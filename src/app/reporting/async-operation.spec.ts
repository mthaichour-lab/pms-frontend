import { describe, expect, it } from 'vitest';
import { ExclusiveOperationManager, LatestOperationManager } from './async-operation';

const noop = () => undefined;
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }

describe('reporting command coordination', () => {
  it('prevents duplicate POST commands until the current command settles', async () => {
    const pending = deferred<string>();
    let requests = 0;
    const manager = new ExclusiveOperationManager();
    const callbacks = { loading: noop, success: noop, failure: noop, settled: noop };
    const first = manager.run(() => { requests += 1; return pending.promise; }, callbacks);
    expect(await manager.run(async () => { requests += 1; return 'duplicate'; }, callbacks)).toBe(false);
    expect(requests).toBe(1);
    pending.resolve('created');
    await first;
  });

  it('ignores a command response invalidated on unmount', async () => {
    const pending = deferred<string>();
    const values: string[] = [];
    let signal: AbortSignal | undefined;
    const manager = new ExclusiveOperationManager();
    const run = manager.run((currentSignal) => { signal = currentSignal; return pending.promise; }, { loading: noop, success: (value) => values.push(value), failure: noop, settled: noop });
    manager.cancel();
    expect(signal?.aborted).toBe(true);
    pending.resolve('obsolete');
    await run;
    expect(values).toEqual([]);
  });

  it('releases the exclusive slot after a command settles', async () => {
    const manager = new ExclusiveOperationManager();
    expect(manager.isActive()).toBe(false);
    await manager.run(async () => 'created', { loading: noop, success: noop, failure: noop, settled: noop });
    expect(manager.isActive()).toBe(false);
  });
});

describe('reporting read coordination', () => {
  it('aborts the previous read and ignores a late response', async () => {
    const first = deferred<string>(), second = deferred<string>();
    const signals: AbortSignal[] = [];
    const values: string[] = [];
    const manager = new LatestOperationManager();
    const callbacks = { loading: noop, success: (value: string) => values.push(value), failure: noop, settled: noop };
    const stale = manager.run((signal) => { signals.push(signal); return first.promise; }, callbacks);
    const current = manager.run((signal) => { signals.push(signal); return second.promise; }, callbacks);
    expect(signals[0]?.aborted).toBe(true);
    second.resolve('current');
    await current;
    first.resolve('stale');
    await stale;
    expect(values).toEqual(['current']);
  });
});
