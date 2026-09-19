import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExport, getAuditTrail, validateAuditTrailFilters } from './audit-api';
import { ExportOperationManager } from './audit-console';

afterEach(() => vi.restoreAllMocks());

describe('secure exports', () => {
  it('sends an idempotent request', async () => {
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ exportId: 'x', status: 'APPROVED' })));
    await createExport({ reportType: 'AUDIT_TRAIL', format: 'CSV', scope: 'SINGLE' });
    expect(new Headers(mock.mock.calls[0]![1]?.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('audit trail', () => {
  it('loads the requested hash-chain segment through the scoped BFF route', async () => {
    const trail = { events: [], integrity: 'HASH_CHAIN', chainValid: true, verifiedCount: 0 };
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(trail)));

    await expect(getAuditTrail(100)).resolves.toEqual(trail);
    expect(mock).toHaveBeenCalledWith('/api/core/audit/events?limit=100', expect.objectContaining({ method: 'GET' }));
  });

  it('serializes every supported audit filter', async () => {
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ events: [], integrity: 'HASH_CHAIN', chainValid: true, verifiedCount: 0 })));
    await getAuditTrail(25, { action: 'APPROVE_CALCULATION', resourceType: 'CalculationRun', outcome: 'DENIED', auditCorrelationId: '65aeb69d-73a7-4f04-9578-5fa8326f654f', businessDateFrom: '2026-09-01', businessDateTo: '2026-09-09' });
    expect(mock.mock.calls[0]?.[0]).toBe('/api/core/audit/events?limit=25&action=APPROVE_CALCULATION&resourceType=CalculationRun&outcome=DENIED&auditCorrelationId=65aeb69d-73a7-4f04-9578-5fa8326f654f&businessDateFrom=2026-09-01&businessDateTo=2026-09-09');
  });

  it('validates filter formats and date ordering', () => {
    expect(validateAuditTrailFilters({ action: 'APPROVE_CALCULATION', resourceType: 'CalculationRun' })).toBeUndefined();
    expect(validateAuditTrailFilters({ action: 'invalid action' })).toContain('action');
    expect(validateAuditTrailFilters({ auditCorrelationId: 'not-an-id' })).toContain('UUID');
    expect(validateAuditTrailFilters({ businessDateFrom: '2026-09-10', businessDateTo: '2026-09-01' })).toContain('date de début');
  });

  it('surfaces the API problem detail', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: 'Accès au journal refusé' }), { status: 403 }));
    await expect(getAuditTrail()).rejects.toThrow('Accès au journal refusé');
  });
});

describe('secure export console operations', () => {
  it('aborts on unmount and suppresses stale callbacks', async () => {
    let signal!: AbortSignal;
    let resolve!: (value: string) => void;
    const pending = new Promise<string>((done) => { resolve = done; });
    const manager = new ExportOperationManager();
    const callbacks = { loading: vi.fn(), success: vi.fn(), failure: vi.fn(), settled: vi.fn() };
    const operation = manager.run((requestSignal) => { signal = requestSignal; return pending; }, callbacks);
    manager.unmount();
    resolve('export');
    await operation;
    expect(signal.aborted).toBe(true);
    expect(callbacks.loading).toHaveBeenCalledOnce();
    expect(callbacks.success).not.toHaveBeenCalled();
    expect(callbacks.failure).not.toHaveBeenCalled();
    expect(callbacks.settled).not.toHaveBeenCalled();
  });

  it('allows a remounted manager to run a fresh operation', async () => {
    const manager = new ExportOperationManager();
    const callbacks = { loading: vi.fn(), success: vi.fn(), failure: vi.fn(), settled: vi.fn() };
    manager.unmount();
    manager.mount();
    await expect(manager.run(async () => 'export', callbacks)).resolves.toBe(true);
    expect(callbacks.success).toHaveBeenCalledWith('export');
    expect(callbacks.settled).toHaveBeenCalledOnce();
  });
});
