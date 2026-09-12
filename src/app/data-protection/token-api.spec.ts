import { afterEach, describe, expect, it, vi } from 'vitest';
import { detokenize, tokenize, validDigest, validPurpose, validToken } from './token-api';
afterEach(() => vi.restoreAllMocks());
describe('personal data protection', () => {
  it('validates operational evidence', () => { expect(validPurpose('KYC verification')).toBe(true); expect(validToken('tok_1234567890abcdef')).toBe(true); expect(validDigest('a'.repeat(64))).toBe(true); expect(validPurpose('')).toBe(false); });
  it('uses POST and idempotency for sensitive operations', async () => { const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}')); await tokenize({ value: 'customer', dataClass: 'CUSTOMER_ID', purpose: 'Account onboarding' }); await detokenize({ token: 'tok_1234567890abcdef', purpose: 'Legal request' }); expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/core/tokenization/tokenize'); expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/core/tokenization/detokenize'); expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/); });
});
