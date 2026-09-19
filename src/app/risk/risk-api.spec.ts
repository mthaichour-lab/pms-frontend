import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateDcr, dcrFieldValidity, getPublishedRiskDashboard, runStress, stressFieldValidity, validDcrCommand, validRiskPoolId, validStressCommand, type DcrCalculationCommand, type DcrCalculationResult, type StressScenarioCommand } from './risk-api';
import { calculateDcrForConsole, RiskConsole, RiskDcrOperation } from './risk-console';
import { StressConsole } from './stress-console';
import { PublishedRiskDashboardConsole } from './published-risk-dashboard';
const valid: DcrCalculationCommand = { poolId: 'pool-1', businessDate: '2026-09-08', currency: 'DZD', capitalDurationAmount: '120', riskWeightedDurationAmount: '100', threshold: '1', formulaVersion: 'DCR-1.0', inputChecksumSha256: 'a'.repeat(64) };
afterEach(() => vi.restoreAllMocks());
describe('DCR controls', () => {
  it('cancels stale console DCR work and validates the runtime response', async () => {
    const controller = new AbortController(); const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ dcrCalculationId: 'dcr-1', value: '1.2', threshold: '1', state: 'COMPLETED' })));
    await expect(calculateDcrForConsole(valid, controller.signal)).resolves.toMatchObject({ dcrCalculationId: 'dcr-1' });
    const init = fetchMock.mock.calls[0]?.[1]; const headers = new Headers(init?.headers); expect(init?.signal).toBe(controller.signal); expect(headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/); expect(headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ state: 'COMPLETED' })));
    await expect(calculateDcrForConsole(valid, controller.signal)).rejects.toThrow('Réponse DCR invalide.');
    const manager = new RiskDcrOperation(); let resolvePending!: (value: DcrCalculationResult) => void; const pending = new Promise<DcrCalculationResult>((resolve) => { resolvePending = resolve; }); const success = vi.fn(); let signal: AbortSignal | undefined; const run = manager.run((current) => { signal = current; return pending; }, { loading: () => undefined, success, failure: () => undefined, settled: () => undefined }); manager.cancel(); resolvePending({ dcrCalculationId: 'stale', value: '0', threshold: '1', state: 'COMPLETED' }); await run; expect(signal?.aborted).toBe(true); expect(success).not.toHaveBeenCalled();
  });
  it('loads only a valid pool dashboard with cancellation support', async () => { expect(validRiskPoolId('POOL_001')).toBe(true); expect(validRiskPoolId('bad/pool')).toBe(false); const controller=new AbortController();const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ source: 'LATEST_PUBLISHED_RUN', dataQualityWarnings: [] }))); await getPublishedRiskDashboard('POOL_001',controller.signal); expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/core/risk/dashboard/POOL_001');expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({signal:controller.signal})); });
  it('validates auditable inputs', () => { expect(validDcrCommand(valid)).toBe(true); expect(validDcrCommand({ ...valid, inputChecksumSha256: 'invalid' })).toBe(false); expect(validDcrCommand({ ...valid, businessDate: '2026-02-31' })).toBe(false); expect(validDcrCommand({ ...valid, riskWeightedDurationAmount: '0' })).toBe(false); expect(validDcrCommand({ ...valid, threshold: '1.1234567' })).toBe(false); });
  it('identifies the exact invalid DCR fields for accessible feedback', () => {
    const validity = dcrFieldValidity({ ...valid, businessDate: '2026-02-31', capitalDurationAmount: '-1', inputChecksumSha256: 'invalid' });
    expect(validity.businessDate).toBe(false);
    expect(validity.capitalDurationAmount).toBe(false);
    expect(validity.inputChecksumSha256).toBe(false);
    expect(validity.poolId).toBe(true);
  });
  it('sends an idempotent calculation command', async () => { const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ state: 'COMPLETED' }))); await calculateDcr(valid); const [, init] = fetchMock.mock.calls[0]!; expect(new Headers(init?.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/); });
  it('surfaces a correlated DCR failure',async()=>{vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({detail:'DCR refusé',correlationId:'corr-dcr'}),{status:409}));await expect(calculateDcr(valid)).rejects.toThrow('DCR refusé (référence : corr-dcr)')});
  it('surfaces a correlated dashboard failure', async () => { vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({detail:'Run publié absent',correlationId:'corr-risk'}),{status:404}));await expect(getPublishedRiskDashboard('POOL_001')).rejects.toThrow('Run publié absent (référence : corr-risk)'); });
});
describe('stress scenario controls', () => {
  const stress: StressScenarioCommand = { scenarioCode: 'LIQUIDITY_STRESS', businessDate: '2026-09-08', currency: 'DZD', baseAmount: '1000', shocks: [{ bucket: 'LIQUIDITY', basisPoints: -200 }], engineVersion: 'STRESS-1.0', inputChecksumSha256: 'c'.repeat(64) };
  it('validates a reproducible scenario', () => { expect(validStressCommand(stress)).toBe(true); expect(validStressCommand({ ...stress, shocks: [] })).toBe(false); expect(validStressCommand({ ...stress, baseAmount: '-1' })).toBe(false); expect(validStressCommand({ ...stress, shocks: [{bucket:'LIQUIDITY',basisPoints:10001}] })).toBe(false); expect(validStressCommand({ ...stress, businessDate:'2026-13-01' })).toBe(false); });
  it('accepts a zero base amount and identifies individual stress field errors', () => {
    expect(validStressCommand({ ...stress, baseAmount: '0' })).toBe(true);
    const validity = stressFieldValidity({ ...stress, currency: 'dz', shocks: [{ bucket: 'bad bucket', basisPoints: 10001 }] });
    expect(validity.currency).toBe(false);
    expect(validity.bucket).toBe(false);
    expect(validity.basisPoints).toBe(false);
    expect(validity.baseAmount).toBe(true);
  });
  it('sends an idempotent stress command', async () => { const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ stressScenarioId: 'stress-1', state: 'COMPLETED', results: [] }))); await runStress(stress); const [, init] = fetchMock.mock.calls[0]!; expect(new Headers(init?.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/); });
});

describe('risk consoles',()=>{
  it.each([RiskConsole,StressConsole,PublishedRiskDashboardConsole])('renders an accessible command state for %s',(Component)=>{const html=renderToStaticMarkup(createElement(Component));expect(html).toContain('aria-busy="false"');expect(html).toContain('<form');expect(html).toContain('required=""');expect(html).toContain('aria-invalid="false"');expect(html).toContain('aria-describedby=');});
  it('describes the stress amount as non-negative',()=>{const html=renderToStaticMarkup(createElement(StressConsole));expect(html).toContain('Montant décimal positif ou nul.');expect(html).toContain('id="stress-amount-hint"');});
});
