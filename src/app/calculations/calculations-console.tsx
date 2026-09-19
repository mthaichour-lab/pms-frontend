"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  calculationRequest,
  type CalculationRun,
  validCalculationRunId,
  validJustification,
  type WorkflowTransition,
} from "./calculation-api";
import { ExclusiveOperationManager, LatestOperationManager } from "./async-operation";
import { CalculationError, CalculationStatus } from "./calculation-feedback";
import styles from "../products/products.module.css";

export type CalculationAction = "control" | "approve";

export function calculationActionForStatus(status?: string): CalculationAction | undefined {
  if (status === "CALCULATED") return "control";
  if (status === "CONTROLLED") return "approve";
  return undefined;
}

export function CalculationsConsole() {
  const [runId, setRunId] = useState("");
  const [run, setRun] = useState<CalculationRun>();
  const [justification, setJustification] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadingRun, setLoadingRun] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const reads = useRef<LatestOperationManager>(null);
  const transitions = useRef<ExclusiveOperationManager>(null);
  if (!reads.current) reads.current = new LatestOperationManager();
  if (!transitions.current) transitions.current = new ExclusiveOperationManager();

  useEffect(() => () => {
    reads.current?.cancel();
    transitions.current?.cancel();
  }, []);

  const busy = loadingRun || transitioning;
  const action = calculationActionForStatus(run?.status);

  function changeRunId(value: string) {
    reads.current!.cancel();
    transitions.current!.cancel();
    setRunId(value.trim());
    setRun(undefined);
    setJustification("");
    setMessage("");
    setError("");
    setLoadingRun(false);
    setTransitioning(false);
  }

  async function load() {
    if (transitions.current!.isActive()) return;
    const requestedRunId = runId.trim();
    if (!validCalculationRunId(requestedRunId)) {
      setError("L’identifiant du run doit être un UUID valide.");
      return;
    }
    await reads.current!.run(
      (signal) => calculationRequest<CalculationRun>(requestedRunId, undefined, undefined, signal),
      {
        loading: () => { setLoadingRun(true); setRun(undefined); setError(""); setMessage(""); },
        success: (result) => { setRun(result); setMessage("Run chargé."); },
        failure: setError,
        settled: () => setLoadingRun(false),
      },
    );
  }

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await load();
  }

  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!run || !action || transitions.current!.isActive()) return;
    if (!validJustification(justification)) {
      setError("La justification doit contenir entre 10 et 1 000 caractères.");
      return;
    }
    const requestedRunId = run.runId;
    if (!validCalculationRunId(requestedRunId)) {
      setError("Le résultat chargé ne contient pas un identifiant de run valide.");
      return;
    }
    reads.current!.cancel();
    await transitions.current!.run(
      async (signal) => {
        await calculationRequest<WorkflowTransition>(requestedRunId, action, justification.trim(), signal);
        return calculationRequest<CalculationRun>(requestedRunId, undefined, undefined, signal);
      },
      {
        loading: () => { setLoadingRun(false); setTransitioning(true); setError(""); setMessage(""); },
        success: (refreshedRun) => {
          setRun(refreshedRun);
          setJustification("");
          setMessage(`Transition ${action} enregistrée.`);
        },
        failure: setError,
        settled: () => setTransitioning(false),
      },
    );
  }

  return (
    <div className={styles.grid} aria-busy={busy}>
      <section className={styles.card} aria-labelledby="calculation-search-title">
        <h2 id="calculation-search-title">Consulter un run</h2>
        <form className={styles.form} onSubmit={lookup}>
          <label className={styles.field}>
            Identifiant du run
            <input value={runId} onChange={(event) => changeRunId(event.target.value)} required autoComplete="off" spellCheck={false} aria-describedby="calculation-run-id-hint" />
          </label>
          <p id="calculation-run-id-hint" className={styles.hint}>Format UUID attendu.</p>
          <button className={styles.button} disabled={busy}>Rechercher</button>
        </form>
        <CalculationStatus message={message} />
        <CalculationError message={error} />
      </section>
      <section className={styles.card} aria-labelledby="calculation-workflow-title" aria-live="polite">
        <h2 id="calculation-workflow-title">Contrôle Maker/Checker</h2>
        {run ? (
          <div className={styles.product}>
            <span className={styles.badge}>{run.status}</span>
            <dl>
              <dt>Identifiant du run</dt><dd className={styles.checksum}>{run.runId}</dd>
              <dt>Date métier</dt><dd>{run.businessDate}</dd>
              <dt>Pool</dt><dd>{run.poolId}</dd>
              <dt>Version moteur</dt><dd>{run.engineVersion}</dd>
            </dl>
            {action ? (
              <form className={styles.form} onSubmit={transition}>
                <fieldset disabled={busy}>
                  <legend>{action === "control" ? "Contrôle du Maker" : "Approbation du Checker"}</legend>
                  <label className={styles.field}>
                    Justification
                    <textarea value={justification} onChange={(event) => setJustification(event.target.value)} required minLength={10} maxLength={1000} aria-describedby="calculation-justification-hint" />
                  </label>
                  <p id="calculation-justification-hint" className={styles.hint}>{justification.trim().length} / 1 000 caractères · minimum 10</p>
                  <button className={styles.button} type="submit" disabled={busy}>
                    {transitioning ? "Enregistrement…" : action === "control" ? "Contrôler" : "Approuver"}
                  </button>
                </fieldset>
              </form>
            ) : <p className={styles.hint}>Aucune transition disponible pour cet état.</p>}
          </div>
        ) : <p className={styles.hint}>Chargez un run pour consulter ses preuves et appliquer le workflow.</p>}
      </section>
    </div>
  );
}
