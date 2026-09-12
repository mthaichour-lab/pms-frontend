'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { createPlanningScenario, transitionPlanningScenario, validPlanningScenario, type CreatePlanningScenario, type PlanningScenarioTransition } from './reporting-api';
import { ExclusiveOperationManager } from './async-operation';
import { ReportingError, ReportingStatus } from './reporting-feedback';
import styles from '../products/products.module.css';

const nextStatus = { DRAFT: 'SUBMITTED', SUBMITTED: 'VALIDATED', VALIDATED: 'OFFICIAL_BUDGET' } as const;
export function nextPlanningScenarioStatus(status: string): string | undefined { return nextStatus[status as keyof typeof nextStatus]; }

export function PlanningScenarioConsole() {
  const [poolId, setPoolId] = useState(''), [kind, setKind] = useState<CreatePlanningScenario['kind']>('CENTRAL'), [version, setVersion] = useState(1), [startMonth, setStartMonth] = useState(new Date().toISOString().slice(0, 7));
  const [resourceGrowth, setResourceGrowth] = useState('1'), [annualYield, setAnnualYield] = useState('6'), [placementGrowth, setPlacementGrowth] = useState('1');
  const [scenario, setScenario] = useState<PlanningScenarioTransition>(), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const operations = useRef<ExclusiveOperationManager>(null);
  if (!operations.current) operations.current = new ExclusiveOperationManager();
  useEffect(() => () => operations.current?.cancel(), []);
  const command: CreatePlanningScenario = { poolId, kind, version, startMonth, assumptions: { monthlyResourceGrowthPercent: resourceGrowth, annualYieldPercent: annualYield, monthlyPlacementGrowthPercent: placementGrowth } };
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!validPlanningScenario(command)) return setError('Renseignez un pool valide, une version, un mois et des hypothèses décimales.');
    await operations.current!.run(() => createPlanningScenario(command), {
      loading: () => { setBusy(true); setError(''); setMessage(''); setScenario(undefined); },
      success: (created) => { setScenario(created); setMessage('Scénario créé au statut DRAFT.'); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }
  async function advance() {
    if (!scenario?.scenarioId) return;
    const next = nextPlanningScenarioStatus(scenario.status);
    if (!next) return;
    const scenarioId = scenario.scenarioId;
    await operations.current!.run(() => transitionPlanningScenario(scenarioId, { targetStatus: next }), {
      loading: () => { setBusy(true); setError(''); setMessage(''); },
      success: (transitioned) => { setScenario({ ...transitioned, scenarioId }); setMessage(`Scénario passé au statut ${transitioned.status}.`); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }
  const next = scenario ? nextPlanningScenarioStatus(scenario.status) : undefined;
  return <section className={styles.card} aria-busy={busy}><h2>Scénario budgétaire à 12 mois</h2><form className={styles.form} onSubmit={create}><label className={styles.field}>Pool<input value={poolId} onChange={(e) => setPoolId(e.target.value)} /></label><label className={styles.field}>Nature<select value={kind} onChange={(e) => setKind(e.target.value as CreatePlanningScenario['kind'])}><option value="CENTRAL">Central</option><option value="OPTIMISTIC">Optimiste</option><option value="STRESSED">Stressé</option></select></label><label className={styles.field}>Version<input type="number" min="1" value={version} onChange={(e) => setVersion(Number(e.target.value))} /></label><label className={styles.field}>Premier mois<input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} /></label><label className={styles.field}>Croissance mensuelle ressources (%)<input value={resourceGrowth} onChange={(e) => setResourceGrowth(e.target.value)} /></label><label className={styles.field}>Rendement annuel (%)<input value={annualYield} onChange={(e) => setAnnualYield(e.target.value)} /></label><label className={styles.field}>Croissance mensuelle placements (%)<input value={placementGrowth} onChange={(e) => setPlacementGrowth(e.target.value)} /></label><button className={styles.button} disabled={busy}>{busy ? 'Traitement…' : 'Créer le scénario'}</button></form><ReportingError message={error} /><ReportingStatus message={message} />{scenario && <div className={styles.product}><span className={styles.badge}>{scenario.status}</span><p>{scenario.scenarioId}</p>{next && <button className={styles.button} disabled={busy || !scenario.scenarioId} onClick={() => void advance()}>Passer au statut {next}</button>}</div>}</section>;
}
