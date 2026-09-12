import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAllocationHistory, getAssetAnomalies, poolRequest, transitionPool, validAllocation } from './allocation-api';
afterEach(() => vi.restoreAllMocks());
describe('allocation rules', () => {
  it('accepts a complete allocation within capacity bounds', () => { expect(validAllocation({ assetId: 'asset-1', percentage: '75', effectiveFrom: '2026-09-08', justification: 'Mandat confirmé' })).toBe(true); });
  it('rejects invalid percentages and short evidence', () => { expect(validAllocation({ assetId: 'asset-1', percentage: '101', effectiveFrom: '2026-09-08', justification: 'court' })).toBe(false); });
});

describe('asset quality', () => {
  it('loads anomalies through the BFF', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'));
    await getAssetAnomalies('asset/1');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/core/investment-pools/assets/asset%2F1/anomalies');
  });
});

describe('allocation history', () => {
  it('encodes the asset and as-of date', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'));
    await getAllocationHistory('asset/1', '2026-09-08');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/core/investment-pools/assets/asset%2F1/allocations?asOf=2026-09-08');
  });
});
describe('poolRequest', () => {
  it('adds command idempotency headers', async () => { const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ allocationId: 'allocation-1' }))); await poolRequest('pool-1', '/allocations/simulate', { assetId: 'asset-1' }); const [, init] = fetchMock.mock.calls[0]!; expect(new Headers(init?.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/); });
  it('routes pool lifecycle actions as idempotent commands', async () => { const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'ACTIVE' }))); await transitionPool('POOL_DZD', 'activate'); expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/core/investment-pools/POOL_DZD/activate'); expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('idempotency-key')).toBeTruthy(); });
});
