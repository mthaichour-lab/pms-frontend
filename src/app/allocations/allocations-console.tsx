'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { allocationFieldValidity, getAllocationHistory, getPoolComposition, poolRequest, recordAllocation, simulateAllocation, validAssetId, validIsoDate, validPoolId, type AllocationSimulation, type AssetAllocation, type InvestmentPool, type PoolCompositionSnapshot, type RecordedAllocation } from './allocation-api';
import { ExclusiveOperationManager, LatestOperationManager } from './async-operation';
import styles from '../products/products.module.css';
import { EntityCatalog } from '../entity-catalog';

const today = new Date().toISOString().slice(0, 10);
interface SimulationState { readonly command: AssetAllocation; readonly result: AllocationSimulation; readonly recordIdempotencyKey: string }

export function AllocationsConsole() {
  const [poolId, setPoolId] = useState(''), [pool, setPool] = useState<InvestmentPool>(), [assetId, setAssetId] = useState(''), [percentage, setPercentage] = useState('100'), [justification, setJustification] = useState(''), [approvalId, setApprovalId] = useState(''), [date, setDate] = useState(today);
  const [simulation, setSimulation] = useState<SimulationState>(), [composition, setComposition] = useState<PoolCompositionSnapshot>(), [history, setHistory] = useState<readonly AssetAllocation[]>([]), [recorded, setRecorded] = useState<RecordedAllocation>();
  const [reading, setReading] = useState(false), [commanding, setCommanding] = useState(false), [poolAttempted, setPoolAttempted] = useState(false), [allocationAttempted, setAllocationAttempted] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const reads = useRef<LatestOperationManager>(null), commands = useRef<ExclusiveOperationManager>(null);
  if (!reads.current) reads.current = new LatestOperationManager();
  if (!commands.current) commands.current = new ExclusiveOperationManager();
  useEffect(() => () => { reads.current?.cancel(); commands.current?.cancel(); }, []);
  const busy = reading || commanding;

  const draft = { assetId: assetId.trim(), percentage: percentage.trim(), effectiveFrom: date, justification, approvalId: approvalId.trim() || undefined };
  const validity = allocationFieldValidity(draft);

  function clearFeedback() { setError(''); setMessage(''); }
  function invalidateSimulation() { setSimulation(undefined); setRecorded(undefined); clearFeedback(); }
  function changePoolId(value: string) { reads.current!.cancel(); commands.current!.cancel(); setReading(false); setCommanding(false); setPoolId(value.toUpperCase()); setPool(undefined); setComposition(undefined); setHistory([]); invalidateSimulation(); }
  function changeAssetId(value: string) { setAssetId(value.trim()); setHistory([]); invalidateSimulation(); }

  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadPool(poolId.trim());
  }
  async function loadPool(requestedPoolId: string) {
    setPoolAttempted(true);
    if (!validPoolId(requestedPoolId) || commands.current!.isActive()) { setError('L’identifiant du pool doit contenir 2 à 32 lettres majuscules, chiffres, tirets ou soulignements.'); return; }
    await reads.current!.run((signal) => poolRequest<InvestmentPool>(requestedPoolId, '', undefined, { signal }), {
      loading: () => { setReading(true); setPool(undefined); setComposition(undefined); setError(''); setMessage(''); },
      success: (loaded) => { setPool(loaded); setMessage('Pool chargé.'); setPoolAttempted(false); },
      failure: setError,
      settled: () => setReading(false),
    });
  }
  function selectPool(poolId: string) {
    changePoolId(poolId);
    void loadPool(poolId);
  }

  async function simulate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAllocationAttempted(true);
    if (!pool || !validPoolId(poolId.trim()) || !Object.values(validity).every(Boolean)) { setError('Vérifiez l’actif UUID, le pourcentage, la date, la justification et l’approbation éventuelle.'); return; }
    const command: AssetAllocation = { allocationId: crypto.randomUUID(), assetId: draft.assetId, percentage: draft.percentage, effectiveFrom: draft.effectiveFrom, justification: draft.justification.trim(), ...(draft.approvalId ? { approvalId: draft.approvalId } : {}) };
    const requestedPoolId = poolId.trim();
    await commands.current!.run((signal) => simulateAllocation(requestedPoolId, command, { signal }), {
      loading: () => { reads.current!.cancel(); setReading(false); setCommanding(true); setSimulation(undefined); setRecorded(undefined); setError(''); setMessage(''); },
      success: (result) => { setSimulation({ command, result, recordIdempotencyKey: crypto.randomUUID() }); setMessage(result.executable ? 'Capacité vérifiée : l’allocation peut être enregistrée.' : 'Simulation terminée : l’allocation reste bloquée.'); setAllocationAttempted(false); },
      failure: setError,
      settled: () => setCommanding(false),
    });
  }

  async function record() {
    if (!simulation?.result.executable || commands.current!.isActive()) return;
    const requestedPoolId = poolId.trim(), { command, recordIdempotencyKey } = simulation;
    await commands.current!.run((signal) => recordAllocation(requestedPoolId, command, { signal, idempotencyKey: recordIdempotencyKey }), {
      loading: () => { reads.current!.cancel(); setReading(false); setCommanding(true); setRecorded(undefined); setError(''); setMessage(''); },
      success: (result) => { setRecorded(result); setSimulation(undefined); setMessage(`Allocation ${result.status === 'CREATED' ? 'enregistrée' : 'déjà enregistrée'} ; capacité restante ${result.remainingPercentage} %.`); },
      failure: setError,
      settled: () => setCommanding(false),
    });
  }

  async function loadComposition() {
    if (!pool || !validIsoDate(date) || commands.current!.isActive()) { setError('Une date valide et un pool chargé sont requis.'); return; }
    const requested = { poolId: poolId.trim(), date };
    await reads.current!.run((signal) => getPoolComposition(requested.poolId, requested.date, { signal }), {
      loading: () => { setReading(true); setComposition(undefined); setError(''); setMessage(''); }, success: (value) => { setComposition(value); setMessage('Composition certifiée chargée.'); }, failure: setError, settled: () => setReading(false),
    });
  }

  async function loadHistory() {
    const requested = { assetId: assetId.trim(), date };
    if (!validAssetId(requested.assetId) || !validIsoDate(requested.date) || commands.current!.isActive()) { setError('Un actif UUID et une date valides sont requis.'); return; }
    await reads.current!.run((signal) => getAllocationHistory(requested.assetId, requested.date, { signal }), {
      loading: () => { setReading(true); setHistory([]); setError(''); setMessage(''); }, success: (value) => { setHistory(value); setMessage(value.length ? 'Historique chargé.' : 'Aucune allocation à cette date.'); }, failure: setError, settled: () => setReading(false),
    });
  }

  return <><EntityCatalog kind="investment-pools" selectedId={poolId} disabled={busy} onSelect={selectPool} /><div className={styles.grid} aria-busy={busy}>
    <section className={styles.card} aria-labelledby="allocation-pool-title"><h2 id="allocation-pool-title">Pool d’investissement</h2><form className={styles.form} onSubmit={load} noValidate><label className={styles.field}>Identifiant du pool<input value={poolId} onChange={(event) => changePoolId(event.target.value)} required minLength={2} maxLength={32} autoComplete="off" spellCheck={false} disabled={busy} aria-invalid={poolAttempted && !validPoolId(poolId.trim())} aria-describedby="allocation-pool-hint" /></label><p id="allocation-pool-hint" className={styles.hint}>2 à 32 lettres majuscules, chiffres, tirets ou soulignements.</p><button className={styles.button} type="submit" disabled={busy}>Charger</button></form>{pool && <article className={styles.product} aria-label={`Pool ${pool.poolId}`}><span className={styles.badge}>{pool.status}</span><dl><dt>Nom</dt><dd>{pool.displayName}</dd><dt>Devise</dt><dd>{pool.currency}</dd><dt>Financements</dt><dd>{pool.fundingSources.length}</dd></dl></article>}<p className={`${styles.notice} ${styles.error}`} role="alert" aria-live="assertive" aria-atomic="true" hidden={!error}>{error}</p><p className={styles.notice} role="status" aria-live="polite" aria-atomic="true" hidden={!message}>{message}</p></section>
    <section className={styles.card} aria-labelledby="allocation-simulation-title"><h2 id="allocation-simulation-title">Simuler puis allouer</h2><form className={styles.form} onSubmit={simulate} noValidate><fieldset disabled={busy || !pool}><label className={styles.field}>Actif<input value={assetId} onChange={(event) => changeAssetId(event.target.value)} required autoComplete="off" spellCheck={false} aria-invalid={allocationAttempted && !validity.assetId} aria-describedby="allocation-asset-hint" /></label><p id="allocation-asset-hint" className={styles.hint}>Identifiant UUID de l’actif.</p><div className={styles.row}><label className={styles.field}>Pourcentage<input value={percentage} onChange={(event) => { setPercentage(event.target.value); invalidateSimulation(); }} required inputMode="decimal" aria-invalid={allocationAttempted && !validity.percentage} aria-describedby="allocation-percentage-hint" /></label><label className={styles.field}>Date d’effet<input type="date" value={date} onChange={(event) => { setDate(event.target.value); setComposition(undefined); setHistory([]); invalidateSimulation(); }} required aria-invalid={allocationAttempted && !validity.effectiveFrom} /></label></div><p id="allocation-percentage-hint" className={styles.hint}>Strictement supérieur à 0 et inférieur ou égal à 100, avec 6 décimales maximum.</p><label className={styles.field}>Justification<textarea value={justification} onChange={(event) => { setJustification(event.target.value); invalidateSimulation(); }} required minLength={10} maxLength={1000} aria-invalid={allocationAttempted && !validity.justification} aria-describedby="allocation-justification-hint" /></label><p id="allocation-justification-hint" className={styles.hint}>{justification.trim().length} / 1 000 caractères · minimum 10.</p><label className={styles.field}>Approbation de réallocation (facultative)<input value={approvalId} onChange={(event) => { setApprovalId(event.target.value.trim()); invalidateSimulation(); }} autoComplete="off" spellCheck={false} aria-invalid={allocationAttempted && !validity.approvalId} aria-describedby="allocation-approval-hint" /></label><p id="allocation-approval-hint" className={styles.hint}>UUID de la décision approuvée, requis par le serveur lors d’une réallocation.</p><div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} type="submit" disabled={busy || !pool}>Simuler</button><button className={styles.button} type="button" disabled={busy || !simulation?.result.executable} onClick={() => void record()}>Enregistrer</button></div></fieldset></form>{simulation && <article className={styles.product} aria-label="Résultat de capacité"><span className={styles.badge}>{simulation.result.executable ? 'EXÉCUTABLE' : 'BLOQUÉE'}</span><dl><dt>Déjà alloué</dt><dd>{simulation.result.currentAllocatedPercentage} %</dd><dt>Demandé</dt><dd>{simulation.command.percentage} %</dd><dt>Capacité restante</dt><dd>{simulation.result.remainingPercentage} %</dd><dt>Approbation requise</dt><dd>{simulation.result.approvalRequired ? 'Oui' : 'Non'}</dd></dl>{simulation.result.blockingAnomalies.length > 0 && <p className={styles.hint}>Anomalies bloquantes : {simulation.result.blockingAnomalies.join(', ')}</p>}</article>}{recorded && <p className={styles.notice}>Allocation {recorded.allocation.allocationId} enregistrée sans conversion de précision.</p>}</section>
    <section className={styles.card} aria-labelledby="allocation-certified-title"><h2 id="allocation-certified-title">Données certifiées</h2><div className={styles.actions}><button className={styles.button} type="button" disabled={busy || !pool} onClick={() => void loadComposition()}>Composition</button><button className={`${styles.button} ${styles.secondary}`} type="button" disabled={busy || !validAssetId(assetId.trim())} onClick={() => void loadHistory()}>Historique</button></div>{composition && <article className={styles.product} aria-label="Composition du pool"><span className={styles.badge}>{composition.certified ? 'CERTIFIÉE' : 'NON CERTIFIÉE'}</span><dl><dt>Ressources</dt><dd>{composition.totalResources} {composition.currency}</dd><dt>Investi</dt><dd>{composition.investedAmount} {composition.currency}</dd><dt>Liquidité</dt><dd>{composition.uninvestedLiquidity} {composition.currency}</dd></dl><p className={styles.checksum}>{composition.checksumSha256}</p></article>}{history.length > 0 && <ul className={styles.referenceList}>{history.map((item) => <li key={item.allocationId}><div><strong>{item.poolId}</strong><small>{item.effectiveFrom}</small></div><span>{item.percentage} %</span></li>)}</ul>}</section>
  </div></>;
}
