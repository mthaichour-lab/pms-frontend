export interface ProductOperationCallbacks<TResult> {
  loading(): void;
  success(result: TResult): void;
  failure(message: string): void;
  settled(): void;
}

const message = (cause: unknown) => cause instanceof Error ? cause.message : 'Une erreur inattendue est survenue.';

export class LatestProductRead {
  private active?: AbortController;

  async run<TResult>(operation: (signal: AbortSignal) => Promise<TResult>, callbacks: ProductOperationCallbacks<TResult>): Promise<void> {
    const controller = new AbortController();
    this.active?.abort();
    this.active = controller;
    callbacks.loading();
    try {
      const result = await operation(controller.signal);
      if (this.active === controller && !controller.signal.aborted) callbacks.success(result);
    } catch (cause) {
      if (this.active === controller && !controller.signal.aborted) callbacks.failure(message(cause));
    } finally {
      if (this.active === controller && !controller.signal.aborted) {
        this.active = undefined;
        callbacks.settled();
      }
    }
  }

  cancel(): void {
    this.active?.abort();
    this.active = undefined;
  }
}

export class ExclusiveProductOperation {
  private active?: { readonly token: symbol; readonly controller: AbortController };

  isActive(): boolean { return this.active !== undefined; }

  async run<TResult>(operation: (signal: AbortSignal) => Promise<TResult>, callbacks: ProductOperationCallbacks<TResult>): Promise<boolean> {
    if (this.active) return false;
    const current = { token: Symbol('product-operation'), controller: new AbortController() };
    this.active = current;
    callbacks.loading();
    try {
      const result = await operation(current.controller.signal);
      if (this.active === current && !current.controller.signal.aborted) callbacks.success(result);
    } catch (cause) {
      if (this.active === current && !current.controller.signal.aborted) callbacks.failure(message(cause));
    } finally {
      if (this.active === current && !current.controller.signal.aborted) {
        this.active = undefined;
        callbacks.settled();
      }
    }
    return true;
  }

  cancel(): void {
    this.active?.controller.abort();
    this.active = undefined;
  }
}
