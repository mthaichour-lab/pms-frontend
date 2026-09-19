'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { getAuditTrail, validateAuditTrailFilters, type AuditTrail, type AuditTrailFilters } from './audit-api';
import styles from '../products/products.module.css';

const limits = [25, 50, 100, 200] as const;

export function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date indisponible'
    : new Intl.DateTimeFormat('fr-DZ', { dateStyle: 'medium', timeStyle: 'medium' }).format(date);
}

interface AuditTrailRequestCallbacks {
  readonly loading: () => void;
  readonly success: (trail: AuditTrail) => void;
  readonly failure: (message: string) => void;
  readonly settled: () => void;
}

type AuditTrailRequest = (limit: number, filters: AuditTrailFilters, signal?: AbortSignal) => Promise<AuditTrail>;

export class AuditTrailRequestManager {
  private active?: AbortController;

  constructor(private readonly request: AuditTrailRequest = getAuditTrail) {}

  async load(limit: number, filters: AuditTrailFilters, callbacks: AuditTrailRequestCallbacks): Promise<void> {
    const controller = new AbortController();
    this.active?.abort();
    this.active = controller;
    callbacks.loading();
    try {
      const trail = await this.request(limit, filters, controller.signal);
      if (this.active === controller && !controller.signal.aborted) callbacks.success(trail);
    } catch (cause) {
      if (this.active === controller && !controller.signal.aborted) {
        callbacks.failure(cause instanceof Error ? cause.message : 'Chargement du journal impossible.');
      }
    } finally {
      if (this.active === controller && !controller.signal.aborted) {
        this.active = undefined;
        callbacks.settled();
      }
    }
  }

  cancel(): void {
    this.active?.abort();
    this.active = undefined;
  }
}

export function AuditTrailConsole() {
  const [limit, setLimit] = useState(50);
  const [filters, setFilters] = useState<AuditTrailFilters>({});
  const [appliedFilters, setAppliedFilters] = useState<AuditTrailFilters>({});
  const [trail, setTrail] = useState<AuditTrail>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const manager = useRef<AuditTrailRequestManager>(null);
  if (!manager.current) manager.current = new AuditTrailRequestManager();

  const load = useCallback(async () => {
    await manager.current!.load(limit, appliedFilters, {
      loading: () => { setBusy(true); setError(''); },
      success: setTrail,
      failure: setError,
      settled: () => setBusy(false),
    });
  }, [limit, appliedFilters]);

  useEffect(() => {
    void load();
    return () => manager.current?.cancel();
  }, [load]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateAuditTrailFilters(filters);
    if (validation) { setError(validation); return; }
    setError('');
    setAppliedFilters({ ...filters });
  }

  function resetFilters() {
    setFilters({});
    setError('');
    setAppliedFilters({});
  }

  return <AuditTrailView trail={trail} error={error} busy={busy} limit={limit} filters={filters} onFiltersChange={setFilters} onApplyFilters={applyFilters} onResetFilters={resetFilters} onLimitChange={setLimit} onRefresh={() => void load()} />;
}

interface AuditTrailViewProps {
  readonly trail?: AuditTrail;
  readonly error: string;
  readonly busy: boolean;
  readonly limit: number;
  readonly filters: AuditTrailFilters;
  readonly onFiltersChange: (filters: AuditTrailFilters) => void;
  readonly onApplyFilters: (event: FormEvent<HTMLFormElement>) => void;
  readonly onResetFilters: () => void;
  readonly onLimitChange: (limit: number) => void;
  readonly onRefresh: () => void;
}

export function AuditTrailView({ trail, error, busy, limit, filters, onFiltersChange, onApplyFilters, onResetFilters, onLimitChange, onRefresh }: AuditTrailViewProps) {
  const recentEvents = trail ? [...trail.events].reverse() : [];

  return <div className={styles.grid}>
    <section className={styles.card} aria-busy={busy}>
      <h2>Intégrité du journal</h2>
      <form className={styles.form} onSubmit={onApplyFilters} aria-label="Filtres du journal d’audit">
        <div className={styles.row}>
          <label className={styles.field}>Action<input value={filters.action ?? ''} maxLength={128} placeholder="Ex. APPROVE_CALCULATION" onChange={(event) => onFiltersChange({ ...filters, action: event.target.value.toUpperCase() || undefined })} /></label>
          <label className={styles.field}>Type de ressource<input value={filters.resourceType ?? ''} maxLength={128} placeholder="Ex. CalculationRun" onChange={(event) => onFiltersChange({ ...filters, resourceType: event.target.value || undefined })} /></label>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>Résultat<select value={filters.outcome ?? ''} onChange={(event) => onFiltersChange({ ...filters, outcome: (event.target.value || undefined) as AuditTrailFilters['outcome'] })}><option value="">Tous les résultats</option><option value="SUCCESS">Succès</option><option value="DENIED">Refusé</option><option value="FAILURE">Échec</option></select></label>
          <label className={styles.field}>Identifiant de corrélation<input value={filters.auditCorrelationId ?? ''} autoComplete="off" spellCheck={false} placeholder="UUID" onChange={(event) => onFiltersChange({ ...filters, auditCorrelationId: event.target.value.trim() || undefined })} /></label>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>Date métier du<input type="date" value={filters.businessDateFrom ?? ''} max={filters.businessDateTo} onChange={(event) => onFiltersChange({ ...filters, businessDateFrom: event.target.value || undefined })} /></label>
          <label className={styles.field}>Date métier au<input type="date" value={filters.businessDateTo ?? ''} min={filters.businessDateFrom} onChange={(event) => onFiltersChange({ ...filters, businessDateTo: event.target.value || undefined })} /></label>
        </div>
        <label className={styles.field}>Profondeur de vérification
          <select value={limit} onChange={(event) => onLimitChange(Number(event.target.value))}>
            {limits.map((value) => <option key={value} value={value}>{value} événements</option>)}
          </select>
        </label>
        <div className={styles.actions}><button type="submit" className={styles.button} disabled={busy}>Appliquer les filtres</button><button type="button" className={styles.secondary} disabled={busy} onClick={onResetFilters}>Réinitialiser</button><button type="button" className={styles.secondary} disabled={busy} onClick={onRefresh}>{busy ? 'Vérification…' : 'Actualiser la chaîne'}</button></div>
      </form>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {trail && <div className={styles.product} aria-live="polite">
        <p className={`${styles.notice} ${trail.chainValid ? '' : styles.error}`} role={trail.chainValid ? 'status' : 'alert'} aria-live={trail.chainValid ? 'polite' : 'assertive'} aria-atomic="true">
          {trail.chainValid ? 'Chaîne de hachage valide.' : 'Rupture d’intégrité détectée.'}
        </p>
        <dl>
          <dt>Mécanisme</dt><dd>{trail.integrity}</dd>
          <dt>Événements vérifiés</dt><dd>{trail.verifiedCount} / {trail.events.length}</dd>
          {!trail.chainValid && <><dt>Rupture à l’événement</dt><dd className={styles.checksum}>{trail.brokenAtEventId ?? 'Non localisée'}</dd></>}
        </dl>
      </div>}
    </section>

    <section className={styles.card} aria-busy={busy}>
      <h2>Lecture de la chaîne</h2>
      <p className={styles.hint}>Chaque empreinte d’événement scelle son contenu et référence l’empreinte précédente.</p>
      {trail && <dl className={styles.product}>
        <dt>Segment chargé</dt><dd>{trail.events.length} événement{trail.events.length > 1 ? 's' : ''}</dd>
        <dt>État</dt><dd><span className={styles.badge}>{trail.chainValid ? 'VALIDE' : 'ROMPUE'}</span></dd>
      </dl>}
    </section>

    <section className={styles.card} style={{ gridColumn: '1 / -1' }} aria-busy={busy}>
      <h2>Événements récents</h2>
      {!trail && !error && <p className={styles.hint}>Chargement du segment d’audit…</p>}
      {trail?.events.length === 0 && <p className={styles.hint}>Aucun événement d’audit dans ce segment.</p>}
      <div className={styles.form}>
        {recentEvents.map((event) => <article className={styles.product} key={event.auditEventId}>
          <div className={styles.actions}>
            <span className={styles.badge}>{event.outcome}</span>
            <strong>{event.action}</strong>
            <time dateTime={event.occurredAt}>{displayDate(event.occurredAt)}</time>
          </div>
          <dl>
            <dt>Ressource</dt><dd>{event.resourceType} · {event.resourceId}</dd>
            <dt>Acteur</dt><dd>{event.actorId}</dd>
            <dt>Source</dt><dd>{event.sourceApplication}</dd>
            <dt>Identifiant</dt><dd className={styles.checksum}>{event.auditEventId}</dd>
            <dt>Empreinte SHA-256</dt><dd className={styles.checksum}>{event.eventHash}</dd>
            <dt>Empreinte précédente</dt><dd className={styles.checksum}>{event.previousHash ?? 'Origine du segment'}</dd>
          </dl>
        </article>)}
      </div>
    </section>
  </div>;
}
