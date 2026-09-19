import type { PurificationCase, PurificationStatement } from '@bank/pms-api-client';
export type { PurificationCase, PurificationStatement };
export type PurificationRequestOptions = { readonly signal?: AbortSignal; readonly idempotencyKey?: string; readonly correlationId?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const date = /^\d{4}-\d{2}-\d{2}$/;
const decimal = /^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/;
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function validDate(value: unknown): value is string { if (typeof value !== 'string' || !date.test(value)) return false; const parsed = new Date(`${value}T00:00:00Z`); return parsed.toISOString().slice(0, 10) === value; }
function validResponseFlag(value: unknown, key: string): boolean { return record(value) && value[key] === true; }
export function validCase(value: unknown): value is PurificationCase { if (!record(value)) return false; return typeof value.purificationId === 'string' && uuid.test(value.purificationId) && typeof value.incomeId === 'string' && uuid.test(value.incomeId) && typeof value.poolId === 'string' && value.poolId.trim().length > 0 && validDate(value.businessDate) && typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency) && typeof value.amount === 'string' && decimal.test(value.amount) && Number(value.amount) > 0 && typeof value.reason === 'string' && value.reason.trim().length > 0 && value.status === 'PENDING_DOCUMENTATION' && value.paidAmount === '0'; }
function validStatement(value: unknown): value is PurificationStatement { if (!record(value)) return false; return [value.openingCarry, value.identified, value.paid, value.closingBalance].every((item) => typeof item === 'string' && decimal.test(item)) && Array.isArray(value.cases) && value.cases.every(validCase); }
function problemDetails(payload: unknown): { message?: string; correlationId?: string } { if (!record(payload)) return {}; const detail = typeof payload.detail === 'string' && payload.detail.trim() ? payload.detail : undefined; const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title : undefined; return { message: detail ?? title, correlationId: typeof payload.correlationId === 'string' && payload.correlationId.trim() ? payload.correlationId : undefined }; }
export class PurificationRequestError extends Error { constructor(message: string, readonly status: number, readonly correlationId: string) { super(`${message} (référence : ${correlationId})`); this.name = 'PurificationRequestError'; } }
async function request<T>(path: string, body: unknown | undefined, validate: (value: unknown) => value is T, options: PurificationRequestOptions = {}): Promise<T> {
  const correlationId = options.correlationId ?? crypto.randomUUID();
  const init: RequestInit = { signal: options.signal, headers: { 'x-correlation-id': correlationId } };
  if (body !== undefined) { init.method = 'POST'; init.headers = { ...init.headers, 'content-type': 'application/json', 'idempotency-key': options.idempotencyKey ?? crypto.randomUUID() }; init.body = JSON.stringify(body); }
  const response = await fetch(`/api/core/purifications${path}`, init); const payload: unknown = await response.json().catch(() => undefined); const problem = problemDetails(payload); const reference = problem.correlationId ?? response.headers.get('x-correlation-id') ?? correlationId;
  if (!response.ok) throw new PurificationRequestError(problem.message ?? `Erreur HTTP ${response.status}`, response.status, reference);
  if (!validate(payload)) throw new PurificationRequestError('Réponse de purification invalide.', response.status, reference);
  return payload;
}
const isCaseResponse = (value: unknown): value is PurificationCase => validCase(value);
const isStatementResponse = (value: unknown): value is PurificationStatement => validStatement(value);
const isDocumented = (value: unknown): value is { documented: true } => validResponseFlag(value, 'documented');
const isPaid = (value: unknown): value is { paid: true } => validResponseFlag(value, 'paid');
export function getStatement(poolId: string, from: string, to: string, options?: PurificationRequestOptions) { return request('/statement?' + new URLSearchParams({ poolId, from, to }), undefined, isStatementResponse, options); }
export function identifyCase(value: PurificationCase, options?: PurificationRequestOptions) { if (!validCase(value)) return Promise.reject(new TypeError('Cas de purification invalide.')); return request('', value, isCaseResponse, options); }
export function documentCase(id: string, charityBeneficiaryId: string, shariaDecisionReference: string, options?: PurificationRequestOptions) { if (!id.trim() || !charityBeneficiaryId.trim() || !shariaDecisionReference.trim()) return Promise.reject(new TypeError('Documentation de purification invalide.')); return request(`/${encodeURIComponent(id)}/document`, { charityBeneficiaryId, shariaDecisionReference }, isDocumented, options); }
export function payCase(id: string, amount: string, evidenceId: string, options?: PurificationRequestOptions) { if (!id.trim() || !decimal.test(amount) || Number(amount) <= 0 || !evidenceId.trim()) return Promise.reject(new TypeError('Paiement de purification invalide.')); return request(`/${encodeURIComponent(id)}/payments`, { amount, evidenceId }, isPaid, options); }
