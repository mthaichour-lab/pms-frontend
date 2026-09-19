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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(command.referenceId.trim())) return 'L’identifiant de référence doit être un UUID valide.';
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

export const validProductId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const validProductJustification = (value: string) => value.trim().length >= 10 && value.length <= 1000;
export const validProductCode = (value: string) => /^[A-Z0-9_-]{2,32}$/.test(value);
export const validProductName = (value: string) => value.trim().length >= 3 && value.trim().length <= 160;

const percentageMillionths = (value: string): bigint | undefined => {
  if (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/.test(value)) return undefined;
  const [whole = '', fraction = ''] = value.split('.');
  const result = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  return result <= 100_000_000n ? result : undefined;
};

export function isExactNisba(investor: string, bank: string): boolean {
  const investorValue = percentageMillionths(investor);
  const bankValue = percentageMillionths(bank);
  return investorValue !== undefined && bankValue !== undefined && investorValue + bankValue === 100_000_000n;
}
