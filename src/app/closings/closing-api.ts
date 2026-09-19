import type { WorkflowTransition } from '@bank/pms-api-client';

export type { WorkflowTransition };

export const validClosingId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const validClosingJustification = (value: string) => value.trim().length >= 10 && value.length <= 1000;

export async function approveClosing(closingId: string, justification: string, signal?: AbortSignal): Promise<WorkflowTransition> {
  return decideClosing(closingId, 'approve', justification, signal);
}

export async function rejectClosing(closingId: string, justification: string, signal?: AbortSignal): Promise<WorkflowTransition> {
  return decideClosing(closingId, 'reject', justification, signal);
}

async function decideClosing(closingId: string, action: 'approve' | 'reject', justification: string, signal?: AbortSignal): Promise<WorkflowTransition> {
  const response = await fetch(`/api/core/closings/${encodeURIComponent(closingId)}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ justification }),
    signal,
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const problem = (payload ?? {}) as { detail?: string; title?: string; correlationId?: string };
    const message = problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`;
    throw new Error(problem.correlationId ? `${message} (référence : ${problem.correlationId})` : message);
  }
  return payload as WorkflowTransition;
}
