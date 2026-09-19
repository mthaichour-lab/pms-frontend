'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { dcrFieldValidity, validDcrCommand, type DcrCalculationCommand, type DcrCalculationResult } from './risk-api';
import { RiskError, RiskStatus } from './risk-feedback';
import styles from '../products/products.module.css';

const empty: DcrCalculationCommand = {
  poolId: '',
  businessDate: new Date().toISOString().slice(0, 10),
  currency: 'DZD',
  capitalDurationAmount: '',
  riskWeightedDurationAmount: '',
  threshold: '1.00',
  formulaVersion: 'DCR-1.0',
  inputChecksumSha256: '',
};

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function validDcrResult(value: unknown): value is DcrCalculationResult { return isRecord(value) && typeof value.dcrCalculationId === 'string' && value.dcrCalculationId.trim().length > 0 && typeof value.value === 'string' && typeof value.threshold === 'string' && typeof value.state === 'string' && value.state.trim().length > 0; }
export async function calculateDcrForConsole(command: DcrCalculationCommand, signal: AbortSignal): Promise<DcrCalculationResult> {
  const correlationId = crypto.randomUUID(); const response = await fetch('/api/core/risk/dcr-calculations', { method: 'POST', signal, headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID(), 'x-correlation-id': correlationId }, body: JSON.stringify(command) });
  const payload: unknown = await response.json().catch(() => undefined); const problem = isRecord(payload) ? payload : {}; const detail = typeof problem.detail === 'string' && problem.detail.trim() ? problem.detail : typeof problem.title === 'string' && problem.title.trim() ? problem.title : `Erreur HTTP ${response.status}`; const reference = typeof problem.correlationId === 'string' && problem.correlationId.trim() ? problem.correlationId : response.headers.get('x-correlation-id') ?? correlationId;
  if (!response.ok) throw new Error(`${detail} (référence : ${reference})`); if (!validDcrResult(payload)) throw new Error(`Réponse DCR invalide. (référence : ${reference})`); return payload;
}
type RiskCallbacks = { loading: () => void; success: (result: DcrCalculationResult) => void; failure: (message: string) => void; settled: () => void };
export class RiskDcrOperation {
  private active?: { readonly token: symbol; readonly controller: AbortController };
  async run(operation: (signal: AbortSignal) => Promise<DcrCalculationResult>, callbacks: RiskCallbacks): Promise<boolean> { if (this.active) return false; const current = { token: Symbol('dcr-command'), controller: new AbortController() }; this.active = current; callbacks.loading(); try { const result = await operation(current.controller.signal); if (this.active === current && !current.controller.signal.aborted) callbacks.success(result); } catch (cause) { if (this.active === current && !current.controller.signal.aborted) callbacks.failure(cause instanceof Error ? cause.message : 'Le calcul DCR a échoué.'); } finally { if (this.active === current) { this.active = undefined; if (!current.controller.signal.aborted) callbacks.settled(); } } return true; }
  cancel(): void { this.active?.controller.abort(); this.active = undefined; }
}

export function RiskConsole() {
  const [command, setCommand] = useState(empty);
  const [result, setResult] = useState<DcrCalculationResult>();
  const [busy, setBusy] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const operations = useRef<RiskDcrOperation>(null);
  if (!operations.current) operations.current = new RiskDcrOperation();
  useEffect(() => () => operations.current?.cancel(), []);

  const validity = dcrFieldValidity(command);
  const invalid = (field: keyof typeof validity) => validationAttempted && !validity[field];
  const change = (key: keyof DcrCalculationCommand, value: string) => setCommand((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationAttempted(true);
    setError('');
    setMessage('');
    if (!validDcrCommand(command)) {
      setError('Vérifiez le pool, les montants, la devise, la date, la formule et le checksum SHA-256.');
      return;
    }
    const snapshot = { ...command };
    await operations.current!.run(
      (signal) => calculateDcrForConsole(snapshot, signal),
      {
        loading: () => { setResult(undefined); setBusy(true); },
        success: (value) => { setResult(value); setMessage('Calcul DCR terminé.'); },
        failure: setError,
        settled: () => setBusy(false),
      },
    );
  }

  return <div className={styles.grid} aria-busy={busy}>
    <section className={styles.card} aria-labelledby="dcr-form-title">
      <h2 id="dcr-form-title">Calcul du DCR</h2>
      <form className={styles.form} onSubmit={submit} noValidate>
        <label className={styles.field}>Pool<input disabled={busy} value={command.poolId} onChange={(event) => change('poolId', event.target.value)} required aria-invalid={invalid('poolId')} aria-describedby="dcr-pool-hint" /></label>
        <p id="dcr-pool-hint" className={styles.hint}>2 à 64 caractères : lettres, chiffres, point, tiret ou soulignement.</p>
        <div className={styles.row}>
          <label className={styles.field}>Date métier<input disabled={busy} required type="date" value={command.businessDate} onChange={(event) => change('businessDate', event.target.value)} aria-invalid={invalid('businessDate')} aria-describedby="dcr-date-hint" /></label>
          <p id="dcr-date-hint" className={styles.hint}>Date calendaire au format AAAA-MM-JJ.</p>
          <label className={styles.field}>Devise<input disabled={busy} required value={command.currency} maxLength={3} onChange={(event) => change('currency', event.target.value.toUpperCase())} aria-invalid={invalid('currency')} aria-describedby="dcr-currency-hint" /></label>
          <p id="dcr-currency-hint" className={styles.hint}>Code ISO sur trois lettres majuscules.</p>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>Capital duration<input disabled={busy} required inputMode="decimal" value={command.capitalDurationAmount} onChange={(event) => change('capitalDurationAmount', event.target.value)} aria-invalid={invalid('capitalDurationAmount')} aria-describedby="dcr-capital-hint" /></label>
          <p id="dcr-capital-hint" className={styles.hint}>Montant décimal positif ou nul.</p>
          <label className={styles.field}>Duration pondérée du risque<input disabled={busy} required inputMode="decimal" value={command.riskWeightedDurationAmount} onChange={(event) => change('riskWeightedDurationAmount', event.target.value)} aria-invalid={invalid('riskWeightedDurationAmount')} aria-describedby="dcr-risk-duration-hint" /></label>
          <p id="dcr-risk-duration-hint" className={styles.hint}>Montant décimal strictement positif.</p>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>Seuil<input disabled={busy} required inputMode="decimal" value={command.threshold} onChange={(event) => change('threshold', event.target.value)} aria-invalid={invalid('threshold')} aria-describedby="dcr-threshold-hint" /></label>
          <p id="dcr-threshold-hint" className={styles.hint}>Nombre décimal avec au maximum six décimales.</p>
          <label className={styles.field}>Version de formule<input disabled={busy} required value={command.formulaVersion} onChange={(event) => change('formulaVersion', event.target.value)} aria-invalid={invalid('formulaVersion')} aria-describedby="dcr-formula-hint" /></label>
          <p id="dcr-formula-hint" className={styles.hint}>1 à 64 caractères techniques.</p>
        </div>
        <label className={styles.field}>Checksum SHA-256 des entrées<input disabled={busy} required spellCheck={false} className={styles.checksum} value={command.inputChecksumSha256} onChange={(event) => change('inputChecksumSha256', event.target.value.toLowerCase())} aria-invalid={invalid('inputChecksumSha256')} aria-describedby="dcr-checksum-hint" /></label>
        <p id="dcr-checksum-hint" className={styles.hint}>64 caractères hexadécimaux minuscules.</p>
        <button className={styles.button} disabled={busy}>{busy ? 'Calcul…' : 'Calculer le DCR'}</button>
      </form>
      <RiskError message={error} />
      <RiskStatus message={message} />
    </section>
    <section className={styles.card} aria-labelledby="dcr-result-title">
      <h2 id="dcr-result-title">Résultat traçable</h2>
      {result ? <div className={styles.product}><span className={styles.badge}>{result.state}</span><dl><dt>DCR</dt><dd>{result.value}</dd><dt>Seuil</dt><dd>{result.threshold}</dd><dt>Calcul</dt><dd>{result.dcrCalculationId}</dd></dl></div> : <p className={styles.hint}>Le résultat et son identifiant de preuve apparaîtront après calcul par le moteur backend.</p>}
    </section>
  </div>;
}
