"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { profitExplanationRequest, validExplanationIdentifiers, type ProfitExplanation } from "./calculation-api";
import { LatestOperationManager } from "./async-operation";
import { CalculationError } from "./calculation-feedback";
import styles from "../products/products.module.css";

export function ProfitExplanationConsole() {
  const [runId, setRunId] = useState(""), [accountId, setAccountId] = useState(""), [view, setView] = useState<"SIMPLIFIED" | "DETAILED">("SIMPLIFIED"), [explanation, setExplanation] = useState<ProfitExplanation>(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const requests = useRef<LatestOperationManager>(null);
  if (!requests.current) requests.current = new LatestOperationManager();
  useEffect(() => () => requests.current?.cancel(), []);
  async function load(event: FormEvent) {
    event.preventDefault();
    if (!validExplanationIdentifiers(runId, accountId)) { requests.current!.cancel(); setBusy(false); setExplanation(undefined); return setError("Les identifiants du run et du compte doivent être des UUID valides."); }
    const requested = { runId, accountId, view };
    await requests.current!.run(
      (signal) => profitExplanationRequest(requested.runId, requested.accountId, requested.view, signal),
      {
        loading: () => { setBusy(true); setError(""); setExplanation(undefined); },
        success: setExplanation,
        failure: setError,
        settled: () => setBusy(false),
      },
    );
  }
  return <section className={styles.card} aria-busy={busy}><h2>Explication du partage publié</h2><form className={styles.form} onSubmit={load}><div className={styles.row}><label className={styles.field}>Identifiant du run<input value={runId} onChange={(event) => setRunId(event.target.value)} required /></label><label className={styles.field}>Identifiant du compte<input value={accountId} onChange={(event) => setAccountId(event.target.value)} required /></label></div><label className={styles.field}>Niveau de restitution<select value={view} onChange={(event) => setView(event.target.value as "SIMPLIFIED" | "DETAILED")}><option value="SIMPLIFIED">Vue client simplifiée</option><option value="DETAILED">Vue interne détaillée</option></select></label><button className={styles.button} disabled={busy}>{busy ? "Chargement…" : "Charger l’explication"}</button></form><CalculationError message={error} />{explanation && <ExplanationResult explanation={explanation} />}</section>;
}

function ExplanationResult({ explanation }: { explanation: ProfitExplanation }) {
  const source = explanation.source;
  return <div className={styles.product}><span className={styles.badge}>{explanation.view}</span><dl><dt>Capital investi</dt><dd>{source.capitalInvested} {source.currency}</dd><dt>Base de participation</dt><dd>{source.participationBase}</dd><dt>Part allouée</dt><dd>{source.allocatedShare}</dd><dt>Impôt</dt><dd>{source.taxAmount}</dd><dt>Net payé</dt><dd>{source.netPaid} {source.currency}</dd><dt>Taux réalisé</dt><dd>{source.realizedRatePercent} %</dd><dt>Période éligible</dt><dd>{source.eligiblePeriod.from} — {source.eligiblePeriod.to}</dd>{source.mudaribNetShare !== undefined && <><dt>Part nette Mudarib</dt><dd>{source.mudaribNetShare}</dd><dt>Solde PER</dt><dd>{source.perClosingBalance}</dd><dt>Solde IRR</dt><dd>{source.irrClosingBalance}</dd><dt>Capacité d’absorption</dt><dd>{source.lossAbsorptionCapacity}</dd></>}</dl><p className={styles.notice}>{source.nonGuaranteedNotice}</p>{source.lossExplanation && <p>{source.lossExplanation}</p>}<p className={styles.checksum}>{explanation.outputChecksumSha256}</p></div>;
}
