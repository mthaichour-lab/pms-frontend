'use client';
import { FormEvent, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  accountingEventFieldErrors,
  validAccountingEvent,
  validAcknowledgement,
  type AccountingAcknowledgementCommand,
  type AccountingEventCommand,
  type AccountingEventFieldErrors,
  type AccountingEventResult,
} from './reconciliation-api';
import { ReconciliationError, ReconciliationStatus } from './reconciliation-feedback';
import styles from '../products/products.module.css';

const initial: AccountingEventCommand = {
  runId: '', poolId: '', productId: '', eventType: 'REVENUE', eventId: '', entityId: '',
  businessDate: new Date().toISOString().slice(0, 10), currencyScale: 2,
  lines: [
    { accountCode: 'POOL:REVENUE', currency: 'DZD', debit: '', credit: '0' },
    { accountCode: 'GL:REVENUE', currency: 'DZD', debit: '0', credit: '' },
  ],
};
const acknowledgementActions = { PENDING: ['ACKNOWLEDGED', 'REJECTED'], ACKNOWLEDGED: [], REJECTED: ['RETRIED'], RETRIED: ['ACKNOWLEDGED', 'REJECTED', 'REVERSED'], REVERSED: [] } as const;
const eventTypes = ['REVENUE', 'PROFIT_SHARE', 'PER_MOVEMENT', 'IRR_MOVEMENT', 'PURIFICATION', 'WITHHOLDING_TAX', 'REMAINDER', 'CORRECTION'];

type AccountingWorkCallbacks<TResult> = { loading: () => void; success: (result: TResult) => void; failure: (message: string) => void; settled: () => void };
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function validEventResult(value: unknown): value is AccountingEventResult { return isRecord(value) && typeof value.journalEntryId === 'string' && value.journalEntryId.trim().length > 0 && typeof value.acknowledgementState === 'string' && value.acknowledgementState.trim().length > 0; }
function validAcknowledgementResult(value: unknown): value is { acknowledgementState: string } { return isRecord(value) && typeof value.acknowledgementState === 'string' && value.acknowledgementState.trim().length > 0; }
export async function accountingCommand<TResult>(path: string, command: unknown, validate: (value: unknown) => value is TResult, signal: AbortSignal): Promise<TResult> {
  const correlationId = crypto.randomUUID();
  const response = await fetch(path, { method: 'POST', signal, headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID(), 'x-correlation-id': correlationId }, body: JSON.stringify(command) });
  const payload: unknown = await response.json().catch(() => undefined);
  const problem = isRecord(payload) ? payload : {};
  const detail = typeof problem.detail === 'string' && problem.detail.trim() ? problem.detail : typeof problem.title === 'string' && problem.title.trim() ? problem.title : `Erreur HTTP ${response.status}`;
  const reference = typeof problem.correlationId === 'string' && problem.correlationId.trim() ? problem.correlationId : response.headers.get('x-correlation-id') ?? correlationId;
  if (!response.ok) throw new Error(`${detail} (référence : ${reference})`);
  if (!validate(payload)) throw new Error(`Réponse comptable invalide. (référence : ${reference})`);
  return payload;
}
export class AccountingEventOperationManager {
  private active?: { readonly token: symbol; readonly controller: AbortController };
  isActive(): boolean { return this.active !== undefined; }
  async run<TResult>(operation: (signal: AbortSignal) => Promise<TResult>, callbacks: AccountingWorkCallbacks<TResult>): Promise<boolean> {
    if (this.active) return false;
    const current = { token: Symbol('accounting-event-operation'), controller: new AbortController() };
    this.active = current; callbacks.loading();
    try { const result = await operation(current.controller.signal); if (this.active === current && !current.controller.signal.aborted) callbacks.success(result); }
    catch (cause) { if (this.active === current && !current.controller.signal.aborted) callbacks.failure(cause instanceof Error ? cause.message : 'Erreur inattendue.'); }
    finally { if (this.active === current) { this.active = undefined; if (!current.controller.signal.aborted) callbacks.settled(); } }
    return true;
  }
  cancel(): void { this.active?.controller.abort(); this.active = undefined; }
}

export function allowedAcknowledgementActions(state: string): readonly string[] {
  return acknowledgementActions[state as keyof typeof acknowledgementActions] ?? [];
}

type EventField = Exclude<keyof AccountingEventCommand, 'lines'>;
type LineField = 'accountCode' | 'currency' | 'debit' | 'credit';
type AccountingEventViewProps = {
  readonly command: AccountingEventCommand;
  readonly emitted?: AccountingEventResult;
  readonly acknowledgement: AccountingAcknowledgementCommand;
  readonly acknowledgementState: string;
  readonly errors: AccountingEventFieldErrors;
  readonly showErrors: boolean;
  readonly busy: boolean;
  readonly error: string;
  readonly message: string;
  readonly onCommandChange: (key: EventField, value: string | number) => void;
  readonly onLineChange: (index: number, key: LineField, value: string) => void;
  readonly onAddLine: () => void;
  readonly onRemoveLine: (index: number) => void;
  readonly onEmit: (event: FormEvent) => void;
  readonly onAcknowledgementChange: (command: AccountingAcknowledgementCommand) => void;
  readonly onUpdateAcknowledgement: () => void;
};

function fieldErrorProps(id: string, message?: string) {
  return { required: true, 'aria-invalid': Boolean(message), 'aria-describedby': message ? `${id}-error` : undefined } as const;
}
function FieldError({ id, children }: { readonly id: string; readonly children?: ReactNode }) {
  return children ? <span id={`${id}-error`} role="alert">{children}</span> : null;
}

export function AccountingEventView(props: AccountingEventViewProps) {
  const { command, emitted, acknowledgement: ack, acknowledgementState: state, errors, showErrors, busy, error, message } = props;
  const actions = allowedAcknowledgementActions(state);
  const visible = (value?: string) => showErrors ? value : undefined;
  const ackReferenceError = ack.externalReference.trim() ? undefined : 'La référence externe est requise.';
  const ackReasonError = ack.action === 'REJECTED' && ((ack.reason?.trim().length ?? 0) < 10) ? 'Le motif doit contenir au moins 10 caractères.' : undefined;
  return <div className={styles.grid} aria-busy={busy}>
    <section className={styles.card} aria-busy={busy} aria-labelledby="accounting-event-title">
      <h2 id="accounting-event-title">Émettre un événement comptable</h2>
      <form className={styles.form} onSubmit={props.onEmit} noValidate>
        <div className={styles.row}>
          <label className={styles.field}>Run<input id="accounting-run-id" disabled={busy} value={command.runId} onChange={(event) => props.onCommandChange('runId', event.target.value)} {...fieldErrorProps('accounting-run-id', visible(errors.runId))} /><FieldError id="accounting-run-id">{visible(errors.runId)}</FieldError></label>
          <label className={styles.field}>Pool<input id="accounting-pool-id" disabled={busy} value={command.poolId} onChange={(event) => props.onCommandChange('poolId', event.target.value)} {...fieldErrorProps('accounting-pool-id', visible(errors.poolId))} /><FieldError id="accounting-pool-id">{visible(errors.poolId)}</FieldError></label>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>Produit<input id="accounting-product-id" disabled={busy} value={command.productId} onChange={(event) => props.onCommandChange('productId', event.target.value)} {...fieldErrorProps('accounting-product-id', visible(errors.productId))} /><FieldError id="accounting-product-id">{visible(errors.productId)}</FieldError></label>
          <label className={styles.field}>Entité<input id="accounting-entity-id" disabled={busy} value={command.entityId} onChange={(event) => props.onCommandChange('entityId', event.target.value)} {...fieldErrorProps('accounting-entity-id', visible(errors.entityId))} /><FieldError id="accounting-entity-id">{visible(errors.entityId)}</FieldError></label>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>Événement<input id="accounting-event-id" disabled={busy} value={command.eventId} onChange={(event) => props.onCommandChange('eventId', event.target.value)} {...fieldErrorProps('accounting-event-id', visible(errors.eventId))} /><FieldError id="accounting-event-id">{visible(errors.eventId)}</FieldError></label>
          <label className={styles.field}>Type<select disabled={busy} value={command.eventType} onChange={(event) => props.onCommandChange('eventType', event.target.value)}>{eventTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>Date métier<input id="accounting-business-date" type="date" disabled={busy} value={command.businessDate} onChange={(event) => props.onCommandChange('businessDate', event.target.value)} {...fieldErrorProps('accounting-business-date', visible(errors.businessDate))} /><FieldError id="accounting-business-date">{visible(errors.businessDate)}</FieldError></label>
          <label className={styles.field}>Nombre de décimales<input id="accounting-currency-scale" type="number" min={0} max={6} step={1} disabled={busy} value={command.currencyScale} onChange={(event) => props.onCommandChange('currencyScale', Number(event.target.value))} {...fieldErrorProps('accounting-currency-scale', visible(errors.currencyScale))} /><FieldError id="accounting-currency-scale">{visible(errors.currencyScale)}</FieldError></label>
        </div>
        <fieldset disabled={busy} aria-describedby={visible(errors.lines) ? 'accounting-lines-error' : undefined}>
          <legend>Lignes du journal ({command.lines.length})</legend>
          {command.lines.map((item, index) => {
            const lineErrors = errors.lineFields[index] ?? {};
            return <div className={styles.product} key={index}>
              <strong>Ligne {index + 1}</strong>
              <div className={styles.row}>
                <label className={styles.field}>Compte<input id={`accounting-line-${index}-account`} value={item.accountCode} onChange={(event) => props.onLineChange(index, 'accountCode', event.target.value)} {...fieldErrorProps(`accounting-line-${index}-account`, visible(lineErrors.accountCode))} /><FieldError id={`accounting-line-${index}-account`}>{visible(lineErrors.accountCode)}</FieldError></label>
                <label className={styles.field}>Devise<input id={`accounting-line-${index}-currency`} maxLength={3} value={item.currency} onChange={(event) => props.onLineChange(index, 'currency', event.target.value.toUpperCase())} {...fieldErrorProps(`accounting-line-${index}-currency`, visible(lineErrors.currency))} /><FieldError id={`accounting-line-${index}-currency`}>{visible(lineErrors.currency)}</FieldError></label>
              </div>
              <div className={styles.row}>
                <label className={styles.field}>Débit<input id={`accounting-line-${index}-debit`} inputMode="decimal" value={item.debit} onChange={(event) => props.onLineChange(index, 'debit', event.target.value)} {...fieldErrorProps(`accounting-line-${index}-debit`, visible(lineErrors.debit))} /><FieldError id={`accounting-line-${index}-debit`}>{visible(lineErrors.debit)}</FieldError></label>
                <label className={styles.field}>Crédit<input id={`accounting-line-${index}-credit`} inputMode="decimal" value={item.credit} onChange={(event) => props.onLineChange(index, 'credit', event.target.value)} {...fieldErrorProps(`accounting-line-${index}-credit`, visible(lineErrors.credit))} /><FieldError id={`accounting-line-${index}-credit`}>{visible(lineErrors.credit)}</FieldError></label>
              </div>
              <button type="button" disabled={busy || command.lines.length <= 2} onClick={() => props.onRemoveLine(index)}>Supprimer la ligne {index + 1}</button>
            </div>;
          })}
          <button type="button" disabled={busy || command.lines.length >= 1000} onClick={props.onAddLine}>Ajouter une ligne</button>
          <FieldError id="accounting-lines">{visible(errors.lines)}</FieldError>
        </fieldset>
        <button className={styles.button} type="submit" disabled={busy}>{busy ? 'Émission…' : 'Émettre le journal'}</button>
      </form>
      <ReconciliationError message={error} /><ReconciliationStatus message={message} />
    </section>
    <section className={styles.card} aria-busy={busy} aria-labelledby="accounting-ack-title">
      <h2 id="accounting-ack-title">Accusé du grand livre</h2>
      {emitted ? <div className={styles.form} aria-live="polite" aria-atomic="true">
        <span className={styles.badge}>{state}</span><p className={styles.hint}>Journal : {emitted.journalEntryId}</p>
        {actions.length > 0 ? <>
          <label className={styles.field}>Action<select disabled={busy} value={ack.action} onChange={(event) => props.onAcknowledgementChange({ action: event.target.value, externalReference: ack.externalReference })}>{actions.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className={styles.field}>Référence externe<input id="ack-reference" disabled={busy} value={ack.externalReference} onChange={(event) => props.onAcknowledgementChange({ ...ack, externalReference: event.target.value })} {...fieldErrorProps('ack-reference', ackReferenceError)} /><FieldError id="ack-reference">{ackReferenceError}</FieldError></label>
          {ack.action === 'REJECTED' && <label className={styles.field}>Motif<textarea id="ack-reason" disabled={busy} value={ack.reason ?? ''} onChange={(event) => props.onAcknowledgementChange({ ...ack, reason: event.target.value })} {...fieldErrorProps('ack-reason', ackReasonError)} /><FieldError id="ack-reason">{ackReasonError}</FieldError></label>}
          <button type="button" className={styles.button} disabled={busy} onClick={props.onUpdateAcknowledgement}>Mettre à jour l’accusé</button>
        </> : <p className={styles.notice}>Cycle d’accusé terminé.</p>}
      </div> : <p className={styles.hint}>Émettez d’abord un événement équilibré pour piloter son accusé.</p>}
    </section>
  </div>;
}

export function AccountingEventConsole() {
  const [command, setCommand] = useState(initial);
  const [emitted, setEmitted] = useState<AccountingEventResult>();
  const [ack, setAck] = useState<AccountingAcknowledgementCommand>({ action: 'ACKNOWLEDGED', externalReference: '' });
  const [state, setState] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const operations = useRef<AccountingEventOperationManager>(null);
  if (!operations.current) operations.current = new AccountingEventOperationManager();
  useEffect(() => () => operations.current?.cancel(), []);
  const invalidateResult = () => { setEmitted(undefined); setState(''); setMessage(''); };
  const change = (key: EventField, value: string | number) => {
    setCommand((current) => ({ ...current, [key]: value }));
    invalidateResult();
  };
  const changeLine = (index: number, key: LineField, value: string) => {
    setCommand((current) => ({ ...current, lines: current.lines.map((item, position) => position === index ? { ...item, [key]: value } : item) }));
    invalidateResult();
  };
  const addLine = () => {
    setCommand((current) => ({ ...current, lines: [...current.lines, { accountCode: '', currency: current.lines.at(-1)?.currency ?? 'DZD', debit: '0', credit: '' }] }));
    invalidateResult();
  };
  const removeLine = (index: number) => {
    setCommand((current) => current.lines.length <= 2 ? current : ({ ...current, lines: current.lines.filter((_, position) => position !== index) }));
    invalidateResult();
  };
  async function emit(event: FormEvent) {
    event.preventDefault();
    setShowErrors(true);
    if (!validAccountingEvent(command)) return setError('Vérifiez les champs et l’équilibre exact des lignes par devise.');
    const snapshot: AccountingEventCommand = { ...command, lines: command.lines.map((item) => ({ ...item })) };
    await operations.current!.run((signal) => accountingCommand('/api/core/accounting/events', snapshot, validEventResult, signal), {
      loading: () => { setBusy(true); setError(''); setMessage(''); setEmitted(undefined); setState(''); },
      success: (result) => { setEmitted(result); setState(result.acknowledgementState); setMessage('Événement comptable émis.'); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }
  async function updateAck() {
    if (!emitted || !allowedAcknowledgementActions(state).includes(ack.action) || !validAcknowledgement(ack)) return setError('Action invalide ou référence manquante ; un rejet exige un motif de 10 caractères.');
    const journalEntryId = emitted.journalEntryId;
    const snapshot = { ...ack };
    await operations.current!.run((signal) => accountingCommand(`/api/core/accounting/journals/${encodeURIComponent(journalEntryId)}/acknowledgements`, snapshot, validAcknowledgementResult, signal), {
      loading: () => { setBusy(true); setError(''); setMessage(''); },
      success: (result) => { setState(result.acknowledgementState); const next = allowedAcknowledgementActions(result.acknowledgementState)[0]; if (next) setAck((current) => ({ action: next, externalReference: current.externalReference })); setMessage(`Accusé passé au statut ${result.acknowledgementState}.`); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }
  return <AccountingEventView command={command} emitted={emitted} acknowledgement={ack} acknowledgementState={state} errors={accountingEventFieldErrors(command)} showErrors={showErrors} busy={busy} error={error} message={message} onCommandChange={change} onLineChange={changeLine} onAddLine={addLine} onRemoveLine={removeLine} onEmit={emit} onAcknowledgementChange={setAck} onUpdateAcknowledgement={updateAck} />;
}
