import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reconcileForConsole, ReconciliationConsole, ReconciliationConsoleOperation } from './reconciliation-console';
import type { ReconciliationResult } from './reconciliation-api';

afterEach(() => vi.restoreAllMocks());
const valid = { businessDate: '2026-09-08', currency: 'DZD', generalLedgerAmount: '100', sourceReference: 'CBS-20260908', sourceChecksumSha256: 'a'.repeat(64) };
describe('reconciliation console boundary', () => {
  it('forwards abort/idempotency/correlation and guards success payloads', async () => {
    const controller = new AbortController(); const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ reconciliationId: 'rec-1', state: 'MATCHED', difference: '0' })));
    await expect(reconcileForConsole(valid, controller.signal)).resolves.toMatchObject({ reconciliationId: 'rec-1' }); const init = fetchMock.mock.calls[0]?.[1]; const headers = new Headers(init?.headers); expect(init?.signal).toBe(controller.signal); expect(headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/); expect(headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ state: 'MATCHED' }))); await expect(reconcileForConsole(valid, controller.signal)).rejects.toThrow('Réponse de rapprochement invalide.');
  });
  it('aborts stale work and exposes a busy accessible shell', async () => {
    let resolve!: (value: ReconciliationResult) => void; const pending = new Promise<ReconciliationResult>((done) => { resolve = done; }); const manager = new ReconciliationConsoleOperation(); let signal: AbortSignal | undefined; const success = vi.fn(); const run = manager.run((current) => { signal = current; return pending; }, { loading: () => undefined, success, failure: () => undefined, settled: () => undefined }); manager.cancel(); resolve({ reconciliationId: 'stale', state: 'MATCHED', difference: '0' }); await run; expect(signal?.aborted).toBe(true); expect(success).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(createElement(ReconciliationConsole))).toContain('aria-busy="false"');
  });
});
