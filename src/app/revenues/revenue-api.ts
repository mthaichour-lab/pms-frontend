import type { ChargePolicy, IncomeAdjustment, PoolCharge, RecognizedIncome } from '@bank/pms-api-client';
export type { ChargePolicy, IncomeAdjustment, PoolCharge, RecognizedIncome };
export interface ChargeEvaluation { readonly accepted: readonly PoolCharge[]; readonly rejected: readonly { charge: PoolCharge; reason: string }[]; readonly poolDeductibleTotal: string }
export interface RevenueRequestOptions { readonly signal?: AbortSignal; readonly idempotencyKey?: string; readonly correlationId?: string }

export class RevenueRequestError extends Error {
  constructor(message: string, readonly status: number, readonly correlationId?: string) {
    super(correlationId ? `${message} (référence : ${correlationId})` : message);
    this.name = 'RevenueRequestError';
  }
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const decimalPattern = /^-?(?:0|[1-9]\d*)(?:\.\d{1,12})?$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';
const stringField = (record: Record<string, unknown>, key: string): record is Record<string, string> => typeof record[key] === 'string';
const isRecognizedIncome = (value: unknown): value is RecognizedIncome => isRecord(value) &&
  ['incomeId', 'sourceSystem', 'sourceReference', 'assetId', 'poolId', 'businessDate', 'currency', 'amount', 'cashStatus', 'realizationStatus', 'incomeType'].every((key) => stringField(value, key));
const isIncomeAdjustment = (value: unknown): value is IncomeAdjustment => isRecord(value) &&
  ['adjustmentId', 'incomeId', 'amount', 'reason', 'approvalId', 'businessDate', 'actorId'].every((key) => stringField(value, key));
const isPoolCharge = (value: unknown): value is PoolCharge => isRecord(value) &&
  ['chargeId', 'poolId', 'categoryCode', 'businessDate', 'currency', 'amount', 'sourceReference'].every((key) => stringField(value, key));
const isChargeEvaluation = (value: unknown): value is ChargeEvaluation => isRecord(value) && Array.isArray(value.accepted) &&
  value.accepted.every(isPoolCharge) && Array.isArray(value.rejected) && value.rejected.every((item) => isRecord(item) && isPoolCharge(item.charge) && typeof item.reason === 'string') &&
  typeof value.poolDeductibleTotal === 'string';

export function validIncome(value: RecognizedIncome): boolean { return uuid.test(value.incomeId) && uuid.test(value.assetId) && [value.sourceSystem, value.sourceReference, value.poolId, value.incomeType].every((item) => item.trim().length > 0) && datePattern.test(value.businessDate) && /^[A-Z]{3}$/.test(value.currency) && decimalPattern.test(value.amount) && Number(value.amount) !== 0 && ['ACCRUED', 'RECEIVED'].includes(value.cashStatus) && ['REALIZED', 'UNREALIZED'].includes(value.realizationStatus); }
export function validAdjustment(value: IncomeAdjustment): boolean { return uuid.test(value.adjustmentId) && uuid.test(value.incomeId) && decimalPattern.test(value.amount) && Number(value.amount) !== 0 && value.reason.trim().length >= 10 && value.approvalId.trim().length >= 16 && value.actorId.trim().length > 0 && datePattern.test(value.businessDate); }
function optionsOf(options?: RevenueRequestOptions | AbortSignal): RevenueRequestOptions { return options && 'aborted' in options ? { signal: options } : options ?? {}; }
async function request<T>(path: string, body: unknown | undefined, validate: (value: unknown) => value is T, options?: RevenueRequestOptions | AbortSignal): Promise<T> {
  const requestOptions = optionsOf(options);
  const correlationId = requestOptions.correlationId ?? crypto.randomUUID();
  const response = await fetch(`/api/core/${path}`, body === undefined ? { signal: requestOptions.signal, headers: { 'x-correlation-id': correlationId } } : {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': requestOptions.idempotencyKey ?? crypto.randomUUID(), 'x-correlation-id': correlationId }, body: JSON.stringify(body), signal: requestOptions.signal,
  });
  const payload: unknown = await response.json().catch(() => undefined);
  const responseCorrelationId = (isRecord(payload) && typeof payload.correlationId === 'string' ? payload.correlationId : undefined) ?? response.headers.get('x-correlation-id') ?? correlationId;
  if (!response.ok) { const problem = isRecord(payload) ? payload : {}; throw new RevenueRequestError(typeof problem.detail === 'string' ? problem.detail : typeof problem.title === 'string' ? problem.title : `Erreur HTTP ${response.status}`, response.status, responseCorrelationId); }
  if (!validate(payload)) throw new RevenueRequestError('Réponse Revenus invalide.', response.status, responseCorrelationId);
  return payload;
}
const query = (poolId: string, businessDate: string) => new URLSearchParams({ poolId, businessDate }).toString();
export const listIncome = (poolId: string, businessDate: string, options?: RevenueRequestOptions | AbortSignal) => request(`revenues?${query(poolId, businessDate)}`, undefined, (value): value is readonly RecognizedIncome[] => Array.isArray(value) && value.every(isRecognizedIncome), options);
export const importIncome = (income: RecognizedIncome, options?: RevenueRequestOptions | AbortSignal) => request('revenues/imports', income, isRecognizedIncome, options);
export const adjustIncome = (adjustment: IncomeAdjustment, options?: RevenueRequestOptions | AbortSignal) => request('revenues/adjustments', adjustment, isIncomeAdjustment, options);
export const evaluateCharges = (poolId: string, businessDate: string, options?: RevenueRequestOptions | AbortSignal) => request(`charges/evaluation?${query(poolId, businessDate)}`, undefined, isChargeEvaluation, options);
export const configureChargePolicy = (policy: ChargePolicy, options?: RevenueRequestOptions | AbortSignal) => request('charges/policies', policy, (value): value is ChargePolicy => isRecord(value) && ['policyId', 'categoryCode', 'responsibility', 'effectiveFrom'].every((key) => stringField(value, key)) && typeof value.version === 'number', options);
export const importCharge = (charge: PoolCharge, options?: RevenueRequestOptions | AbortSignal) => request('charges/imports', charge, isPoolCharge, options);
