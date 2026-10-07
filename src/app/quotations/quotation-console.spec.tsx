import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QuotationConsole, quotationFailureMessage } from './quotation-console';
import { QuotationRequestError } from './quotation-api';

describe('quotation console accessibility', () => {
  it('renders explicit basis controls, reconciled verdict and busy-safe form', () => {
    const html = renderToStaticMarkup(createElement(QuotationConsole));
    expect(html).toContain('id="quotation-basis"');
    expect(html).toContain('id="quotation-result-title"');
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain('type="submit"');
    expect(html).toContain('aria-invalid="false"');
  });

  it('explains a missing certified basis as a business prerequisite', () => {
    expect(quotationFailureMessage(new QuotationRequestError('Aucun résultat certifié disponible.', 409, 'corr-42')))
      .toBe('Prérequis métier non satisfait : Aucun résultat certifié disponible. (référence : corr-42)');
  });
});
