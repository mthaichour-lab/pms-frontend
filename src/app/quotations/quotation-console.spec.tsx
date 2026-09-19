import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QuotationConsole } from './quotation-console';

describe('quotation console accessibility', () => {
  it('renders explicit basis controls, reconciled verdict and busy-safe form', () => {
    const html = renderToStaticMarkup(createElement(QuotationConsole));
    expect(html).toContain('id="quotation-basis"');
    expect(html).toContain('id="quotation-result-title"');
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain('type="submit"');
    expect(html).toContain('aria-invalid="false"');
  });
});
