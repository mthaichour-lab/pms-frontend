import { describe, expect, it } from 'vitest';
import { ExclusiveOperationManager, LatestOperationManager } from './async-operation';

const noop = () => undefined;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe('allocation operation coordination', () => {
  it('prevents double submission and aborts a command on cancel', async () => { const pending = deferred<string>(); let calls = 0, signal: AbortSignal | undefined; const manager = new ExclusiveOperationManager(); const callbacks = { loading: noop, success: noop, failure: noop, settled: noop }; const first = manager.run((current) => { signal = current; calls += 1; return pending.promise; }, callbacks); expect(await manager.run(async () => { calls += 1; return 'duplicate'; }, callbacks)).toBe(false); manager.cancel(); expect(signal?.aborted).toBe(true); pending.resolve('obsolete'); await first; expect(calls).toBe(1); });
  it('aborts the previous read and ignores its late result', async () => { const first = deferred<string>(), second = deferred<string>(), values: string[] = [], signals: AbortSignal[] = []; const manager = new LatestOperationManager(); const callbacks = { loading: noop, success: (value: string) => values.push(value), failure: noop, settled: noop }; const stale = manager.run((signal) => { signals.push(signal); return first.promise; }, callbacks); const current = manager.run((signal) => { signals.push(signal); return second.promise; }, callbacks); expect(signals[0]?.aborted).toBe(true); second.resolve('current'); await current; first.resolve('stale'); await stale; expect(values).toEqual(['current']); });
});
