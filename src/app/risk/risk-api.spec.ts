import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateDcr, getPublishedRiskDashboard, runStress, validDcrCommand, validRiskPoolId, validStressCommand, type DcrCalculationCommand, type StressScenarioCommand } from './risk-api';
import { RiskConsole } from './risk-console';
import { StressConsole } from './stress-console';
import { PublishedRiskDashboardConsole } from './published-risk-dashboard';
const valid: DcrCalculationCommand = { poolId: 'pool-1', businessDate: '2026-09-08', currency: 'DZD', capitalDurationAmount: '120', riskWeightedDurationAmount: '100', threshold: '1', formulaVersion: 'DCR-1.0', inputChecksumSha256: 'a'.repeat(64) };
afterEach(() => vi.restoreAllMocks());
describe('DCR controls', () => {
  it('loads only a valid pool dashboard with cancellation support', async () => { expect(validRiskPoolId('POOL_001')).toBe(true); expect(validRiskPoolId('bad/pool')).toBe(false); const controller=new AbortController();const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ source: 'LATEST_PUBLISHED_RUN', dataQualityWarnings: [] }))); await getPublishedRiskDashboard('POOL_001',controller.signal); expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/core/risk/dashboard/POOL_001');expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({signal:controller.signal})); });
  it('validates auditable inputs', () => { expect(validDcrCommand(valid)).toBe(true); expect(validDcrCommand({ ...valid, inputChecksumSha256: 'invalid' })).toBe(false); expect(validDcrCommand({ ...valid, businessDate: '2026-02-31' })).toBe(false); expect(validDcrCommand({ ...valid, riskWeightedDurationAmount: '0' })).toBe(false); expect(validDcrCommand({ ...valid, threshold: '1.1234567' })).toBe(false); });
  it('sends an idempotent calculation command', async () => { const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ state: 'COMPLETED' }))); await calculateDcr(valid); const [, init] = fetchMock.mock.calls[0]!; expect(new Headers(init?.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/); });
  it('surfaces a correlated DCR failure',async()=>{vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({detail:'DCR refusé',correlationId:'corr-dcr'}),{status:409}));await expect(calculateDcr(valid)).rejects.toThrow('DCR refusé (référence : corr-dcr)')});
  it('surfaces a correlated dashboard failure', async () => { vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({detail:'Run publié absent',correlationId:'corr-risk'}),{status:404}));await expect(getPublishedRiskDashboard('POOL_001')).rejects.toThrow('Run publié absent (référence : corr-risk)'); });
});
describe('stress scenario controls', () => {
  const stress: StressScenarioCommand = { scenarioCode: 'LIQUIDITY_STRESS', businessDate: '2026-09-08', currency: 'DZD', baseAmount: '1000', shocks: [{ bucket: 'LIQUIDITY', basisPoints: -200 }], engineVersion: 'STRESS-1.0', inputChecksumSha256: 'c'.repeat(64) };
  it('validates a reproducible scenario', () => { expect(validStressCommand(stress)).toBe(true); expect(validStressCommand({ ...stress, shocks: [] })).toBe(false); expect(validStressCommand({ ...stress, baseAmount: '-1' })).toBe(false); expect(validStressCommand({ ...stress, shocks: [{bucket:'LIQUIDITY',basisPoints:10001}] })).toBe(false); expect(validStressCommand({ ...stress, businessDate:'2026-13-01' })).toBe(false); });
  it('sends an idempotent stress command', async () => { const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ stressScenarioId: 'stress-1', state: 'COMPLETED', results: [] }))); await runStress(stress); const [, init] = fetchMock.mock.calls[0]!; expect(new Headers(init?.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/); });
});

describe('risk consoles',()=>{
  it.each([RiskConsole,StressConsole,PublishedRiskDashboardConsole])('renders an accessible command state for %s',(Component)=>{const html=renderToStaticMarkup(createElement(Component));expect(html).toContain('aria-busy="false"');expect(html).toContain('<form');expect(html).toContain('required=""');});
});
