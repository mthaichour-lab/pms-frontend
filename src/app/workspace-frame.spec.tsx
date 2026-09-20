import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WorkspaceFrame } from './workspace-frame';

function render(roles: readonly string[] = ['SYSTEM_ADMIN']): string {
  return renderToStaticMarkup(createElement(WorkspaceFrame, {
    userName: 'Mohamed Haichour',
    roles,
    locale: 'fr',
    children: createElement('section', null, 'Contenu métier'),
  }));
}

describe('workspace frame', () => {
  it('renders the persistent navigation and the test database status', () => {
    const html = render();
    expect(html).toContain('id="primary-navigation"');
    expect(html).toContain('Base de données simulée active');
    expect(html).toContain('12 produits');
    expect(html).toContain('Contenu métier');
  });

  it('preserves accessible mobile navigation controls', () => {
    const html = render();
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('aria-controls="primary-navigation"');
    expect(html).toContain('aria-expanded="false"');
  });

  it('filters protected modules according to the user role', () => {
    const html = render(['RELATIONSHIP_MANAGER']);
    expect(html).toContain('href="/customers"');
    expect(html).not.toContain('href="/risk"');
    expect(html).not.toContain('href="/audit"');
  });
});
