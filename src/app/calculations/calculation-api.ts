import type { CalculationRun, ProfitExplanation, WorkflowTransition } from "@bank/pms-api-client";

export type { CalculationRun, ProfitExplanation, WorkflowTransition };

export type CalculationRunKind = "PARALLEL" | "PRODUCTION";
export type CalculationWeightBasis = "LATEST_POSITION" | "SUBSCRIPTION_LEDGER_BALANCE";

export interface CalculationRunPage {
  readonly items: readonly CalculationRun[];
  readonly total: number;
}

export interface CalculationListFilters {
  readonly limit?: number;
  readonly offset?: number;
  readonly poolId?: string;
  readonly status?: string;
}

export interface CreateCalculationRun {
  readonly runId: string;
  readonly poolId: string;
  readonly businessDate: string;
  readonly rulesVersion: string;
  readonly runKind?: CalculationRunKind;
  readonly participantBasis: {
    readonly type: "ACTIVE_SUBSCRIPTIONS";
    readonly weightBasis: CalculationWeightBasis;
  };
}

export interface CalculationDispatch {
  readonly runId: string;
  readonly status: "DRAFT";
  readonly dispatchStatus: "QUEUED" | "ALREADY_QUEUED";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseReference(response: Response, payload: unknown, fallback: string): string {
  return record(payload) && typeof payload.correlationId === "string" && payload.correlationId.trim()
    ? payload.correlationId
    : response.headers.get("x-correlation-id") ?? fallback;
}

function problemMessage(response: Response, payload: unknown, fallback: string): string {
  const problem = record(payload) ? payload : {};
  const detail = typeof problem.detail === "string" && problem.detail.trim()
    ? problem.detail
    : typeof problem.message === "string" && problem.message.trim()
      ? problem.message
      : typeof problem.title === "string" && problem.title.trim()
        ? problem.title
        : `Erreur HTTP ${response.status}`;
  return `${detail} (référence : ${responseReference(response, payload, fallback)})`;
}

export const validJustification = (value: string) =>
  value.trim().length >= 10 && value.length <= 1000;

export const validCalculationRunId = (value: string) => UUID.test(value);

export const validExplanationIdentifiers = (runId: string, accountId: string) =>
  UUID.test(runId) && UUID.test(accountId);

export function validCalculationDraft(value: CreateCalculationRun): boolean {
  return validCalculationRunId(value.runId) &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{1,63}$/.test(value.poolId) &&
    DATE.test(value.businessDate) &&
    value.rulesVersion.trim().length >= 1 && value.rulesVersion.length <= 128 &&
    (value.runKind === undefined || value.runKind === "PARALLEL" || value.runKind === "PRODUCTION") &&
    value.participantBasis.type === "ACTIVE_SUBSCRIPTIONS" &&
    ["LATEST_POSITION", "SUBSCRIPTION_LEDGER_BALANCE"].includes(value.participantBasis.weightBasis);
}

export function isCalculationRun(value: unknown): value is CalculationRun {
  if (!record(value) || !validCalculationRunId(String(value.runId ?? "")) ||
    typeof value.poolId !== "string" || !value.poolId.trim() ||
    typeof value.businessDate !== "string" || !DATE.test(value.businessDate) ||
    typeof value.rulesVersion !== "string" || typeof value.engineVersion !== "string" ||
    typeof value.status !== "string" || !value.status.trim() || !Array.isArray(value.allocations)) return false;
  if (["inputChecksumSha256", "outputChecksumSha256"].some((key) => value[key] !== undefined &&
    (typeof value[key] !== "string" || !/^[0-9a-f]{64}$/i.test(value[key] as string)))) return false;
  if (value.distributableAmount !== undefined && (typeof value.distributableAmount !== "string" || !DECIMAL.test(value.distributableAmount))) return false;
  if (value.currency !== undefined && (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency))) return false;
  return value.allocations.every((allocation) => record(allocation) &&
    typeof allocation.participantId === "string" && allocation.participantId.trim().length > 0 &&
    typeof allocation.amount === "string" && DECIMAL.test(allocation.amount) &&
    typeof allocation.currency === "string" && /^[A-Z]{3}$/.test(allocation.currency));
}

export function isCalculationRunPage(value: unknown): value is CalculationRunPage {
  return record(value) && Array.isArray(value.items) && value.items.every(isCalculationRun) &&
    typeof value.total === "number" && Number.isSafeInteger(value.total) && value.total >= value.items.length;
}

export function isCalculationDispatch(value: unknown): value is CalculationDispatch {
  return record(value) && validCalculationRunId(String(value.runId ?? "")) && value.status === "DRAFT" &&
    (value.dispatchStatus === "QUEUED" || value.dispatchStatus === "ALREADY_QUEUED");
}

async function jsonRequest<T>(path: string, init: RequestInit, validate: (value: unknown) => value is T): Promise<T> {
  const correlationId = crypto.randomUUID();
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set("x-correlation-id", correlationId);
  if (init.body) headers.set("content-type", "application/json");
  const response = await fetch(`/api/core/calculations${path}`, { cache: "no-store", ...init, headers });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(problemMessage(response, payload, correlationId));
  if (!validate(payload)) throw new Error(`Réponse des calculs invalide (référence : ${responseReference(response, payload, correlationId)}).`);
  return payload;
}

export function listCalculationRuns(filters: CalculationListFilters = {}, signal?: AbortSignal): Promise<CalculationRunPage> {
  const query = new URLSearchParams({ limit: String(filters.limit ?? 50), offset: String(filters.offset ?? 0) });
  if (filters.poolId?.trim()) query.set("poolId", filters.poolId.trim());
  if (filters.status?.trim()) query.set("status", filters.status.trim());
  return jsonRequest(`?${query}`, { signal }, isCalculationRunPage);
}

export const getCalculationRun = (runId: string, signal?: AbortSignal) =>
  jsonRequest(`/${encodeURIComponent(runId)}`, { signal }, isCalculationRun);

export const initiateCalculation = (command: CreateCalculationRun, signal?: AbortSignal) =>
  jsonRequest("", { method: "POST", body: JSON.stringify(command), signal }, isCalculationDispatch);

export async function profitExplanationRequest(runId: string, accountId: string, view: "SIMPLIFIED" | "DETAILED", signal?: AbortSignal): Promise<ProfitExplanation> {
  const query = new URLSearchParams({ view });
  const correlationId = crypto.randomUUID();
  const response = await fetch(`/api/core/reporting/profit-explanations/${encodeURIComponent(runId)}/accounts/${encodeURIComponent(accountId)}?${query}`, { signal, headers: { "x-correlation-id": correlationId } });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(problemMessage(response, body, correlationId));
  return body as ProfitExplanation;
}

export async function calculationRequest<T>(runId: string, action?: "control" | "approve", justification?: string, signal?: AbortSignal): Promise<T> {
  const correlationId = crypto.randomUUID();
  const response = await fetch(`/api/core/calculations/${encodeURIComponent(runId)}${action ? `/${action}` : ""}`, {
    method: action ? "POST" : "GET",
    headers: action
      ? { "content-type": "application/json", "idempotency-key": crypto.randomUUID(), "x-correlation-id": correlationId }
      : { "x-correlation-id": correlationId },
    body: action ? JSON.stringify({ justification }) : undefined,
    signal,
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(problemMessage(response, body, correlationId));
  return body as T;
}
