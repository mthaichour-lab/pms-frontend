'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { CBS_QUALITY_STATES, cbsQualityFilterErrors, loadCbsQuality, qualitySummary, type CbsDataQualityBatch, type CbsQualityFilters, type CbsQualityState } from './cbs-quality-api';
import styles from './cbs-quality.module.css';

type LoadCallbacks<T> = { loading: () => void; success: (value: T) => void; failure: (message: string) => void; settled: () => void };

export class CbsQualityLoadCoordinator {
  private controller?: AbortController;
  private revision = 0;
  private mounted = false;
  mount(): void { this.mounted = true; }
  cancel(): void { this.revision += 1; this.controller?.abort(); this.controller = undefined; }
  unmount(): void { this.mounted = false; this.cancel(); }
  async run<T>(work: (signal: AbortSignal) => Promise<T>, callbacks: LoadCallbacks<T>): Promise<void> {
    this.cancel();
    const controller = new AbortController();
    const expectedRevision = this.revision;
    this.controller = controller;
    if (this.mounted) callbacks.loading();
    try {
      const result = await work(controller.signal);
      if (this.mounted && !controller.signal.aborted && expectedRevision === this.revision) callbacks.success(result);
    } catch (cause) {
      if (this.mounted && !controller.signal.aborted && expectedRevision === this.revision) callbacks.failure(cause instanceof Error ? cause.message : 'Chargement impossible.');
    } finally {
      if (this.controller === controller) this.controller = undefined;
      if (this.mounted && !controller.signal.aborted && expectedRevision === this.revision) callbacks.settled();
    }
  }
}

const initialDraft = { businessDate: '', state: '' };

export function CbsQualityConsole() {
  const [rows, setRows] = useState<readonly CbsDataQualityBatch[]>([]);
  const [draft, setDraft] = useState(initialDraft);
  const [filters, setFilters] = useState<CbsQualityFilters>({});
  const [retryRevision, setRetryRevision] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const coordinator = useRef(new CbsQualityLoadCoordinator());
  const validation = cbsQualityFilterErrors(draft);

  useEffect(() => { coordinator.current.mount(); return () => coordinator.current.unmount(); }, []);
  useEffect(() => {
    void coordinator.current.run((signal) => loadCbsQuality(filters, { signal }), {
      loading: () => { setLoading(true); setError(''); setRows([]); },
      success: setRows,
      failure: setError,
      settled: () => setLoading(false),
    });
    return () => coordinator.current.cancel();
  }, [filters, retryRevision]);

  const summary = qualitySummary(rows);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (Object.keys(validation).length > 0 || loading) return;
    setFilters({ businessDate: draft.businessDate || undefined, state: (draft.state || undefined) as CbsQualityState | undefined });
  }

  return <>
    <form className={styles.filters} onSubmit={submit} aria-label="Filtres de qualité CBS" noValidate>
      <label htmlFor="cbs-business-date">Date métier
        <input id="cbs-business-date" name="businessDate" type="date" disabled={loading} value={draft.businessDate} onChange={(event) => { setAttempted(false); setDraft((current) => ({ ...current, businessDate: event.target.value })); }} aria-invalid={Boolean(attempted && validation.businessDate)} aria-describedby={attempted && validation.businessDate ? 'cbs-business-date-error' : undefined} />
        {attempted && validation.businessDate && <span id="cbs-business-date-error" role="alert">{validation.businessDate}</span>}
      </label>
      <label htmlFor="cbs-state">État
        <select id="cbs-state" name="state" disabled={loading} value={draft.state} onChange={(event) => { setAttempted(false); setDraft((current) => ({ ...current, state: event.target.value })); }} aria-invalid={Boolean(attempted && validation.state)} aria-describedby={attempted && validation.state ? 'cbs-state-error' : undefined}>
          <option value="">Tous les états</option>
          {CBS_QUALITY_STATES.map((state) => <option key={state}>{state}</option>)}
        </select>
        {attempted && validation.state && <span id="cbs-state-error" role="alert">{validation.state}</span>}
      </label>
      <button disabled={loading}>{loading ? 'Chargement…' : 'Appliquer'}</button>
    </form>
    <section className={styles.summary} aria-label="Synthèse qualité">
      <Metric label="Lots contrôlés" value={summary.batches} />
      <Metric label="Lots en anomalie" value={summary.rejected} alert={summary.rejected > 0} />
      <Metric label="Erreurs" value={summary.errors} alert={summary.errors > 0} />
      <Metric label="Avertissements" value={summary.warnings} />
    </section>
    <div aria-live="polite" aria-atomic="true">
      {loading ? <div className={styles.skeleton} aria-label="Chargement des lots" aria-busy="true">{[1, 2, 3].map((value) => <i key={value} />)}</div>
        : error ? <div className={styles.feedback} role="alert"><strong>Données indisponibles</strong><p>{error}</p><button type="button" onClick={() => setRetryRevision((current) => current + 1)}>Réessayer</button></div>
          : rows.length === 0 ? <div className={styles.feedback} role="status"><strong>Aucun lot trouvé</strong><p>Modifiez les filtres ou attendez la prochaine ingestion CBS.</p></div>
            : <QualityTable rows={rows} />}
    </div>
  </>;
}

function QualityTable({ rows }: { rows: readonly CbsDataQualityBatch[] }) {
  return <div className={styles.tableWrap}><table><caption>Résultats des contrôles CBS</caption><thead><tr><th>Date</th><th>Flux</th><th>Séquence</th><th>État</th><th>Lignes attendues</th><th>Solde manifeste</th><th>Erreurs</th><th>Dernier contrôle</th></tr></thead><tbody>{rows.map((row) => <tr key={row.batchId}><td>{row.businessDate}</td><td><strong>{row.flowType}</strong><small>{row.sourceCode}</small></td><td>{row.sequenceNumber}</td><td><span className={`${styles.state} ${stateClass(row.state)}`}>{row.state}</span></td><td>{row.manifestRowCount ?? 'Non renseigné'}</td><td className={styles.number}>{row.manifestBalanceTotal ?? 'Non renseigné'}</td><td><b className={row.errorCount ? styles.errorCount : undefined}>{row.errorCount}</b>{row.warningCount > 0 && <small>{row.warningCount} avert.</small>}</td><td>{row.lastControlAt ? new Intl.DateTimeFormat('fr-DZ', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.lastControlAt)) : 'En attente'}</td></tr>)}</tbody></table></div>;
}

function Metric({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) { return <article><span>{label}</span><strong className={alert ? styles.alert : undefined}>{value}</strong></article>; }
function stateClass(state: string) { return state === 'VALIDATED' ? styles.valid : state === 'REJECTED' || state === 'QUARANTINED' ? styles.invalid : styles.pending; }
