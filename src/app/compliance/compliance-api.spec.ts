import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { arbitrate, exactComplianceDate, getRule, referenceFieldErrors, validArbitration, validReference } from './compliance-api';
import { ComplianceConsole, ComplianceOperationCoordinator, productIdError, ruleQueryFieldErrors } from './compliance-console';

afterEach(() => vi.restoreAllMocks());

const selected = '123e4567-e89b-42d3-a456-426614174000';
const rejected = '223e4567-e89b-42d3-a456-426614174000';

describe('compliance governance', () => {
  it('validates real calendar dates, references and distinct arbitration choices', () => {
    const reference = { source: 'BA', referenceCode: 'BA-2026/01', version: '1', title: 'Instruction participative', effectiveFrom: '2026-01-01' } as const;
    expect(validReference(reference)).toBe(true);
    expect(exactComplianceDate('2026-02-30')).toBe(false);
    expect(referenceFieldErrors({ ...reference, effectiveFrom: '2026-02-30' }).effectiveFrom).toBeDefined();
    expect(validArbitration({ selectedReferenceId: selected, rejectedReferenceId: rejected, rationale: 'Priorité réglementaire suffisamment documentée' })).toBe(true);
    expect(validArbitration({ selectedReferenceId: selected, rejectedReferenceId: selected, rationale: 'Priorité réglementaire suffisamment documentée' })).toBe(false);
    expect(productIdError('invalid')).toContain('UUID');
    expect(ruleQueryFieldErrors({ ruleCode: 'BA_RATE', businessDate: '2026-09-14' })).toEqual({});
  });

  it('uses encoded rule lookup, idempotent arbitration and correlated errors', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Arbitrage refusé' }), { status: 409, headers: { 'x-correlation-id': 'corr-42' } }));
    await getRule('RATE/LIMIT', '2026-09-14');
    await arbitrate('product/1', { selectedReferenceId: selected, rejectedReferenceId: rejected, rationale: 'Décision suffisamment documentée' });
    await expect(arbitrate('product/1', { selectedReferenceId: selected, rejectedReferenceId: rejected, rationale: 'Décision suffisamment documentée' })).rejects.toThrow('corr-42');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('RATE%2FLIMIT?businessDate=2026-09-14');
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('renders semantic required fields and accessible live feedback', () => {
    const html = renderToStaticMarkup(createElement(ComplianceConsole));
    expect(html).toContain('required=""');
    expect(html).toContain('aria-invalid="false"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('<form');
  });

  it('blocks concurrent operations and ignores stale or unmounted callbacks', async () => {
    const coordinator = new ComplianceOperationCoordinator();
    let resolve!: (value: string) => void;
    const work = new Promise<string>((done) => { resolve = done; });
    const success = vi.fn(), failure = vi.fn(), settled = vi.fn(), loading = vi.fn();
    const first = coordinator.run(() => work, { loading, success, failure, settled });
    await expect(coordinator.run(async () => 'duplicate', { loading, success, failure, settled })).resolves.toBe(false);
    coordinator.invalidate();
    resolve('late');
    await first;
    expect(success).not.toHaveBeenCalled();
    expect(settled).toHaveBeenCalledOnce();

    coordinator.unmount();
    await coordinator.run(async () => 'after-unmount', { loading, success, failure, settled });
    expect(success).not.toHaveBeenCalled();
  });

  it('provides an abort signal and aborts it on invalidation', async () => {
    const coordinator = new ComplianceOperationCoordinator();
    let resolve!: (value: string) => void;
    const pending = new Promise<string>((done) => { resolve = done; });
    let signal: AbortSignal | undefined;
    const running = coordinator.run((received) => { signal = received; return pending; }, { loading: () => undefined, success: () => undefined, failure: () => undefined, settled: () => undefined });
    coordinator.invalidate();
    expect(signal?.aborted).toBe(true);
    resolve('late');
    await running;
  });
});
