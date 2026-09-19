import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CbsQualityConsole, CbsQualityLoadCoordinator } from './cbs-quality-console';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const noop = () => undefined;

describe('CBS quality console', () => {
  it('renders controlled, labelled filters and accessible loading feedback', () => {
    const html = renderToStaticMarkup(createElement(CbsQualityConsole));
    expect(html).toContain('aria-label="Filtres de qualité CBS"');
    expect(html).toContain('for="cbs-business-date"');
    expect(html).toContain('aria-invalid="false"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
  });

  it('aborts the previous load and ignores its stale result and settlement', async () => {
    const coordinator = new CbsQualityLoadCoordinator();
    coordinator.mount();
    const first = deferred<string>(), second = deferred<string>();
    const success = vi.fn(), failure = vi.fn(), settled = vi.fn(), loading = vi.fn();
    const callbacks = { loading, success, failure, settled };
    let firstSignal: AbortSignal | undefined;
    const stale = coordinator.run((signal) => { firstSignal = signal; return first.promise; }, callbacks);
    const current = coordinator.run(() => second.promise, callbacks);
    expect(firstSignal?.aborted).toBe(true);
    second.resolve('current');
    await current;
    first.resolve('stale');
    await stale;
    expect(success).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledWith('current');
    expect(settled).toHaveBeenCalledOnce();
    expect(failure).not.toHaveBeenCalled();
  });

  it('suppresses abort failures and every callback after unmount', async () => {
    const coordinator = new CbsQualityLoadCoordinator();
    coordinator.mount();
    const pending = deferred<string>();
    const success = vi.fn(), failure = vi.fn(), settled = vi.fn();
    const running = coordinator.run(() => pending.promise, { loading: noop, success, failure, settled });
    coordinator.unmount();
    pending.reject(new DOMException('Aborted', 'AbortError'));
    await running;
    expect(success).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();
  });

  it('can mount and load again after a Strict Mode effect cleanup', async () => {
    const coordinator = new CbsQualityLoadCoordinator();
    const success = vi.fn();
    const callbacks = { loading: noop, success, failure: noop, settled: noop };
    coordinator.mount();
    coordinator.unmount();
    coordinator.mount();
    await coordinator.run(async () => 'remounted', callbacks);
    expect(success).toHaveBeenCalledWith('remounted');
  });
});
