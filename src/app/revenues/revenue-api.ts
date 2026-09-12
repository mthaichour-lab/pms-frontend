import type { ChargePolicy, IncomeAdjustment, PoolCharge, RecognizedIncome } from '@bank/pms-api-client';
export type { ChargePolicy, IncomeAdjustment, PoolCharge, RecognizedIncome };
export interface ChargeEvaluation { readonly accepted: readonly PoolCharge[]; readonly rejected: readonly { charge: PoolCharge; reason: string }[]; readonly poolDeductibleTotal: string }
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const decimalPattern = /^-?(?:0|[1-9]\d*)(?:\.\d{1,12})?$/;
export function validIncome(value: RecognizedIncome): boolean { return /^[0-9a-f-]{36}$/i.test(value.incomeId) && /^[0-9a-f-]{36}$/i.test(value.assetId) && [value.sourceSystem, value.sourceReference, value.poolId, value.incomeType].every((item) => item.trim().length > 0) && datePattern.test(value.businessDate) && /^[A-Z]{3}$/.test(value.currency) && decimalPattern.test(value.amount) && Number(value.amount) !== 0 && ['ACCRUED', 'RECEIVED'].includes(value.cashStatus) && ['REALIZED', 'UNREALIZED'].includes(value.realizationStatus); }
export function validAdjustment(value: IncomeAdjustment): boolean { return /^[0-9a-f-]{36}$/i.test(value.adjustmentId) && /^[0-9a-f-]{36}$/i.test(value.incomeId) && decimalPattern.test(value.amount) && Number(value.amount) !== 0 && value.reason.trim().length >= 10 && value.approvalId.length >= 16 && value.actorId.trim().length > 0 && datePattern.test(value.businessDate); }
async function request<T>(path: string, body?: unknown): Promise<T> { const response = await fetch(`/api/core/${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(body) }); const payload: unknown = await response.json().catch(() => undefined); if (!response.ok) { const problem = (payload ?? {}) as { detail?: string; title?: string }; throw new Error(problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`); } return payload as T; }
const query = (poolId: string, businessDate: string) => new URLSearchParams({ poolId, businessDate }).toString();
export const listIncome = (poolId: string, businessDate: string) => request<readonly RecognizedIncome[]>(`revenues?${query(poolId, businessDate)}`);
export const importIncome = (income: RecognizedIncome) => request<RecognizedIncome>('revenues/imports', income);
export const adjustIncome = (adjustment: IncomeAdjustment) => request<IncomeAdjustment>('revenues/adjustments', adjustment);
export const evaluateCharges = (poolId: string, businessDate: string) => request<ChargeEvaluation>(`charges/evaluation?${query(poolId, businessDate)}`);
export const configureChargePolicy = (policy: ChargePolicy) => request<ChargePolicy>('charges/policies', policy);
export const importCharge = (charge: PoolCharge) => request<PoolCharge>('charges/imports', charge);
