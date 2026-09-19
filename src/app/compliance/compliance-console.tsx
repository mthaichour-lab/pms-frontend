'use client';
import { FormEvent, useEffect, useRef, useState, type ReactNode } from 'react';
import { arbitrate, arbitrationFieldErrors, createReference, exactComplianceDate, getRule, referenceFieldErrors, validArbitration, validReference, type ComplianceArbitration, type ComplianceReference, type CreateComplianceReference, type RegulatoryRule } from './compliance-api';
import styles from '../products/products.module.css';

const today = new Date().toISOString().slice(0, 10);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sources = ['BA', 'SHARIA_COMMITTEE', 'AAOIFI', 'IFSB'];
const initialReference: CreateComplianceReference = { source: 'BA', referenceCode: '', version: '1', title: '', effectiveFrom: today };
type ArbitrationDraft = ComplianceArbitration & { productId: string };
const initialArbitration: ArbitrationDraft = { productId: '', selectedReferenceId: '', rejectedReferenceId: '', rationale: '' };
type RuleQuery = { ruleCode: string; businessDate: string };
const initialRuleQuery: RuleQuery = { ruleCode: '', businessDate: today };

type OperationCallbacks<T> = { loading: () => void; success: (value: T) => void; failure: (message: string) => void; settled: () => void };
export class ComplianceOperationCoordinator {
  private running = false;
  private revision = 0;
  private mounted = true;
  private controller?: AbortController;
  mount(): void { this.mounted = true; }
  invalidate(): void { this.revision += 1; this.controller?.abort(); }
  unmount(): void { this.mounted = false; this.invalidate(); this.controller = undefined; }
  async run<T>(work: (signal: AbortSignal) => Promise<T>, callbacks: OperationCallbacks<T>): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    const expectedRevision = this.revision;
    const controller = new AbortController();
    this.controller = controller;
    callbacks.loading();
    try { const result = await work(controller.signal); if (this.mounted && !controller.signal.aborted && expectedRevision === this.revision) callbacks.success(result); }
    catch (cause) { if (this.mounted && !controller.signal.aborted && expectedRevision === this.revision) callbacks.failure(cause instanceof Error ? cause.message : 'Erreur inattendue.'); }
    finally { this.running = false; if (this.controller === controller) this.controller = undefined; if (this.mounted) callbacks.settled(); }
    return true;
  }
}

export function ruleQueryFieldErrors(query: RuleQuery): Partial<Record<keyof RuleQuery, string>> {
  const errors: Partial<Record<keyof RuleQuery, string>> = {};
  if (!/^[A-Z][A-Z0-9_.-]{2,63}$/.test(query.ruleCode)) errors.ruleCode = 'Le code règle doit contenir 3 à 64 caractères réglementaires.';
  if (!exactComplianceDate(query.businessDate)) errors.businessDate = 'Saisissez une date métier valide.';
  return errors;
}
export function productIdError(productId: string): string | undefined { return uuid.test(productId) ? undefined : 'Saisissez un UUID produit valide.'; }
export function snapshotReference(value: CreateComplianceReference): CreateComplianceReference { return { ...value }; }
export function snapshotArbitration(value: ArbitrationDraft): ArbitrationDraft { return { ...value }; }

function inputA11y(id: string, error?: string) { return { 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined } as const; }
function FieldError({ id, children }: { id: string; children?: ReactNode }) { return children ? <span id={`${id}-error`} role="alert">{children}</span> : null; }

type ReferenceFormProps = { value: CreateComplianceReference; errors: Partial<Record<keyof CreateComplianceReference, string>>; busy: boolean; onChange: (field: keyof CreateComplianceReference, value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void };
export function ComplianceReferenceForm({ value, errors, busy, onChange, onSubmit }: ReferenceFormProps) {
  return <form className={styles.form} onSubmit={onSubmit} noValidate>
    <label className={styles.field}>Autorité<select id="compliance-source" required disabled={busy} value={value.source} onChange={(event) => onChange('source', event.target.value)} {...inputA11y('compliance-source', errors.source)}>{sources.map((source) => <option key={source}>{source}</option>)}</select><FieldError id="compliance-source">{errors.source}</FieldError></label>
    <div className={styles.row}>
      <label className={styles.field}>Code<input id="compliance-reference-code" required disabled={busy} value={value.referenceCode} onChange={(event) => onChange('referenceCode', event.target.value)} {...inputA11y('compliance-reference-code', errors.referenceCode)} /><FieldError id="compliance-reference-code">{errors.referenceCode}</FieldError></label>
      <label className={styles.field}>Version<input id="compliance-reference-version" required disabled={busy} value={value.version} onChange={(event) => onChange('version', event.target.value)} {...inputA11y('compliance-reference-version', errors.version)} /><FieldError id="compliance-reference-version">{errors.version}</FieldError></label>
    </div>
    <label className={styles.field}>Titre<input id="compliance-reference-title" required disabled={busy} value={value.title} onChange={(event) => onChange('title', event.target.value)} {...inputA11y('compliance-reference-title', errors.title)} /><FieldError id="compliance-reference-title">{errors.title}</FieldError></label>
    <div className={styles.row}>
      <label className={styles.field}>Applicable à partir du<input id="compliance-effective-from" required disabled={busy} type="date" value={value.effectiveFrom} onChange={(event) => onChange('effectiveFrom', event.target.value)} {...inputA11y('compliance-effective-from', errors.effectiveFrom)} /><FieldError id="compliance-effective-from">{errors.effectiveFrom}</FieldError></label>
      <label className={styles.field}>Applicable jusqu’au (facultatif)<input id="compliance-effective-to" disabled={busy} type="date" value={value.effectiveTo ?? ''} onChange={(event) => onChange('effectiveTo', event.target.value)} aria-invalid={Boolean(errors.effectiveTo)} aria-describedby={errors.effectiveTo ? 'compliance-effective-to-error' : undefined} /><FieldError id="compliance-effective-to">{errors.effectiveTo}</FieldError></label>
    </div>
    <button className={styles.button} disabled={busy}>{busy ? 'Création…' : 'Créer la référence'}</button>
  </form>;
}

export function ComplianceConsole() {
  const [reference, setReference] = useState(initialReference), [created, setCreated] = useState<ComplianceReference>();
  const [query, setQuery] = useState(initialRuleQuery), [rule, setRule] = useState<RegulatoryRule>();
  const [arbitration, setArbitration] = useState(initialArbitration);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [referenceAttempted, setReferenceAttempted] = useState(false), [ruleAttempted, setRuleAttempted] = useState(false), [arbitrationAttempted, setArbitrationAttempted] = useState(false);
  const operations = useRef(new ComplianceOperationCoordinator());
  useEffect(() => { operations.current.mount(); return () => operations.current.unmount(); }, []);
  const refErrors = referenceFieldErrors(reference), queryErrors = ruleQueryFieldErrors(query);
  const arbitrationCommand: ComplianceArbitration = { selectedReferenceId: arbitration.selectedReferenceId, rejectedReferenceId: arbitration.rejectedReferenceId, rationale: arbitration.rationale };
  const arbErrors = arbitrationFieldErrors(arbitrationCommand), productError = productIdError(arbitration.productId);

  function invalidate() { operations.current.invalidate(); setError(''); setMessage(''); }
  async function run<T>(work: () => Promise<T>, success: (value: T) => void, successMessage: string) {
    await operations.current.run(work, { loading: () => { setBusy(true); setError(''); setMessage(''); }, success: (value) => { success(value); setMessage(successMessage); }, failure: setError, settled: () => setBusy(false) });
  }
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setReferenceAttempted(true); if (!validReference(reference)) return setError(Object.values(refErrors)[0] ?? 'Référence invalide.'); const snapshot = snapshotReference(reference); await run(() => createReference(snapshot), setCreated, 'Référence versionnée créée.'); }
  async function lookup(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setRuleAttempted(true); if (Object.keys(queryErrors).length) return setError(Object.values(queryErrors)[0]!); const snapshot = { ...query }; await run(() => getRule(snapshot.ruleCode, snapshot.businessDate), setRule, 'Règle chargée.'); }
  async function decide(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setArbitrationAttempted(true); if (productError || !validArbitration(arbitrationCommand)) return setError(productError ?? Object.values(arbErrors)[0] ?? 'Arbitrage invalide.'); const snapshot = snapshotArbitration(arbitration); const command = { selectedReferenceId: snapshot.selectedReferenceId, rejectedReferenceId: snapshot.rejectedReferenceId, rationale: snapshot.rationale.trim() }; await run(() => arbitrate(snapshot.productId, command), () => undefined, 'Arbitrage de conformité enregistré.'); }

  return <div className={styles.grid} aria-busy={busy}>
    <section className={styles.card}><h2>Nouvelle référence</h2><ComplianceReferenceForm value={reference} errors={referenceAttempted ? refErrors : {}} busy={busy} onChange={(field, value) => { invalidate(); setCreated(undefined); setReference((current) => ({ ...current, [field]: value || (field === 'effectiveTo' ? undefined : value) })); }} onSubmit={create} />{created && <p className={styles.checksum} role="status">{created.referenceId}</p>}</section>
    <section className={styles.card}><h2>Règle réglementaire effective</h2><form className={styles.form} onSubmit={lookup} noValidate><label className={styles.field}>Code règle<input id="compliance-rule-code" required disabled={busy} value={query.ruleCode} onChange={(event) => { invalidate(); setRule(undefined); setQuery((current) => ({ ...current, ruleCode: event.target.value.toUpperCase() })); }} {...inputA11y('compliance-rule-code', ruleAttempted ? queryErrors.ruleCode : undefined)} /><FieldError id="compliance-rule-code">{ruleAttempted ? queryErrors.ruleCode : undefined}</FieldError></label><label className={styles.field}>Date métier<input id="compliance-business-date" required disabled={busy} type="date" value={query.businessDate} onChange={(event) => { invalidate(); setRule(undefined); setQuery((current) => ({ ...current, businessDate: event.target.value })); }} {...inputA11y('compliance-business-date', ruleAttempted ? queryErrors.businessDate : undefined)} /><FieldError id="compliance-business-date">{ruleAttempted ? queryErrors.businessDate : undefined}</FieldError></label><button className={styles.button} disabled={busy}>{busy ? 'Chargement…' : 'Consulter'}</button>{rule && <div className={styles.product}><span className={styles.badge}>Version {rule.version}</span><dl><dt>Autorité</dt><dd>{rule.authority}</dd><dt>Référence légale</dt><dd>{rule.legalReference}</dd><dt>Validité</dt><dd>{rule.effectiveFrom}</dd></dl><pre className={styles.checksum}>{JSON.stringify(rule.parameters, null, 2)}</pre></div>}</form></section>
    <section className={styles.card} style={{ gridColumn: '1 / -1' }}><h2>Arbitrer une divergence</h2><form className={styles.form} onSubmit={decide} noValidate><label className={styles.field}>Produit<input id="compliance-product-id" required disabled={busy} value={arbitration.productId} onChange={(event) => { invalidate(); setArbitration((current) => ({ ...current, productId: event.target.value.trim() })); }} {...inputA11y('compliance-product-id', arbitrationAttempted ? productError : undefined)} /><FieldError id="compliance-product-id">{arbitrationAttempted ? productError : undefined}</FieldError></label><div className={styles.row}><label className={styles.field}>Référence retenue (UUID)<input id="compliance-selected-reference" required disabled={busy} value={arbitration.selectedReferenceId} onChange={(event) => { invalidate(); setArbitration((current) => ({ ...current, selectedReferenceId: event.target.value.trim() })); }} {...inputA11y('compliance-selected-reference', arbitrationAttempted ? arbErrors.selectedReferenceId : undefined)} /><FieldError id="compliance-selected-reference">{arbitrationAttempted ? arbErrors.selectedReferenceId : undefined}</FieldError></label><label className={styles.field}>Référence écartée (UUID)<input id="compliance-rejected-reference" required disabled={busy} value={arbitration.rejectedReferenceId} onChange={(event) => { invalidate(); setArbitration((current) => ({ ...current, rejectedReferenceId: event.target.value.trim() })); }} {...inputA11y('compliance-rejected-reference', arbitrationAttempted ? arbErrors.rejectedReferenceId : undefined)} /><FieldError id="compliance-rejected-reference">{arbitrationAttempted ? arbErrors.rejectedReferenceId : undefined}</FieldError></label></div><label className={styles.field}>Motivation<textarea id="compliance-rationale" required disabled={busy} minLength={20} value={arbitration.rationale} onChange={(event) => { invalidate(); setArbitration((current) => ({ ...current, rationale: event.target.value })); }} {...inputA11y('compliance-rationale', arbitrationAttempted ? arbErrors.rationale : undefined)} /><FieldError id="compliance-rationale">{arbitrationAttempted ? arbErrors.rationale : undefined}</FieldError></label><button className={styles.button} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer l’arbitrage'}</button></form><div aria-live="polite" aria-atomic="true">{error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}{message && <p className={styles.notice} role="status">{message}</p>}</div></section>
  </div>;
}
