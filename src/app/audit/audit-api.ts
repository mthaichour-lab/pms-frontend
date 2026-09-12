import type { AuditTrail, CreateSecureExport, DocumentArchiveQueued, DocumentArchiveRequest, DocumentArchiveRequestCommand, GeneratedSecureExport, SecureExportApproval, SecureExportGeneration, SecureExportTransition } from '@bank/pms-api-client';
export type { AuditTrail, CreateSecureExport, DocumentArchiveQueued, DocumentArchiveRequest, DocumentArchiveRequestCommand, GeneratedSecureExport, SecureExportApproval, SecureExportGeneration, SecureExportTransition };
async function command<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(`/api/core/reporting/exports${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(body) });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) { const problem = (payload ?? {}) as { detail?: string; title?: string; correlationId?: string }; throw new Error(problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`); }
  return payload as T;
}
export const createExport = (input: CreateSecureExport) => command<SecureExportTransition>('', input);
export const approveExport = (id: string) => command<SecureExportApproval>(`/${encodeURIComponent(id)}/approvals`);
export const generateExport = (id: string, input: SecureExportGeneration) => command<GeneratedSecureExport>(`/${encodeURIComponent(id)}/generation`, input);
export function validDocumentArchiveRequest(input: DocumentArchiveRequestCommand): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._/-]{2,511}$/.test(input.objectKey) && !input.objectKey.includes('..') && /^[A-Z][A-Z0-9_]{1,63}$/.test(input.businessType) && /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(input.businessId) && /^[A-Z][A-Z0-9_]{1,63}$/.test(input.classification);
}
export async function requestDocumentArchive(input: DocumentArchiveRequestCommand): Promise<DocumentArchiveQueued> {
  const response = await fetch('/api/core/documents/archive-requests', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(input) });
  return archiveResponse<DocumentArchiveQueued>(response);
}
export async function getDocumentArchiveRequest(requestId: string): Promise<DocumentArchiveRequest> {
  return archiveResponse<DocumentArchiveRequest>(await fetch(`/api/core/documents/archive-requests/${encodeURIComponent(requestId)}`));
}
async function archiveResponse<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) { const problem = (payload ?? {}) as { detail?: string; title?: string }; throw new Error(problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`); }
  return payload as T;
}

export interface AuditTrailFilters {
  readonly action?: string;
  readonly resourceType?: string;
  readonly outcome?: 'SUCCESS' | 'DENIED' | 'FAILURE';
  readonly auditCorrelationId?: string;
  readonly businessDateFrom?: string;
  readonly businessDateTo?: string;
}

export function validateAuditTrailFilters(filters: AuditTrailFilters): string | undefined {
  if (filters.action && !/^[A-Z][A-Z0-9_.:-]{0,127}$/.test(filters.action)) return 'L’action doit commencer par une lettre majuscule et contenir uniquement des caractères autorisés.';
  if (filters.resourceType && !/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(filters.resourceType)) return 'Le type de ressource contient des caractères non autorisés.';
  if (filters.auditCorrelationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(filters.auditCorrelationId)) return 'L’identifiant de corrélation doit être un UUID valide.';
  if (filters.businessDateFrom && filters.businessDateTo && filters.businessDateFrom > filters.businessDateTo) return 'La date de début doit précéder ou égaler la date de fin.';
  return undefined;
}

export async function getAuditTrail(limit = 50, filters: AuditTrailFilters = {}, signal?: AbortSignal): Promise<AuditTrail> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (filters.action) query.set('action', filters.action);
  if (filters.resourceType) query.set('resourceType', filters.resourceType);
  if (filters.outcome) query.set('outcome', filters.outcome);
  if (filters.auditCorrelationId) query.set('auditCorrelationId', filters.auditCorrelationId);
  if (filters.businessDateFrom) query.set('businessDateFrom', filters.businessDateFrom);
  if (filters.businessDateTo) query.set('businessDateTo', filters.businessDateTo);
  return archiveResponse<AuditTrail>(await fetch(`/api/core/audit/events?${query}`, { method: 'GET', signal }));
}
