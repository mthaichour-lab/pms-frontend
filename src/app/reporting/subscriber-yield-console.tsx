'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { getSubscriberYieldReport, validForecastPoolId, type SubscriberYieldReport } from './reporting-api';
import { LatestOperationManager } from './async-operation';
import { ReportingError, ReportingStatus } from './reporting-feedback';
import styles from '../products/products.module.css';

export function SubscriberYieldConsole() {
  const [poolId, setPoolId] = useState(''), [report, setReport] = useState<SubscriberYieldReport>(), [busy, setBusy] = useState(false), [attempted, setAttempted] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const requests = useRef<LatestOperationManager>(null);
  if (!requests.current) requests.current = new LatestOperationManager();
  useEffect(() => () => requests.current?.cancel(), []);

  function changePoolId(value: string) { setPoolId(value); requests.current!.cancel(); setBusy(false); setReport(undefined); setError(''); setMessage(''); }

  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requested = poolId.trim();
    setAttempted(true);
    if (!validForecastPoolId(requested)) { requests.current!.cancel(); setBusy(false); setReport(undefined); setError('Le pool est invalide.'); return; }
    await requests.current!.run((signal) => getSubscriberYieldReport(requested, signal), {
      loading: () => { setBusy(true); setError(''); setMessage(''); setReport(undefined); },
      success: (result) => { setReport(result); setMessage('Rapport de rendement par souscripteur chargé.'); setAttempted(false); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }

  return <section className={styles.card} aria-busy={busy} aria-labelledby="subscriber-yield-title">
    <h2 id="subscriber-yield-title">Taux de profit et de rendement par souscripteur</h2>
    <form className={styles.form} onSubmit={load} noValidate>
      <label className={styles.field}>Pool<input value={poolId} onChange={(event) => changePoolId(event.target.value)} required minLength={2} maxLength={64} autoComplete="off" spellCheck={false} aria-invalid={attempted && !validForecastPoolId(poolId.trim())} aria-describedby="subscriber-yield-hint" /></label>
      <p id="subscriber-yield-hint" className={styles.hint}>Identifiant du pool, entre 2 et 64 caractères autorisés. Le dernier calcul affecté (POSTED/ARCHIVED) est utilisé.</p>
      <button className={styles.button} type="submit" disabled={busy}>{busy ? 'Chargement…' : 'Afficher les taux par souscripteur'}</button>
    </form>
    <ReportingError message={error} />
    <ReportingStatus message={message} />
    {report && <article aria-label="Taux par souscripteur">
      <span className={styles.badge}>{report.poolId} · {report.businessDate} · {report.currency}</span>
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Compte</th><th>Capital investi</th><th>Profit alloué</th><th>Taux réalisé %</th><th>Taux distribué %</th><th>Maturité</th><th>Tranche</th></tr></thead>
          <tbody>{report.subscribers.map((row) => <tr key={row.accountId}><td className={styles.catalogId}>{row.accountId}</td><td>{row.capitalInvested} {report.currency}</td><td>{row.allocatedProfit} {report.currency}</td><td>{row.realizedRatePercent}</td><td>{row.distributedRatePercent}</td><td>{row.maturityDate}</td><td>{row.maturityBucket}</td></tr>)}</tbody>
        </table>
      </div>
      <h2>Répartition par tranche de maturité</h2>
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Tranche</th><th>Souscripteurs</th><th>Capital investi</th><th>Profit alloué</th><th>Taux moyen %</th></tr></thead>
          <tbody>{report.byMaturityBucket.map((bucket) => <tr key={bucket.bucket}><td>{bucket.bucket}</td><td>{bucket.subscriberCount}</td><td>{bucket.capitalInvested} {report.currency}</td><td>{bucket.allocatedProfit} {report.currency}</td><td>{bucket.averageRatePercent}</td></tr>)}</tbody>
        </table>
      </div>
    </article>}
  </section>;
}
