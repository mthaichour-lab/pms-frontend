import type { CbsDataQualityBatch } from '@bank/pms-api-client';

export type { CbsDataQualityBatch };

export const CBS_QUALITY_STATES = ['VALIDATED', 'REJECTED', 'QUARANTINED', 'STAGED'] as const;
export type CbsQualityState = (typeof CBS_QUALITY_STATES)[number];
export type CbsQualityFilters = { readonly businessDate?: string; readonly state?: CbsQualityState };
export type CbsQualityRequestOptions = { readonly signal?: AbortSignal; readonly correlationId?: string; readonly idempotencyKey?: string };

export class CbsQualityRequestError extends Error {
  constructor(message: string, readonly status: number, readonly correlationId: string) {
    super(`${message} (référence : ${correlationId})`);
    this.name = 'CbsQualityRequestError';
  }
}

export function isExactBusinessDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function cbsQualityFilterErrors(filters: { businessDate: string; state: string }): Partial<Record<keyof typeof filters, string>> {
  const errors: Partial<Record<keyof typeof filters, string>> = {};
  if (filters.businessDate && !isExactBusinessDate(filters.businessDate)) errors.businessDate = 'Saisissez une date métier valide.';
  if (filters.state && !CBS_QUALITY_STATES.includes(filters.state as CbsQualityState)) errors.state = 'Sélectionnez un état reconnu.';
  return errors;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isNonEmptyString(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function isCount(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
function isOptional<T>(value: unknown, predicate: (candidate: unknown) => candidate is T): value is T | null | undefined { return value === undefined || value === null || predicate(value); }

export function isCbsDataQualityBatch(value: unknown): value is CbsDataQualityBatch {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.batchId)
    && isNonEmptyString(value.sourceCode)
    && typeof value.businessDate === 'string' && isExactBusinessDate(value.businessDate)
    && isNonEmptyString(value.flowType)
    && isCount(value.sequenceNumber)
    && isNonEmptyString(value.state) && CBS_QUALITY_STATES.includes(value.state as CbsQualityState)
    && isOptional(value.manifestRowCount, isCount)
    && isOptional(value.manifestBalanceTotal, isNonEmptyString)
    && isCount(value.errorCount)
    && isCount(value.warningCount)
    && isOptional(value.lastControlAt, (candidate): candidate is string => isNonEmptyString(candidate) && !Number.isNaN(Date.parse(candidate)));
}

function problemDetails(payload: unknown): { message?: string; correlationId?: string } {
  if (!isRecord(payload)) return {};
  const detail = typeof payload.detail === 'string' && payload.detail.trim() ? payload.detail : undefined;
  const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title : undefined;
  return {
    message: detail ?? title,
    correlationId: typeof payload.correlationId === 'string' && payload.correlationId.trim() ? payload.correlationId : undefined,
  };
}

export async function loadCbsQuality(filters: CbsQualityFilters, options: CbsQualityRequestOptions = {}): Promise<readonly CbsDataQualityBatch[]> {
  const filterErrors = cbsQualityFilterErrors({ businessDate: filters.businessDate ?? '', state: filters.state ?? '' });
  if (Object.keys(filterErrors).length > 0) {
    const correlationId = options.correlationId ?? crypto.randomUUID();
    throw new CbsQualityRequestError(Object.values(filterErrors)[0] ?? 'Filtres CBS invalides.', 400, correlationId);
  }
  const query = new URLSearchParams({ limit: '100', offset: '0' });
  if (filters.businessDate) query.set('businessDate', filters.businessDate);
  if (filters.state) query.set('state', filters.state);
  const requestCorrelationId = options.correlationId ?? crypto.randomUUID();
  const response = await fetch(`/api/core/cbs/data-quality/batches?${query}`, { signal: options.signal, headers: { 'x-correlation-id': requestCorrelationId, 'idempotency-key': options.idempotencyKey ?? crypto.randomUUID() } });
  const payload: unknown = await response.json().catch(() => undefined);
  const problem = problemDetails(payload);
  const correlationId = problem.correlationId ?? response.headers.get('x-correlation-id') ?? requestCorrelationId;
  if (!response.ok) throw new CbsQualityRequestError(problem.message ?? `Erreur HTTP ${response.status}`, response.status, correlationId);
  if (!Array.isArray(payload) || !payload.every(isCbsDataQualityBatch)) throw new CbsQualityRequestError('Réponse de qualité CBS invalide.', response.status, correlationId);
  return payload;
}

export function qualitySummary(rows: readonly CbsDataQualityBatch[]) {
  return rows.reduce((summary, row) => ({
    batches: summary.batches + 1,
    rejected: summary.rejected + Number(row.state === 'REJECTED' || row.state === 'QUARANTINED'),
    errors: summary.errors + row.errorCount,
    warnings: summary.warnings + row.warningCount,
  }), { batches: 0, rejected: 0, errors: 0, warnings: 0 });
}
