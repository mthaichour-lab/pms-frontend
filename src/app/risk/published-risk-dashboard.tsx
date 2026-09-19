'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { getPublishedRiskDashboard, validRiskPoolId, type PublishedRiskDashboard } from './risk-api';
import { LatestRiskRead } from './async-operation';
import { RiskError, RiskStatus } from './risk-feedback';
import styles from '../products/products.module.css';

export function PublishedRiskDashboardConsole() {
  const [poolId, setPoolId] = useState('');
  const [dashboard, setDashboard] = useState<PublishedRiskDashboard>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [validationAttempted, setValidationAttempted] = useState(false);
  const requests = useRef<LatestRiskRead>(null);
  if (!requests.current) requests.current = new LatestRiskRead();
  useEffect(() => () => requests.current?.cancel(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationAttempted(true);
    setError('');
    setMessage('');
    if (!validRiskPoolId(poolId)) {
      setError('Identifiant de pool invalide.');
      return;
    }
    const requestedPoolId = poolId;
    await requests.current!.run(
      (signal) => getPublishedRiskDashboard(requestedPoolId, signal),
      {
        loading: () => { setBusy(true); setDashboard(undefined); },
        success: (result) => { setDashboard(result); setMessage('Tableau de risque publié chargé.'); },
        failure: setError,
        settled: () => setBusy(false),
      },
      'Le tableau de risque est indisponible.',
    );
  }

  function changePoolId(value: string) {
    requests.current!.cancel();
    setBusy(false);
    setPoolId(value);
    setDashboard(undefined);
    setValidationAttempted(false);
    setError('');
    setMessage('');
  }

  return <div className={styles.grid} aria-busy={busy}>
    <section className={styles.card} aria-labelledby="risk-dashboard-form-title">
      <h2 id="risk-dashboard-form-title">Dernier risque publié</h2>
      <form className={styles.form} onSubmit={submit} noValidate>
        <label className={styles.field}>Pool<input required value={poolId} onChange={(event) => changePoolId(event.target.value)} aria-invalid={validationAttempted && !validRiskPoolId(poolId)} aria-describedby="risk-dashboard-pool-hint" /></label>
        <p id="risk-dashboard-pool-hint" className={styles.hint}>2 à 64 caractères : lettres, chiffres, point, tiret ou soulignement.</p>
        <button className={styles.button} disabled={busy}>{busy ? 'Chargement…' : 'Charger le tableau publié'}</button>
      </form>
      <RiskError message={error} />
      <RiskStatus message={message} />
    </section>
    <section className={styles.card} aria-labelledby="risk-dashboard-result-title">
      <h2 id="risk-dashboard-result-title">Indicateurs certifiés</h2>
      {dashboard ? <div className={styles.product}><span className={styles.badge}>{dashboard.source}</span><dl><dt>Date / devise</dt><dd>{dashboard.businessDate} · {dashboard.currency}</dd><dt>Taux pool / distribué</dt><dd>{dashboard.poolProfitRate} / {dashboard.distributedProfitRate}</dd><dt>Écart de rendement</dt><dd>{dashboard.yieldGap}</dd><dt>Marge banque</dt><dd>{dashboard.bankMargin}</dd><dt>Ressources / investi</dt><dd>{dashboard.totalResources} / {dashboard.investedAmount}</dd><dt>Concentration actif</dt><dd>{dashboard.assetConcentrationRate}</dd><dt>DCR</dt><dd>{dashboard.dcrValue ?? 'Indisponible'} {dashboard.dcrState ? `(${dashboard.dcrState})` : ''}</dd></dl>{dashboard.dataQualityWarnings.length > 0 ? <p className={styles.notice}>Qualité : {dashboard.dataQualityWarnings.join(' · ')}</p> : null}</div> : <p className={styles.hint}>Les indicateurs proviennent exclusivement du dernier run publié.</p>}
    </section>
  </div>;
}
