import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluateCharges, importIncome, listIncome, validAdjustment, validIncome } from './revenue-api';
afterEach(() => vi.restoreAllMocks());
const income = { incomeId: '11111111-1111-4111-8111-111111111111', sourceSystem: 'CBS', sourceReference: 'REV-1', assetId: '22222222-2222-4222-8222-222222222222', poolId: 'POOL-1', businessDate: '2026-09-08', currency: 'DZD', amount: '1250.50', cashStatus: 'RECEIVED', realizationStatus: 'REALIZED', incomeType: 'MURABAHA' } as const;
describe('revenue operations', () => {
  it('validates income and adjustments', () => { expect(validIncome(income)).toBe(true); expect(validIncome({ ...income, amount: '0' })).toBe(false); expect(validAdjustment({ adjustmentId: crypto.randomUUID(), incomeId: income.incomeId, amount: '-10', reason: 'Correction approuvée', approvalId: 'APPROVAL-00000001', businessDate: income.businessDate, actorId: 'controller' })).toBe(true); });
  it('encodes query criteria', async () => { const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]')); await listIncome('POOL/1', income.businessDate); await evaluateCharges('POOL/1', income.businessDate); expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/core/revenues?poolId=POOL%2F1&businessDate=2026-09-08'); expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/core/charges/evaluation?poolId=POOL%2F1&businessDate=2026-09-08'); });
  it('adds idempotency to imports', async () => { const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(income))); await importIncome(income); expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/); });
});
