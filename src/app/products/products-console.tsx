'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { ExclusiveProductOperation, LatestProductRead } from './async-operation';
import type { InvestmentProduct, ProductTerms, ProductTermsSimulation } from './product-api';
import { isExactNisba, validProductCode, validProductId, validProductJustification, validProductName } from './product-api';
import { ProductReferencesPanel } from './product-references-panel';
import { EntityCatalog } from '../entity-catalog';
import styles from './products.module.css';

type Tab = 'product' | 'terms' | 'references';
export type ProductAction = 'validate' | 'publish' | 'suspend' | 'resume' | 'close';

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export async function productRequestForConsole<T>(path: string, init: RequestInit, validate: (value: unknown) => value is T): Promise<T> {
  const correlationId = crypto.randomUUID(); const headers = new Headers(init.headers); headers.set('accept', 'application/json'); if (init.body) headers.set('content-type', 'application/json'); if (init.method === 'POST') headers.set('idempotency-key', crypto.randomUUID()); headers.set('x-correlation-id', correlationId);
  const response = await fetch(`/api/core/products${path}`, { ...init, headers }); const payload: unknown = await response.json().catch(() => undefined); const problem = isRecord(payload) ? payload : {}; const detail = typeof problem.detail === 'string' && problem.detail.trim() ? problem.detail : typeof problem.title === 'string' && problem.title.trim() ? problem.title : `Erreur HTTP ${response.status}`; const reference = typeof problem.correlationId === 'string' && problem.correlationId.trim() ? problem.correlationId : response.headers.get('x-correlation-id') ?? correlationId;
  if (!response.ok) throw new Error(`${detail} (référence : ${reference})`); if (!validate(payload)) throw new Error(`Réponse produit invalide. (référence : ${reference})`); return payload;
}
const isProductPayload = (value: unknown): value is InvestmentProduct => isRecord(value) && typeof value.productId === 'string' && value.productId.trim().length > 0 && typeof value.code === 'string' && value.code.trim().length > 0 && typeof value.name === 'string' && value.name.trim().length > 0 && typeof value.investorNisba === 'string' && typeof value.bankNisba === 'string' && typeof value.status === 'string';
const isProductSimulationPayload = (value: unknown): value is ProductTermsSimulation => isRecord(value) && value.valid === true && typeof value.simulationChecksumSha256 === 'string' && value.simulationChecksumSha256.length === 64 && typeof value.notice === 'string';
const isProductTermsPayload = (value: unknown): value is ProductTerms => isRecord(value) && typeof value.termsVersionId === 'string' && typeof value.productId === 'string' && typeof value.version === 'number' && typeof value.effectiveFrom === 'string' && typeof value.status === 'string';
const isTermsPayload = (value: unknown): value is ProductTerms | ProductTermsSimulation => isProductTermsPayload(value) || isProductSimulationPayload(value);

export function productActionsForStatus(status?: string): readonly ProductAction[] {
  if (status === 'DRAFT') return ['validate'];
  if (status === 'VALIDATED') return ['publish'];
  if (status === 'PUBLISHED') return ['suspend', 'close'];
  if (status === 'SUSPENDED') return ['resume', 'close'];
  return [];
}

export function ProductsConsole() {
  const [tab, setTab] = useState<Tab>('product');
  const [product, setProduct] = useState<InvestmentProduct>();
  const [productId, setProductId] = useState('');
  const [simulation, setSimulation] = useState<ProductTermsSimulation>();
  const [terms, setTerms] = useState<ProductTerms>();
  const [justification, setJustification] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [invalidCreate, setInvalidCreate] = useState<ReadonlySet<string>>(new Set());
  const reads = useRef<LatestProductRead>(null);
  const commands = useRef<ExclusiveProductOperation>(null);
  if (!reads.current) reads.current = new LatestProductRead();
  if (!commands.current) commands.current = new ExclusiveProductOperation();

  useEffect(() => () => { reads.current?.cancel(); commands.current?.cancel(); }, []);

  function moveTab(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs: Tab[] = ['product', 'terms', 'references'];
    const current = tabs.indexOf(tab);
    const next = event.key === 'Home' ? tabs[0]! : event.key === 'End' ? tabs.at(-1)! : tabs[(current + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length]!;
    setTab(next);
    document.getElementById(`${next}-tab`)?.focus();
  }

  async function runCommand<T>(operation: (signal: AbortSignal) => Promise<T>, success: string, apply: (result: T) => void) {
    reads.current!.cancel();
    await commands.current!.run(operation, {
      loading: () => { setBusy(true); setError(''); setMessage(''); },
      success: (result) => { apply(result); setMessage(success); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (commands.current!.isActive()) return;
    const requestedId = productId.trim();
    if (!validProductId(requestedId)) { setProduct(undefined); setError('L’identifiant du produit doit être un UUID valide.'); return; }
    await reads.current!.run(
      (signal) => productRequestForConsole(`/${encodeURIComponent(requestedId)}`, { signal }, isProductPayload),
      {
        loading: () => { setBusy(true); setProduct(undefined); setError(''); setMessage(''); },
        success: (value) => { setProduct(value); setMessage('Produit chargé.'); },
        failure: setError,
        settled: () => setBusy(false),
      },
    );
  }

  function changeProductId(value: string) {
    reads.current!.cancel();
    setProductId(value.trim());
    setProduct(undefined);
    setBusy(commands.current!.isActive());
    setError('');
    setMessage('');
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const code = String(data.get('code')).trim().toUpperCase();
    const name = String(data.get('name')).trim();
    const investorNisba = String(data.get('investorNisba')).trim();
    const bankNisba = String(data.get('bankNisba')).trim();
    const invalid = new Set<string>();
    if (!validProductCode(code)) invalid.add('code');
    if (!validProductName(name)) invalid.add('name');
    if (!isExactNisba(investorNisba, bankNisba)) { invalid.add('investorNisba'); invalid.add('bankNisba'); }
    setInvalidCreate(invalid);
    if (invalid.size > 0) { setError('Vérifiez le code, le libellé et la répartition exacte de la Nisba.'); return; }
    const command = { code, name, investorNisba, bankNisba, shariaReference: String(data.get('shariaReference')).trim() || undefined };
    await runCommand(
      (signal) => productRequestForConsole('', { method: 'POST', body: JSON.stringify(command), signal }, isProductPayload),
      'Produit créé en brouillon.',
      (value) => { setProduct(value); setProductId(value.productId); setJustification(''); },
    );
  }

  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const action = submitter instanceof HTMLButtonElement ? submitter.value as ProductAction : undefined;
    if (!action || !productActionsForStatus(product.status).includes(action)) { setError('Cette transition n’est pas autorisée pour l’état courant.'); return; }
    if (!validProductJustification(justification)) { setError('La justification doit contenir entre 10 et 1 000 caractères.'); return; }
    const requestedProductId = product.productId;
    await runCommand(
      (signal) => productRequestForConsole(`/${encodeURIComponent(requestedProductId)}/${action}`, { method: 'POST', body: JSON.stringify({ justification: justification.trim() }), signal }, isProductPayload),
      `Transition ${action} enregistrée.`,
      (value) => { setProduct(value); setJustification(''); },
    );
  }

  async function termsOperation(form: HTMLFormElement, mode: 'simulate' | 'draft') {
    const data = new FormData(form);
    const currentProductId = String(data.get('productId')).trim();
    const command = { effectiveFrom: data.get('effectiveFrom'), effectiveTo: data.get('effectiveTo') || undefined, investorNisba: data.get('termsInvestorNisba'), bankNisba: data.get('termsBankNisba'), indicativeTargetRate: data.get('indicativeTargetRate') || undefined };
    if (!validProductId(currentProductId)) { setError('L’identifiant du produit doit être un UUID valide.'); return; }
    if (!isExactNisba(String(command.investorNisba), String(command.bankNisba))) { setError('Les Nisba de la version doivent totaliser exactement 100 %.'); return; }
    const path = `/${encodeURIComponent(currentProductId)}/terms${mode === 'simulate' ? '/simulate' : ''}`;
    await runCommand(
      (signal) => productRequestForConsole(path, { method: 'POST', body: JSON.stringify(command), signal }, isTermsPayload),
      mode === 'simulate' ? 'Simulation réussie. Son empreinte peut maintenant être publiée.' : 'Version contractuelle créée en brouillon.',
      (value) => mode === 'simulate' ? setSimulation(value as ProductTermsSimulation) : setTerms(value as ProductTerms),
    );
  }

  async function publishTerms(form: HTMLFormElement) {
    const data = new FormData(form);
    const currentProductId = String(data.get('publishProductId')).trim();
    const termsVersionId = String(data.get('termsVersionId')).trim();
    const publishJustification = String(data.get('justification'));
    if (!validProductId(currentProductId) || !validProductId(termsVersionId)) { setError('Les identifiants produit et version doivent être des UUID valides.'); return; }
    if (!validProductJustification(publishJustification)) { setError('La justification doit contenir entre 10 et 1 000 caractères.'); return; }
    const command = { businessDate: data.get('businessDate'), simulationChecksumSha256: data.get('simulationChecksumSha256'), retroactiveApprovalId: data.get('retroactiveApprovalId') || undefined, justification: publishJustification.trim() };
    await runCommand(
      (signal) => productRequestForConsole(`/${encodeURIComponent(currentProductId)}/terms/${encodeURIComponent(termsVersionId)}/publish`, { method: 'POST', body: JSON.stringify(command), signal }, isProductTermsPayload),
      'Version contractuelle publiée.',
      setTerms,
    );
  }

  const actions = productActionsForStatus(product?.status);

  return <>
    <EntityCatalog kind="products" selectedId={productId} disabled={busy} onSelect={changeProductId} />
    <div className={styles.tabs} role="tablist" aria-label="Gestion des produits">
      <button id="product-tab" type="button" role="tab" aria-controls="product-panel" aria-selected={tab === 'product'} tabIndex={tab === 'product' ? 0 : -1} onKeyDown={moveTab} onClick={() => setTab('product')}>Produits</button>
      <button id="terms-tab" type="button" role="tab" aria-controls="terms-panel" aria-selected={tab === 'terms'} tabIndex={tab === 'terms' ? 0 : -1} onKeyDown={moveTab} onClick={() => setTab('terms')}>Versions et simulation</button>
      <button id="references-tab" type="button" role="tab" aria-controls="references-panel" aria-selected={tab === 'references'} tabIndex={tab === 'references' ? 0 : -1} onKeyDown={moveTab} onClick={() => setTab('references')}>Référentiels et conformité</button>
    </div>
    <div aria-live="polite" aria-atomic="true">{message ? <p className={styles.notice} role="status">{message}</p> : null}{error ? <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p> : null}</div>
    {tab === 'product' ? <div id="product-panel" role="tabpanel" aria-labelledby="product-tab" className={styles.grid}>
      <section className={styles.card} aria-labelledby="create-title"><h2 id="create-title">Créer un produit</h2><form className={styles.form} onSubmit={create} noValidate>
        <label className={styles.field}>Code produit<input name="code" disabled={busy} required minLength={2} maxLength={32} autoComplete="off" aria-invalid={invalidCreate.has('code')} aria-describedby="product-code-hint" /></label><p id="product-code-hint" className={styles.hint}>2 à 32 lettres majuscules, chiffres, tirets ou soulignements.</p>
        <label className={styles.field}>Libellé<input name="name" disabled={busy} required minLength={3} maxLength={160} aria-invalid={invalidCreate.has('name')} aria-describedby="product-name-hint" /></label><p id="product-name-hint" className={styles.hint}>3 à 160 caractères.</p>
        <div className={styles.row}><label className={styles.field}>Nisba investisseur (%)<input name="investorNisba" disabled={busy} inputMode="decimal" defaultValue="70" required aria-invalid={invalidCreate.has('investorNisba')} aria-describedby="product-nisba-hint" /></label><label className={styles.field}>Nisba banque (%)<input name="bankNisba" disabled={busy} inputMode="decimal" defaultValue="30" required aria-invalid={invalidCreate.has('bankNisba')} aria-describedby="product-nisba-hint" /></label></div><p id="product-nisba-hint" className={styles.hint}>Décimales canoniques, six décimales maximum, total exact de 100 %.</p>
        <label className={styles.field}>Référence Charia<input name="shariaReference" disabled={busy} maxLength={128} placeholder="Ex. FATWA-2026-014" /></label>
        <button className={styles.button} disabled={busy}>{busy ? 'Traitement…' : 'Créer le brouillon'}</button>
      </form></section>
      <section className={styles.card} aria-labelledby="consult-title"><h2 id="consult-title">Consulter et piloter</h2><form className={styles.form} onSubmit={lookup} noValidate><label className={styles.field}>Identifiant du produit<input value={productId} onChange={(event) => changeProductId(event.target.value)} required disabled={commands.current.isActive()} aria-invalid={Boolean(productId) && !validProductId(productId)} aria-describedby="product-id-hint" /></label><p id="product-id-hint" className={styles.hint}>Identifiant UUID du produit.</p><button className={`${styles.button} ${styles.secondary}`} disabled={busy}>Rechercher</button></form>
        {product ? <article className={styles.product} aria-label={`Produit ${product.code}`}><span className={styles.badge}>{product.status}</span><dl><dt>Identifiant</dt><dd className={styles.checksum}>{product.productId}</dd><dt>Code</dt><dd>{product.code}</dd><dt>Libellé</dt><dd>{product.name}</dd><dt>Part investisseur</dt><dd>{product.investorNisba} %</dd><dt>Part banque</dt><dd>{product.bankNisba} %</dd><dt>Référence Charia</dt><dd>{product.shariaReference ?? 'Non renseignée'}</dd></dl>{actions.length > 0 ? <form className={styles.form} onSubmit={transition}><label className={styles.field}>Justification de la transition<textarea value={justification} disabled={busy} onChange={(event) => setJustification(event.target.value)} minLength={10} maxLength={1000} required aria-invalid={Boolean(justification) && !validProductJustification(justification)} aria-describedby="product-transition-hint" /></label><p id="product-transition-hint" className={styles.hint}>{justification.trim().length} / 1 000 caractères · minimum 10.</p><div className={styles.actions}>{actions.map((action) => <button type="submit" name="action" value={action} className={`${styles.button} ${styles.secondary}`} key={action} disabled={busy}>{action}</button>)}</div></form> : <p className={styles.hint}>Aucune transition disponible pour cet état.</p>}</article> : null}
      </section>
    </div> : tab === 'terms' ? <div id="terms-panel" role="tabpanel" aria-labelledby="terms-tab"><TermsPanel key={product?.productId ?? productId} busy={busy} defaultProductId={product?.productId ?? productId} simulation={simulation} terms={terms} onSubmit={termsOperation} onPublish={publishTerms} /></div> : <div id="references-panel" role="tabpanel" aria-labelledby="references-tab"><ProductReferencesPanel defaultProductId={product?.productId ?? productId} /></div>}
  </>;
}

function TermsPanel({ busy, defaultProductId, simulation, terms, onSubmit, onPublish }: { busy: boolean; defaultProductId: string; simulation?: ProductTermsSimulation; terms?: ProductTerms; onSubmit: (form: HTMLFormElement, mode: 'simulate' | 'draft') => Promise<void>; onPublish: (form: HTMLFormElement) => Promise<void> }) {
  return <div className={styles.grid}><section className={styles.card}><h2>Paramètres contractuels</h2><form className={styles.form} onSubmit={(event) => { event.preventDefault(); void onSubmit(event.currentTarget, 'simulate'); }}>
    <label className={styles.field}>Identifiant produit<input name="productId" disabled={busy} required defaultValue={defaultProductId} aria-describedby="terms-product-id-hint" /></label><p id="terms-product-id-hint" className={styles.hint}>Identifiant UUID du produit.</p>
    <div className={styles.row}><label className={styles.field}>Début d’effet<input name="effectiveFrom" disabled={busy} type="date" required /></label><label className={styles.field}>Fin d’effet<input name="effectiveTo" disabled={busy} type="date" /></label></div>
    <div className={styles.row}><label className={styles.field}>Nisba investisseur (%)<input name="termsInvestorNisba" disabled={busy} inputMode="decimal" defaultValue="70" required /></label><label className={styles.field}>Nisba banque (%)<input name="termsBankNisba" disabled={busy} inputMode="decimal" defaultValue="30" required /></label></div>
    <label className={styles.field}>Taux cible indicatif (%)<input name="indicativeTargetRate" disabled={busy} inputMode="decimal" aria-describedby="rate-hint" /></label><p id="rate-hint" className={styles.hint}>Ce taux reste indicatif et ne constitue pas une promesse de rendement.</p>
    <div className={styles.actions}><button className={styles.button} disabled={busy}>Simuler</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} type="button" onClick={(event) => void onSubmit(event.currentTarget.form!, 'draft')}>Créer le brouillon</button></div>
  </form></section><section className={styles.card}><h2>Résultat et publication</h2>{!simulation && !terms ? <p className={styles.hint}>Lancez une simulation avant de publier une version contractuelle.</p> : null}{simulation ? <div className={styles.product}><span className={styles.badge}>{simulation.valid ? 'Simulation valide' : 'Simulation invalide'}</span><p>{simulation.notice}</p><p className={styles.checksum}>{simulation.simulationChecksumSha256}</p></div> : null}{terms ? <div className={styles.product}><span className={styles.badge}>{terms.status}</span><dl><dt>Version</dt><dd>{terms.version}</dd><dt>Début d’effet</dt><dd>{terms.effectiveFrom}</dd><dt>Fin d’effet</dt><dd>{terms.effectiveTo ?? 'Sans limite'}</dd></dl></div> : null}
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void onPublish(event.currentTarget); }}>
      <label className={styles.field}>Identifiant produit<input name="publishProductId" disabled={busy} required defaultValue={terms?.productId ?? defaultProductId} /></label>
      <label className={styles.field}>Identifiant de version<input name="termsVersionId" disabled={busy} required defaultValue={terms?.termsVersionId} /></label>
      <label className={styles.field}>Date métier<input name="businessDate" disabled={busy} type="date" required /></label>
      <label className={styles.field}>Empreinte de simulation<input name="simulationChecksumSha256" disabled={busy} pattern="[0-9a-f]{64}" required defaultValue={simulation?.simulationChecksumSha256} /></label>
      <label className={styles.field}>Approbation rétroactive (si nécessaire)<input name="retroactiveApprovalId" disabled={busy} /></label>
      <label className={styles.field}>Justification<textarea name="justification" disabled={busy} minLength={10} maxLength={1000} required /></label>
      <button className={styles.button} disabled={busy || !simulation?.valid}>Publier la version</button>
    </form>
  </section></div>;
}
