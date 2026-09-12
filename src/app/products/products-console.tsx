'use client';

import { FormEvent, KeyboardEvent, useState } from 'react';
import type { InvestmentProduct, ProductTerms, ProductTermsSimulation } from './product-api';
import { isExactNisba, productRequest } from './product-api';
import { ProductReferencesPanel } from './product-references-panel';
import styles from './products.module.css';

type Tab = 'product' | 'terms' | 'references';
type ProductAction = 'validate' | 'publish' | 'suspend' | 'resume' | 'close';

export function ProductsConsole() {
  const [tab, setTab] = useState<Tab>('product');
  const [product, setProduct] = useState<InvestmentProduct>();
  const [productId, setProductId] = useState('');
  const [simulation, setSimulation] = useState<ProductTermsSimulation>();
  const [terms, setTerms] = useState<ProductTerms>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function moveTab(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs: Tab[] = ['product', 'terms', 'references'];
    const current = tabs.indexOf(tab);
    const next = event.key === 'Home' ? tabs[0]! : event.key === 'End' ? tabs.at(-1)! : tabs[(current + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length]!;
    setTab(next);
    document.getElementById(`${next}-tab`)?.focus();
  }

  async function run<T>(operation: () => Promise<T>, success: string, apply: (result: T) => void) {
    setBusy(true); setError(''); setMessage('');
    try { const result = await operation(); apply(result); setMessage(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Une erreur inattendue est survenue.'); }
    finally { setBusy(false); }
  }

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(() => productRequest<InvestmentProduct>(`/${encodeURIComponent(productId.trim())}`), 'Produit chargé.', setProduct);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const investorNisba = String(data.get('investorNisba')); const bankNisba = String(data.get('bankNisba'));
    if (!isExactNisba(investorNisba, bankNisba)) { setError('La Nisba investisseur et la Nisba banque doivent totaliser exactement 100 %.'); return; }
    await run(() => productRequest<InvestmentProduct>('', { method: 'POST', body: JSON.stringify({ code: data.get('code'), name: data.get('name'), investorNisba, bankNisba, shariaReference: data.get('shariaReference') || undefined }) }), 'Produit créé en brouillon.', (value) => { setProduct(value); setProductId(value.productId); });
  }

  async function transition(action: ProductAction) {
    if (!product) return;
    const justification = window.prompt(`Justification obligatoire pour « ${action} » (10 caractères minimum) :`);
    if (!justification || justification.trim().length < 10) { setError('La justification doit contenir au moins 10 caractères.'); return; }
    await run(() => productRequest<InvestmentProduct>(`/${encodeURIComponent(product.productId)}/${action}`, { method: 'POST', body: JSON.stringify({ justification }) }), `Transition ${action} enregistrée.`, setProduct);
  }

  async function termsOperation(form: HTMLFormElement, mode: 'simulate' | 'draft') {
    const data = new FormData(form);
    const currentProductId = String(data.get('productId')).trim();
    const command = { effectiveFrom: data.get('effectiveFrom'), effectiveTo: data.get('effectiveTo') || undefined, investorNisba: data.get('termsInvestorNisba'), bankNisba: data.get('termsBankNisba'), indicativeTargetRate: data.get('indicativeTargetRate') || undefined };
    if (!isExactNisba(String(command.investorNisba), String(command.bankNisba))) { setError('Les Nisba de la version doivent totaliser exactement 100 %.'); return; }
    if (mode === 'simulate') await run(() => productRequest<ProductTermsSimulation>(`/${encodeURIComponent(currentProductId)}/terms/simulate`, { method: 'POST', body: JSON.stringify(command) }), 'Simulation réussie. Son empreinte peut maintenant être publiée.', setSimulation);
    else await run(() => productRequest<ProductTerms>(`/${encodeURIComponent(currentProductId)}/terms`, { method: 'POST', body: JSON.stringify(command) }), 'Version contractuelle créée en brouillon.', setTerms);
  }

  async function publishTerms(form: HTMLFormElement) {
    const data = new FormData(form);
    const currentProductId = String(data.get('publishProductId')).trim();
    const termsVersionId = String(data.get('termsVersionId')).trim();
    await run(() => productRequest<ProductTerms>(`/${encodeURIComponent(currentProductId)}/terms/${encodeURIComponent(termsVersionId)}/publish`, { method: 'POST', body: JSON.stringify({ businessDate: data.get('businessDate'), simulationChecksumSha256: data.get('simulationChecksumSha256'), retroactiveApprovalId: data.get('retroactiveApprovalId') || undefined, justification: data.get('justification') }) }), 'Version contractuelle publiée.', setTerms);
  }

  return <>
    <div className={styles.tabs} role="tablist" aria-label="Gestion des produits">
      <button id="product-tab" type="button" role="tab" aria-controls="product-panel" aria-selected={tab === 'product'} tabIndex={tab === 'product' ? 0 : -1} onKeyDown={moveTab} onClick={() => setTab('product')}>Produits</button>
      <button id="terms-tab" type="button" role="tab" aria-controls="terms-panel" aria-selected={tab === 'terms'} tabIndex={tab === 'terms' ? 0 : -1} onKeyDown={moveTab} onClick={() => setTab('terms')}>Versions et simulation</button>
      <button id="references-tab" type="button" role="tab" aria-controls="references-panel" aria-selected={tab === 'references'} tabIndex={tab === 'references' ? 0 : -1} onKeyDown={moveTab} onClick={() => setTab('references')}>Référentiels et conformité</button>
    </div>
    <div aria-live="polite" aria-atomic="true">{message && <p className={styles.notice}>{message}</p>}{error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}</div>
    {tab === 'product' ? <div id="product-panel" role="tabpanel" aria-labelledby="product-tab" className={styles.grid}>
      <section className={styles.card} aria-labelledby="create-title"><h2 id="create-title">Créer un produit</h2><form className={styles.form} onSubmit={create}>
        <label className={styles.field}>Code produit<input name="code" required minLength={2} maxLength={32} autoComplete="off" /></label>
        <label className={styles.field}>Libellé<input name="name" required minLength={3} maxLength={160} /></label>
        <div className={styles.row}><label className={styles.field}>Nisba investisseur (%)<input name="investorNisba" type="number" step="0.01" min="0" max="100" defaultValue="70" required /></label><label className={styles.field}>Nisba banque (%)<input name="bankNisba" type="number" step="0.01" min="0" max="100" defaultValue="30" required /></label></div>
        <label className={styles.field}>Référence Charia<input name="shariaReference" maxLength={128} placeholder="Ex. FATWA-2026-014" /></label>
        <button className={styles.button} disabled={busy}>{busy ? 'Traitement…' : 'Créer le brouillon'}</button>
      </form></section>
      <section className={styles.card} aria-labelledby="consult-title"><h2 id="consult-title">Consulter et piloter</h2><form className={styles.form} onSubmit={lookup}><label className={styles.field}>Identifiant du produit<input value={productId} onChange={(e) => setProductId(e.target.value)} required /></label><button className={`${styles.button} ${styles.secondary}`} disabled={busy}>Rechercher</button></form>
        {product && <article className={styles.product} aria-label={`Produit ${product.code}`}><span className={styles.badge}>{product.status}</span><dl><dt>Code</dt><dd>{product.code}</dd><dt>Libellé</dt><dd>{product.name}</dd><dt>Part investisseur</dt><dd>{product.investorNisba} %</dd><dt>Part banque</dt><dd>{product.bankNisba} %</dd><dt>Référence Charia</dt><dd>{product.shariaReference ?? 'Non renseignée'}</dd></dl><div className={styles.actions}>{(['validate', 'publish', 'suspend', 'resume', 'close'] as const).map((action) => <button className={`${styles.button} ${styles.secondary}`} key={action} disabled={busy} onClick={() => void transition(action)}>{action}</button>)}</div></article>}
      </section>
    </div> : tab === 'terms' ? <div id="terms-panel" role="tabpanel" aria-labelledby="terms-tab"><TermsPanel busy={busy} defaultProductId={product?.productId ?? productId} simulation={simulation} terms={terms} onSubmit={termsOperation} onPublish={publishTerms} /></div> : <div id="references-panel" role="tabpanel" aria-labelledby="references-tab"><ProductReferencesPanel defaultProductId={product?.productId ?? productId} /></div>}
  </>;
}

function TermsPanel({ busy, defaultProductId, simulation, terms, onSubmit, onPublish }: { busy: boolean; defaultProductId: string; simulation?: ProductTermsSimulation; terms?: ProductTerms; onSubmit: (form: HTMLFormElement, mode: 'simulate' | 'draft') => Promise<void>; onPublish: (form: HTMLFormElement) => Promise<void> }) {
  return <div className={styles.grid}><section className={styles.card}><h2>Paramètres contractuels</h2><form className={styles.form} onSubmit={(event) => { event.preventDefault(); void onSubmit(event.currentTarget, 'simulate'); }}>
    <label className={styles.field}>Identifiant produit<input name="productId" required defaultValue={defaultProductId} /></label>
    <div className={styles.row}><label className={styles.field}>Début d’effet<input name="effectiveFrom" type="date" required /></label><label className={styles.field}>Fin d’effet<input name="effectiveTo" type="date" /></label></div>
    <div className={styles.row}><label className={styles.field}>Nisba investisseur (%)<input name="termsInvestorNisba" type="number" step="0.01" min="0" max="100" defaultValue="70" required /></label><label className={styles.field}>Nisba banque (%)<input name="termsBankNisba" type="number" step="0.01" min="0" max="100" defaultValue="30" required /></label></div>
    <label className={styles.field}>Taux cible indicatif (%)<input name="indicativeTargetRate" type="number" step="0.001" min="0" aria-describedby="rate-hint" /></label><p id="rate-hint" className={styles.hint}>Ce taux reste indicatif et ne constitue pas une promesse de rendement.</p>
    <div className={styles.actions}><button className={styles.button} disabled={busy}>Simuler</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} type="button" onClick={(event) => void onSubmit(event.currentTarget.form!, 'draft')}>Créer le brouillon</button></div>
  </form></section><section className={styles.card}><h2>Résultat et publication</h2>{!simulation && !terms && <p className={styles.hint}>Lancez une simulation avant de publier une version contractuelle.</p>}{simulation && <div className={styles.product}><span className={styles.badge}>{simulation.valid ? 'Simulation valide' : 'Simulation invalide'}</span><p>{simulation.notice}</p><p className={styles.checksum}>{simulation.simulationChecksumSha256}</p></div>}{terms && <div className={styles.product}><span className={styles.badge}>{terms.status}</span><dl><dt>Version</dt><dd>{terms.version}</dd><dt>Début d’effet</dt><dd>{terms.effectiveFrom}</dd><dt>Fin d’effet</dt><dd>{terms.effectiveTo ?? 'Sans limite'}</dd></dl></div>}
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void onPublish(event.currentTarget); }}>
      <label className={styles.field}>Identifiant produit<input name="publishProductId" required defaultValue={terms?.productId ?? defaultProductId} /></label>
      <label className={styles.field}>Identifiant de version<input name="termsVersionId" required defaultValue={terms?.termsVersionId} /></label>
      <label className={styles.field}>Date métier<input name="businessDate" type="date" required /></label>
      <label className={styles.field}>Empreinte de simulation<input name="simulationChecksumSha256" pattern="[0-9a-f]{64}" required defaultValue={simulation?.simulationChecksumSha256} /></label>
      <label className={styles.field}>Approbation rétroactive (si nécessaire)<input name="retroactiveApprovalId" /></label>
      <label className={styles.field}>Justification<textarea name="justification" minLength={10} maxLength={1000} required /></label>
      <button className={styles.button} disabled={busy || !simulation?.valid}>Publier la version</button>
    </form>
  </section></div>;
}
