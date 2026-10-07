import type { CreateInvestmentSubscription, InvestmentSubscription, InvestmentSubscriptionAction } from '@bank/pms-api-client';

export type { CreateInvestmentSubscription, InvestmentSubscription, InvestmentSubscriptionAction };

export interface InvestmentSubscriptionBalance extends InvestmentSubscription {
  readonly balance: string;
  readonly totalDeposits: string;
  readonly totalWithdrawals: string;
  readonly termsAccepted: boolean;
}

export interface InvestmentSubscriptionPage {
  readonly items: readonly InvestmentSubscriptionBalance[];
  readonly total: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const SIGNED_DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function problemMessage(payload: unknown, status: number): string {
  if (!record(payload)) return `Erreur HTTP ${status}`;
  const detail = typeof payload.detail === 'string' ? payload.detail : typeof payload.message === 'string' ? payload.message : typeof payload.title === 'string' ? payload.title : `Erreur HTTP ${status}`;
  return typeof payload.correlationId === 'string' ? `${detail} (référence : ${payload.correlationId})` : detail;
}

export function isInvestmentSubscriptionBalance(value: unknown): value is InvestmentSubscriptionBalance {
  return record(value) && typeof value.accountId === 'string' && UUID.test(value.accountId) &&
    typeof value.customerId === 'string' && UUID.test(value.customerId) &&
    typeof value.productId === 'string' && UUID.test(value.productId) &&
    typeof value.productTermsVersionId === 'string' && UUID.test(value.productTermsVersionId) &&
    typeof value.contractVersion === 'string' && typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency) &&
    typeof value.investorNisba === 'string' && typeof value.bankNisba === 'string' && typeof value.status === 'string' &&
    typeof value.balance === 'string' && SIGNED_DECIMAL.test(value.balance) &&
    typeof value.totalDeposits === 'string' && DECIMAL.test(value.totalDeposits) &&
    typeof value.totalWithdrawals === 'string' && DECIMAL.test(value.totalWithdrawals) &&
    typeof value.termsAccepted === 'boolean';
}

async function get<T>(path: string, validate: (value: unknown) => value is T, signal?: AbortSignal): Promise<T> {
  const correlationId = crypto.randomUUID();
  const response = await fetch(`/api/core/investment-accounts/subscriptions${path}`, {
    signal,
    cache: 'no-store',
    headers: { accept: 'application/json', 'x-correlation-id': correlationId },
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(problemMessage(payload, response.status));
  if (!validate(payload)) throw new Error(`Réponse des souscriptions invalide (référence : ${correlationId}).`);
  return payload;
}

export function subscriptionPage(value: unknown): value is InvestmentSubscriptionPage {
  return record(value) && Array.isArray(value.items) && value.items.every(isInvestmentSubscriptionBalance) &&
    typeof value.total === 'number' && Number.isSafeInteger(value.total) && value.total >= value.items.length;
}

export const listSubscriptions = (signal?: AbortSignal) => get<InvestmentSubscriptionPage>('?limit=100&offset=0', subscriptionPage, signal);
export const getSubscription = (accountId: string, signal?: AbortSignal) => get<InvestmentSubscriptionBalance>(`/${encodeURIComponent(accountId)}`, isInvestmentSubscriptionBalance, signal);

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
