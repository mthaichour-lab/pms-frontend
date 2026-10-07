"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { EntityCatalog } from "../entity-catalog";
import {
  calculationRequest,
  getCalculationRun,
  initiateCalculation,
  listCalculationRuns,
  type CalculationRun,
  type CalculationWeightBasis,
  type CreateCalculationRun,
  validCalculationDraft,
  validCalculationRunId,
  validJustification,
  type WorkflowTransition,
} from "./calculation-api";
import { ExclusiveOperationManager, LatestOperationManager } from "./async-operation";
import { CalculationError, CalculationStatus } from "./calculation-feedback";
import styles from "../products/products.module.css";

export type CalculationAction = "control" | "approve";

const calculationStatuses = ["", "DRAFT", "CALCULATED", "CONTROLLED", "APPROVED", "POSTED", "ARCHIVED", "FAILED"] as const;

export function calculationActionForStatus(status?: string): CalculationAction | undefined {
  if (status === "CALCULATED") return "control";
  if (status === "CONTROLLED") return "approve";
  return undefined;
}

export function CalculationsConsole() {
  const [runId, setRunId] = useState("");
  const [run, setRun] = useState<CalculationRun>();
  const [runs, setRuns] = useState<readonly CalculationRun[]>([]);
  const [poolId, setPoolId] = useState("");
  const [businessDate, setBusinessDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rulesVersion, setRulesVersion] = useState("rules-2026.1");
  const [runKind, setRunKind] = useState<"PARALLEL" | "PRODUCTION">("PARALLEL");
  const [weightBasis, setWeightBasis] = useState<CalculationWeightBasis>("SUBSCRIPTION_LEDGER_BALANCE");
  const [poolFilter, setPoolFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [registryRevision, setRegistryRevision] = useState(0);
  const [registryLoading, setRegistryLoading] = useState(true);
  const [registryError, setRegistryError] = useState("");
  const [justification, setJustification] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadingRun, setLoadingRun] = useState(false);
  const [initiating, setInitiating] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const reads = useRef<LatestOperationManager>(null);
  const initiations = useRef<ExclusiveOperationManager>(null);
  const transitions = useRef<ExclusiveOperationManager>(null);
  if (!reads.current) reads.current = new LatestOperationManager();
  if (!initiations.current) initiations.current = new ExclusiveOperationManager();
  if (!transitions.current) transitions.current = new ExclusiveOperationManager();

  useEffect(() => () => {
    reads.current?.cancel();
    initiations.current?.cancel();
    transitions.current?.cancel();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setRegistryLoading(true);
    setRegistryError("");
    void listCalculationRuns({ limit: 50, poolId: poolFilter || undefined, status: statusFilter || undefined }, controller.signal)
      .then((page) => { if (!controller.signal.aborted) setRuns(page.items); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setRegistryError(cause instanceof Error ? cause.message : "Chargement des runs impossible."); })
      .finally(() => { if (!controller.signal.aborted) setRegistryLoading(false); });
    return () => controller.abort();
  }, [poolFilter, registryRevision, statusFilter]);

  useEffect(() => {
    if (!run || run.status !== "DRAFT") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const refreshed = await getCalculationRun(run.runId, controller.signal);
        if (controller.signal.aborted) return;
        setRun(refreshed);
        if (refreshed.status === "DRAFT") timer = setTimeout(() => void poll(), 1500);
        else {
          setMessage(`Traitement terminé avec le statut ${refreshed.status}.`);
          setRegistryRevision((value) => value + 1);
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Actualisation du calcul impossible.");
      }
    };
    timer = setTimeout(() => void poll(), 1500);
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [run?.runId, run?.status]);

  const busy = loadingRun || initiating || transitioning;
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

  async function loadRun(requestedRunId = runId.trim()) {
    if (transitions.current!.isActive() || initiations.current!.isActive()) return;
    if (!validCalculationRunId(requestedRunId)) {
      setError("L’identifiant du run doit être un UUID valide.");
      return;
    }
    setRunId(requestedRunId);
    await reads.current!.run(
      (signal) => getCalculationRun(requestedRunId, signal),
      {
        loading: () => { setLoadingRun(true); setRun(undefined); setError(""); setMessage(""); },
        success: (result) => { setRun(result); setMessage("Run chargé."); },
        failure: setError,
        settled: () => setLoadingRun(false),
      },
    );
  }

  async function initiate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command: CreateCalculationRun = {
      runId: crypto.randomUUID(), poolId, businessDate, rulesVersion: rulesVersion.trim(), runKind,
      participantBasis: { type: "ACTIVE_SUBSCRIPTIONS", weightBasis },
    };
    if (!validCalculationDraft(command)) {
      setError("Sélectionnez un pool actif et renseignez une date et une version de règles valides.");
      return;
    }
    await initiations.current!.run(
      async (signal) => {
        const dispatch = await initiateCalculation(command, signal);
        return getCalculationRun(dispatch.runId, signal);
      },
      {
        loading: () => { reads.current!.cancel(); setInitiating(true); setError(""); setMessage(""); },
        success: (created) => {
          setRunId(created.runId);
          setRun(created);
          setMessage("Calcul placé dans la file de traitement. Le résultat sera actualisé automatiquement.");
          setRegistryRevision((value) => value + 1);
        },
        failure: setError,
        settled: () => setInitiating(false),
      },
    );
  }

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadRun();
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
        return getCalculationRun(requestedRunId, signal);
      },
      {
        loading: () => { setLoadingRun(false); setTransitioning(true); setError(""); setMessage(""); },
        success: (refreshedRun) => {
          setRun(refreshedRun);
          setJustification("");
          setMessage(`Transition ${action} enregistrée.`);
          setRegistryRevision((value) => value + 1);
        },
        failure: setError,
        settled: () => setTransitioning(false),
      },
    );
  }

  return <div aria-busy={busy}>
    <div className={styles.grid}>
      <section className={styles.card} aria-labelledby="calculation-create-title">
        <h2 id="calculation-create-title">Lancer un calcul</h2>
        <form className={styles.form} onSubmit={initiate} noValidate>
          <EntityCatalog compact label="Pool actif" kind="investment-pools" selectedId={poolId} disabled={busy} onSelect={setPoolId} />
          <div className={styles.row}><label className={styles.field}>Date métier<input type="date" required disabled={busy} value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} /></label><label className={styles.field}>Version des règles<input required disabled={busy} value={rulesVersion} onChange={(event) => setRulesVersion(event.target.value)} /></label></div>
          <div className={styles.row}><label className={styles.field}>Type de run<select disabled={busy} value={runKind} onChange={(event) => setRunKind(event.target.value as "PARALLEL" | "PRODUCTION")}><option value="PARALLEL">Parallèle / simulation</option><option value="PRODUCTION">Production</option></select></label><label className={styles.field}>Base de pondération<select disabled={busy} value={weightBasis} onChange={(event) => setWeightBasis(event.target.value as CalculationWeightBasis)}><option value="SUBSCRIPTION_LEDGER_BALANCE">Solde des souscriptions</option><option value="LATEST_POSITION">Dernière position certifiée</option></select></label></div>
          <button className={styles.button} disabled={busy || !poolId}>{initiating ? "Mise en file…" : "Lancer le calcul"}</button>
        </form>
      </section>
      <section className={styles.card} aria-labelledby="calculation-registry-title">
        <h2 id="calculation-registry-title">Historique des runs</h2>
        <div className={styles.row}><label className={styles.field}>Pool<input value={poolFilter} onChange={(event) => setPoolFilter(event.target.value.trim().toUpperCase())} placeholder="Tous les pools" /></label><label className={styles.field}>Statut<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{calculationStatuses.map((status) => <option key={status || "ALL"} value={status}>{status || "Tous les statuts"}</option>)}</select></label></div>
        <button type="button" className={styles.secondary} disabled={registryLoading || busy} onClick={() => setRegistryRevision((value) => value + 1)}>Actualiser</button>
        {registryError ? <p role="alert" className={`${styles.notice} ${styles.error}`}>{registryError}</p> : null}
        {!registryLoading && !registryError && runs.length === 0 ? <p className={styles.hint}>Aucun run trouvé.</p> : null}
        {runs.length > 0 ? <div className={styles.tableWrap} data-layout-scroll-region><table><thead><tr><th>Date</th><th>Pool</th><th>Statut</th><th>Montant</th><th>Action</th></tr></thead><tbody>{runs.map((item) => <tr key={item.runId}><td>{item.businessDate}</td><td>{item.poolId}</td><td><span className={styles.badge}>{item.status}</span></td><td>{item.distributableAmount ? `${item.distributableAmount} ${item.currency ?? ""}` : "—"}</td><td><button type="button" className={styles.secondary} disabled={busy} onClick={() => void loadRun(item.runId)}>Ouvrir</button></td></tr>)}</tbody></table></div> : null}
      </section>
    </div>
    <div className={styles.grid}>
      <section className={styles.card} aria-labelledby="calculation-search-title">
        <h2 id="calculation-search-title">Consulter un run</h2>
        <form className={styles.form} onSubmit={lookup}>
          <label className={styles.field}>Identifiant du run<input value={runId} onChange={(event) => changeRunId(event.target.value)} required autoComplete="off" spellCheck={false} aria-describedby="calculation-run-id-hint" /></label>
          <p id="calculation-run-id-hint" className={styles.hint}>Format UUID attendu.</p>
          <button className={styles.button} disabled={busy}>Rechercher</button>
        </form>
        <CalculationStatus message={message} />
        <CalculationError message={error} />
      </section>
      <section className={styles.card} aria-labelledby="calculation-workflow-title" aria-live="polite">
        <h2 id="calculation-workflow-title">Contrôle Maker/Checker</h2>
        {run ? <div className={styles.product}>
          <span className={styles.badge}>{run.status}</span>
          <dl><dt>Identifiant du run</dt><dd className={styles.checksum}>{run.runId}</dd><dt>Date métier</dt><dd>{run.businessDate}</dd><dt>Pool</dt><dd>{run.poolId}</dd><dt>Version moteur</dt><dd>{run.engineVersion}</dd><dt>Montant distribuable</dt><dd>{run.distributableAmount ? `${run.distributableAmount} ${run.currency ?? ""}` : "En cours de calcul"}</dd></dl>
          {action ? <form className={styles.form} onSubmit={transition}><fieldset disabled={busy}><legend>{action === "control" ? "Contrôle du Maker" : "Approbation du Checker"}</legend><label className={styles.field}>Justification<textarea value={justification} onChange={(event) => setJustification(event.target.value)} required minLength={10} maxLength={1000} aria-describedby="calculation-justification-hint" /></label><p id="calculation-justification-hint" className={styles.hint}>{justification.trim().length} / 1 000 caractères · minimum 10</p><button className={styles.button} type="submit" disabled={busy}>{transitioning ? "Enregistrement…" : action === "control" ? "Contrôler" : "Approuver"}</button></fieldset></form> : <p className={styles.hint}>{run.status === "DRAFT" ? "Calcul en cours dans le worker…" : "Aucune transition disponible pour cet état."}</p>}
        </div> : <p className={styles.hint}>Chargez un run pour consulter ses preuves et appliquer le workflow.</p>}
      </section>
    </div>
  </div>;
}
