import type { DcrCalculationCommand, DcrCalculationResult, PublishedRiskDashboard, StressScenarioCommand, StressScenarioResult } from '@bank/pms-api-client';
export type { DcrCalculationCommand, DcrCalculationResult, PublishedRiskDashboard, StressScenarioCommand, StressScenarioResult };
export function validRiskPoolId(poolId: string): boolean { return /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(poolId); }
const decimal = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
function exactDate(value: string): boolean { const parsed = new Date(`${value}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value; }
async function responseBody<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) { const problem = (payload ?? {}) as { detail?: string; title?: string; correlationId?: string }; const message = problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`; throw new Error(problem.correlationId ? `${message} (référence : ${problem.correlationId})` : message); }
  return payload as T;
}
export async function getPublishedRiskDashboard(poolId: string, signal?: AbortSignal): Promise<PublishedRiskDashboard> {
  const response = await fetch(`/api/core/risk/dashboard/${encodeURIComponent(poolId)}`, { signal });
  return responseBody<PublishedRiskDashboard>(response);
}
export function validDcrCommand(command: DcrCalculationCommand): boolean {
  return validRiskPoolId(command.poolId) && exactDate(command.businessDate) && /^[A-Z]{3}$/.test(command.currency) &&
    decimal.test(command.capitalDurationAmount) && Number(command.capitalDurationAmount) >= 0 && decimal.test(command.riskWeightedDurationAmount) && Number(command.riskWeightedDurationAmount) > 0 &&
    /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(command.threshold) && /^[A-Za-z0-9._-]{1,64}$/.test(command.formulaVersion) && /^[0-9a-f]{64}$/.test(command.inputChecksumSha256);
}
export async function calculateDcr(command: DcrCalculationCommand): Promise<DcrCalculationResult> {
  const response = await fetch('/api/core/risk/dcr-calculations', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(command) });
  return responseBody<DcrCalculationResult>(response);
}
export function validStressCommand(command: StressScenarioCommand): boolean {
  return /^[A-Z][A-Z0-9_-]{1,63}$/.test(command.scenarioCode) && exactDate(command.businessDate) && /^[A-Z]{3}$/.test(command.currency) && decimal.test(command.baseAmount) && command.shocks.length > 0 && command.shocks.length <= 100 && command.shocks.every((shock) => /^[A-Z][A-Z0-9_-]{1,63}$/.test(shock.bucket) && Number.isInteger(shock.basisPoints) && shock.basisPoints >= -10_000 && shock.basisPoints <= 10_000) && /^[A-Za-z0-9._-]{1,64}$/.test(command.engineVersion) && /^[0-9a-f]{64}$/.test(command.inputChecksumSha256);
}
export async function runStress(command: StressScenarioCommand): Promise<StressScenarioResult> {
  const response = await fetch('/api/core/risk/stress-scenarios', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(command) });
  return responseBody<StressScenarioResult>(response);
}
