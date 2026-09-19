export interface OperationCallbacks<TResult> {
  readonly loading: () => void;
  readonly success: (result: TResult) => void;
  readonly failure: (message: string) => void;
  readonly settled: () => void;
}

const message = (cause: unknown) => cause instanceof Error ? cause.message : 'Erreur inattendue.';

export class ExclusiveOperationManager {
  private active?: { readonly token: symbol; readonly controller: AbortController };

  isActive(): boolean { return this.active !== undefined; }

  async run<TResult>(operation: (signal: AbortSignal) => Promise<TResult>, callbacks: OperationCallbacks<TResult>): Promise<boolean> {
    if (this.active) return false;
    const token = Symbol('reporting-command');
    const controller = new AbortController();
    this.active = { token, controller };
    callbacks.loading();
    try { const result = await operation(controller.signal); if (this.active?.token === token && !controller.signal.aborted) callbacks.success(result); }
    catch (cause) { if (this.active?.token === token && !controller.signal.aborted) callbacks.failure(message(cause)); }
    finally { if (this.active?.token === token && !controller.signal.aborted) { this.active = undefined; callbacks.settled(); } }
    return true;
  }
  cancel(): void { this.active?.controller.abort(); this.active = undefined; }
}

export class LatestOperationManager {
  private active?: AbortController;
  async run<TResult>(operation: (signal: AbortSignal) => Promise<TResult>, callbacks: OperationCallbacks<TResult>): Promise<void> {
    const controller = new AbortController();
    this.active?.abort();
    this.active = controller;
    callbacks.loading();
    try { const result = await operation(controller.signal); if (this.active === controller && !controller.signal.aborted) callbacks.success(result); }
    catch (cause) { if (this.active === controller && !controller.signal.aborted) callbacks.failure(message(cause)); }
    finally { if (this.active === controller && !controller.signal.aborted) { this.active = undefined; callbacks.settled(); } }
  }
  cancel(): void { this.active?.abort(); this.active = undefined; }
}
