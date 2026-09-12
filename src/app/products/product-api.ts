import type { InvestmentProduct, ProductTerms, ProductTermsSimulation } from '@bank/pms-api-client';

export type { InvestmentProduct, ProductTerms, ProductTermsSimulation };

export type ProductReferenceKind = 'CONTRACTUAL_DOCUMENT' | 'REGULATORY_DOCUMENT' | 'SHARIA_DOCUMENT' | 'ACCOUNTING_SCHEMA';
export type ComplianceReferenceSource = 'BA' | 'SHARIA_COMMITTEE' | 'AAOIFI' | 'IFSB';

export interface ProductReference {
  readonly referenceId: string;
  readonly source: ComplianceReferenceSource;
  readonly referenceCode: string;
  readonly version: string;
  readonly title: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly createdBy: string;
  readonly kind: ProductReferenceKind;
  readonly associatedAt: string;
}

export interface CreateProductReferenceCommand {
  readonly kind: ProductReferenceKind;
  readonly referenceId: string;
}

export function productReferencesRequest<T>(productId: string, path = '', init?: RequestInit): Promise<T> {
  return productRequest<T>(`/${encodeURIComponent(productId)}/references${path}`, init);
}

export function referenceValidationMessage(command: CreateProductReferenceCommand): string | undefined {
  if (!command.referenceId.trim()) return 'L’identifiant de référence est obligatoire.';
  return undefined;
}

export interface ApiProblem {
  readonly title?: string;
  readonly detail?: string;
  readonly status?: number;
  readonly correlationId?: string;
}

export async function productRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set('content-type', 'application/json');
  if (init?.method === 'POST') headers.set('idempotency-key', crypto.randomUUID());

  const response = await fetch(`/api/core/products${path}`, { ...init, headers });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const problem = (body ?? {}) as ApiProblem;
    const description = problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`;
    throw new Error(problem.correlationId ? `${description} (référence : ${problem.correlationId})` : description);
  }
  return body as T;
}

export function isExactNisba(investor: string, bank: string): boolean {
  const investorValue = Number(investor);
  const bankValue = Number(bank);
  return Number.isFinite(investorValue) && Number.isFinite(bankValue) &&
    investorValue >= 0 && bankValue >= 0 && Math.abs(investorValue + bankValue - 100) < 0.000001;
}
