import { afterEach, describe, expect, it, vi } from 'vitest';
import { solveQuotation, validQuotation } from './quotation-api';
afterEach(() => vi.restoreAllMocks());
describe('quotation target', () => {
  it('requires positive amounts and a reference for scoped bases', () => { expect(validQuotation({ placementAmount: '1000000', targetNetRatePercent: '4.5', basis: { type: 'GLOBAL_POOL' } })).toBe(true); expect(validQuotation({ placementAmount: '1000000', targetNetRatePercent: '4.5', basis: { type: 'CUSTOMER' } })).toBe(false); });
  it('sends the simulation as an idempotent command', async () => { const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ verdict: 'APPROVABLE' }))); await solveQuotation({ placementAmount: '10', targetNetRatePercent: '2', basis: { type: 'SECTOR', reference: 'SME' } }); expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/core/simulations'); expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/); });
});
