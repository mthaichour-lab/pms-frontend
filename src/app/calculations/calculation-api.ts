import type { CalculationRun, ProfitExplanation, WorkflowTransition } from "@bank/pms-api-client";
export type { CalculationRun, ProfitExplanation, WorkflowTransition };
export const validJustification = (value: string) =>
  value.trim().length >= 10 && value.length <= 1000;
export const validExplanationIdentifiers = (runId: string, accountId: string) => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuid.test(runId) && uuid.test(accountId);
};
export async function profitExplanationRequest(runId: string, accountId: string, view: "SIMPLIFIED" | "DETAILED", signal?: AbortSignal): Promise<ProfitExplanation> {
  const query = new URLSearchParams({ view });
  const response = await fetch(`/api/core/reporting/profit-explanations/${encodeURIComponent(runId)}/accounts/${encodeURIComponent(accountId)}?${query}`, { signal });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const problem = (body ?? {}) as { detail?: string; title?: string; correlationId?: string };
    const message = problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`;
    throw new Error(problem.correlationId ? `${message} (référence : ${problem.correlationId})` : message);
  }
  return body as ProfitExplanation;
}
export async function calculationRequest<T>(
  runId: string,
  action?: "control" | "approve",
  justification?: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(
    `/api/core/calculations/${encodeURIComponent(runId)}${action ? `/${action}` : ""}`,
    {
      method: action ? "POST" : "GET",
      headers: action
        ? {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          }
        : undefined,
      body: action ? JSON.stringify({ justification }) : undefined,
      signal,
    },
  );
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const problem = (body ?? {}) as {
      detail?: string;
      title?: string;
      correlationId?: string;
    };
    const message =
      problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`;
    throw new Error(
      problem.correlationId
        ? `${message} (référence : ${problem.correlationId})`
        : message,
    );
  }
  return body as T;
}
