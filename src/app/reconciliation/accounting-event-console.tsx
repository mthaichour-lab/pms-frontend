'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { acknowledgeAccountingEvent, emitAccountingEvent, validAccountingEvent, validAcknowledgement, type AccountingAcknowledgementCommand, type AccountingEventCommand, type AccountingEventResult } from './reconciliation-api';
import { ReconciliationOperationManager } from './async-operation';
import { ReconciliationError, ReconciliationStatus } from './reconciliation-feedback';
import styles from '../products/products.module.css';

const initial: AccountingEventCommand = { runId: '', poolId: '', productId: '', eventType: 'REVENUE', eventId: '', entityId: '', businessDate: new Date().toISOString().slice(0, 10), currencyScale: 2, lines: [{ accountCode: 'POOL:REVENUE', currency: 'DZD', debit: '', credit: '0' }, { accountCode: 'GL:REVENUE', currency: 'DZD', debit: '0', credit: '' }] };
const acknowledgementActions = { PENDING: ['ACKNOWLEDGED', 'REJECTED'], ACKNOWLEDGED: [], REJECTED: ['RETRIED'], RETRIED: ['ACKNOWLEDGED', 'REJECTED', 'REVERSED'], REVERSED: [] } as const;
export function allowedAcknowledgementActions(state: string): readonly string[] { return acknowledgementActions[state as keyof typeof acknowledgementActions] ?? []; }
export function AccountingEventConsole() {
  const [command, setCommand] = useState(initial);
  const [emitted, setEmitted] = useState<AccountingEventResult>();
  const [ack, setAck] = useState<AccountingAcknowledgementCommand>({ action: 'ACKNOWLEDGED', externalReference: '' });
  const [state, setState] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const operations = useRef<ReconciliationOperationManager>(null);
  if (!operations.current) operations.current = new ReconciliationOperationManager();
  useEffect(() => () => operations.current?.cancel(), []);
  const change = (key: keyof AccountingEventCommand, value: string | number) => setCommand({ ...command, [key]: value });
  const line = (index: number, key: 'accountCode' | 'debit' | 'credit', value: string) => setCommand({ ...command, lines: command.lines.map((item, position) => position === index ? { ...item, [key]: value } : item) });
  async function emit(event: FormEvent) {
    event.preventDefault();
    if (!validAccountingEvent(command)) return setError('Vérifiez la source, l’échelle et l’équilibre exact des lignes par devise.');
    await operations.current!.run(() => emitAccountingEvent(command), {
      loading: () => { setBusy(true); setError(''); setMessage(''); setEmitted(undefined); setState(''); },
      success: (result) => { setEmitted(result); setState(result.acknowledgementState); setMessage('Événement comptable émis.'); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }
  async function updateAck() {
    if (!emitted || !allowedAcknowledgementActions(state).includes(ack.action) || !validAcknowledgement(ack)) return setError('Action invalide ou référence manquante ; un rejet exige un motif de 10 caractères.');
    const journalEntryId = emitted.journalEntryId;
    await operations.current!.run(() => acknowledgeAccountingEvent(journalEntryId, ack), {
      loading: () => { setBusy(true); setError(''); setMessage(''); },
      success: (result) => { setState(result.acknowledgementState); const next = allowedAcknowledgementActions(result.acknowledgementState)[0]; if (next) setAck((current) => ({ action: next, externalReference: current.externalReference })); setMessage(`Accusé passé au statut ${result.acknowledgementState}.`); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }
  const actions = allowedAcknowledgementActions(state);
  return <div className={styles.grid} aria-busy={busy}>
    <section className={styles.card}><h2>Émettre un événement comptable</h2><form className={styles.form} onSubmit={emit}><div className={styles.row}><label className={styles.field}>Run<input value={command.runId} onChange={(event) => change('runId', event.target.value)} /></label><label className={styles.field}>Pool<input value={command.poolId} onChange={(event) => change('poolId', event.target.value)} /></label></div><div className={styles.row}><label className={styles.field}>Produit<input value={command.productId} onChange={(event) => change('productId', event.target.value)} /></label><label className={styles.field}>Entité<input value={command.entityId} onChange={(event) => change('entityId', event.target.value)} /></label></div><div className={styles.row}><label className={styles.field}>Événement<input value={command.eventId} onChange={(event) => change('eventId', event.target.value)} /></label><label className={styles.field}>Type<select value={command.eventType} onChange={(event) => change('eventType', event.target.value)}>{['REVENUE','PROFIT_SHARE','PER_MOVEMENT','IRR_MOVEMENT','PURIFICATION','WITHHOLDING_TAX','REMAINDER','CORRECTION'].map((value) => <option key={value}>{value}</option>)}</select></label></div>{command.lines.map((item, index) => <div className={styles.row} key={index}><label className={styles.field}>Compte {index + 1}<input value={item.accountCode} onChange={(event) => line(index, 'accountCode', event.target.value)} /></label><label className={styles.field}>{index === 0 ? 'Débit' : 'Crédit'}<input inputMode="decimal" value={index === 0 ? item.debit : item.credit} onChange={(event) => line(index, index === 0 ? 'debit' : 'credit', event.target.value)} /></label></div>)}<button className={styles.button} disabled={busy}>{busy ? 'Émission…' : 'Émettre le journal'}</button></form><ReconciliationError message={error} /><ReconciliationStatus message={message} /></section>
    <section className={styles.card}><h2>Accusé du grand livre</h2>{emitted ? <div className={styles.form}><span className={styles.badge}>{state}</span><p className={styles.hint}>Journal : {emitted.journalEntryId}</p>{actions.length > 0 ? <><label className={styles.field}>Action<select value={ack.action} onChange={(event) => setAck({ action: event.target.value, externalReference: ack.externalReference })}>{actions.map((value) => <option key={value}>{value}</option>)}</select></label><label className={styles.field}>Référence externe<input value={ack.externalReference} onChange={(event) => setAck({ ...ack, externalReference: event.target.value })} /></label>{ack.action === 'REJECTED' && <label className={styles.field}>Motif<textarea value={ack.reason ?? ''} onChange={(event) => setAck({ ...ack, reason: event.target.value })} /></label>}<button type="button" className={styles.button} disabled={busy} onClick={updateAck}>Mettre à jour l’accusé</button></> : <p className={styles.notice}>Cycle d’accusé terminé.</p>}</div> : <p className={styles.hint}>Émettez d’abord un événement équilibré pour piloter son accusé.</p>}</section>
  </div>;
}
