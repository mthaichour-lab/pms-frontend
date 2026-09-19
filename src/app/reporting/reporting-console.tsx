'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { generateReport, generationFieldValidity, publicationFieldValidity, publishReport, type GeneratedRegulatoryReport, type RegulatoryReportTransition } from './reporting-api';
import { ExclusiveOperationManager } from './async-operation';
import { downloadReport } from './report-download';
import { ReportingError, ReportingStatus } from './reporting-feedback';
import styles from '../products/products.module.css';

export function ReportingConsole() {
  const [reportType, setReportType] = useState('REGULATORY_MONTHLY'), [period, setPeriod] = useState(new Date().toISOString().slice(0, 7)), [report, setReport] = useState<GeneratedRegulatoryReport>(), [evidenceDocumentId, setEvidenceDocumentId] = useState(''), [justification, setJustification] = useState(''), [publication, setPublication] = useState<RegulatoryReportTransition>(), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [generationAttempted, setGenerationAttempted] = useState(false), [publicationAttempted, setPublicationAttempted] = useState(false);
  const operations = useRef<ExclusiveOperationManager>(null);
  if (!operations.current) operations.current = new ExclusiveOperationManager();
  useEffect(() => () => operations.current?.cancel(), []);

  const generation = { reportType: reportType.trim(), period };
  const generationValidity = generationFieldValidity(generation);
  const publicationInput = { evidenceDocumentId: evidenceDocumentId.trim(), justification };
  const publicationCommand = { ...publicationInput, justification: justification.trim() };
  const publicationValidity = publicationFieldValidity(publicationInput);

  function resetGeneratedReport() { setReport(undefined); setPublication(undefined); setEvidenceDocumentId(''); setJustification(''); setMessage(''); setError(''); setPublicationAttempted(false); }
  function changeReportType(value: string) { setReportType(value.toUpperCase()); resetGeneratedReport(); }
  function changePeriod(value: string) { setPeriod(value); resetGeneratedReport(); }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGenerationAttempted(true);
    if (!Object.values(generationValidity).every(Boolean)) { setError('Le type et la période du rapport sont invalides.'); return; }
    await operations.current!.run((signal) => generateReport(generation, signal), {
      loading: () => { setBusy(true); setError(''); setMessage(''); setReport(undefined); setPublication(undefined); },
      success: (generated) => { setReport(generated); setMessage('Rapport généré et prêt à publier ou télécharger.'); setGenerationAttempted(false); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!report || publication || operations.current!.isActive()) return;
    setPublicationAttempted(true);
    if (!Object.values(publicationValidity).every(Boolean)) { setError('Une preuve UUID et une justification de 10 à 1 000 caractères sont obligatoires.'); return; }
    const reportId = report.regulatoryReportId;
    await operations.current!.run((signal) => publishReport(reportId, publicationCommand, signal), {
      loading: () => { setBusy(true); setError(''); setMessage(''); },
      success: (published) => { setPublication(published); setMessage('Rapport publié avec sa preuve.'); setPublicationAttempted(false); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }

  function download() {
    if (!report) return;
    try { downloadReport(report); setError(''); setMessage('Téléchargement JSON préparé.'); }
    catch { setError('Le navigateur n’a pas pu préparer le téléchargement.'); }
  }

  return <div className={styles.grid} aria-busy={busy}>
    <section className={styles.card} aria-labelledby="report-generation-title" aria-busy={busy}>
      <h2 id="report-generation-title">Générer le rapport</h2>
      <form className={styles.form} onSubmit={generate} noValidate><fieldset disabled={busy}>
        <label className={styles.field}>Type réglementaire<input value={reportType} onChange={(event) => changeReportType(event.target.value)} required minLength={2} maxLength={64} autoComplete="off" spellCheck={false} aria-invalid={generationAttempted && !generationValidity.reportType} aria-describedby="report-type-hint" /></label>
        <p id="report-type-hint" className={styles.hint}>2 à 64 lettres majuscules, chiffres, tirets ou soulignements.</p>
        <label className={styles.field}>Période<input type="month" value={period} onChange={(event) => changePeriod(event.target.value)} required aria-invalid={generationAttempted && !generationValidity.period} aria-describedby="report-period-hint" /></label>
        <p id="report-period-hint" className={styles.hint}>Mois réglementaire au format AAAA-MM.</p>
        <button className={styles.button} type="submit" disabled={busy}>{busy ? 'Génération…' : 'Générer le rapport'}</button>
      </fieldset></form>
      <ReportingError message={error} /><ReportingStatus message={message} />
      {report && <article className={styles.product} aria-label={`Rapport ${report.regulatoryReportId}`}><hr className={styles.separator} /><span className={styles.badge}>{report.state}</span><dl><dt>Rapport</dt><dd className={styles.checksum}>{report.regulatoryReportId}</dd><dt>Calculs comptabilisés</dt><dd>{report.snapshot.postedCalculationCount}</dd><dt>Écarts</dt><dd>{report.snapshot.reconciliationVarianceCount}</dd><dt>Alertes DCR</dt><dd>{report.snapshot.dcrBreachCount}</dd></dl><p className={styles.checksum}>{report.outputChecksumSha256}</p><button className={`${styles.button} ${styles.secondary}`} type="button" disabled={busy} onClick={download}>Télécharger le rapport JSON</button></article>}
    </section>
    <section className={styles.card} aria-labelledby="report-publication-title" aria-busy={busy}>
      <h2 id="report-publication-title">Publier avec preuve</h2>
      <form className={styles.form} onSubmit={publish} noValidate><fieldset disabled={busy || !report || Boolean(publication)}>
        <label className={styles.field}>UUID de la preuve documentaire<input value={evidenceDocumentId} onChange={(event) => setEvidenceDocumentId(event.target.value)} required autoComplete="off" spellCheck={false} aria-invalid={publicationAttempted && !publicationValidity.evidenceDocumentId} aria-describedby="report-evidence-hint" /></label>
        <p id="report-evidence-hint" className={styles.hint}>Identifiant UUID du document de preuve.</p>
        <label className={styles.field}>Justification du Checker<textarea value={justification} onChange={(event) => setJustification(event.target.value)} required minLength={10} maxLength={1000} aria-invalid={publicationAttempted && !publicationValidity.justification} aria-describedby="report-justification-hint" /></label>
        <p id="report-justification-hint" className={styles.hint}>{justification.trim().length} / 1 000 caractères · minimum 10.</p>
        <button className={styles.button} type="submit" disabled={busy || !report || Boolean(publication)}>{publication ? 'Rapport publié' : 'Publier le rapport'}</button>
      </fieldset></form>
      {publication ? <p className={styles.notice} role="status" aria-live="polite" aria-atomic="true">Rapport {publication.regulatoryReportId} — {publication.state}</p> : <p className={styles.hint}>La publication reste bloquée tant qu’aucun rapport n’a été généré et contrôlé.</p>}
    </section>
  </div>;
}
