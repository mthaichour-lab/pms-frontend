import { describe, expect, it } from "vitest";
import { catalogPayload, filterCatalog } from "./entity-catalog";

describe("asset catalog presentation contract", () => {
  it("normalizes a complete asset position for the allocation selector", () => {
    expect(catalogPayload("assets", {
      items: [{
        assetId: "a1d817e4-657f-475f-a96a-7eecb8f93acc",
        assetCode: "MURABAHA-2026-001",
        currency: "DZD",
        outstandingAmount: "1250000.00",
        financingType: "MURABAHA",
      }],
    })).toEqual([{
      id: "a1d817e4-657f-475f-a96a-7eecb8f93acc",
      label: "MURABAHA-2026-001",
      detail: "1250000.00 DZD",
      status: "MURABAHA",
    }]);
  });

  it("rejects incomplete asset positions instead of offering an unsafe selection", () => {
    expect(() => catalogPayload("assets", {
      items: [{ assetId: "a1d817e4-657f-475f-a96a-7eecb8f93acc", assetCode: "MURABAHA-2026-001", currency: "DZD" }],
    })).toThrow("Entrée du catalogue invalide.");
  });

  it("finds an asset by code, amount, currency, or financing type", () => {
    const items = catalogPayload("assets", {
      items: [{ assetId: "a1d817e4-657f-475f-a96a-7eecb8f93acc", assetCode: "IJARA-42", currency: "DZD", outstandingAmount: "8200.00", financingType: "IJARA" }],
    });
    expect(filterCatalog(items, "ijara")).toHaveLength(1);
    expect(filterCatalog(items, "8200")).toHaveLength(1);
    expect(filterCatalog(items, "eur")).toHaveLength(0);
  });

  it("presents effective currency versions as selectable entries", () => {
    expect(catalogPayload("currencies", { items: [{ code: "EUR", name: "Euro", fractionDigits: 2, validFrom: "2026-01-01" }], total: 1 })).toEqual([
      { id: "EUR", label: "EUR", detail: "Euro · 2 décimales", status: "En vigueur depuis 2026-01-01" },
    ]);
  });
});
