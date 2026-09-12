import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReportingError, ReportingStatus } from './reporting-feedback';

describe('reporting feedback', () => {
  it('announces correlated errors assertively', () => {
    const html = renderToStaticMarkup(createElement(ReportingError, { message: 'Publication refusée (référence : corr-1)' }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain('corr-1');
  });
  it('announces success without interrupting the user', () => {
    const html = renderToStaticMarkup(createElement(ReportingStatus, { message: 'Rapport publié.' }));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });
});
