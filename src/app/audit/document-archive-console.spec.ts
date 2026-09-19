import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ArchiveError, ArchiveOperationManager } from './document-archive-console';

const noop = () => undefined;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

describe('document archive interactions', () => {
  it('prevents a double submission while the first request is pending', async () => {
    const pending = deferred<string>();
    let requests = 0;
    const manager = new ArchiveOperationManager();
    const callbacks = { loading: noop, success: noop, failure: noop, settled: noop };
    const first = manager.run(() => { requests += 1; return pending.promise; }, callbacks);
    const duplicateAccepted = await manager.run(async () => { requests += 1; return 'duplicate'; }, callbacks);

    expect(duplicateAccepted).toBe(false);
    expect(requests).toBe(1);
    pending.resolve('queued');
    await first;
  });

  it('prevents a double refresh while the first status request is pending', async () => {
    const pending = deferred<string>();
    let requests = 0;
    const manager = new ArchiveOperationManager();
    const callbacks = { loading: noop, success: noop, failure: noop, settled: noop };
    const first = manager.run(() => { requests += 1; return pending.promise; }, callbacks);
    const duplicateAccepted = await manager.run(async () => { requests += 1; return 'ARCHIVED'; }, callbacks);

    expect(duplicateAccepted).toBe(false);
    expect(requests).toBe(1);
    pending.resolve('QUEUED');
    await first;
  });

  it('ignores a stale response after the operation is invalidated', async () => {
    const stale = deferred<string>();
    const current = deferred<string>();
    const manager = new ArchiveOperationManager();
    const successes: string[] = [];
    let settled = 0;
    const callbacks = { loading: noop, success: (value: string) => successes.push(value), failure: noop, settled: () => { settled += 1; } };

    const staleRun = manager.run(() => stale.promise, callbacks);
    manager.cancel();
    const currentRun = manager.run(() => current.promise, callbacks);
    current.resolve('ARCHIVED');
    await currentRun;
    stale.resolve('QUEUED');
    await staleRun;

    expect(successes).toEqual(['ARCHIVED']);
    expect(settled).toBe(1);
  });

  it('reports only the current operation failure', async () => {
    const manager = new ArchiveOperationManager();
    const failures: string[] = [];
    let settled = 0;
    await manager.run(async () => { throw new Error('Paperless indisponible'); }, { loading: noop, success: noop, failure: (message) => failures.push(message), settled: () => { settled += 1; } });
    expect(failures).toEqual(['Paperless indisponible']);
    expect(settled).toBe(1);
  });

  it('aborts an active archive request and suppresses late callbacks', async () => {
    const pending = deferred<string>();
    const manager = new ArchiveOperationManager();
    let signal: AbortSignal | undefined;
    const success = vi.fn();
    const running = manager.run((received) => { signal = received; return pending.promise; }, { loading: noop, success, failure: noop, settled: noop });
    manager.cancel();
    expect(signal?.aborted).toBe(true);
    pending.resolve('late');
    await running;
    expect(success).not.toHaveBeenCalled();
  });

  it('renders errors as an assertive accessible alert', () => {
    const html = renderToStaticMarkup(createElement(ArchiveError, { message: 'Archivage refusé' }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain('Archivage refusé');
  });
});
