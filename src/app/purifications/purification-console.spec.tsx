import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PurificationConsole } from './purification-console';

describe('purification console behavior contract', () => {
  it('renders the three operational areas with busy state and live feedback', () => {
    const html = renderToStaticMarkup(createElement(PurificationConsole));
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain('Relevé de purification');
    expect(html).toContain('Identifier un revenu non conforme');
    expect(html).toContain('Documenter puis payer');
  });

  it('keeps destructive operations disabled until a case is selected', () => {
    const html = renderToStaticMarkup(createElement(PurificationConsole));
    expect(html).toContain('Documenter');
    expect(html).toContain('Enregistrer le paiement');
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
