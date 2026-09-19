'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { createPlanningScenario, planningScenarioFieldValidity, transitionPlanningScenario, type CreatePlanningScenario, type PlanningScenarioTransition } from './reporting-api';
import { ExclusiveOperationManager } from './async-operation';
import { ReportingError, ReportingStatus } from './reporting-feedback';
import styles from '../products/products.module.css';

const nextStatus = { DRAFT: 'SUBMITTED', SUBMITTED: 'VALIDATED', VALIDATED: 'OFFICIAL_BUDGET' } as const;
export function nextPlanningScenarioStatus(status: string): string | undefined { return nextStatus[status as keyof typeof nextStatus]; }

export function PlanningScenarioConsole() {
  const [poolId, setPoolId] = useState(''), [kind, setKind] = useState<CreatePlanningScenario['kind']>('CENTRAL'), [version, setVersion] = useState('1'), [startMonth, setStartMonth] = useState(new Date().toISOString().slice(0, 7));
  const [resourceGrowth, setResourceGrowth] = useState('1'), [annualYield, setAnnualYield] = useState('6'), [placementGrowth, setPlacementGrowth] = useState('1');
  const [scenario, setScenario] = useState<PlanningScenarioTransition>(), [busy, setBusy] = useState(false), [attempted, setAttempted] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const operations = useRef<ExclusiveOperationManager>(null);
  if (!operations.current) operations.current = new ExclusiveOperationManager();
  useEffect(() => () => operations.current?.cancel(), []);
  const command: CreatePlanningScenario = { poolId: poolId.trim(), kind, version: Number(version), startMonth, assumptions: { monthlyResourceGrowthPercent: resourceGrowth.trim(), annualYieldPercent: annualYield.trim(), monthlyPlacementGrowthPercent: placementGrowth.trim() } };
  const validity = planningScenarioFieldValidity(command);
  function invalidateScenario() { setScenario(undefined); setError(''); setMessage(''); }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (!Object.values(validity).every(Boolean)) { setError('Renseignez un pool valide, une version, un mois et des hypothèses décimales finies.'); return; }
    await operations.current!.run((signal) => createPlanningScenario(command, signal), {
      loading: () => { setBusy(true); setError(''); setMessage(''); setScenario(undefined); },
      success: (created) => { setScenario(created); setMessage('Scénario créé au statut DRAFT.'); setAttempted(false); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }

  async function advance() {
    if (!scenario?.scenarioId || operations.current!.isActive()) return;
    const next = nextPlanningScenarioStatus(scenario.status);
    if (!next) return;
    const scenarioId = scenario.scenarioId;
    await operations.current!.run((signal) => transitionPlanningScenario(scenarioId, { targetStatus: next }, signal), {
      loading: () => { setBusy(true); setError(''); setMessage(''); },
      success: (transitioned) => { setScenario({ ...transitioned, scenarioId }); setMessage(`Scénario passé au statut ${transitioned.status}.`); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }

  const next = scenario ? nextPlanningScenarioStatus(scenario.status) : undefined;
  const decimalHint = 'Nombre décimal fini, avec un point comme séparateur.';
  return <section className={styles.card} aria-busy={busy} aria-labelledby="planning-scenario-title">
    <h2 id="planning-scenario-title">Scénario budgétaire à 12 mois</h2>
    <form className={styles.form} onSubmit={create} noValidate><fieldset disabled={busy}>
      <label className={styles.field}>Pool<input value={poolId} onChange={(event) => { setPoolId(event.target.value); invalidateScenario(); }} required minLength={2} maxLength={64} autoComplete="off" spellCheck={false} aria-invalid={attempted && !validity.poolId} aria-describedby="planning-pool-hint" /></label><p id="planning-pool-hint" className={styles.hint}>2 à 64 caractères autorisés : lettres, chiffres, point, tiret, deux-points ou soulignement.</p>
      <label className={styles.field}>Nature<select value={kind} onChange={(event) => { setKind(event.target.value as CreatePlanningScenario['kind']); invalidateScenario(); }} required aria-invalid={attempted && !validity.kind}><option value="CENTRAL">Central</option><option value="OPTIMISTIC">Optimiste</option><option value="STRESSED">Stressé</option></select></label>
      <label className={styles.field}>Version<input type="number" min="1" step="1" value={version} onChange={(event) => { setVersion(event.target.value); invalidateScenario(); }} required aria-invalid={attempted && !validity.version} aria-describedby="planning-version-hint" /></label><p id="planning-version-hint" className={styles.hint}>Entier supérieur ou égal à 1.</p>
      <label className={styles.field}>Premier mois<input type="month" value={startMonth} onChange={(event) => { setStartMonth(event.target.value); invalidateScenario(); }} required aria-invalid={attempted && !validity.startMonth} /></label>
      <label className={styles.field}>Croissance mensuelle ressources (%)<input value={resourceGrowth} onChange={(event) => { setResourceGrowth(event.target.value); invalidateScenario(); }} required inputMode="decimal" aria-invalid={attempted && !validity.monthlyResourceGrowthPercent} aria-describedby="planning-decimal-hint" /></label>
      <label className={styles.field}>Rendement annuel (%)<input value={annualYield} onChange={(event) => { setAnnualYield(event.target.value); invalidateScenario(); }} required inputMode="decimal" aria-invalid={attempted && !validity.annualYieldPercent} aria-describedby="planning-decimal-hint" /></label>
      <label className={styles.field}>Croissance mensuelle placements (%)<input value={placementGrowth} onChange={(event) => { setPlacementGrowth(event.target.value); invalidateScenario(); }} required inputMode="decimal" aria-invalid={attempted && !validity.monthlyPlacementGrowthPercent} aria-describedby="planning-decimal-hint" /></label><p id="planning-decimal-hint" className={styles.hint}>{decimalHint}</p>
      <button className={styles.button} type="submit" disabled={busy}>{busy ? 'Traitement…' : 'Créer le scénario'}</button>
    </fieldset></form>
    <ReportingError message={error} /><ReportingStatus message={message} />
    {scenario && <article className={styles.product} aria-label={`Scénario ${scenario.scenarioId}`}><span className={styles.badge}>{scenario.status}</span><p className={styles.checksum}>{scenario.scenarioId}</p>{next && <button className={styles.button} type="button" disabled={busy || !scenario.scenarioId} onClick={() => void advance()}>Passer au statut {next}</button>}</article>}
  </section>;
}
