import { afterEach, describe, expect, it, vi } from 'vitest';
import { shariaRequest, shariaValidationMessage } from './sharia-api';
afterEach(() => vi.restoreAllMocks());
describe('Sharia workflow', () => {
  it('validates each independent step', () => { expect(shariaValidationMessage({ kind: 'submit', command: { resourceType: 'PRODUCT', resourceId: 'product-1' } })).toBeUndefined(); expect(shariaValidationMessage({ kind: 'review', reviewId: 'review-1', command: { opinion: 'court' } })).toContain('10 caractères'); });
  it('requires documentary evidence for a decision', () => { expect(shariaValidationMessage({ kind: 'decide', reviewId: 'review-1', command: { decision: 'APPROVED', justification: 'Décision conforme', evidenceDocumentId: 'invalid' } })).toContain('UUID'); });
  it('sends an idempotent workflow command', async () => { const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ reviewId: 'review-1', state: 'SUBMITTED' }))); await shariaRequest({ kind: 'submit', command: { resourceType: 'PRODUCT', resourceId: 'product-1' } }); const [, init] = fetchMock.mock.calls[0]!; expect(new Headers(init?.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/); });
});
