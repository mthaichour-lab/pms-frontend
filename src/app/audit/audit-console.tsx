'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  approveExport, AuditApiError, createExport, generateExport,
  type GeneratedSecureExport, type SecureExportApproval, type SecureExportTransition,
} from './audit-api';
import styles from '../products/products.module.css';

interface ExportOperationCallbacks<TResult> {
  readonly loading: () => void;
  readonly success: (result: TResult) => void;
  readonly failure: (message: string) => void;
  readonly settled: () => void;
}

export function auditErrorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : 'Erreur inattendue.';
  return cause instanceof AuditApiError && cause.correlationId
    ? `${message} (corrélation : ${cause.correlationId})`
    : message;
}

export class ExportOperationManager {
  private active?: AbortController;
  private mounted = true;

  mount(): void { this.mounted = true; }

  unmount(): void {
    this.mounted = false;
    this.cancel();
  }

  async run<TResult>(operation: (signal: AbortSignal) => Promise<TResult>, callbacks: ExportOperationCallbacks<TResult>): Promise<boolean> {
    if (this.active) return false;
    const controller = new AbortController();
    this.active = controller;
    if (this.mounted) callbacks.loading();
    try {
      const result = await operation(controller.signal);
      if (this.mounted && this.active === controller && !controller.signal.aborted) callbacks.success(result);
    } catch (cause) {
      if (this.mounted && this.active === controller && !controller.signal.aborted) callbacks.failure(auditErrorMessage(cause));
    } finally {
      if (this.active === controller) {
        this.active = undefined;
        if (this.mounted && !controller.signal.aborted) callbacks.settled();
      }
    }
    return true;
  }

  cancel(): void {
    this.active?.abort();
    this.active = undefined;
  }
}

type ExportFormat = 'PDF' | 'XLSX' | 'CSV' | 'API';
type ExportScope = 'SINGLE' | 'BULK';
interface RequestedExport { readonly transition: SecureExportTransition; readonly scope: ExportScope }

export function AuditConsole() {
  const [reportType, setReportType] = useState('AUDIT_TRAIL');
  const [format, setFormat] = useState<ExportFormat>('CSV');
  const [scope, setScope] = useState<ExportScope>('SINGLE');
  const [request, setRequest] = useState<RequestedExport>();
  const [generated, setGenerated] = useState<GeneratedSecureExport>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const operations = useRef<ExportOperationManager>(null);
  if (!operations.current) operations.current = new ExportOperationManager();
  useEffect(() => {
    operations.current?.mount();
    setBusy(false);
    return () => operations.current?.unmount();
  }, []);

  const callbacks = <T,>(success: (result: T) => void): ExportOperationCallbacks<T> => ({
    loading: () => { setBusy(true); setError(''); },
    success,
    failure: setError,
    settled: () => setBusy(false),
  });

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(reportType)) {
      setError('Le type de rapport doit commencer par une lettre et utiliser uniquement des lettres majuscules, chiffres ou tirets bas.');
      return;
    }
    const submittedScope = scope;
    await operations.current!.run<SecureExportTransition>(
      (signal) => createExport({ reportType, format, scope: submittedScope }, signal),
      callbacks((transition) => { setRequest({ transition, scope: submittedScope }); setGenerated(undefined); }),
    );
  }

  async function approve() {
    if (!request || request.scope !== 'BULK') return;
    const exportId = request.transition.exportId;
    await operations.current!.run<SecureExportApproval>(
      (signal) => approveExport(exportId, signal),
      callbacks((approval) => setRequest((current) => current?.transition.exportId === exportId
        ? { ...current, transition: { ...current.transition, status: approval.status } }
        : current)),
    );
  }

  async function generate() {
    if (!request || request.transition.status !== 'APPROVED') return;
    const exportId = request.transition.exportId;
    await operations.current!.run<GeneratedSecureExport>(
      (signal) => generateExport(exportId, { dataset: { columns: [{ key: 'reference', label: 'Référence' }], rows: [{ reference: exportId }] } }, signal),
      callbacks((result) => {
        if (result.exportId !== exportId) throw new Error('La preuve générée ne correspond pas à la demande active.');
        setGenerated(result);
      }),
    );
  }

  const reportTypeInvalid = Boolean(error) && !/^[A-Z][A-Z0-9_]{1,63}$/.test(reportType);
  return <div className={styles.grid} aria-busy={busy}>
    <section className={styles.card} aria-labelledby="audit-export-title">
      <h2 id="audit-export-title">Demander un export sécurisé</h2>
      <form className={styles.form} onSubmit={create} noValidate>
        <label className={styles.field}>Type de rapport
          <input id="audit-report-type" value={reportType} maxLength={64} aria-invalid={reportTypeInvalid || undefined} aria-describedby={reportTypeInvalid ? 'export-error' : undefined} onChange={(event) => setReportType(event.target.value.toUpperCase())} />
        </label>
        <div className={styles.row}>
          <label className={styles.field} htmlFor="audit-export-format">Format<select id="audit-export-format" value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}>{(['PDF', 'XLSX', 'CSV', 'API'] as const).map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className={styles.field} htmlFor="audit-export-scope">Portée<select id="audit-export-scope" value={scope} onChange={(event) => setScope(event.target.value as ExportScope)}><option>SINGLE</option><option>BULK</option></select></label>
        </div>
        <button className={styles.button} disabled={busy}>{busy ? 'Création…' : 'Créer la demande'}</button>
      </form>
      {error && <p id="export-error" className={`${styles.notice} ${styles.error}`} role="alert" aria-live="assertive" aria-atomic="true">{error}</p>}
      {request && <div className={styles.product} aria-live="polite"><span className={styles.badge}>{request.transition.status}</span><dl><dt>Export</dt><dd>{request.transition.exportId}</dd><dt>Portée demandée</dt><dd>{request.scope}</dd></dl></div>}
    </section>
    <section className={styles.card} aria-labelledby="audit-control-title">
      <h2 id="audit-control-title">Contrôle et génération</h2>
      <p className={styles.hint}>Les exports massifs exigent l’approbation renforcée d’un Checker distinct.</p>
      <div className={styles.actions}>
        <button type="button" className={`${styles.button} ${styles.secondary}`} disabled={busy || !request || request.scope !== 'BULK' || request.transition.status === 'APPROVED'} onClick={() => void approve()}>Approuver l’export massif</button>
        <button type="button" className={styles.button} disabled={busy || !request || request.transition.status !== 'APPROVED' || Boolean(generated)} onClick={() => void generate()}>{generated ? 'Preuve générée' : 'Générer la preuve'}</button>
      </div>
      {generated && <div className={styles.product} aria-live="polite"><span className={styles.badge}>{generated.status}</span><dl><dt>Export</dt><dd>{generated.exportId}</dd><dt>Checksum SHA-256</dt><dd className={styles.checksum}>{generated.checksumSha256}</dd></dl></div>}
    </section>
  </div>;
}
