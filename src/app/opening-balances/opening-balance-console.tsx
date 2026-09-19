'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { certify, components, validCertification, type OpeningBalanceLine, type OpeningBalanceRequestOptions } from './opening-balance-api';
import styles from '../products/products.module.css';
const labels: Record<OpeningBalanceLine['component'], string> = { HISTORICAL_ACCOUNTS: 'Comptes historiques', PER: 'PER', IRR: 'IRR', PAST_DISTRIBUTIONS: 'Distributions passées' };
const initial = (): OpeningBalanceLine[] => components.map((component) => ({ component, currencyCode: 'DZD', migratedAmount: '', generalLedgerAmount: '', evidenceReference: '' }));
type SubmitCallbacks = { loading: () => void; success: () => void; failure: (message: string) => void; settled: () => void };

export class OpeningBalanceSubmitCoordinator {
  private controller?: AbortController; private revision = 0; private mounted = false; private running = false;
  mount(): void { this.mounted = true; }
  cancel(): void { this.revision += 1; this.controller?.abort(); this.controller = undefined; this.running = false; }
  unmount(): void { this.mounted = false; this.cancel(); }
  async run(work: (signal: AbortSignal, options: OpeningBalanceRequestOptions) => Promise<void>, callbacks: SubmitCallbacks): Promise<void> {
    if (this.running) return; this.cancel(); this.running = true; const controller = new AbortController(); const expectedRevision = this.revision; this.controller = controller;
    const active = () => this.mounted && !controller.signal.aborted && expectedRevision === this.revision;
    if (this.mounted) callbacks.loading();
    try { await work(controller.signal, { idempotencyKey: crypto.randomUUID(), signal: controller.signal }); if (active()) callbacks.success(); }
    catch (cause) { if (active()) callbacks.failure(cause instanceof Error ? cause.message : 'Erreur inattendue.'); }
    finally { const ownsOperation = this.controller === controller; if (ownsOperation) { this.controller = undefined; this.running = false; } if (active() && ownsOperation) callbacks.settled(); }
  }
}

export function OpeningBalanceConsole() {
  const [lines, setLines] = useState(initial), [busy, setBusy] = useState(false), [attempted, setAttempted] = useState(false), [message, setMessage] = useState(''), [proof, setProof] = useState<{ certificationId: string; evidenceCount: number }>();
  const coordinator = useRef(new OpeningBalanceSubmitCoordinator());
  useEffect(() => { coordinator.current.mount(); return () => coordinator.current.unmount(); }, []);
  function change(index: number, field: keyof OpeningBalanceLine, value: string) { setAttempted(false); setMessage(''); setProof(undefined); setLines((current) => current.map((line, position) => position === index ? { ...line, [field]: value } : line)); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAttempted(true); const command = { certificationId: crypto.randomUUID(), signedAt: new Date().toISOString(), lines };
    if (!validCertification(command) || busy) { setMessage('Les quatre composantes doivent être rapprochées avec des montants valides et une preuve.'); return; }
    await coordinator.current.run((signal, options) => certify(command, { ...options, signal }).then(() => undefined), { loading: () => { setBusy(true); setMessage(''); setProof(undefined); }, success: () => { setProof({ certificationId: command.certificationId, evidenceCount: command.lines.length }); setMessage('Soldes d’ouverture certifiés par Finance.'); }, failure: setMessage, settled: () => setBusy(false) });
  }
  const valid = validCertification({ certificationId: '00000000-0000-4000-8000-000000000000', signedAt: new Date().toISOString(), lines });
  return <section className={styles.card} aria-labelledby="opening-balances-title" aria-busy={busy}><h2 id="opening-balances-title">Rapprochement Finance</h2><form className={styles.form} onSubmit={submit} noValidate>
    {lines.map((line, index) => <fieldset className={styles.card} key={line.component} disabled={busy}><legend><strong>{labels[line.component]}</strong></legend><div className={styles.row}><label className={styles.field} htmlFor={`opening-migrated-${index}`}>Montant migré<input id={`opening-migrated-${index}`} inputMode="decimal" required value={line.migratedAmount} onChange={(event) => change(index, 'migratedAmount', event.target.value)} aria-invalid={attempted && (!line.migratedAmount || line.migratedAmount !== line.generalLedgerAmount)} /></label><label className={styles.field} htmlFor={`opening-ledger-${index}`}>Grand livre<input id={`opening-ledger-${index}`} inputMode="decimal" required value={line.generalLedgerAmount} onChange={(event) => change(index, 'generalLedgerAmount', event.target.value)} aria-invalid={attempted && (!line.generalLedgerAmount || line.migratedAmount !== line.generalLedgerAmount)} /></label></div><label className={styles.field} htmlFor={`opening-evidence-${index}`}>Référence de preuve<input id={`opening-evidence-${index}`} required value={line.evidenceReference} onChange={(event) => change(index, 'evidenceReference', event.target.value)} aria-invalid={attempted && !line.evidenceReference.trim()} /></label></fieldset>)}
    <p className={styles.hint} id="opening-balances-hint">La certification est bloquée dès qu’un écart subsiste. Le signataire est issu de la session authentifiée.</p><button className={styles.button} type="submit" disabled={busy} aria-describedby="opening-balances-hint">{busy ? 'Certification en cours…' : 'Certifier les quatre soldes'}</button>{message && <p className={styles.notice} role={proof ? 'status' : 'alert'} aria-live="polite" aria-atomic="true">{message}</p>}{proof && <dl className={styles.product} aria-label="Preuve de certification"><dt>Identifiant de certification</dt><dd className={styles.checksum}>{proof.certificationId}</dd><dt>Preuves Finance</dt><dd>{proof.evidenceCount}</dd></dl>}
  </form></section>;
}
