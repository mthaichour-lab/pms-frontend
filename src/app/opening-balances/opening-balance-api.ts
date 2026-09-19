import type { OpeningBalanceCertificationCommand } from '@bank/pms-api-client';

export type { OpeningBalanceCertificationCommand };
export type OpeningBalanceLine = OpeningBalanceCertificationCommand['lines'][number];
export const components = ['HISTORICAL_ACCOUNTS', 'PER', 'IRR', 'PAST_DISTRIBUTIONS'] as const;
export type OpeningBalanceComponent = (typeof components)[number];
export type OpeningBalanceRequestOptions = { readonly signal?: AbortSignal; readonly idempotencyKey?: string; readonly correlationId?: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const amount = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const currency = /^[A-Z]{3}$/;
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isIsoDateTime(value: unknown): value is string { if (typeof value !== 'string' || value.trim() === '') return false; return !Number.isNaN(Date.parse(value)) && /T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value); }
function isComponent(value: unknown): value is OpeningBalanceComponent { return typeof value === 'string' && (components as readonly string[]).includes(value); }
function isOpeningBalanceLine(value: unknown): value is OpeningBalanceLine { if (!isRecord(value)) return false; return isComponent(value.component) && typeof value.currencyCode === 'string' && currency.test(value.currencyCode) && typeof value.migratedAmount === 'string' && amount.test(value.migratedAmount) && typeof value.generalLedgerAmount === 'string' && amount.test(value.generalLedgerAmount) && typeof value.evidenceReference === 'string' && value.evidenceReference.trim().length > 0; }

export function validCertification(value: unknown): value is OpeningBalanceCertificationCommand {
  if (!isRecord(value) || !uuid.test(typeof value.certificationId === 'string' ? value.certificationId : '')) return false;
  if (!isIsoDateTime(value.signedAt) || !Array.isArray(value.lines) || value.lines.length !== components.length || !value.lines.every(isOpeningBalanceLine)) return false;
  const lines = value.lines as readonly OpeningBalanceLine[];
  const found = new Set(lines.map((line) => line.component));
  return found.size === components.length && components.every((component) => found.has(component)) && lines.every((line) => line.migratedAmount === line.generalLedgerAmount);
}

function problemDetails(payload: unknown): { message?: string; correlationId?: string } { if (!isRecord(payload)) return {}; const detail = typeof payload.detail === 'string' && payload.detail.trim() ? payload.detail : undefined; const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title : undefined; return { message: detail ?? title, correlationId: typeof payload.correlationId === 'string' && payload.correlationId.trim() ? payload.correlationId : undefined }; }
export class OpeningBalanceRequestError extends Error { constructor(message: string, readonly status: number, readonly correlationId: string) { super(`${message} (référence : ${correlationId})`); this.name = 'OpeningBalanceRequestError'; } }
function isCertifiedResponse(value: unknown): value is { status: 'CERTIFIED' } { return isRecord(value) && value.status === 'CERTIFIED'; }

export async function certify(command: OpeningBalanceCertificationCommand, options: OpeningBalanceRequestOptions = {}): Promise<{ status: 'CERTIFIED' }> {
  if (!validCertification(command)) throw new TypeError('Commande de certification invalide.');
  const requestCorrelationId = options.correlationId ?? crypto.randomUUID();
  const response = await fetch('/api/core/accounting/opening-balances/certifications', { method: 'POST', signal: options.signal, headers: { 'content-type': 'application/json', 'idempotency-key': options.idempotencyKey ?? crypto.randomUUID(), 'x-correlation-id': requestCorrelationId }, body: JSON.stringify(command) });
  const payload: unknown = await response.json().catch(() => undefined);
  const problem = problemDetails(payload); const correlationId = problem.correlationId ?? response.headers.get('x-correlation-id') ?? requestCorrelationId;
  if (!response.ok) throw new OpeningBalanceRequestError(problem.message ?? `Erreur HTTP ${response.status}`, response.status, correlationId);
  if (!isCertifiedResponse(payload)) throw new OpeningBalanceRequestError('Réponse de certification invalide.', response.status, correlationId);
  return payload;
}
