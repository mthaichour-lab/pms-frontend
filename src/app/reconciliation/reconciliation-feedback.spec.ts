import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReconciliationError, ReconciliationStatus } from './reconciliation-feedback';

describe('reconciliation feedback', () => {
  it('announces correlated errors assertively', () => {
    const html = renderToStaticMarkup(createElement(ReconciliationError, { message: 'Accusé refusé (référence : corr-7)' }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain('corr-7');
  });
  it('announces lifecycle success politely', () => {
    const html = renderToStaticMarkup(createElement(ReconciliationStatus, { message: 'Rapprochement MATCHED.' }));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });
});
