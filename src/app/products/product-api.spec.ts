import { afterEach, describe, expect, it, vi } from 'vitest';
import { isExactNisba, productRequest, referenceValidationMessage } from './product-api';

afterEach(() => vi.restoreAllMocks());

describe('product form rules', () => {
  it('accepts a Nisba split totaling exactly 100', () => {
    expect(isExactNisba('70', '30')).toBe(true);
    expect(isExactNisba('66.67', '33.33')).toBe(true);
  });

  it('rejects invalid or imbalanced Nisba values', () => {
    expect(isExactNisba('70', '29')).toBe(false);
    expect(isExactNisba('-1', '101')).toBe(false);
    expect(isExactNisba('abc', '30')).toBe(false);
  });
});

describe('product reference form rules', () => {
  it('accepts a complete association', () => {
    expect(referenceValidationMessage({ kind: 'CONTRACTUAL_DOCUMENT', referenceId: 'reference-42' })).toBeUndefined();
  });

  it('rejects incomplete associations before calling the BFF', () => {
    expect(referenceValidationMessage({ kind: 'ACCOUNTING_SCHEMA', referenceId: ' ' })).toBe('L’identifiant de référence est obligatoire.');
  });
});

describe('productRequest', () => {
  it('adds JSON and idempotency headers to commands', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ productId: 'product-1' }), { status: 200 }),
    );

    await productRequest('', { method: 'POST', body: JSON.stringify({ code: 'MUD' }) });

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('surfaces the safe API problem and its support reference', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      title: 'Conflit métier', correlationId: 'corr-123', status: 409,
    }), { status: 409 }));

    await expect(productRequest('/product-1')).rejects.toThrow(
      'Conflit métier (référence : corr-123)',
    );
  });
});
