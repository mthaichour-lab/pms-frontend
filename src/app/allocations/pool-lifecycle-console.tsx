'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { poolRequest, transitionPool, validPoolId, type InvestmentPool } from './allocation-api';
import { ExclusiveOperationManager, LatestOperationManager } from './async-operation';
import styles from '../products/products.module.css';

export type PoolAction = 'activate' | 'suspend' | 'close';
export function poolActionsForStatus(status?: string): readonly PoolAction[] {
  if (status === 'DRAFT' || status === 'SUSPENDED') return ['activate', 'close'];
  if (status === 'ACTIVE') return ['suspend', 'close'];
  return [];
}

const actionLabels: Record<PoolAction, string> = { activate: 'Activer', suspend: 'Suspendre', close: 'Clôturer définitivement' };

export function PoolLifecycleConsole() {
  const [poolId, setPoolId] = useState(''), [pool, setPool] = useState<InvestmentPool>(), [reading, setReading] = useState(false), [commanding, setCommanding] = useState(false), [attempted, setAttempted] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const reads = useRef<LatestOperationManager>(null), commands = useRef<ExclusiveOperationManager>(null);
  if (!reads.current) reads.current = new LatestOperationManager();
  if (!commands.current) commands.current = new ExclusiveOperationManager();
  useEffect(() => () => { reads.current?.cancel(); commands.current?.cancel(); }, []);
  const busy = reading || commanding;

  function changePoolId(value: string) { reads.current!.cancel(); commands.current!.cancel(); setReading(false); setCommanding(false); setPoolId(value.toUpperCase()); setPool(undefined); setError(''); setMessage(''); }
  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedPoolId = poolId.trim();
    setAttempted(true);
    if (!validPoolId(requestedPoolId) || commands.current!.isActive()) { setError('L’identifiant du pool doit contenir 2 à 32 lettres majuscules, chiffres, tirets ou soulignements.'); return; }
    await reads.current!.run((signal) => poolRequest<InvestmentPool>(requestedPoolId, '', undefined, { signal }), {
      loading: () => { setReading(true); setPool(undefined); setError(''); setMessage(''); }, success: (value) => { setPool(value); setMessage('Pool chargé.'); setAttempted(false); }, failure: setError, settled: () => setReading(false),
    });
  }
  async function transition(action: PoolAction) {
    if (!pool || !poolActionsForStatus(pool.status).includes(action) || commands.current!.isActive()) return;
    const requestedPoolId = poolId.trim();
    await commands.current!.run((signal) => transitionPool(requestedPoolId, action, { signal }), {
      loading: () => { reads.current!.cancel(); setReading(false); setCommanding(true); setError(''); setMessage(''); }, success: (value) => { setPool(value); setMessage(`Transition ${actionLabels[action].toLowerCase()} enregistrée.`); }, failure: setError, settled: () => setCommanding(false),
    });
  }
  const actions = poolActionsForStatus(pool?.status);
  return <section className={styles.card} aria-busy={busy} aria-labelledby="pool-lifecycle-title"><h2 id="pool-lifecycle-title">Cycle de vie du pool</h2><form className={styles.form} onSubmit={load} noValidate><label className={styles.field}>Identifiant du pool<input value={poolId} onChange={(event) => changePoolId(event.target.value)} required minLength={2} maxLength={32} autoComplete="off" spellCheck={false} disabled={busy} aria-invalid={attempted && !validPoolId(poolId.trim())} aria-describedby="lifecycle-pool-hint" /></label><p id="lifecycle-pool-hint" className={styles.hint}>2 à 32 lettres majuscules, chiffres, tirets ou soulignements.</p><button className={styles.button} type="submit" disabled={busy}>Charger le pool</button></form><p className={`${styles.notice} ${styles.error}`} role="alert" aria-live="assertive" aria-atomic="true" hidden={!error}>{error}</p><p className={styles.notice} role="status" aria-live="polite" aria-atomic="true" hidden={!message}>{message}</p>{pool && <article className={styles.product} aria-label={`Cycle de vie du pool ${pool.poolId}`}><span className={styles.badge}>{pool.status}</span><dl><dt>Pool</dt><dd>{pool.displayName}</dd><dt>Financements</dt><dd>{pool.fundingSources.length}</dd></dl>{actions.length > 0 ? <div className={styles.actions}>{actions.map((action) => <button key={action} className={action === 'activate' ? styles.button : styles.secondary} type="button" disabled={busy} onClick={() => void transition(action)}>{actionLabels[action]}</button>)}</div> : <p className={styles.hint}>Aucune transition disponible pour cet état.</p>}</article>}</section>;
}
