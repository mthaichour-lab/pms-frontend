import type { DetokenizedValue, TokenOperationCommand, TokenSearchCommand, TokenizeBatchCommand, TokenizeCommand, TokenizedValue } from '@bank/pms-api-client';
export type { DetokenizedValue, TokenOperationCommand, TokenSearchCommand, TokenizeBatchCommand, TokenizeCommand, TokenizedValue };
export const validPurpose = (value: string) => value.trim().length >= 3;
export const validToken = (value: string) => /^tok_[A-Za-z0-9_-]{16,128}$/.test(value);
export const validDigest = (value: string) => /^[0-9a-f]{64}$/.test(value);
async function command<T>(operation: string, body: unknown): Promise<T> { const response = await fetch(`/api/core/tokenization/${operation}`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(body) }); const payload: unknown = await response.json().catch(() => undefined); if (!response.ok) { const problem = (payload ?? {}) as { detail?: string; title?: string }; throw new Error(problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`); } return payload as T; }
export const tokenize = (body: TokenizeCommand) => command<TokenizedValue>('tokenize', body);
export const tokenizeBatch = (body: TokenizeBatchCommand) => command<readonly TokenizedValue[]>('tokenize-batch', body);
export const detokenize = (body: TokenOperationCommand) => command<DetokenizedValue>('detokenize', body);
export const searchToken = (body: TokenSearchCommand) => command<TokenizedValue>('search', body);
export const rotateToken = (body: TokenOperationCommand) => command<TokenizedValue>('rotate', body);
