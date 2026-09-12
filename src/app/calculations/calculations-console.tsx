"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  calculationRequest,
  type CalculationRun,
  validJustification,
  type WorkflowTransition,
} from "./calculation-api";
import { ExclusiveOperationManager, LatestOperationManager } from "./async-operation";
import { CalculationError, CalculationStatus } from "./calculation-feedback";
import styles from "../products/products.module.css";
export function CalculationsConsole() {
  const [runId, setRunId] = useState(""),
    [run, setRun] = useState<CalculationRun>(),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [loadingRun, setLoadingRun] = useState(false),
    [transitioning, setTransitioning] = useState(false);
  const reads = useRef<LatestOperationManager>(null);
  const transitions = useRef<ExclusiveOperationManager>(null);
  if (!reads.current) reads.current = new LatestOperationManager();
  if (!transitions.current) transitions.current = new ExclusiveOperationManager();
  useEffect(() => () => { reads.current?.cancel(); transitions.current?.cancel(); }, []);
  const busy = loadingRun || transitioning;
  async function load() {
    if (transitions.current!.isActive()) return;
    const requestedRunId = runId;
    await reads.current!.run(
      (signal) => calculationRequest<CalculationRun>(requestedRunId, undefined, undefined, signal),
      {
        loading: () => { setLoadingRun(true); setError(""); setMessage(""); },
        success: (result) => { setRun(result); setMessage("Run chargé."); },
        failure: setError,
        settled: () => setLoadingRun(false),
      },
    );
  }
  async function lookup(event: FormEvent) {
    event.preventDefault();
    await load();
  }
  async function transition(action: "control" | "approve") {
    const justification =
      window.prompt("Justification Maker/Checker (10 caractères minimum) :") ??
      "";
    if (!validJustification(justification)) {
      setError("La justification doit contenir entre 10 et 1 000 caractères.");
      return;
    }
    reads.current!.cancel();
    const requestedRunId = runId;
    await transitions.current!.run(
      async () => {
        await calculationRequest<WorkflowTransition>(requestedRunId, action, justification);
        return calculationRequest<CalculationRun>(requestedRunId);
      },
      {
        loading: () => { setLoadingRun(false); setTransitioning(true); setError(""); setMessage(""); },
        success: (refreshedRun) => { setRun(refreshedRun); setMessage(`Transition ${action} enregistrée.`); },
        failure: setError,
        settled: () => setTransitioning(false),
      },
    );
  }
  return (
    <div className={styles.grid} aria-busy={busy}>
      <section className={styles.card}>
        <h2>Consulter un run</h2>
        <form className={styles.form} onSubmit={lookup}>
          <label className={styles.field}>
            Identifiant du run
            <input
              value={runId}
              onChange={(event) => setRunId(event.target.value)}
              required
            />
          </label>
          <button className={styles.button} disabled={busy}>
            Rechercher
          </button>
        </form>
        <CalculationStatus message={message} />
        <CalculationError message={error} />
      </section>
      <section className={styles.card}>
        <h2>Contrôle Maker/Checker</h2>
        {run ? (
          <div className={styles.product}>
            <span className={styles.badge}>{run.status}</span>
            <dl>
              <dt>Date métier</dt>
              <dd>{run.businessDate}</dd>
              <dt>Pool</dt>
              <dd>{run.poolId}</dd>
              <dt>Version moteur</dt>
              <dd>{run.engineVersion}</dd>
            </dl>
            <div className={styles.actions}>
              <button
                className={styles.button}
                disabled={busy}
                onClick={() => void transition("control")}
              >
                Contrôler
              </button>
              <button
                className={`${styles.button} ${styles.secondary}`}
                disabled={busy}
                onClick={() => void transition("approve")}
              >
                Approuver
              </button>
            </div>
          </div>
        ) : (
          <p className={styles.hint}>
            Chargez un run pour consulter ses preuves et appliquer le workflow.
          </p>
        )}
      </section>
    </div>
  );
}
