'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { generateHistoricalYieldForecast, validForecastPoolId, type HistoricalYieldForecast } from './reporting-api';
import { ExclusiveOperationManager } from './async-operation';
import { ReportingError, ReportingStatus } from './reporting-feedback';
import styles from '../products/products.module.css';

export function HistoricalForecastConsole() {
  const [poolId, setPoolId] = useState(''), [forecast, setForecast] = useState<HistoricalYieldForecast>(), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const operations = useRef<ExclusiveOperationManager>(null);
  if (!operations.current) operations.current = new ExclusiveOperationManager();
  useEffect(() => () => operations.current?.cancel(), []);
  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!validForecastPoolId(poolId)) return setError('Le pool doit contenir entre 2 et 64 caractères autorisés.');
    const requestedPoolId = poolId;
    await operations.current!.run(() => generateHistoricalYieldForecast(requestedPoolId), {
      loading: () => { setBusy(true); setError(''); setMessage(''); setForecast(undefined); },
      success: (generated) => { setForecast(generated); setMessage('Prévision historique générée.'); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }
  return <section className={styles.card} aria-busy={busy}><h2>Prévision historique de rendement</h2><form className={styles.form} onSubmit={generate}><label className={styles.field}>Pool certifié<input value={poolId} onChange={(event) => setPoolId(event.target.value)} required /></label><button className={styles.button} disabled={busy}>{busy ? 'Génération…' : 'Projeter les 12 prochains mois'}</button></form><ReportingError message={error} /><ReportingStatus message={message} />{forecast && <div className={styles.product}><span className={styles.badge}>Source clôturée · Pool uniquement</span><ul className={styles.complianceSteps}>{forecast.points.map((point) => <li key={point.month}><span>↗</span><span><strong>{point.month} · {point.forecastPercent} %</strong><small>Moyenne {point.movingAveragePercent} % · tendance {point.trendPercent} %</small></span></li>)}</ul><p className={styles.hint}>Cette projection complète les scénarios manuels et ne les remplace pas.</p><p className={styles.checksum}>{forecast.sourceChecksumSha256}</p></div>}</section>;
}
