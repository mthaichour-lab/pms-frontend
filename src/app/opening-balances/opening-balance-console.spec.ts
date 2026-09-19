import { describe, expect, it, vi } from 'vitest';
import { OpeningBalanceSubmitCoordinator } from './opening-balance-console';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe('opening balance submit coordinator', () => {
  it('aborts and suppresses callbacks after unmount', async () => {
    const coordinator = new OpeningBalanceSubmitCoordinator();
    const pending = deferred<void>();
    const callbacks = { loading: vi.fn(), success: vi.fn(), failure: vi.fn(), settled: vi.fn() };
    let signal!: AbortSignal;
    coordinator.mount();
    const submission = coordinator.run((requestSignal) => {
      signal = requestSignal;
      return pending.promise;
    }, callbacks);

    coordinator.unmount();
    pending.resolve();
    await submission;

    expect(signal.aborted).toBe(true);
    expect(callbacks.loading).toHaveBeenCalledOnce();
    expect(callbacks.success).not.toHaveBeenCalled();
    expect(callbacks.failure).not.toHaveBeenCalled();
    expect(callbacks.settled).not.toHaveBeenCalled();
  });

  it('keeps only one in-flight certification', async () => {
    const coordinator = new OpeningBalanceSubmitCoordinator();
    const pending = deferred<void>();
    const work = vi.fn(() => pending.promise);
    const callbacks = { loading: vi.fn(), success: vi.fn(), failure: vi.fn(), settled: vi.fn() };
    coordinator.mount();

    const first = coordinator.run(work, callbacks);
    await coordinator.run(work, callbacks);
    pending.resolve();
    await first;

    expect(work).toHaveBeenCalledOnce();
    expect(callbacks.success).toHaveBeenCalledOnce();
    expect(callbacks.settled).toHaveBeenCalledOnce();
  });
});
