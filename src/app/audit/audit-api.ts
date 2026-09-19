import type {
  AuditEvent, AuditTrail, CreateSecureExport, DocumentArchiveQueued, DocumentArchiveRequest,
  DocumentArchiveRequestCommand, GeneratedSecureExport, SecureExportApproval,
  SecureExportGeneration, SecureExportTransition,
} from '@bank/pms-api-client';

export type {
  AuditTrail, CreateSecureExport, DocumentArchiveQueued, DocumentArchiveRequest,
  DocumentArchiveRequestCommand, GeneratedSecureExport, SecureExportApproval,
  SecureExportGeneration, SecureExportTransition,
};

type JsonRecord = Record<string, unknown>;
type ResponseParser<T> = (payload: unknown) => T;

export class AuditApiError extends Error {
  constructor(message: string, readonly correlationId?: string) {
    super(message);
    this.name = 'AuditApiError';
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`champ ${key} absent`);
  return value;
}

function optionalString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length === 0) throw new Error(`champ ${key} invalide`);
  return value;
}

function parseObject(payload: unknown): JsonRecord {
  if (!isRecord(payload)) throw new Error('objet JSON attendu');
  return payload;
}

function parseSecureExportTransition(payload: unknown): SecureExportTransition {
  const value = parseObject(payload);
  return { exportId: requiredString(value, 'exportId'), status: requiredString(value, 'status') };
}

function parseSecureExportApproval(payload: unknown): SecureExportApproval {
  const value = parseObject(payload);
  return { status: requiredString(value, 'status') };
}

function parseGeneratedSecureExport(payload: unknown): GeneratedSecureExport {
  const value = parseObject(payload);
  const status = requiredString(value, 'status');
  if (status !== 'GENERATED') throw new Error('statut GENERATED attendu');
  return { exportId: requiredString(value, 'exportId'), status, checksumSha256: requiredString(value, 'checksumSha256') };
}

function parseDocumentArchiveQueued(payload: unknown): DocumentArchiveQueued {
  const value = parseObject(payload);
  return { requestId: requiredString(value, 'requestId'), status: requiredString(value, 'status') };
}

function parseDocumentArchiveRequest(payload: unknown): DocumentArchiveRequest {
  const value = parseObject(payload);
  const paperlessDocumentId = value.paperlessDocumentId;
  if (paperlessDocumentId !== undefined && (!Number.isSafeInteger(paperlessDocumentId) || Number(paperlessDocumentId) < 0)) throw new Error('champ paperlessDocumentId invalide');
  if (typeof value.evidentiary !== 'boolean') throw new Error('champ evidentiary absent');
  return {
    requestId: requiredString(value, 'requestId'), status: requiredString(value, 'status'),
    objectKey: requiredString(value, 'objectKey'), businessType: requiredString(value, 'businessType'),
    businessId: requiredString(value, 'businessId'), classification: requiredString(value, 'classification'),
    evidentiary: value.evidentiary, createdAt: requiredString(value, 'createdAt'),
    checksumSha256: optionalString(value, 'checksumSha256'),
    paperlessDocumentId: paperlessDocumentId as number | undefined,
    wormObjectKey: optionalString(value, 'wormObjectKey'), archivedAt: optionalString(value, 'archivedAt'),
  };
}

function parseAuditEvent(payload: unknown): AuditEvent {
  const value = parseObject(payload);
  return {
    auditEventId: requiredString(value, 'auditEventId'), previousHash: optionalString(value, 'previousHash'),
    eventHash: requiredString(value, 'eventHash'), signingKeyId: requiredString(value, 'signingKeyId'),
    signatureBase64: requiredString(value, 'signatureBase64'), correlationId: requiredString(value, 'correlationId'),
    actorId: requiredString(value, 'actorId'), technicalIdentity: requiredString(value, 'technicalIdentity'),
    sessionId: optionalString(value, 'sessionId'), action: requiredString(value, 'action'),
    resourceType: requiredString(value, 'resourceType'), resourceId: requiredString(value, 'resourceId'),
    outcome: requiredString(value, 'outcome'), businessDate: requiredString(value, 'businessDate'),
    occurredAt: requiredString(value, 'occurredAt'), sourceApplication: requiredString(value, 'sourceApplication'),
    sourceAddress: optionalString(value, 'sourceAddress'), justification: optionalString(value, 'justification'),
    runId: optionalString(value, 'runId'), batchId: optionalString(value, 'batchId'),
    documentReferenceId: optionalString(value, 'documentReferenceId'),
    authorizedChanges: isRecord(value.authorizedChanges) ? value.authorizedChanges : undefined,
  };
}

function parseAuditTrail(payload: unknown): AuditTrail {
  const value = parseObject(payload);
  if (!Array.isArray(value.events)) throw new Error('champ events absent');
  if (value.integrity !== 'HASH_CHAIN') throw new Error('mécanisme HASH_CHAIN attendu');
  if (typeof value.chainValid !== 'boolean') throw new Error('champ chainValid absent');
  if (!Number.isSafeInteger(value.verifiedCount) || Number(value.verifiedCount) < 0) throw new Error('champ verifiedCount invalide');
  return {
    events: value.events.map(parseAuditEvent), integrity: value.integrity, chainValid: value.chainValid,
    verifiedCount: Number(value.verifiedCount), brokenAtEventId: optionalString(value, 'brokenAtEventId'),
  };
}

async function parseResponse<T>(response: Response, parser: ResponseParser<T>): Promise<T> {
  const payload: unknown = await response.json().catch(() => undefined);
  const payloadCorrelationId = isRecord(payload) && typeof payload.correlationId === 'string' ? payload.correlationId : undefined;
  const correlationId = response.headers.get('x-correlation-id') ?? payloadCorrelationId;
  if (!response.ok) {
    const detail = isRecord(payload) && typeof payload.detail === 'string' ? payload.detail : undefined;
    const title = isRecord(payload) && typeof payload.title === 'string' ? payload.title : undefined;
    throw new AuditApiError(detail ?? title ?? `Erreur HTTP ${response.status}`, correlationId);
  }
  try {
    return parser(payload);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : 'format inconnu';
    throw new AuditApiError(`Réponse du service d’audit invalide (${reason}).`, correlationId);
  }
}

async function command<T>(path: string, body: unknown, parser: ResponseParser<T>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/core/reporting/exports${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify(body), signal,
  });
  return parseResponse(response, parser);
}

export const createExport = (input: CreateSecureExport, signal?: AbortSignal) => command('', input, parseSecureExportTransition, signal);
export const approveExport = (id: string, signal?: AbortSignal) => command(`/${encodeURIComponent(id)}/approvals`, {}, parseSecureExportApproval, signal);
export const generateExport = (id: string, input: SecureExportGeneration, signal?: AbortSignal) => command(`/${encodeURIComponent(id)}/generation`, input, parseGeneratedSecureExport, signal);

export function validDocumentArchiveRequest(input: DocumentArchiveRequestCommand): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._/-]{2,511}$/.test(input.objectKey)
    && !input.objectKey.includes('..') && !input.objectKey.startsWith('/') && !input.objectKey.includes('//')
    && /^[A-Z][A-Z0-9_]{1,63}$/.test(input.businessType)
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(input.businessId)
    && /^[A-Z][A-Z0-9_]{1,63}$/.test(input.classification);
}

export async function requestDocumentArchive(input: DocumentArchiveRequestCommand, signal?: AbortSignal): Promise<DocumentArchiveQueued> {
  const response = await fetch('/api/core/documents/archive-requests', {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify(input), signal,
  });
  return parseResponse(response, parseDocumentArchiveQueued);
}

export async function getDocumentArchiveRequest(requestId: string, signal?: AbortSignal): Promise<DocumentArchiveRequest> {
  const response = await fetch(`/api/core/documents/archive-requests/${encodeURIComponent(requestId)}`, { signal });
  return parseResponse(response, parseDocumentArchiveRequest);
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
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new AuditApiError('La profondeur du journal doit être comprise entre 1 et 200.');
  const validation = validateAuditTrailFilters(filters);
  if (validation) throw new AuditApiError(validation);
  const query = new URLSearchParams({ limit: String(limit) });
  if (filters.action) query.set('action', filters.action);
  if (filters.resourceType) query.set('resourceType', filters.resourceType);
  if (filters.outcome) query.set('outcome', filters.outcome);
  if (filters.auditCorrelationId) query.set('auditCorrelationId', filters.auditCorrelationId);
  if (filters.businessDateFrom) query.set('businessDateFrom', filters.businessDateFrom);
  if (filters.businessDateTo) query.set('businessDateTo', filters.businessDateTo);
  const response = await fetch(`/api/core/audit/events?${query}`, { method: 'GET', signal });
  return parseResponse(response, parseAuditTrail);
}
