import type { AssetAllocation, AssetAnomaly, InvestmentPool, PoolCompositionSnapshot, PoolFundingSource } from '@bank/pms-api-client';
export type { AssetAllocation, AssetAnomaly, InvestmentPool, PoolCompositionSnapshot, PoolFundingSource };

export interface AllocationSimulation {
  readonly remainingPercentage: string;
  readonly currentAllocatedPercentage: string;
  readonly simulated: true;
  readonly blockingAnomalies: readonly string[];
  readonly approvalRequired: boolean;
  readonly executable: boolean;
}

export interface RecordedAllocation {
  readonly allocation: AssetAllocation;
  readonly remainingPercentage: string;
  readonly status: 'CREATED' | 'EXISTING';
}

export interface AllocationRequestOptions {
  readonly signal?: AbortSignal;
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
}

export class AllocationRequestError extends Error {
  constructor(message: string, readonly status: number, readonly correlationId: string) {
    super(`${message} (référence : ${correlationId})`);
    this.name = 'AllocationRequestError';
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const percentagePattern = /^(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/;

export function validPoolId(value: string): boolean { return /^[A-Z0-9_-]{2,32}$/.test(value); }
export function validAssetId(value: string): boolean { return uuid.test(value); }
export function validIsoDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function validPercentage(value: string): boolean {
  if (!percentagePattern.test(value)) return false;
  const [whole, fraction = ''] = value.split('.');
  const scaled = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  return scaled > 0n && scaled <= 100_000_000n;
}
export function allocationFieldValidity(value: Pick<AssetAllocation, 'assetId' | 'percentage' | 'effectiveFrom' | 'justification' | 'approvalId'>) {
  return {
    assetId: validAssetId(value.assetId),
    percentage: validPercentage(value.percentage),
    effectiveFrom: validIsoDate(value.effectiveFrom),
    justification: value.justification.trim().length >= 10 && value.justification.length <= 1000,
    approvalId: value.approvalId === undefined || value.approvalId === '' || uuid.test(value.approvalId),
  } as const;
}
export function validAllocation(value: Pick<AssetAllocation, 'assetId' | 'percentage' | 'effectiveFrom' | 'justification' | 'approvalId'>): boolean {
  return Object.values(allocationFieldValidity(value)).every(Boolean);
}

async function responsePayload<T>(response: Response, requestCorrelationId: string): Promise<T> {
  const payload: unknown = await response.json().catch(() => undefined);
  const correlationId = payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).correlationId === 'string'
    ? (payload as Record<string, string>).correlationId
    : response.headers.get('x-correlation-id') ?? requestCorrelationId;
  if (!response.ok) {
    const problem = (payload ?? {}) as { detail?: string; title?: string; correlationId?: string };
    const description = problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`;
    throw new AllocationRequestError(description, response.status, correlationId);
  }
  return payload as T;
}

function requestHeaders(options: AllocationRequestOptions, command: boolean): Headers {
  const headers = new Headers({ 'x-correlation-id': options.correlationId ?? crypto.randomUUID() });
  if (command) {
    headers.set('content-type', 'application/json');
    headers.set('idempotency-key', options.idempotencyKey ?? crypto.randomUUID());
  }
  return headers;
}

function isAllocationSimulation(value: unknown): value is AllocationSimulation {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return typeof result.remainingPercentage === 'string' && typeof result.currentAllocatedPercentage === 'string' &&
    result.simulated === true && Array.isArray(result.blockingAnomalies) && result.blockingAnomalies.every((item) => typeof item === 'string') &&
    typeof result.approvalRequired === 'boolean' && typeof result.executable === 'boolean';
}

function isAssetAllocation(value: unknown): value is AssetAllocation {
  if (!value || typeof value !== 'object') return false;
  const allocation = value as Record<string, unknown>;
  return typeof allocation.allocationId === 'string' && validAssetId(allocation.allocationId) &&
    typeof allocation.assetId === 'string' && validAssetId(allocation.assetId) &&
    (allocation.poolId === undefined || typeof allocation.poolId === 'string' && validPoolId(allocation.poolId)) &&
    typeof allocation.percentage === 'string' && validPercentage(allocation.percentage) &&
    typeof allocation.effectiveFrom === 'string' && validIsoDate(allocation.effectiveFrom) &&
    typeof allocation.justification === 'string' && allocation.justification.trim().length >= 10;
}

function isAssetAnomaly(value: unknown): value is AssetAnomaly {
  if (!value || typeof value !== 'object') return false;
  const anomaly = value as Record<string, unknown>;
  return typeof anomaly.anomalyId === 'string' && validAssetId(anomaly.anomalyId) &&
    typeof anomaly.kind === 'string' && anomaly.kind.trim().length > 0 &&
    typeof anomaly.reason === 'string' && anomaly.reason.trim().length >= 10 &&
    typeof anomaly.detectedAt === 'string' && !Number.isNaN(Date.parse(anomaly.detectedAt)) &&
    typeof anomaly.status === 'string' && anomaly.status.trim().length > 0;
}

function isRecordedAllocation(value: unknown): value is RecordedAllocation {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  const allocation = result.allocation as Record<string, unknown> | undefined;
  return !!allocation && typeof allocation.allocationId === 'string' && typeof allocation.assetId === 'string' &&
    typeof allocation.percentage === 'string' && typeof allocation.effectiveFrom === 'string' && typeof allocation.justification === 'string' &&
    typeof result.remainingPercentage === 'string' && (result.status === 'CREATED' || result.status === 'EXISTING');
}

function invalidResponse(status: number, correlationId: string, description: string): never {
  throw new AllocationRequestError(description, status, correlationId);
}

export const getPoolComposition = (poolId: string, businessDate: string, options: AllocationRequestOptions = {}) => poolRequest<PoolCompositionSnapshot>(poolId, `/compositions/${encodeURIComponent(businessDate)}`, undefined, options);
export async function getAllocationHistory(assetId: string, asOf?: string, options: AllocationRequestOptions = {}): Promise<readonly AssetAllocation[]> {
  const query = asOf ? `?${new URLSearchParams({ asOf })}` : '';
  const headers = requestHeaders(options, false);
  const response = await fetch(`/api/core/investment-pools/assets/${encodeURIComponent(assetId)}/allocations${query}`, { headers, signal: options.signal });
  const payload = await responsePayload<unknown>(response, headers.get('x-correlation-id')!);
  return Array.isArray(payload) && payload.every(isAssetAllocation) ? payload : invalidResponse(response.status, response.headers.get('x-correlation-id') ?? headers.get('x-correlation-id')!, 'Réponse d’historique invalide.');
}
export async function getAssetAnomalies(assetId: string, options: AllocationRequestOptions = {}): Promise<readonly AssetAnomaly[]> {
  const headers = requestHeaders(options, false);
  const response = await fetch(`/api/core/investment-pools/assets/${encodeURIComponent(assetId)}/anomalies`, { headers, signal: options.signal });
  const payload = await responsePayload<unknown>(response, headers.get('x-correlation-id')!);
  return Array.isArray(payload) && payload.every(isAssetAnomaly) ? payload : invalidResponse(response.status, response.headers.get('x-correlation-id') ?? headers.get('x-correlation-id')!, 'Réponse d’anomalies invalide.');
}
async function anomalyCommand(assetId: string, suffix: string, body: unknown, options: AllocationRequestOptions = {}): Promise<AssetAnomaly> {
  const headers = requestHeaders(options, true);
  const response = await fetch(`/api/core/investment-pools/assets/${encodeURIComponent(assetId)}/anomalies${suffix}`, { method: 'POST', headers, body: JSON.stringify(body), signal: options.signal });
  return responsePayload<AssetAnomaly>(response, headers.get('x-correlation-id')!);
}
export const reportAssetAnomaly = (assetId: string, anomaly: AssetAnomaly, options: AllocationRequestOptions = {}) => anomalyCommand(assetId, '', anomaly, options);
export const resolveAssetAnomaly = (assetId: string, anomalyId: string, resolutionEvidenceId: string, options: AllocationRequestOptions = {}) => anomalyCommand(assetId, `/${encodeURIComponent(anomalyId)}/resolve`, { resolvedAt: new Date().toISOString(), resolutionEvidenceId }, options);
export async function poolRequest<T>(poolId: string, suffix = '', body?: unknown, options: AllocationRequestOptions = {}): Promise<T> {
  const command = body !== undefined;
  const headers = requestHeaders(options, command);
  const response = await fetch(`/api/core/investment-pools/${encodeURIComponent(poolId)}${suffix}`, { method: command ? 'POST' : 'GET', headers, body: command ? JSON.stringify(body) : undefined, signal: options.signal });
  return responsePayload<T>(response, headers.get('x-correlation-id')!);
}
export async function simulateAllocation(poolId: string, command: AssetAllocation, options: AllocationRequestOptions = {}): Promise<AllocationSimulation> {
  const correlationId = options.correlationId ?? crypto.randomUUID();
  const result = await poolRequest<unknown>(poolId, '/allocations/simulate', command, { ...options, correlationId });
  return isAllocationSimulation(result) ? result : invalidResponse(200, correlationId, 'Réponse de simulation invalide.');
}
export async function recordAllocation(poolId: string, command: AssetAllocation, options: AllocationRequestOptions = {}): Promise<RecordedAllocation> {
  const correlationId = options.correlationId ?? crypto.randomUUID();
  const result = await poolRequest<unknown>(poolId, '/allocations', command, { ...options, correlationId });
  return isRecordedAllocation(result) ? result : invalidResponse(200, correlationId, 'Réponse d’allocation invalide.');
}
export const transitionPool = (poolId: string, action: 'activate' | 'suspend' | 'close', options: AllocationRequestOptions = {}) => poolRequest<InvestmentPool>(poolId, `/${action}`, {}, options);
