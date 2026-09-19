'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { generateHistoricalYieldForecast, validForecastPoolId, type HistoricalYieldForecast } from './reporting-api';
import { ExclusiveOperationManager } from './async-operation';
import { ReportingError, ReportingStatus } from './reporting-feedback';
import styles from '../products/products.module.css';

export function HistoricalForecastConsole() {
  const [poolId, setPoolId] = useState(''), [forecast, setForecast] = useState<HistoricalYieldForecast>(), [busy, setBusy] = useState(false), [attempted, setAttempted] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const operations = useRef<ExclusiveOperationManager>(null);
  if (!operations.current) operations.current = new ExclusiveOperationManager();
  useEffect(() => () => operations.current?.cancel(), []);

  function changePoolId(value: string) { setPoolId(value); setForecast(undefined); setError(''); setMessage(''); }
  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedPoolId = poolId.trim();
    setAttempted(true);
    if (!validForecastPoolId(requestedPoolId)) { setError('Le pool doit contenir entre 2 et 64 caractères autorisés.'); return; }
    await operations.current!.run((signal) => generateHistoricalYieldForecast(requestedPoolId, signal), {
      loading: () => { setBusy(true); setError(''); setMessage(''); setForecast(undefined); },
      success: (generated) => { setForecast(generated); setMessage('Prévision historique générée.'); setAttempted(false); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }

  return <section className={styles.card} aria-busy={busy} aria-labelledby="historical-forecast-title"><h2 id="historical-forecast-title">Prévision historique de rendement</h2><form className={styles.form} onSubmit={generate} noValidate><fieldset disabled={busy}><label className={styles.field}>Pool certifié<input value={poolId} onChange={(event) => changePoolId(event.target.value)} required minLength={2} maxLength={64} autoComplete="off" spellCheck={false} aria-invalid={attempted && !validForecastPoolId(poolId.trim())} aria-describedby="historical-pool-hint" /></label><p id="historical-pool-hint" className={styles.hint}>2 à 64 caractères autorisés : lettres, chiffres, point, tiret, deux-points ou soulignement.</p><button className={styles.button} type="submit" disabled={busy}>{busy ? 'Génération…' : 'Projeter les 12 prochains mois'}</button></fieldset></form><ReportingError message={error} /><ReportingStatus message={message} />{forecast && <article className={styles.product} aria-label="Prévision générée"><span className={styles.badge}>Source clôturée · Pool uniquement</span><ul className={styles.complianceSteps}>{forecast.points.map((point) => <li key={point.month}><span aria-hidden="true">↗</span><span><strong>{point.month} · {point.forecastPercent} %</strong><small>Moyenne {point.movingAveragePercent} % · tendance {point.trendPercent} %</small></span></li>)}</ul><p className={styles.hint}>Cette projection complète les scénarios manuels et ne les remplace pas.</p><p className={styles.checksum}>{forecast.sourceChecksumSha256}</p></article>}</section>;
}
