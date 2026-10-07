"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "../products/products.module.css";

type CurrencyDefinition = { code: string; name: string; fractionDigits: number; validFrom: string; validUntil?: string };
type CurrencyPage = { items: readonly CurrencyDefinition[]; total: number };

function isCurrencyPage(value: unknown): value is CurrencyPage {
  if (!value || typeof value !== "object" || !Array.isArray((value as CurrencyPage).items) || typeof (value as CurrencyPage).total !== "number") return false;
  return (value as CurrencyPage).items.every((item) => typeof item.code === "string" && /^[A-Z]{3}$/.test(item.code) && typeof item.name === "string" && Number.isInteger(item.fractionDigits) && typeof item.validFrom === "string");
}

function messageFrom(payload: unknown, fallback: string): string {
  return payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).detail === "string" ? String((payload as Record<string, unknown>).detail) : fallback;
}

export function CurrencyConsole() {
  const today = useRef(new Date().toISOString().slice(0, 10));
  const [currencies, setCurrencies] = useState<readonly CurrencyDefinition[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError("");
    void fetch(`/api/core/currencies?businessDate=${encodeURIComponent(today.current)}&limit=100&offset=0`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => undefined);
        if (!response.ok) throw new Error(messageFrom(payload, `Chargement des devises impossible (HTTP ${response.status}).`));
        if (!isCurrencyPage(payload)) throw new Error("Réponse de référentiel devises invalide.");
        setCurrencies(payload.items);
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Chargement impossible."); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [revision]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const validUntil = String(data.get("validUntil") ?? "");
    const command: CurrencyDefinition = {
      code: String(data.get("code") ?? "").trim().toUpperCase(),
      name: String(data.get("name") ?? "").trim(),
      fractionDigits: Number(data.get("fractionDigits")),
      validFrom: String(data.get("validFrom") ?? ""),
      ...(validUntil ? { validUntil } : {}),
    };
    if (!/^[A-Z]{3}$/.test(command.code) || !command.name || !Number.isInteger(command.fractionDigits) || command.fractionDigits < 0 || command.fractionDigits > 6 || !/^\d{4}-\d{2}-\d{2}$/.test(command.validFrom) || (command.validUntil !== undefined && command.validUntil <= command.validFrom)) {
      setError("Renseignez un code ISO à trois lettres, un libellé, une précision de 0 à 6 et une période cohérente."); setMessage(""); return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/core/currencies", { method: "POST", headers: { "content-type": "application/json", "x-correlation-id": crypto.randomUUID(), "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(command) });
      const payload: unknown = await response.json().catch(() => undefined);
      if (!response.ok) throw new Error(messageFrom(payload, `Création impossible (HTTP ${response.status}).`));
      setMessage(`${command.code} est enregistré comme nouvelle version de référence.`);
      event.currentTarget.reset();
      setRevision((value) => value + 1);
      window.dispatchEvent(new CustomEvent("pms-catalog-changed", { detail: "currencies" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Création impossible.");
    } finally { setBusy(false); }
  }

  return <div className={styles.grid}>
    <section className={styles.card} aria-labelledby="currency-create-title" aria-busy={busy}>
      <h2 id="currency-create-title">Ajouter une devise</h2>
      <p className={styles.hint}>Les versions sont traçables et immuables. Pour faire évoluer une devise, ajoutez une version datée au lieu de modifier l’historique.</p>
      <form className={styles.form} onSubmit={create} noValidate>
        <div className={styles.row}><label className={styles.field}>Code ISO<input name="code" required maxLength={3} placeholder="Ex. GBP" disabled={busy} autoComplete="off" /></label><label className={styles.field}>Décimales<input name="fractionDigits" type="number" min={0} max={6} step={1} defaultValue={2} required disabled={busy} /></label></div>
        <label className={styles.field}>Libellé<input name="name" required maxLength={120} placeholder="Ex. Livre sterling" disabled={busy} /></label>
        <div className={styles.row}><label className={styles.field}>En vigueur à partir du<input name="validFrom" type="date" defaultValue={today.current} required disabled={busy} /></label><label className={styles.field}>Fin de validité (facultative)<input name="validUntil" type="date" disabled={busy} /></label></div>
        <button className={styles.button} type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Ajouter la version"}</button>
      </form>
      {error ? <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p> : null}
      {message ? <p className={styles.notice} role="status">{message}</p> : null}
    </section>
    <section className={styles.card} aria-labelledby="currency-list-title" aria-busy={busy}>
      <div className={styles.catalogHead}><div><p>Référentiel</p><h2 id="currency-list-title">Devises en vigueur</h2></div><button className={styles.secondary} type="button" disabled={busy} onClick={() => setRevision((value) => value + 1)}>Actualiser</button></div>
      <p className={styles.hint}>Date métier : {today.current} · {currencies.length} devise{currencies.length > 1 ? "s" : ""} disponible{currencies.length > 1 ? "s" : ""}.</p>
      <div className={styles.tableWrap} data-layout-scroll-region><table><thead><tr><th>Code</th><th>Libellé</th><th>Précision</th><th>Période</th></tr></thead><tbody>{currencies.map((currency) => <tr key={`${currency.code}-${currency.validFrom}`}><td className={styles.catalogId}>{currency.code}</td><td>{currency.name}</td><td>{currency.fractionDigits}</td><td>{currency.validFrom}{currency.validUntil ? ` — ${currency.validUntil}` : " — ouverte"}</td></tr>)}</tbody></table></div>
    </section>
  </div>;
}
