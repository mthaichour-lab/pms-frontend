import type { CustomerProfile, LegalRestriction } from '@bank/pms-api-client';
export type { CustomerProfile, LegalRestriction };
async function request<T>(path: string, body?: unknown): Promise<T> { const response = await fetch(`/api/core/customers${path}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: body === undefined ? undefined : JSON.stringify(body) }); const payload: unknown = await response.json().catch(() => undefined); if (!response.ok) { const problem = (payload ?? {}) as { detail?: string; title?: string }; throw new Error(problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`); } return payload as T; }
export const getCustomer = (id: string) => request<CustomerProfile>(`/${encodeURIComponent(id)}`);
export const createCustomer = (profile: CustomerProfile) => request<CustomerProfile>('', profile);
export const restrictCustomer = (id: string, restriction: LegalRestriction) => request<{ restricted: true }>(`/${encodeURIComponent(id)}/restrictions`, restriction);
export const liftCustomerRestriction = (customerId: string, restrictionId: string, liftedAt: string) => request<CustomerProfile>(`/${encodeURIComponent(customerId)}/restrictions/${encodeURIComponent(restrictionId)}/lift`, { liftedAt });
