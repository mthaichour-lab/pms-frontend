'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { getDocumentArchiveRequest, requestDocumentArchive, validDocumentArchiveRequest, type DocumentArchiveRequest, type DocumentArchiveRequestCommand } from './audit-api';
import styles from '../products/products.module.css';

const initial: DocumentArchiveRequestCommand = { objectKey: '', businessType: 'AUDIT_EVIDENCE', businessId: '', classification: 'CONFIDENTIAL', evidentiary: true };
interface ArchiveOperationCallbacks<TResult> { readonly loading: () => void; readonly success: (result: TResult) => void; readonly failure: (message: string) => void; readonly settled: () => void; }
export class ArchiveOperationManager {
  private active?: { readonly token: symbol; readonly controller: AbortController };
  async run<TResult>(operation: (signal: AbortSignal) => Promise<TResult>, callbacks: ArchiveOperationCallbacks<TResult>): Promise<boolean> {
    if (this.active) return false;
    const token = Symbol('archive-operation'); const controller = new AbortController(); this.active = { token, controller }; callbacks.loading();
    try { const result = await operation(controller.signal); if (this.active?.token === token && !controller.signal.aborted) callbacks.success(result); }
    catch (cause) { if (this.active?.token === token && !controller.signal.aborted) callbacks.failure(cause instanceof Error ? cause.message : 'Erreur inattendue.'); }
    finally { if (this.active?.token === token) { this.active = undefined; if (!controller.signal.aborted) callbacks.settled(); } }
    return true;
  }
  cancel(): void { this.active?.controller.abort(); this.active = undefined; }
}
export function ArchiveError({ message }: { readonly message: string }) { return message ? <p className={`${styles.notice} ${styles.error}`} role="alert" aria-live="assertive" aria-atomic="true">{message}</p> : null; }
export function DocumentArchiveConsole() {
  const [command, setCommand] = useState(initial), [archive, setArchive] = useState<DocumentArchiveRequest>(), [requestId, setRequestId] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const operations = useRef<ArchiveOperationManager>(null); if (!operations.current) operations.current = new ArchiveOperationManager(); useEffect(() => () => operations.current?.cancel(), []);
  const change = (key: keyof DocumentArchiveRequestCommand, value: string | boolean) => setCommand((current) => ({ ...current, [key]: value }));
  async function submit(event: FormEvent) { event.preventDefault(); if (!validDocumentArchiveRequest(command)) { setError('Vérifiez la clé de dépôt et les références métier.'); return; } await operations.current!.run((signal) => requestDocumentArchive(command, signal), { loading: () => { setBusy(true); setError(''); }, success: (queued) => { setRequestId(queued.requestId); setArchive({ ...command, ...queued, createdAt: new Date().toISOString() }); }, failure: setError, settled: () => setBusy(false) }); }
  async function refresh() { if (!requestId) return; await operations.current!.run((signal) => getDocumentArchiveRequest(requestId, signal), { loading: () => { setBusy(true); setError(''); }, success: setArchive, failure: setError, settled: () => setBusy(false) }); }
  return <div className={styles.grid} aria-busy={busy}>
    <section className={styles.card}>
      <h2>Archiver une preuve</h2>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}>Clé du dépôt sécurisé<input value={command.objectKey} onChange={(event) => change('objectKey', event.target.value)} placeholder="landing/audit/preuve.pdf" /></label>
        <div className={styles.row}>
          <label className={styles.field}>Type métier<input value={command.businessType} onChange={(event) => change('businessType', event.target.value.toUpperCase())} /></label>
          <label className={styles.field}>Identifiant métier<input value={command.businessId} onChange={(event) => change('businessId', event.target.value)} /></label>
        </div>
        <label className={styles.field}>Classification<input value={command.classification} onChange={(event) => change('classification', event.target.value.toUpperCase())} /></label>
        <label className={styles.field}><input type="checkbox" checked={command.evidentiary} onChange={(event) => change('evidentiary', event.target.checked)} /> Conservation probatoire WORM</label>
        <button className={styles.button} disabled={busy}>{busy ? 'Mise en file…' : 'Demander l’archivage'}</button>
      </form>
      <ArchiveError message={error} />
    </section>
    <section className={styles.card} aria-live="polite" aria-busy={busy}>
      <h2>Suivi Paperless / WORM</h2>
      {archive ? <div className={styles.product}>
        <span className={styles.badge}>{archive.status}</span>
        <dl>
          <dt>Demande</dt><dd>{archive.requestId}</dd>
          <dt>Objet</dt><dd>{archive.objectKey}</dd>
          <dt>Document Paperless</dt><dd>{archive.paperlessDocumentId ?? '—'}</dd>
          <dt>Checksum SHA-256</dt><dd className={styles.checksum}>{archive.checksumSha256 ?? '—'}</dd>
        </dl>
        <button type="button" className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={refresh}>Actualiser le statut</button>
      </div> : <p className={styles.hint}>Le worker analyse le fichier, vérifie son intégrité puis conserve les pièces probatoires dans le stockage WORM.</p>}
    </section>
  </div>;
}
