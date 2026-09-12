export interface OperationCallbacks<TResult> {
  readonly loading: () => void;
  readonly success: (result: TResult) => void;
  readonly failure: (message: string) => void;
  readonly settled: () => void;
}

export class ReconciliationOperationManager {
  private active?: symbol;
  async run<TResult>(operation: () => Promise<TResult>, callbacks: OperationCallbacks<TResult>): Promise<boolean> {
    if (this.active) return false;
    const token = Symbol('reconciliation-command');
    this.active = token;
    callbacks.loading();
    try { const result = await operation(); if (this.active === token) callbacks.success(result); }
    catch (cause) { if (this.active === token) callbacks.failure(cause instanceof Error ? cause.message : 'Erreur inattendue.'); }
    finally { if (this.active === token) { this.active = undefined; callbacks.settled(); } }
    return true;
  }
  cancel(): void { this.active = undefined; }
}
