"use client";

import { useEffect, useState } from "react";
import styles from "./products/products.module.css";

type CatalogKind = "products" | "customers" | "investment-pools";

type CatalogItem = {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly status: string;
};

const demoCatalogs: Record<CatalogKind, readonly CatalogItem[]> = {
  products: [
    ["10000000-0000-4000-8000-000000000003", "AL_AMAL_RENDEMENT", "Al Amal Rendement", "PUBLISHED"],
    ["10000000-0000-4000-8000-000000000012", "AMANA_DYNAMIQUE", "Amana Dynamique", "VALIDATED"],
    ["10000000-0000-4000-8000-000000000010", "ASSALA_ACTIONS", "Assala Actions", "PUBLISHED"],
    ["10000000-0000-4000-8000-000000000002", "BARAKA_CROISSANCE", "Baraka Croissance", "PUBLISHED"],
    ["10000000-0000-4000-8000-000000000005", "FONDS_PME_HALAL", "Fonds PME Halal", "PUBLISHED"],
    ["10000000-0000-4000-8000-000000000006", "ISTITHMAR_EQUILIBRE", "Al Istithmar Équilibré", "PUBLISHED"],
    ["10000000-0000-4000-8000-000000000001", "MUDARABA_STD", "Compte Moudaraba standard", "DRAFT"],
    ["10000000-0000-4000-8000-000000000009", "NOUR_TRESORERIE", "Nour Trésorerie", "PUBLISHED"],
    ["10000000-0000-4000-8000-000000000008", "RIBH_INTERNATIONAL", "Ribh International", "PUBLISHED"],
    ["10000000-0000-4000-8000-000000000004", "SUKUK_IMMOBILIER", "Sukuk Immobilier", "PUBLISHED"],
    ["10000000-0000-4000-8000-000000000007", "TAZKIA_SELECTIF", "Tazkia Sélectif", "SUSPENDED"],
    ["10000000-0000-4000-8000-000000000011", "WAFAA_OBLIGATIONS", "Wafaa Obligations", "CLOSED"],
  ].map(([id, label, detail, status]) => ({ id, label, detail, status })),
  customers: [
    ["20000000-0000-4000-8000-000000000001", "Client 001", "Retail · KYC vérifié", "VERIFIED"],
    ["20000000-0000-4000-8000-000000000002", "Client 002", "Corporate · KYC vérifié", "VERIFIED"],
    ["20000000-0000-4000-8000-000000000003", "Client 003", "PME · KYC vérifié", "VERIFIED"],
    ["20000000-0000-4000-8000-000000000004", "Client 004", "Institutionnel · KYC vérifié", "VERIFIED"],
    ["20000000-0000-4000-8000-000000000005", "Client 005", "Retail · KYC en attente", "PENDING"],
    ["20000000-0000-4000-8000-000000000006", "Client 006", "Corporate · KYC expiré", "EXPIRED"],
    ["20000000-0000-4000-8000-000000000007", "Client 007", "PME · KYC vérifié", "VERIFIED"],
    ["20000000-0000-4000-8000-000000000008", "Client 008", "Retail · KYC rejeté", "REJECTED"],
  ].map(([id, label, detail, status]) => ({ id, label, detail, status })),
  "investment-pools": [
    ["EQUIPMENT", "EQUIPMENT", "Financement équipement · DZD", "ACTIVE"],
    ["GLOBAL_POOL", "GLOBAL_POOL", "Pool global participatif · DZD", "ACTIVE"],
    ["REAL_ESTATE", "REAL_ESTATE", "Financement immobilier · DZD", "ACTIVE"],
  ].map(([id, label, detail, status]) => ({ id, label, detail, status })),
};

const titles: Record<CatalogKind, string> = {
  products: "Produits disponibles",
  customers: "Clients disponibles",
  "investment-pools": "Pools disponibles",
};

function isCatalogItem(value: unknown): value is CatalogItem {
  return typeof value === "object" && value !== null &&
    typeof (value as Record<string, unknown>).id === "string" &&
    typeof (value as Record<string, unknown>).label === "string" &&
    typeof (value as Record<string, unknown>).detail === "string" &&
    typeof (value as Record<string, unknown>).status === "string";
}

function catalogPayload(value: unknown): readonly CatalogItem[] | undefined {
  if (Array.isArray(value) && value.every(isCatalogItem)) return value;
  if (typeof value === "object" && value !== null && Array.isArray((value as Record<string, unknown>).items)) {
    const items = (value as Record<string, unknown>).items as unknown[];
    return items.every(isCatalogItem) ? items : undefined;
  }
  return undefined;
}

export function EntityCatalog({ kind, selectedId, onSelect, disabled = false }: {
  readonly kind: CatalogKind;
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
  readonly disabled?: boolean;
}) {
  const [items, setItems] = useState<readonly CatalogItem[]>(demoCatalogs[kind]);
  const [source, setSource] = useState<"demo" | "live">("demo");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/core/${kind}`, { signal: controller.signal, headers: { accept: "application/json" } })
      .then(async (response) => response.ok ? catalogPayload(await response.json()) : undefined)
      .then((payload) => { if (!controller.signal.aborted && payload?.length) { setItems(payload); setSource("live"); } })
      .catch(() => undefined);
    return () => controller.abort();
  }, [kind]);

  return <section className={styles.catalog} aria-labelledby={`${kind}-catalog-title`}>
    <div className={styles.catalogHead}>
      <div><p>Référentiel</p><h2 id={`${kind}-catalog-title`}>{titles[kind]}</h2></div>
      <span className={styles.catalogSource}>{source === "live" ? "Synchronisé" : "Données de test"}</span>
    </div>
    <label className={styles.field} htmlFor={`${kind}-selector`}>Sélection rapide
      <select id={`${kind}-selector`} value={selectedId} disabled={disabled} onChange={(event) => onSelect(event.target.value)}>
        <option value="">Choisir dans la liste…</option>
        {items.map((item) => <option key={item.id} value={item.id}>{item.label} — {item.detail}</option>)}
      </select>
    </label>
    <div className={styles.tableWrap} data-layout-scroll-region>
      <table>
        <thead><tr><th>Référence</th><th>Libellé</th><th>Statut</th><th><span className={styles.srOnly}>Action</span></th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id} aria-selected={selectedId === item.id}>
          <td className={styles.catalogId}>{item.label}</td><td>{item.detail}</td><td><span className={styles.badge}>{item.status}</span></td>
          <td><button className={styles.secondary} type="button" disabled={disabled} onClick={() => onSelect(item.id)}>Choisir</button></td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
