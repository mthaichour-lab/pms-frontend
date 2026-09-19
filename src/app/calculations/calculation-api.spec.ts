import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calculationRequest,
  profitExplanationRequest,
  validCalculationRunId,
  validExplanationIdentifiers,
  validJustification,
} from "./calculation-api";
import { CalculationsConsole, calculationActionForStatus } from "./calculations-console";

afterEach(() => vi.restoreAllMocks());

describe("calculation workflow validation", () => {
  it("requires a meaningful Maker/Checker justification", () => {
    expect(validJustification("court")).toBe(false);
    expect(validJustification("Contrôle financier conforme")).toBe(true);
  });

  it("requires UUIDs for calculation runs and published explanations", () => {
    const runId = "8c86d06e-2c2e-4aac-93d7-465c338232d9";
    const accountId = "1447e82c-ca3d-4bad-b9f8-476f10ec8d3d";
    expect(validCalculationRunId(runId)).toBe(true);
    expect(validExplanationIdentifiers(runId, accountId)).toBe(true);
    expect(validCalculationRunId("run-1")).toBe(false);
    expect(validCalculationRunId("00000000-0000-0000-0000-000000000000")).toBe(false);
    expect(validExplanationIdentifiers("run-1", "account-1")).toBe(false);
  });

  it("exposes only the transition allowed by the loaded run status", () => {
    expect(calculationActionForStatus("CALCULATED")).toBe("control");
    expect(calculationActionForStatus("CONTROLLED")).toBe("approve");
    expect(calculationActionForStatus("APPROVED")).toBeUndefined();
    expect(calculationActionForStatus()).toBeUndefined();
  });

  it("renders an accessible UUID lookup without a prompt-driven workflow", () => {
    const html = renderToStaticMarkup(createElement(CalculationsConsole));
    expect(html).toContain('aria-describedby="calculation-run-id-hint"');
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("window.prompt");
  });

  it("requests the selected explanation view through the BFF", async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ view: "DETAILED", source: {} })));
    await profitExplanationRequest("8c86d06e-2c2e-4aac-93d7-465c338232d9", "1447e82c-ca3d-4bad-b9f8-476f10ec8d3d", "DETAILED", controller.signal);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("view=DETAILED");
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ signal: controller.signal }));
  });

  it("posts a transition idempotently and forwards its justification and signal", async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "CONTROLLED" })));
    await calculationRequest("8c86d06e-2c2e-4aac-93d7-465c338232d9", "control", "Contrôle documenté", controller.signal);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("idempotency-key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(init?.body).toBe(JSON.stringify({ justification: "Contrôle documenté" }));
    expect(init?.signal).toBe(controller.signal);
  });

  it("surfaces the backend correlation reference", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: "Transition refusée", correlationId: "corr-calc-17" }), { status: 409 }));
    await expect(calculationRequest("8c86d06e-2c2e-4aac-93d7-465c338232d9", "control", "Contrôle financier conforme")).rejects.toThrow("Transition refusée (référence : corr-calc-17)");
  });
});
