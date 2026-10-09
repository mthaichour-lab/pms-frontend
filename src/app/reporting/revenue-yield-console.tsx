'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { getRevenueYieldReport, validForecastPoolId, validReportingPeriod, type RevenueYieldReport } from './reporting-api';
import { LatestOperationManager } from './async-operation';
import { ReportingError, ReportingStatus } from './reporting-feedback';
import styles from '../products/products.module.css';

const today = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

export function RevenueYieldConsole() {
  const [poolId, setPoolId] = useState(''), [periodFrom, setPeriodFrom] = useState(monthAgo), [periodTo, setPeriodTo] = useState(today), [report, setReport] = useState<RevenueYieldReport>(), [busy, setBusy] = useState(false), [attempted, setAttempted] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const requests = useRef<LatestOperationManager>(null);
  if (!requests.current) requests.current = new LatestOperationManager();
  useEffect(() => () => requests.current?.cancel(), []);

  function resetResult() { requests.current!.cancel(); setBusy(false); setReport(undefined); setError(''); setMessage(''); }
  function changePoolId(value: string) { setPoolId(value); resetResult(); }
  function changePeriodFrom(value: string) { setPeriodFrom(value); resetResult(); }
  function changePeriodTo(value: string) { setPeriodTo(value); resetResult(); }

  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requested = { poolId: poolId.trim(), periodFrom, periodTo };
    setAttempted(true);
    if (!validForecastPoolId(requested.poolId) || !validReportingPeriod(requested.periodFrom, requested.periodTo)) {
      requests.current!.cancel(); setBusy(false); setReport(undefined);
      setError('Le pool ou la période est invalide. La date de début doit précéder ou égaler la date de fin.');
      return;
    }
    await requests.current!.run((signal) => getRevenueYieldReport(requested.poolId, requested.periodFrom, requested.periodTo, signal), {
      loading: () => { setBusy(true); setError(''); setMessage(''); setReport(undefined); },
      success: (result) => { setReport(result); setMessage('Rapport de rendement des revenus chargé.'); setAttempted(false); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }

  return <section className={styles.card} aria-busy={busy} aria-labelledby="revenue-yield-title">
    <h2 id="revenue-yield-title">Taux de rendement et de profit des revenus par GL et par pool</h2>
    <form className={styles.form} onSubmit={load} noValidate>
      <div className={styles.row}>
        <label className={styles.field}>Pool<input value={poolId} onChange={(event) => changePoolId(event.target.value)} required minLength={2} maxLength={64} autoComplete="off" spellCheck={false} aria-invalid={attempted && !validForecastPoolId(poolId.trim())} /></label>
      </div>
      <div className={styles.row}>
        <label className={styles.field}>Du<input type="date" value={periodFrom} onChange={(event) => changePeriodFrom(event.target.value)} required /></label>
        <label className={styles.field}>Au<input type="date" value={periodTo} onChange={(event) => changePeriodTo(event.target.value)} required /></label>
      </div>
      <p className={styles.hint}>La base de capital utilisée pour les taux est le dernier arrêté certifié du pool à la date de fin de période.</p>
      <button className={styles.button} type="submit" disabled={busy}>{busy ? 'Chargement…' : 'Afficher les taux de revenus'}</button>
    </form>
    <ReportingError message={error} />
    <ReportingStatus message={message} />
    {report && <article aria-label="Taux de rendement des revenus">
      <span className={styles.badge}>{report.poolId} · {report.periodFrom} → {report.periodTo} · base {report.capitalBase} {report.currency}</span>
      <h2>Par compte GL</h2>
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Compte GL</th><th>Reçu</th><th>Accru</th><th>Taux reçu %</th><th>Taux reconnu %</th></tr></thead>
          <tbody>{report.byGlAccount.map((row) => <tr key={row.glAccountCode}><td className={styles.catalogId}>{row.glAccountCode}</td><td>{row.receivedAmount} {report.currency}</td><td>{row.accruedAmount} {report.currency}</td><td>{row.receivedRatePercent}</td><td>{row.recognizedRatePercent}</td></tr>)}</tbody>
        </table>
      </div>
      <h2>Par tranche de maturité</h2>
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Tranche</th><th>Reçu</th><th>Accru</th><th>Taux reçu %</th><th>Taux reconnu %</th></tr></thead>
          <tbody>{report.byMaturityBucket.map((bucket) => <tr key={bucket.bucket}><td>{bucket.bucket}</td><td>{bucket.receivedAmount} {report.currency}</td><td>{bucket.accruedAmount} {report.currency}</td><td>{bucket.receivedRatePercent}</td><td>{bucket.recognizedRatePercent}</td></tr>)}</tbody>
        </table>
      </div>
    </article>}
  </section>;
}
