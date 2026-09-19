'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { getTenorYieldCurve, validCustomerToken, validForecastPoolId, type TenorYieldCurve } from './reporting-api';
import { LatestOperationManager } from './async-operation';
import { ReportingError, ReportingStatus } from './reporting-feedback';
import styles from '../products/products.module.css';

export function TenorCurveConsole() {
  const [poolId, setPoolId] = useState(''), [customerToken, setCustomerToken] = useState(''), [curve, setCurve] = useState<TenorYieldCurve>(), [busy, setBusy] = useState(false), [attempted, setAttempted] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const requests = useRef<LatestOperationManager>(null);
  if (!requests.current) requests.current = new LatestOperationManager();
  useEffect(() => () => requests.current?.cancel(), []);

  function resetResult() { requests.current!.cancel(); setBusy(false); setCurve(undefined); setError(''); setMessage(''); }
  function changePoolId(value: string) { setPoolId(value); resetResult(); }
  function changeCustomerToken(value: string) { setCustomerToken(value); resetResult(); }

  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requested = { poolId: poolId.trim(), customerToken: customerToken.trim() };
    setAttempted(true);
    if (!validForecastPoolId(requested.poolId) || !validCustomerToken(requested.customerToken)) { requests.current!.cancel(); setBusy(false); setCurve(undefined); setError('Le pool ou le jeton client est invalide. Utilisez uniquement un jeton tok_… pour cibler un client.'); return; }
    await requests.current!.run((signal) => getTenorYieldCurve(requested.poolId, requested.customerToken || undefined, signal), {
      loading: () => { setBusy(true); setError(''); setMessage(''); setCurve(undefined); },
      success: (result) => { setCurve(result); setMessage('Courbe de rendement chargée.'); setAttempted(false); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }

  return <section className={styles.card} aria-busy={busy} aria-labelledby="tenor-curve-title"><h2 id="tenor-curve-title">Courbe de rendement par maturité</h2><form className={styles.form} onSubmit={load} noValidate><div className={styles.row}><label className={styles.field}>Pool<input value={poolId} onChange={(event) => changePoolId(event.target.value)} required minLength={2} maxLength={64} autoComplete="off" spellCheck={false} aria-invalid={attempted && !validForecastPoolId(poolId.trim())} aria-describedby="tenor-pool-hint" /></label><label className={styles.field}>Jeton client facultatif<input value={customerToken} onChange={(event) => changeCustomerToken(event.target.value)} placeholder="tok_…" autoComplete="off" spellCheck={false} aria-invalid={attempted && !validCustomerToken(customerToken.trim())} aria-describedby="tenor-token-hint" /></label></div><p id="tenor-pool-hint" className={styles.hint}>Identifiant du pool, entre 2 et 64 caractères autorisés.</p><p id="tenor-token-hint" className={styles.hint}>Jeton facultatif tok_ de 16 à 128 caractères, jamais un identifiant client en clair.</p><button className={styles.button} type="submit" disabled={busy}>{busy ? 'Chargement…' : 'Afficher la courbe'}</button></form><ReportingError message={error} /><ReportingStatus message={message} />{curve && <article className={styles.product} aria-label="Courbe de rendement"><span className={styles.badge}>{curve.scope} · {curve.businessDate}</span><ul className={styles.complianceSteps}>{curve.points.map((point) => <li key={point.bucket}><span aria-hidden="true">↔</span><span><strong>{point.bucket} · rendement {point.servedYieldPercent} %</strong><small>Financements {point.financingAmount} {curve.currency} · placements {point.placementAmount} · écart {point.gap}</small></span></li>)}</ul><p className={styles.hint}>Arrêté certifié : {curve.closingId}</p></article>}</section>;
}
