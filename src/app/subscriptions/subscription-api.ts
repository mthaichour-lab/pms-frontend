import type { CreateInvestmentSubscription, InvestmentSubscription, InvestmentSubscriptionAction } from '@bank/pms-api-client';

export type { CreateInvestmentSubscription, InvestmentSubscription, InvestmentSubscriptionAction };

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/core/investment-accounts/subscriptions${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const problem = (payload ?? {}) as { detail?: string; title?: string; correlationId?: string };
    const description = problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`;
    throw new Error(problem.correlationId ? `${description} (référence : ${problem.correlationId})` : description);
  }
  return payload as T;
}

export const createSubscription = (command: CreateInvestmentSubscription) => post<InvestmentSubscription>('', command);
export const transitionSubscription = (accountId: string, command: InvestmentSubscriptionAction) =>
  post<InvestmentSubscription>(`/${encodeURIComponent(accountId)}/actions`, command);
