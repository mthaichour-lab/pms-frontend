import { describe, expect, it } from 'vitest';
import { ReconciliationOperationManager } from './async-operation';

const noop = () => undefined;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((result) => { resolve = result; }); return { promise, resolve }; }

describe('reconciliation command coordination', () => {
  it('prevents duplicate submissions while a command is pending', async () => {
    const pending = deferred<string>();
    let requests = 0;
    const manager = new ReconciliationOperationManager();
    const callbacks = { loading: noop, success: noop, failure: noop, settled: noop };
    const first = manager.run(() => { requests += 1; return pending.promise; }, callbacks);
    expect(await manager.run(async () => { requests += 1; return 'duplicate'; }, callbacks)).toBe(false);
    expect(requests).toBe(1);
    pending.resolve('done');
    await first;
  });
  it('ignores a response invalidated on unmount', async () => {
    const pending = deferred<string>();
    const values: string[] = [];
    const manager = new ReconciliationOperationManager();
    const run = manager.run(() => pending.promise, { loading: noop, success: (value) => values.push(value), failure: noop, settled: noop });
    manager.cancel();
    pending.resolve('obsolete');
    await run;
    expect(values).toEqual([]);
  });
});
