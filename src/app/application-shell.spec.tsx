import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ApplicationShell } from './application-shell';

function render(roles: readonly string[] = ['FINANCE_CONTROLLER'], locale: 'fr' | 'ar' | 'en' = 'fr'): string {
  return renderToStaticMarkup(createElement(ApplicationShell, {
    userName: 'Nadia Benali', roles, locale,
  }));
}

describe('application shell navigation', () => {
  it('provides a skip link and an explicitly controlled mobile navigation', () => {
    const html = render();
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('aria-controls="primary-navigation"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('id="main-content"');
  });

  it('labels navigation groups with semantic headings', () => {
    const html = render();
    expect(html).toContain('aria-labelledby="navigation-group-0"');
    expect(html).toContain('id="navigation-group-0"');
  });

  it('does not render links forbidden to the current role', () => {
    const html = render(['RELATIONSHIP_MANAGER']);
    expect(html).toContain('href="/customers"');
    expect(html).not.toContain('href="/audit"');
    expect(html).not.toContain('href="/risk"');
  });

  it('renders the selected locale direction and RTL flow arrow', () => {
    const html = render(['FINANCE_CONTROLLER'], 'ar');
    expect(html).toContain('lang="ar"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('id="application-locale"');
    expect(html).toContain('←');
  });

  it('exposes an accessible monthly/annual chart selector', () => {
    const html = render();
    expect(html).toContain('role="group" aria-label="Période du graphique"');
    expect(html).toContain('aria-pressed="true">Mensuel');
    expect(html).toContain('aria-pressed="false">Annuel');
    expect(html).toContain('vue mensuelle');
  });
});
