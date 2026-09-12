'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { generateReport, publishReport, validGeneration, validPublication, type GeneratedRegulatoryReport, type RegulatoryReportTransition } from './reporting-api';
import { ExclusiveOperationManager } from './async-operation';
import { ReportingError, ReportingStatus } from './reporting-feedback';
import styles from '../products/products.module.css';
export function ReportingConsole() {
  const [reportType, setReportType] = useState('REGULATORY_MONTHLY'), [period, setPeriod] = useState(new Date().toISOString().slice(0, 7)), [report, setReport] = useState<GeneratedRegulatoryReport>(), [evidenceDocumentId, setEvidenceDocumentId] = useState(''), [justification, setJustification] = useState(''), [publication, setPublication] = useState<RegulatoryReportTransition>(), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const operations = useRef<ExclusiveOperationManager>(null);
  if (!operations.current) operations.current = new ExclusiveOperationManager();
  useEffect(() => () => operations.current?.cancel(), []);
  async function generate(event: FormEvent) {
    event.preventDefault();
    const command = { reportType, period };
    if (!validGeneration(command)) return setError('Le type et la période du rapport sont invalides.');
    await operations.current!.run(() => generateReport(command), {
      loading: () => { setBusy(true); setError(''); setMessage(''); setReport(undefined); setPublication(undefined); },
      success: (generated) => { setReport(generated); setMessage('Rapport généré et prêt à publier.'); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }
  async function publish() {
    if (!report || publication) return;
    const command = { evidenceDocumentId, justification };
    if (!validPublication(command)) return setError('Une preuve UUID et une justification de 10 caractères minimum sont obligatoires.');
    const reportId = report.regulatoryReportId;
    await operations.current!.run(() => publishReport(reportId, command), {
      loading: () => { setBusy(true); setError(''); setMessage(''); },
      success: (published) => { setPublication(published); setMessage('Rapport publié avec sa preuve.'); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }
  return <div className={styles.grid} aria-busy={busy}><section className={styles.card}><h2>Générer le rapport</h2><form className={styles.form} onSubmit={generate}><label className={styles.field}>Type réglementaire<input value={reportType} onChange={(e) => setReportType(e.target.value.toUpperCase())} /></label><label className={styles.field}>Période<input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></label><button className={styles.button} disabled={busy}>{busy ? 'Génération…' : 'Générer le rapport'}</button></form><ReportingError message={error} /><ReportingStatus message={message} />{report && <div className={styles.product}><hr className={styles.separator} /><span className={styles.badge}>{report.state}</span><dl><dt>Rapport</dt><dd>{report.regulatoryReportId}</dd><dt>Calculs comptabilisés</dt><dd>{report.snapshot.postedCalculationCount}</dd><dt>Écarts</dt><dd>{report.snapshot.reconciliationVarianceCount}</dd><dt>Alertes DCR</dt><dd>{report.snapshot.dcrBreachCount}</dd></dl><p className={styles.checksum}>{report.outputChecksumSha256}</p></div>}</section><section className={styles.card}><h2>Publier avec preuve</h2><div className={styles.form}><label className={styles.field}>UUID de la preuve documentaire<input value={evidenceDocumentId} onChange={(e) => setEvidenceDocumentId(e.target.value)} /></label><label className={styles.field}>Justification du Checker<textarea value={justification} onChange={(e) => setJustification(e.target.value)} /></label><button className={styles.button} disabled={busy || !report || Boolean(publication)} onClick={() => void publish()}>{publication ? 'Rapport publié' : 'Publier le rapport'}</button></div>{publication ? <p className={styles.notice}>Rapport {publication.regulatoryReportId} — {publication.state}</p> : <p className={styles.hint}>La publication reste bloquée tant qu’aucun rapport n’a été généré et contrôlé.</p>}</section></div>;
}
