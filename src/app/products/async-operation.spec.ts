import { describe, expect, it } from 'vitest';
import { ExclusiveProductOperation, LatestProductRead } from './async-operation';

const noop = () => undefined;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('product operations', () => {
  it('locks synchronously against duplicate commands', async () => {
    const pending = deferred<string>();
    const manager = new ExclusiveProductOperation();
    let calls = 0;
    const callbacks = { loading: noop, success: noop, failure: noop, settled: noop };
    const first = manager.run(() => { calls += 1; return pending.promise; }, callbacks);
    const duplicate = await manager.run(async () => { calls += 1; return 'duplicate'; }, callbacks);
    expect(duplicate).toBe(false);
    expect(calls).toBe(1);
    pending.resolve('created');
    await first;
    expect(manager.isActive()).toBe(false);
  });

  it('aborts an operation on unmount and suppresses its late result', async () => {
    const pending = deferred<string>();
    const manager = new ExclusiveProductOperation();
    const values: string[] = [];
    let signal: AbortSignal | undefined;
    const operation = manager.run((currentSignal) => { signal = currentSignal; return pending.promise; }, { loading: noop, success: (value) => values.push(value), failure: noop, settled: noop });
    manager.cancel();
    expect(signal?.aborted).toBe(true);
    pending.resolve('stale');
    await operation;
    expect(values).toEqual([]);
  });

  it('aborts a stale lookup and keeps only the latest product', async () => {
    const old = deferred<string>();
    const latest = deferred<string>();
    const manager = new LatestProductRead();
    const values: string[] = [];
    const signals: AbortSignal[] = [];
    const callbacks = { loading: noop, success: (value: string) => values.push(value), failure: noop, settled: noop };
    const staleRequest = manager.run((signal) => { signals.push(signal); return old.promise; }, callbacks);
    const latestRequest = manager.run((signal) => { signals.push(signal); return latest.promise; }, callbacks);
    expect(signals[0]?.aborted).toBe(true);
    latest.resolve('current-product');
    await latestRequest;
    old.resolve('old-product');
    await staleRequest;
    expect(values).toEqual(['current-product']);
  });
});
