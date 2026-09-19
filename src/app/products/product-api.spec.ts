import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isExactNisba, productRequest, referenceValidationMessage, validProductCode, validProductId, validProductJustification, validProductName } from './product-api';
import { ProductsConsole, productActionsForStatus } from './products-console';

afterEach(() => vi.restoreAllMocks());

describe('product form rules', () => {
  it('accepts a canonical Nisba split totaling exactly 100', () => {
    expect(isExactNisba('70', '30')).toBe(true);
    expect(isExactNisba('66.67', '33.33')).toBe(true);
    expect(isExactNisba('0', '100')).toBe(true);
  });

  it('rejects non-canonical, invalid or imbalanced Nisba values', () => {
    expect(isExactNisba('70', '29')).toBe(false);
    expect(isExactNisba('-1', '101')).toBe(false);
    expect(isExactNisba('abc', '30')).toBe(false);
    expect(isExactNisba('070', '30')).toBe(false);
    expect(isExactNisba('.5', '99.5')).toBe(false);
    expect(isExactNisba('66.6666667', '33.3333333')).toBe(false);
  });

  it('validates product fields independently', () => {
    expect(validProductId('8c86d06e-2c2e-4aac-93d7-465c338232d9')).toBe(true);
    expect(validProductId('product-1')).toBe(false);
    expect(validProductCode('MUDARABA_01')).toBe(true);
    expect(validProductCode('bad code')).toBe(false);
    expect(validProductName('Compte Moudaraba')).toBe(true);
    expect(validProductName(' x ')).toBe(false);
    expect(validProductJustification('Validation documentée')).toBe(true);
    expect(validProductJustification('court')).toBe(false);
  });

  it('offers only domain-authorized transitions', () => {
    expect(productActionsForStatus('DRAFT')).toEqual(['validate']);
    expect(productActionsForStatus('VALIDATED')).toEqual(['publish']);
    expect(productActionsForStatus('PUBLISHED')).toEqual(['suspend', 'close']);
    expect(productActionsForStatus('SUSPENDED')).toEqual(['resume', 'close']);
    expect(productActionsForStatus('CLOSED')).toEqual([]);
  });

  it('renders accessible tabs and per-field descriptions without prompt UI', () => {
    const html = renderToStaticMarkup(createElement(ProductsConsole));
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-describedby="product-code-hint"');
    expect(html).toContain('aria-invalid="false"');
    expect(html).not.toContain('window.prompt');
  });
});

describe('product reference form rules', () => {
  it('accepts a complete association with a UUID reference', () => {
    expect(referenceValidationMessage({ kind: 'CONTRACTUAL_DOCUMENT', referenceId: '1447e82c-ca3d-4bad-b9f8-476f10ec8d3d' })).toBeUndefined();
  });

  it('rejects incomplete or malformed associations before calling the BFF', () => {
    expect(referenceValidationMessage({ kind: 'ACCOUNTING_SCHEMA', referenceId: ' ' })).toBeDefined();
    expect(referenceValidationMessage({ kind: 'ACCOUNTING_SCHEMA', referenceId: 'reference-42' })).toContain('UUID');
  });
});

describe('productRequest', () => {
  it('adds JSON and idempotency headers and forwards cancellation', async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ productId: 'product-1' }), { status: 200 }));
    await productRequest('', { method: 'POST', body: JSON.stringify({ code: 'MUD' }), signal: controller.signal });
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(init?.signal).toBe(controller.signal);
  });

  it('surfaces the safe API problem and its support reference', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ title: 'Conflit métier', correlationId: 'corr-123', status: 409 }), { status: 409 }));
    await expect(productRequest('/product-1')).rejects.toThrow('Conflit métier (référence : corr-123)');
  });
});
