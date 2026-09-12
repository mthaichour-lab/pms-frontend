import { afterEach, describe, expect, it, vi } from "vitest";
import { calculationRequest, profitExplanationRequest, validExplanationIdentifiers, validJustification } from "./calculation-api";
afterEach(() => vi.restoreAllMocks());
describe("calculation workflow validation", () => {
  it("requires a meaningful Maker/Checker justification", () => {
    expect(validJustification("court")).toBe(false);
    expect(validJustification("Contrôle financier conforme")).toBe(true);
  });
  it("requires UUIDs for the published explanation", () => {
    expect(validExplanationIdentifiers("8c86d06e-2c2e-4aac-93d7-465c338232d9", "1447e82c-ca3d-4bad-b9f8-476f10ec8d3d")).toBe(true);
    expect(validExplanationIdentifiers("run-1", "account-1")).toBe(false);
  });
  it("requests the selected explanation view through the BFF", async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ view: "DETAILED", source: {} })));
    await profitExplanationRequest("8c86d06e-2c2e-4aac-93d7-465c338232d9", "1447e82c-ca3d-4bad-b9f8-476f10ec8d3d", "DETAILED", controller.signal);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("view=DETAILED");
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ signal: controller.signal }));
  });
  it("posts a transition idempotently and forwards its justification", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "CONTROLLED" })));
    await calculationRequest("run-1", "control", "Contrôle documenté");
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("idempotency-key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(init?.body).toBe(JSON.stringify({ justification: "Contrôle documenté" }));
  });
});
