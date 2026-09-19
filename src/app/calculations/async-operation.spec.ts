import { describe, expect, it } from "vitest";
import { ExclusiveOperationManager, LatestOperationManager } from "./async-operation";

const noop = () => undefined;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

describe("latest calculation reads", () => {
  it("aborts the prior read and ignores its late response", async () => {
    const first = deferred<string>(), second = deferred<string>();
    const signals: AbortSignal[] = [];
    let call = 0;
    const manager = new LatestOperationManager();
    const values: string[] = [];
    let settled = 0;
    const callbacks = { loading: noop, success: (value: string) => values.push(value), failure: noop, settled: () => { settled += 1; } };

    const staleRun = manager.run((signal) => { signals.push(signal); call += 1; return call === 1 ? first.promise : second.promise; }, callbacks);
    const currentRun = manager.run((signal) => { signals.push(signal); return second.promise; }, callbacks);
    expect(signals[0]?.aborted).toBe(true);
    second.resolve("current");
    await currentRun;
    first.resolve("stale");
    await staleRun;

    expect(values).toEqual(["current"]);
    expect(settled).toBe(1);
  });

  it("reports a current read failure and releases busy state", async () => {
    const errors: string[] = [];
    let settled = 0;
    await new LatestOperationManager().run(async () => { throw new Error("Run introuvable"); }, { loading: noop, success: noop, failure: (message) => errors.push(message), settled: () => { settled += 1; } });
    expect(errors).toEqual(["Run introuvable"]);
    expect(settled).toBe(1);
  });
});

describe("exclusive calculation transitions", () => {
  it("keeps read and transition coordinators independent for parallel work", async () => {
    const read = new LatestOperationManager();
    const transition = new ExclusiveOperationManager();
    const readPending = deferred<string>();
    const transitionPending = deferred<string>();
    const values: string[] = [];
    const callbacks = { loading: noop, success: (value: string) => values.push(value), failure: noop, settled: noop };
    const readRun = read.run(() => readPending.promise, callbacks);
    const transitionRun = transition.run(() => transitionPending.promise, callbacks);
    expect(transition.isActive()).toBe(true);
    readPending.resolve("read-complete");
    transitionPending.resolve("transition-complete");
    await Promise.all([readRun, transitionRun]);
    expect(values).toEqual(["read-complete", "transition-complete"]);
  });

  it("prevents a duplicate Maker/Checker submission", async () => {
    const pending = deferred<string>();
    let requests = 0;
    const manager = new ExclusiveOperationManager();
    const callbacks = { loading: noop, success: noop, failure: noop, settled: noop };
    const first = manager.run(() => { requests += 1; return pending.promise; }, callbacks);
    expect(manager.isActive()).toBe(true);
    const duplicateAccepted = await manager.run(async () => { requests += 1; return "duplicate"; }, callbacks);
    expect(duplicateAccepted).toBe(false);
    expect(requests).toBe(1);
    pending.resolve("approved");
    await first;
    expect(manager.isActive()).toBe(false);
  });

  it("aborts an active transition and suppresses its late callbacks", async () => {
    const pending = deferred<string>();
    const manager = new ExclusiveOperationManager();
    const values: string[] = [];
    let settled = 0;
    let signal: AbortSignal | undefined;
    const operation = manager.run((operationSignal) => {
      signal = operationSignal;
      return pending.promise;
    }, {
      loading: noop,
      success: (value) => values.push(value),
      failure: noop,
      settled: () => { settled += 1; },
    });

    manager.cancel();
    expect(signal?.aborted).toBe(true);
    pending.resolve("stale");
    await operation;

    expect(values).toEqual([]);
    expect(settled).toBe(0);
    expect(manager.isActive()).toBe(false);
  });
});
