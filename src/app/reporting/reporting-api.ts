import type { GeneratedRegulatoryReport, RegulatoryReportGeneration, RegulatoryReportPublication, RegulatoryReportTransition } from '@bank/pms-api-client';
import type { CreatePlanningScenario, PlanningScenarioTransition, PlanningScenarioTransitionCommand } from '@bank/pms-api-client';
import type { HistoricalYieldForecast } from '@bank/pms-api-client';
import type { TenorYieldCurve } from '@bank/pms-api-client';
export type { GeneratedRegulatoryReport, RegulatoryReportGeneration, RegulatoryReportPublication, RegulatoryReportTransition };
export const validGeneration = (command: RegulatoryReportGeneration) => /^[A-Z][A-Z0-9_-]{1,63}$/.test(command.reportType) && /^\d{4}-(0[1-9]|1[0-2])$/.test(command.period);
export const validPublication = (command: RegulatoryReportPublication) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(command.evidenceDocumentId) && command.justification.trim().length >= 10 && command.justification.length <= 1000;
async function post<T>(path: string, command: unknown): Promise<T> {
  return postCore<T>(`/reporting/regulatory-reports${path}`, command);
}
async function postCore<T>(path: string, command: unknown): Promise<T> {
  const response = await fetch(`/api/core${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(command) });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) { const problem = (payload ?? {}) as { detail?: string; title?: string; correlationId?: string }; const message = problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`; throw new Error(problem.correlationId ? `${message} (référence : ${problem.correlationId})` : message); }
  return payload as T;
}
export const generateReport = (command: RegulatoryReportGeneration) => post<GeneratedRegulatoryReport>('/generate', command);
export const publishReport = (reportId: string, command: RegulatoryReportPublication) => post<RegulatoryReportTransition>(`/${encodeURIComponent(reportId)}/publish`, command);

export type { CreatePlanningScenario, PlanningScenarioTransition, PlanningScenarioTransitionCommand };
export const validPlanningScenario = (command: CreatePlanningScenario) => validForecastPoolId(command.poolId) && ['CENTRAL', 'OPTIMISTIC', 'STRESSED'].includes(command.kind) && Number.isInteger(command.version) && command.version >= 1 && /^\d{4}-(0[1-9]|1[0-2])$/.test(command.startMonth) && Object.values(command.assumptions).every((value) => /^-?\d+(?:\.\d+)?$/.test(value));
export const createPlanningScenario = (command: CreatePlanningScenario) => postCore<PlanningScenarioTransition>('/reporting/planning-scenarios', command);
export const transitionPlanningScenario = (scenarioId: string, command: PlanningScenarioTransitionCommand) => postCore<PlanningScenarioTransition>(`/reporting/planning-scenarios/${encodeURIComponent(scenarioId)}/transitions`, command);
export type { HistoricalYieldForecast };
export const validForecastPoolId = (poolId: string) => /^[A-Za-z0-9._:-]{2,64}$/.test(poolId);
export const generateHistoricalYieldForecast = (poolId: string) => postCore<HistoricalYieldForecast>(`/reporting/historical-yield-forecasts/${encodeURIComponent(poolId)}`, {});
export type { TenorYieldCurve };
export const validCustomerToken = (token: string) => token === '' || /^tok_[A-Za-z0-9_-]{16,}$/.test(token);
export async function getTenorYieldCurve(poolId: string, customerToken?: string, signal?: AbortSignal): Promise<TenorYieldCurve> {
  const query = customerToken ? `?${new URLSearchParams({ customerToken })}` : '';
  const response = await fetch(`/api/core/reporting/tenor-curves/${encodeURIComponent(poolId)}${query}`, { signal });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) { const problem = (payload ?? {}) as { detail?: string; title?: string; correlationId?: string }; const message = problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`; throw new Error(problem.correlationId ? `${message} (référence : ${problem.correlationId})` : message); }
  return payload as TenorYieldCurve;
}
