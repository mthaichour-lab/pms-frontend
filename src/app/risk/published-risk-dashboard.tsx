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
  const requests = useRef<LatestRiskRead>(null);
  if (!requests.current) requests.current = new LatestRiskRead();
  useEffect(() => () => requests.current?.cancel(), []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');setMessage('');
    if (!validRiskPoolId(poolId)) return setError('Identifiant de pool invalide.');
    const requestedPoolId = poolId;
    await requests.current!.run((signal) => getPublishedRiskDashboard(requestedPoolId, signal), {
      loading: () => { setBusy(true); setDashboard(undefined); },
      success: (result) => { setDashboard(result); setMessage('Tableau de risque publié chargé.'); },
      failure: setError,
      settled: () => setBusy(false),
    }, 'Le tableau de risque est indisponible.');
  }
  return <div className={styles.grid} aria-busy={busy}>
    <section className={styles.card}><h2>Dernier risque publié</h2><form className={styles.form} onSubmit={submit}><label className={styles.field}>Pool<input required value={poolId} onChange={(event) => { requests.current!.cancel(); setBusy(false); setPoolId(event.target.value); setDashboard(undefined); setError(''); setMessage(''); }} /></label><button className={styles.button} disabled={busy}>{busy ? 'Chargement…' : 'Charger le tableau publié'}</button></form><RiskError message={error} /><RiskStatus message={message} /></section>
    <section className={styles.card}><h2>Indicateurs certifiés</h2>{dashboard ? <div className={styles.product}><span className={styles.badge}>{dashboard.source}</span><dl><dt>Date / devise</dt><dd>{dashboard.businessDate} · {dashboard.currency}</dd><dt>Taux pool / distribué</dt><dd>{dashboard.poolProfitRate} / {dashboard.distributedProfitRate}</dd><dt>Écart de rendement</dt><dd>{dashboard.yieldGap}</dd><dt>Marge banque</dt><dd>{dashboard.bankMargin}</dd><dt>Ressources / investi</dt><dd>{dashboard.totalResources} / {dashboard.investedAmount}</dd><dt>Concentration actif</dt><dd>{dashboard.assetConcentrationRate}</dd><dt>DCR</dt><dd>{dashboard.dcrValue ?? 'Indisponible'} {dashboard.dcrState ? `(${dashboard.dcrState})` : ''}</dd></dl>{dashboard.dataQualityWarnings.length > 0 && <p className={styles.notice}>Qualité : {dashboard.dataQualityWarnings.join(' · ')}</p>}</div> : <p className={styles.hint}>Les indicateurs proviennent exclusivement du dernier run publié.</p>}</section>
  </div>;
}
