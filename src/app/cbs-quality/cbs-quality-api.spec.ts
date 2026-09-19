import { afterEach, describe, expect, it, vi } from 'vitest';
import { CbsQualityRequestError, cbsQualityFilterErrors, isCbsDataQualityBatch, isExactBusinessDate, loadCbsQuality, qualitySummary } from './cbs-quality-api';

afterEach(() => vi.restoreAllMocks());

const batch = {
  batchId: 'batch-1', sourceCode: 'CBS', businessDate: '2026-08-29', flowType: 'POSITIONS', sequenceNumber: 1,
  state: 'REJECTED', manifestRowCount: 8, manifestBalanceTotal: '1200.50', errorCount: 3, warningCount: 1,
  lastControlAt: '2026-08-29T10:30:00Z',
} as const;

describe('CBS quality API', () => {
  it('encodes filters and propagates cancellation and correlation', async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([batch])));
    await expect(loadCbsQuality({ businessDate: '2026-08-29', state: 'REJECTED' }, { signal: controller.signal, correlationId: 'corr-cbs-1' })).resolves.toEqual([batch]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/core/cbs/data-quality/batches?limit=100&offset=0&businessDate=2026-08-29&state=REJECTED');
    expect(init?.signal).toBe(controller.signal);
    expect(new Headers(init?.headers).get('x-correlation-id')).toBe('corr-cbs-1');
    expect(new Headers(init?.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects malformed successful payloads with a traceable reference', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{ ...batch, errorCount: -1 }]), { headers: { 'x-correlation-id': 'corr-response' } }));
    const error = await loadCbsQuality({}, { correlationId: 'corr-request' }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(CbsQualityRequestError);
    expect(error).toMatchObject({ status: 200, correlationId: 'corr-response' });
    expect((error as Error).message).toContain('Réponse de qualité CBS invalide');
  });

  it('surfaces problem detail and prefers body then response correlation', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Lot inaccessible', correlationId: 'corr-body' }), { status: 403, headers: { 'x-correlation-id': 'corr-header' } }))
      .mockResolvedValueOnce(new Response(null, { status: 503, headers: { 'x-correlation-id': 'corr-header' } }));
    await expect(loadCbsQuality({}, { correlationId: 'corr-request' })).rejects.toThrow('Lot inaccessible (référence : corr-body)');
    await expect(loadCbsQuality({}, { correlationId: 'corr-request' })).rejects.toThrow('Erreur HTTP 503 (référence : corr-header)');
  });

  it('validates the complete runtime contract and real calendar dates', () => {
    expect(isCbsDataQualityBatch(batch)).toBe(true);
    expect(isCbsDataQualityBatch({ ...batch, businessDate: '2026-02-30' })).toBe(false);
    expect(isCbsDataQualityBatch({ ...batch, lastControlAt: 'not-a-date' })).toBe(false);
    expect(isCbsDataQualityBatch({ ...batch, state: 'UNKNOWN' })).toBe(false);
    expect(isExactBusinessDate('2024-02-29')).toBe(true);
    expect(isExactBusinessDate('2026-02-29')).toBe(false);
    expect(cbsQualityFilterErrors({ businessDate: '2026-02-30', state: 'UNKNOWN' })).toEqual({ businessDate: 'Saisissez une date métier valide.', state: 'Sélectionnez un état reconnu.' });
  });

  it('rejects an invalid filter before making a request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(loadCbsQuality({ businessDate: '2026-02-30' })).rejects.toBeInstanceOf(CbsQualityRequestError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aggregates operational quality indicators', () => {
    expect(qualitySummary([batch, { ...batch, batchId: 'batch-2', state: 'VALIDATED', errorCount: 0, warningCount: 2 }])).toEqual({ batches: 2, rejected: 1, errors: 3, warnings: 3 });
  });
});
