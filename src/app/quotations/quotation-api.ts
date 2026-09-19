import type { QuotationCommand } from '@bank/pms-api-client';
export type { QuotationCommand };
export interface QuotationResult { readonly verdict: 'APPROVABLE' | 'ALCO_APPROVAL_REQUIRED' | 'NOT_VIABLE'; readonly governance: string; readonly commercialViability: string; readonly recommendedInvestorNisbaPercent: string; readonly requiredSupportAmount: string; readonly maximumBasisCapacity: string; readonly segregatedAccountingRequired: boolean; readonly notice: string }
export interface QuotationRequestOptions { readonly signal?: AbortSignal; readonly idempotencyKey?: string; readonly correlationId?: string }
export class QuotationRequestError extends Error {
  constructor(message: string, readonly status: number, readonly correlationId?: string) { super(correlationId ? `${message} (référence : ${correlationId})` : message); this.name = 'QuotationRequestError'; }
}
const decimal = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const basisTypes = new Set(['GLOBAL_POOL', 'FINANCING_TYPE', 'DESIGNATED_FINANCING', 'CUSTOMER', 'SECTOR']);
const verdicts = new Set(['APPROVABLE', 'ALCO_APPROVAL_REQUIRED', 'NOT_VIABLE']);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';
const isString = (value: unknown): value is string => typeof value === 'string';
const isQuotationResult = (value: unknown): value is QuotationResult => isRecord(value) && typeof value.verdict === 'string' && verdicts.has(value.verdict) &&
  ['governance', 'commercialViability', 'recommendedInvestorNisbaPercent', 'requiredSupportAmount', 'maximumBasisCapacity', 'notice'].every((key) => isString(value[key])) && typeof value.segregatedAccountingRequired === 'boolean';
export function validQuotation(value: QuotationCommand): boolean { if (!value || !value.basis || !basisTypes.has(value.basis.type)) return false; const requiresReference = value.basis.type !== 'GLOBAL_POOL'; return decimal.test(value.placementAmount) && Number.isFinite(Number(value.placementAmount)) && Number(value.placementAmount) > 0 && decimal.test(value.targetNetRatePercent) && Number.isFinite(Number(value.targetNetRatePercent)) && Number(value.targetNetRatePercent) > 0 && (!requiresReference || Boolean(value.basis.reference?.trim())); }
function optionsOf(options?: QuotationRequestOptions | AbortSignal): QuotationRequestOptions { return options && 'aborted' in options ? { signal: options } : options ?? {}; }
export async function solveQuotation(command: QuotationCommand, options?: QuotationRequestOptions | AbortSignal): Promise<QuotationResult> {
  const requestOptions = optionsOf(options); const correlationId = requestOptions.correlationId ?? crypto.randomUUID();
  const response = await fetch('/api/core/simulations', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': requestOptions.idempotencyKey ?? crypto.randomUUID(), 'x-correlation-id': correlationId }, body: JSON.stringify(command), signal: requestOptions.signal });
  const payload: unknown = await response.json().catch(() => undefined); const responseCorrelationId = (isRecord(payload) && isString(payload.correlationId) ? payload.correlationId : undefined) ?? response.headers.get('x-correlation-id') ?? correlationId;
  if (!response.ok) { const problem = isRecord(payload) ? payload : {}; const text = isString(problem.detail) ? problem.detail : isString(problem.message) ? problem.message : isString(problem.title) ? problem.title : `Erreur HTTP ${response.status}`; throw new QuotationRequestError(isString(problem.maximumCapacity) ? `${text} (capacité maximale : ${problem.maximumCapacity})` : text, response.status, responseCorrelationId); }
  if (!isQuotationResult(payload)) throw new QuotationRequestError('Réponse de cotation invalide.', response.status, responseCorrelationId);
  return payload;
}
