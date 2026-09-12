'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { reconcile, validReconciliation, type ReconciliationCommand, type ReconciliationResult } from './reconciliation-api';
import { ReconciliationOperationManager } from './async-operation';
import { ReconciliationError, ReconciliationStatus } from './reconciliation-feedback';
import styles from '../products/products.module.css';
const initial: ReconciliationCommand = { businessDate: new Date().toISOString().slice(0, 10), currency: 'DZD', generalLedgerAmount: '', sourceReference: '', sourceChecksumSha256: '' };
export function ReconciliationConsole() {
  const [command, setCommand] = useState(initial), [submitted, setSubmitted] = useState<ReconciliationCommand>(), [result, setResult] = useState<ReconciliationResult>(), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const operations = useRef<ReconciliationOperationManager>(null);
  if (!operations.current) operations.current = new ReconciliationOperationManager();
  useEffect(() => () => operations.current?.cancel(), []);
  const change = (key: keyof ReconciliationCommand, value: string) => setCommand({ ...command, [key]: value });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validReconciliation(command)) return setError('Vérifiez la date, la devise, le montant, la référence et le checksum SHA-256.');
    const snapshot = { ...command };
    await operations.current!.run(() => reconcile(snapshot), {
      loading: () => { setBusy(true); setError(''); setMessage(''); setResult(undefined); setSubmitted(undefined); },
      success: (reconciled) => { setResult(reconciled); setSubmitted(snapshot); setMessage(`Rapprochement ${reconciled.state}.`); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }
  return <div className={styles.grid} aria-busy={busy}><section className={styles.card}><h2>Lancer un rapprochement</h2><form className={styles.form} onSubmit={submit}><div className={styles.row}><label className={styles.field}>Date métier<input type="date" value={command.businessDate} onChange={(e) => change('businessDate', e.target.value)} /></label><label className={styles.field}>Devise<input maxLength={3} value={command.currency} onChange={(e) => change('currency', e.target.value.toUpperCase())} /></label></div><label className={styles.field}>Montant du grand livre<input inputMode="decimal" value={command.generalLedgerAmount} onChange={(e) => change('generalLedgerAmount', e.target.value)} /></label><label className={styles.field}>Référence de la source<input value={command.sourceReference} onChange={(e) => change('sourceReference', e.target.value)} /></label><label className={styles.field}>Checksum SHA-256 de la source<input className={styles.checksum} value={command.sourceChecksumSha256} onChange={(e) => change('sourceChecksumSha256', e.target.value.toLowerCase())} /></label><button className={styles.button} disabled={busy}>{busy ? 'Rapprochement…' : 'Rapprocher les écritures'}</button></form><ReconciliationError message={error} /><ReconciliationStatus message={message} /></section><section className={styles.card}><h2>Écart comptable</h2>{result && submitted ? <div className={styles.product}><span className={styles.badge}>{result.state}</span><dl><dt>Écart</dt><dd>{result.difference} {submitted.currency}</dd><dt>Rapprochement</dt><dd>{result.reconciliationId}</dd><dt>Source</dt><dd>{submitted.sourceReference}</dd></dl></div> : <p className={styles.hint}>Le backend comparera la source certifiée au grand livre et conservera la preuve du rapprochement.</p>}</section></div>;
}
