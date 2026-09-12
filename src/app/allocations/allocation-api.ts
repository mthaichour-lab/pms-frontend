import type { AssetAllocation, AssetAnomaly, InvestmentPool, PoolCompositionSnapshot, PoolFundingSource } from '@bank/pms-api-client';
export type { AssetAllocation, AssetAnomaly, InvestmentPool, PoolCompositionSnapshot, PoolFundingSource };
export function validAllocation(value: Pick<AssetAllocation, 'assetId' | 'percentage' | 'effectiveFrom' | 'justification'>): boolean {
  const percentage = Number(value.percentage);
  return value.assetId.trim().length > 0 && percentage > 0 && percentage <= 100 && /^\d{4}-\d{2}-\d{2}$/.test(value.effectiveFrom) && value.justification.trim().length >= 10;
}
export const getPoolComposition = (poolId: string, businessDate: string) => poolRequest<PoolCompositionSnapshot>(poolId, `/compositions/${encodeURIComponent(businessDate)}`);
export async function getAllocationHistory(assetId: string, asOf?: string): Promise<readonly AssetAllocation[]> {
  const query = asOf ? `?${new URLSearchParams({ asOf })}` : '';
  const response = await fetch(`/api/core/investment-pools/assets/${encodeURIComponent(assetId)}/allocations${query}`);
  if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
  return response.json() as Promise<readonly AssetAllocation[]>;
}
export async function getAssetAnomalies(assetId: string): Promise<readonly AssetAnomaly[]> {
  const response = await fetch(`/api/core/investment-pools/assets/${encodeURIComponent(assetId)}/anomalies`);
  if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
  return response.json() as Promise<readonly AssetAnomaly[]>;
}
async function anomalyCommand(assetId: string, suffix: string, body: unknown): Promise<AssetAnomaly> {
  const response = await fetch(`/api/core/investment-pools/assets/${encodeURIComponent(assetId)}/anomalies${suffix}`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
  return response.json() as Promise<AssetAnomaly>;
}
export const reportAssetAnomaly = (assetId: string, anomaly: AssetAnomaly) => anomalyCommand(assetId, '', anomaly);
export const resolveAssetAnomaly = (assetId: string, anomalyId: string, resolutionEvidenceId: string) => anomalyCommand(assetId, `/${encodeURIComponent(anomalyId)}/resolve`, { resolvedAt: new Date().toISOString(), resolutionEvidenceId });
export async function poolRequest<T>(poolId: string, suffix = '', body?: unknown): Promise<T> {
  const response = await fetch(`/api/core/investment-pools/${encodeURIComponent(poolId)}${suffix}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) { const problem = (payload ?? {}) as { detail?: string; title?: string; correlationId?: string }; const message = problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`; throw new Error(problem.correlationId ? `${message} (référence : ${problem.correlationId})` : message); }
  return payload as T;
}
export const transitionPool = (poolId: string, action: 'activate' | 'suspend' | 'close') => poolRequest<InvestmentPool>(poolId, `/${action}`, {});
