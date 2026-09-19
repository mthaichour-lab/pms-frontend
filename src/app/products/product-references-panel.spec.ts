import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { isProductReferenceList, ProductReferencesPanel } from './product-references-panel';

const reference = { referenceId: '1447e82c-ca3d-4bad-b9f8-476f10ec8d3d', source: 'BA', referenceCode: 'BA-2026-01', version: '1', title: 'Référence Banque', effectiveFrom: '2026-01-01', createdBy: 'finance', kind: 'REGULATORY_DOCUMENT', associatedAt: '2026-09-19T12:00:00Z' };

describe('product references panel', () => {
  it('guards the references response at runtime', () => {
    expect(isProductReferenceList([reference])).toBe(true);
    expect(isProductReferenceList([{ ...reference, kind: 'UNKNOWN' }])).toBe(false);
    expect(isProductReferenceList([{ ...reference, title: 42 }])).toBe(false);
  });

  it('renders labelled controls and busy-safe actions', () => {
    const html = renderToStaticMarkup(createElement(ProductReferencesPanel, { defaultProductId: reference.referenceId }));
    expect(html).toContain('id="reference-product-id"');
    expect(html).toContain('for="reference-kind"');
    expect(html).toContain('for="reference-id"');
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain('aria-live="polite"');
  });
});
