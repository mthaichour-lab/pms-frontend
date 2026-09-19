import type { GeneratedRegulatoryReport, RegulatoryReportGeneration, RegulatoryReportPublication, RegulatoryReportTransition } from '@bank/pms-api-client';
import type { CreatePlanningScenario, PlanningScenarioTransition, PlanningScenarioTransitionCommand } from '@bank/pms-api-client';
import type { HistoricalYieldForecast } from '@bank/pms-api-client';
import type { TenorYieldCurve } from '@bank/pms-api-client';
export type { GeneratedRegulatoryReport, RegulatoryReportGeneration, RegulatoryReportPublication, RegulatoryReportTransition };
export function generationFieldValidity(command: RegulatoryReportGeneration) {
  return {
    reportType: /^[A-Z][A-Z0-9_-]{1,63}$/.test(command.reportType),
    period: /^\d{4}-(0[1-9]|1[0-2])$/.test(command.period),
  } as const;
}
export const validGeneration = (command: RegulatoryReportGeneration) => Object.values(generationFieldValidity(command)).every(Boolean);
export function publicationFieldValidity(command: RegulatoryReportPublication) {
  return {
    evidenceDocumentId: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(command.evidenceDocumentId),
    justification: command.justification.trim().length >= 10 && command.justification.length <= 1000,
  } as const;
}
export const validPublication = (command: RegulatoryReportPublication) => Object.values(publicationFieldValidity(command)).every(Boolean);
async function responsePayload<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const problem = (payload ?? {}) as { detail?: string; title?: string; correlationId?: string };
    const description = problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`;
    const correlationId = problem.correlationId ?? response.headers.get('x-correlation-id');
    throw new Error(correlationId ? `${description} (référence : ${correlationId})` : description);
  }
  return payload as T;
}
async function post<T>(path: string, command: unknown, signal?: AbortSignal): Promise<T> {
  return postCore<T>(`/reporting/regulatory-reports${path}`, command, signal);
}
async function postCore<T>(path: string, command: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/core${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(command), signal });
  return responsePayload<T>(response);
}
export const generateReport = (command: RegulatoryReportGeneration, signal?: AbortSignal) => post<GeneratedRegulatoryReport>('/generate', command, signal);
export const publishReport = (reportId: string, command: RegulatoryReportPublication, signal?: AbortSignal) => post<RegulatoryReportTransition>(`/${encodeURIComponent(reportId)}/publish`, command, signal);

export type { CreatePlanningScenario, PlanningScenarioTransition, PlanningScenarioTransitionCommand };
const validDecimal = (value: string) => /^-?\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value));
export function planningScenarioFieldValidity(command: CreatePlanningScenario) {
  return {
    poolId: validForecastPoolId(command.poolId),
    kind: ['CENTRAL', 'OPTIMISTIC', 'STRESSED'].includes(command.kind),
    version: Number.isInteger(command.version) && command.version >= 1,
    startMonth: /^\d{4}-(0[1-9]|1[0-2])$/.test(command.startMonth),
    monthlyResourceGrowthPercent: validDecimal(command.assumptions.monthlyResourceGrowthPercent),
    annualYieldPercent: validDecimal(command.assumptions.annualYieldPercent),
    monthlyPlacementGrowthPercent: validDecimal(command.assumptions.monthlyPlacementGrowthPercent),
  } as const;
}
export const validPlanningScenario = (command: CreatePlanningScenario) => Object.values(planningScenarioFieldValidity(command)).every(Boolean);
export const createPlanningScenario = (command: CreatePlanningScenario, signal?: AbortSignal) => postCore<PlanningScenarioTransition>('/reporting/planning-scenarios', command, signal);
export const transitionPlanningScenario = (scenarioId: string, command: PlanningScenarioTransitionCommand, signal?: AbortSignal) => postCore<PlanningScenarioTransition>(`/reporting/planning-scenarios/${encodeURIComponent(scenarioId)}/transitions`, command, signal);
export type { HistoricalYieldForecast };
export const validForecastPoolId = (poolId: string) => /^[A-Za-z0-9._:-]{2,64}$/.test(poolId);
export const generateHistoricalYieldForecast = (poolId: string, signal?: AbortSignal) => postCore<HistoricalYieldForecast>(`/reporting/historical-yield-forecasts/${encodeURIComponent(poolId)}`, {}, signal);
export type { TenorYieldCurve };
export const validCustomerToken = (token: string) => token === '' || /^tok_[A-Za-z0-9_-]{16,128}$/.test(token);
export async function getTenorYieldCurve(poolId: string, customerToken?: string, signal?: AbortSignal): Promise<TenorYieldCurve> {
  const query = customerToken ? `?${new URLSearchParams({ customerToken })}` : '';
  const response = await fetch(`/api/core/reporting/tenor-curves/${encodeURIComponent(poolId)}${query}`, { signal });
  return responsePayload<TenorYieldCurve>(response);
}
