'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { getTenorYieldCurve, validCustomerToken, validForecastPoolId, type TenorYieldCurve } from './reporting-api';
import { LatestOperationManager } from './async-operation';
import { ReportingError } from './reporting-feedback';
import styles from '../products/products.module.css';

export function TenorCurveConsole() {
  const [poolId, setPoolId] = useState(''), [customerToken, setCustomerToken] = useState(''), [curve, setCurve] = useState<TenorYieldCurve>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const requests = useRef<LatestOperationManager>(null);
  if (!requests.current) requests.current = new LatestOperationManager();
  useEffect(() => () => requests.current?.cancel(), []);
  async function load(event: FormEvent) {
    event.preventDefault();
    if (!validForecastPoolId(poolId) || !validCustomerToken(customerToken)) { requests.current!.cancel(); setBusy(false); setCurve(undefined); return setError('Le pool ou le jeton client est invalide. Utilisez uniquement un jeton tok_… pour cibler un client.'); }
    const requested = { poolId, customerToken: customerToken || undefined };
    await requests.current!.run((signal) => getTenorYieldCurve(requested.poolId, requested.customerToken, signal), {
      loading: () => { setBusy(true); setError(''); setCurve(undefined); },
      success: setCurve,
      failure: setError,
      settled: () => setBusy(false),
    });
  }
  return <section className={styles.card} aria-busy={busy}><h2>Courbe de rendement par maturité</h2><form className={styles.form} onSubmit={load}><div className={styles.row}><label className={styles.field}>Pool<input value={poolId} onChange={(event) => setPoolId(event.target.value)} required /></label><label className={styles.field}>Jeton client facultatif<input value={customerToken} onChange={(event) => setCustomerToken(event.target.value)} placeholder="tok_…" /></label></div><button className={styles.button} disabled={busy}>{busy ? 'Chargement…' : 'Afficher la courbe'}</button></form><ReportingError message={error} />{curve && <div className={styles.product}><span className={styles.badge}>{curve.scope} · {curve.businessDate}</span><ul className={styles.complianceSteps}>{curve.points.map((point) => <li key={point.bucket}><span>↔</span><span><strong>{point.bucket} · rendement {point.servedYieldPercent} %</strong><small>Financements {point.financingAmount} {curve.currency} · placements {point.placementAmount} · écart {point.gap}</small></span></li>)}</ul><p className={styles.hint}>Arrêté certifié : {curve.closingId}</p></div>}</section>;
}
