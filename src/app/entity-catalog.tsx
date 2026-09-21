"use client";

import { useEffect, useId, useState } from "react";
import styles from "./products/products.module.css";

export type CatalogKind = "products" | "customers" | "investment-pools";
export type CatalogItem = { readonly id: string; readonly label: string; readonly detail: string; readonly status: string };
const titles: Record<CatalogKind, string> = { products: "Produits disponibles", customers: "Clients disponibles", "investment-pools": "Pools disponibles" };
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

export function catalogPayload(kind: CatalogKind, value: unknown): readonly CatalogItem[] {
  const rows = Array.isArray(value) ? value : record(value) && Array.isArray(value.items) ? value.items : undefined;
  if (!rows) throw new Error("Réponse du catalogue invalide.");
  return rows.map((row: unknown) => {
    if (!record(row)) throw new Error("Entrée du catalogue invalide.");
    if (["id", "label", "detail", "status"].every((key) => typeof row[key] === "string")) return row as CatalogItem;
    if (kind === "products" && typeof row.productId === "string" && typeof row.code === "string" && typeof row.name === "string" && typeof row.status === "string") return { id: row.productId, label: row.code, detail: row.name, status: row.status };
    if (kind === "customers" && typeof row.customerId === "string" && typeof row.segment === "string" && typeof row.kycStatus === "string") return { id: row.customerId, label: `Client ${row.customerId}`, detail: row.segment, status: row.kycStatus };
    if (kind === "investment-pools" && typeof row.poolId === "string" && typeof row.displayName === "string" && typeof row.currency === "string" && typeof row.status === "string") return { id: row.poolId, label: row.poolId, detail: `${row.displayName} · ${row.currency}`, status: row.status };
    throw new Error("Entrée du catalogue invalide.");
  });
}
export function filterCatalog(items: readonly CatalogItem[], query: string): readonly CatalogItem[] {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
  const search = normalize(query.trim());
  return items.filter((item) => normalize(`${item.id} ${item.label} ${item.detail} ${item.status}`).includes(search));
}
export function notifyCatalogChanged(kind: CatalogKind) { window.dispatchEvent(new CustomEvent("pms-catalog-changed", { detail: kind })); }

export function EntityCatalog({ kind, selectedId, onSelect, disabled = false, compact = false, label }: {
  readonly kind: CatalogKind; readonly selectedId: string; readonly onSelect: (id: string) => void;
  readonly disabled?: boolean; readonly compact?: boolean; readonly label?: string;
}) {
  const id = useId();
  const [items, setItems] = useState<readonly CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const changed = (event: Event) => { if ((event as CustomEvent).detail === kind) setRevision((value) => value + 1); };
    window.addEventListener("pms-catalog-changed", changed);
    return () => window.removeEventListener("pms-catalog-changed", changed);
  }, [kind]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    async function load() {
      const all: CatalogItem[] = [];
      let offset = 0;
      while (!controller.signal.aborted) {
        const response = await fetch(`/api/core/${kind}?limit=100&offset=${offset}`, { signal: controller.signal, headers: { accept: "application/json" }, cache: "no-store" });
        const payload: unknown = await response.json().catch(() => undefined);
        if (!response.ok) throw new Error(record(payload) && typeof payload.detail === "string" ? payload.detail : `Impossible de charger le catalogue (HTTP ${response.status}).`);
        const page = catalogPayload(kind, payload);
        all.push(...page);
        const total = record(payload) && typeof payload.total === "number" ? payload.total : all.length;
        if (page.length === 0 || all.length >= total) break;
        offset += page.length;
      }
      if (!controller.signal.aborted) setItems(all);
    }
    void load().catch((cause: unknown) => { if (!controller.signal.aborted) { setItems([]); setError(cause instanceof Error ? cause.message : "Chargement impossible."); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, revision]);
  const visible = filterCatalog(items, query);
  return <section className={compact ? styles.form : styles.catalog} aria-label={label ?? titles[kind]} aria-busy={loading}>
    {!compact && <div className={styles.catalogHead}><div><p>Référentiel</p><h2>{titles[kind]}</h2></div><button type="button" className={styles.secondary} disabled={loading || disabled} onClick={() => setRevision((value) => value + 1)}>Actualiser</button></div>}
    <label className={styles.field} htmlFor={`${id}-search`}>Rechercher {label?.toLocaleLowerCase("fr") ?? "dans le catalogue"}<input id={`${id}-search`} type="search" value={query} placeholder="Nom, référence ou statut…" onChange={(event) => setQuery(event.target.value)} disabled={disabled} /></label>
    <label className={styles.field} htmlFor={`${id}-selector`}>{label ?? "Sélection rapide"}<select id={`${id}-selector`} value={selectedId} disabled={disabled || loading || Boolean(error)} onChange={(event) => { if (event.target.value) onSelect(event.target.value); }}>
      <option value="">{loading ? "Chargement…" : "Choisir dans la liste…"}</option>
      {selectedId && !visible.some((item) => item.id === selectedId) && <option value={selectedId}>{items.find((item) => item.id === selectedId)?.label ?? selectedId} — sélection actuelle</option>}
      {visible.map((item) => <option key={item.id} value={item.id}>{item.label} — {item.detail} ({item.status})</option>)}
    </select></label>
    {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error} <button type="button" className={styles.secondary} disabled={disabled || loading} onClick={() => setRevision((value) => value + 1)}>Réessayer</button></p>}
    {!loading && !error && <p className={styles.hint} role="status">{visible.length} résultat{visible.length > 1 ? "s" : ""}{query ? ` pour « ${query} »` : ""}.</p>}
    {!compact && visible.length > 0 && <div className={styles.tableWrap} data-layout-scroll-region><table><thead><tr><th>Référence</th><th>Libellé</th><th>Statut</th><th><span className={styles.srOnly}>Action</span></th></tr></thead><tbody>{visible.map((item) => <tr key={item.id} aria-selected={selectedId === item.id}><td className={styles.catalogId}>{item.label}</td><td>{item.detail}</td><td><span className={styles.badge}>{item.status}</span></td><td><button className={styles.secondary} type="button" disabled={disabled || loading} onClick={() => onSelect(item.id)}>Choisir</button></td></tr>)}</tbody></table></div>}
  </section>;
}
