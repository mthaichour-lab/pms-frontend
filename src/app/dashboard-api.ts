import type { AudienceDashboard, DashboardAudience, DashboardItem } from '@bank/pms-api-client';
export type DashboardRequestOptions = { readonly signal?: AbortSignal; readonly correlationId?: string };
const audienceByRole: Readonly<Record<string, DashboardAudience>> = { SYSTEM_ADMIN: 'EXECUTIVE', FINANCE_CONTROLLER: 'FINANCE', FINANCE_ANALYST: 'FINANCE', RISK_ANALYST: 'RISK_ALM', SHARIA_AUDITOR: 'SHARIA' };
export function audienceForRoles(roles: readonly string[]): DashboardAudience | undefined { for (const role of roles) { const audience = audienceByRole[role]; if (audience) return audience; } return undefined; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function nonEmpty(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function validDateTime(value: unknown): value is string { return nonEmpty(value) && !Number.isNaN(Date.parse(value)); }
function validBusinessDate(value: unknown): value is string { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const parsed = new Date(`${value}T00:00:00Z`); return parsed.toISOString().slice(0, 10) === value; }
function validItem(value: unknown): value is DashboardItem { if (!record(value) || !nonEmpty(value.code) || !nonEmpty(value.availability)) return false; if ('justification' in value && value.justification !== undefined && typeof value.justification !== 'string') return false; return true; }
export function isAudienceDashboard(value: unknown): value is AudienceDashboard {
  if (!record(value) || !nonEmpty(value.audience) || !validDateTime(value.generatedAt) || !Array.isArray(value.items) || !value.items.every(validItem)) return false;
  const queryDurationMs = value.queryDurationMs, requiredItemCount = value.requiredItemCount, performanceBudgetMs = value.performanceBudgetMs;
  if (typeof queryDurationMs !== 'number' || !Number.isFinite(queryDurationMs) || queryDurationMs < 0 || typeof requiredItemCount !== 'number' || !Number.isSafeInteger(requiredItemCount) || requiredItemCount < 0 || value.complete !== true || typeof performanceBudgetMs !== 'number' || !Number.isFinite(performanceBudgetMs) || performanceBudgetMs < 0) return false;
  return value.businessDate === undefined || validBusinessDate(value.businessDate);
}
function problemDetails(payload: unknown): { message?: string; correlationId?: string } { if (!record(payload)) return {}; const detail = typeof payload.detail === 'string' && payload.detail.trim() ? payload.detail : undefined; const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title : undefined; return { message: detail ?? title, correlationId: typeof payload.correlationId === 'string' && payload.correlationId.trim() ? payload.correlationId : undefined }; }
export class DashboardRequestError extends Error { constructor(message: string, readonly status: number, readonly correlationId: string) { super(`${message} (référence : ${correlationId})`); this.name = 'DashboardRequestError'; } }
export async function loadAudienceDashboard(audience: DashboardAudience, poolId?: string, options: DashboardRequestOptions = {}): Promise<AudienceDashboard> {
  if (!nonEmpty(audience)) throw new TypeError('Audience dashboard invalide.');
  const query = new URLSearchParams(); if (poolId?.trim()) query.set('poolId', poolId.trim()); const suffix = query.size ? `?${query}` : ''; const requestCorrelationId = options.correlationId ?? crypto.randomUUID();
  const response = await fetch(`/api/core/reporting/dashboards/${encodeURIComponent(audience)}${suffix}`, { signal: options.signal, headers: { accept: 'application/json', 'x-correlation-id': requestCorrelationId } });
  const payload: unknown = await response.json().catch(() => undefined); const problem = problemDetails(payload); const correlationId = problem.correlationId ?? response.headers.get('x-correlation-id') ?? requestCorrelationId;
  if (!response.ok) throw new DashboardRequestError(problem.message ?? `Erreur HTTP ${response.status}`, response.status, correlationId);
  if (!isAudienceDashboard(payload)) throw new DashboardRequestError('Réponse du tableau de bord invalide.', response.status, correlationId);
  return payload;
}
export function dashboardItemLabel(item: DashboardItem): string { const code = typeof item.code === 'string' ? item.code : ''; return code.toLowerCase().split('_').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') || 'Indicateur'; }
export function dashboardItemValue(item: DashboardItem): string { if (item.availability === 'UNAVAILABLE' || item.value === null) return 'Indisponible'; if (typeof item.value === 'string' || typeof item.value === 'number') return String(item.value); if (typeof item.value === 'boolean') return item.value ? 'Oui' : 'Non'; if (typeof item.value === 'object' && item.value !== null) { const value = item.value as Record<string, unknown>; const preferred = value['displayValue'] ?? value['value'] ?? value['amount'] ?? value['status']; if (typeof preferred === 'string' || typeof preferred === 'number') { const unit = typeof value['unit'] === 'string' ? ` ${value['unit']}` : typeof value['currency'] === 'string' ? ` ${value['currency']}` : ''; return `${preferred}${unit}`; } } return 'Disponible'; }
