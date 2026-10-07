import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RevenuesConsole } from './revenues-console';

describe('revenues console accessibility contract', () => {
  it('renders busy-aware recognition and live result regions', () => {
    const html = renderToStaticMarkup(createElement(RevenuesConsole));
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain('aria-live="polite"');
  });

  it('keeps charge evaluation and import actions disabled without a pool', () => {
    const html = renderToStaticMarkup(createElement(RevenuesConsole));
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('Évaluer les charges');
    expect(html).toContain('Importer');
  });

  it('offers controlled pool and asset selectors for a new recognized income', () => {
    const html = renderToStaticMarkup(createElement(RevenuesConsole));
    expect(html).toContain('Pools disponibles');
    expect(html).toContain('Actif source du revenu');
  });
});
