import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { productRequestForConsole, ProductsConsole } from './products-console';

afterEach(() => vi.restoreAllMocks());

describe('products console request boundary', () => {
  it('forwards abort, idempotency and correlation metadata and guards payloads', async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ productId: 'product-1', status: 'DRAFT' })));
    await expect(productRequestForConsole('', { method: 'POST', signal: controller.signal, body: '{}' }, (value): value is { productId: string } => Boolean(value && typeof value === 'object' && (value as { productId?: unknown }).productId === 'product-1'))).resolves.toEqual({ productId: 'product-1', status: 'DRAFT' });
    const init = fetchMock.mock.calls[0]?.[1]; const headers = new Headers(init?.headers);
    expect(init?.signal).toBe(controller.signal); expect(headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/); expect(headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'DRAFT' })));
    await expect(productRequestForConsole('', { method: 'POST', body: '{}' }, (value): value is { productId: string } => Boolean(value && typeof value === 'object' && typeof (value as { productId?: unknown }).productId === 'string'))).rejects.toThrow('Réponse produit invalide.');
  });

  it('renders the accessible product tab workflow', () => {
    const html = renderToStaticMarkup(createElement(ProductsConsole));
    expect(html).toContain('role="tablist"'); expect(html).toContain('aria-selected="true"'); expect(html).toContain('aria-live="polite"'); expect(html).toContain('role="tabpanel"');
  });
});
