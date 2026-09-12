export interface OperationCallbacks<TResult> { loading(): void; success(result: TResult): void; failure(message: string): void; settled(): void; }
const errorMessage = (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback;
export class ExclusiveRiskOperation {
  private active?: symbol;
  async run<TResult>(operation: () => Promise<TResult>, callbacks: OperationCallbacks<TResult>, fallback: string): Promise<boolean> {
    if (this.active) return false;
    const token = Symbol('risk-command'); this.active = token; callbacks.loading();
    try { const result = await operation(); if (this.active === token) callbacks.success(result); }
    catch (cause) { if (this.active === token) callbacks.failure(errorMessage(cause, fallback)); }
    finally { if (this.active === token) { this.active = undefined; callbacks.settled(); } }
    return true;
  }
  cancel() { this.active = undefined; }
}
export class LatestRiskRead {
  private active?: AbortController;
  async run<TResult>(operation: (signal: AbortSignal) => Promise<TResult>, callbacks: OperationCallbacks<TResult>, fallback: string) {
    const controller = new AbortController(); this.active?.abort(); this.active = controller; callbacks.loading();
    try { const result = await operation(controller.signal); if (this.active === controller && !controller.signal.aborted) callbacks.success(result); }
    catch (cause) { if (this.active === controller && !controller.signal.aborted) callbacks.failure(errorMessage(cause, fallback)); }
    finally { if (this.active === controller && !controller.signal.aborted) { this.active = undefined; callbacks.settled(); } }
  }
  cancel() { this.active?.abort(); this.active = undefined; }
}
