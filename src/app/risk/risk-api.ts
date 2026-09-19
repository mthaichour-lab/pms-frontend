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
export function dcrFieldValidity(command: DcrCalculationCommand) {
  return {
    poolId: validRiskPoolId(command.poolId),
    businessDate: exactDate(command.businessDate),
    currency: /^[A-Z]{3}$/.test(command.currency),
    capitalDurationAmount: decimal.test(command.capitalDurationAmount) && Number(command.capitalDurationAmount) >= 0,
    riskWeightedDurationAmount: decimal.test(command.riskWeightedDurationAmount) && Number(command.riskWeightedDurationAmount) > 0,
    threshold: /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(command.threshold),
    formulaVersion: /^[A-Za-z0-9._-]{1,64}$/.test(command.formulaVersion),
    inputChecksumSha256: /^[0-9a-f]{64}$/.test(command.inputChecksumSha256),
  } as const;
}
export function validDcrCommand(command: DcrCalculationCommand): boolean {
  return Object.values(dcrFieldValidity(command)).every(Boolean);
}
export async function calculateDcr(command: DcrCalculationCommand): Promise<DcrCalculationResult> {
  const response = await fetch('/api/core/risk/dcr-calculations', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(command) });
  return responseBody<DcrCalculationResult>(response);
}
export function validStressCommand(command: StressScenarioCommand): boolean {
  return Object.values(stressFieldValidity(command)).every(Boolean);
}
export function stressFieldValidity(command: StressScenarioCommand) {
  return {
    scenarioCode: /^[A-Z][A-Z0-9_-]{1,63}$/.test(command.scenarioCode),
    businessDate: exactDate(command.businessDate),
    currency: /^[A-Z]{3}$/.test(command.currency),
    baseAmount: decimal.test(command.baseAmount),
    shocks: command.shocks.length > 0 && command.shocks.length <= 100,
    bucket: command.shocks.length > 0 && command.shocks.every((shock) => /^[A-Z][A-Z0-9_-]{1,63}$/.test(shock.bucket)),
    basisPoints: command.shocks.length > 0 && command.shocks.every((shock) => Number.isInteger(shock.basisPoints) && shock.basisPoints >= -10_000 && shock.basisPoints <= 10_000),
    engineVersion: /^[A-Za-z0-9._-]{1,64}$/.test(command.engineVersion),
    inputChecksumSha256: /^[0-9a-f]{64}$/.test(command.inputChecksumSha256),
  } as const;
}
export async function runStress(command: StressScenarioCommand): Promise<StressScenarioResult> {
  const response = await fetch('/api/core/risk/stress-scenarios', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(command) });
  return responseBody<StressScenarioResult>(response);
}
