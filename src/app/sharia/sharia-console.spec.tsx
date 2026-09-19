import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShariaConsole } from './sharia-console';

describe('Sharia console accessibility', () => {
  it('renders controlled workflow tabs, panel state and valid-field accessibility', () => {
    const html = renderToStaticMarkup(createElement(ShariaConsole));
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-controls="sharia-step-panel"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain('aria-invalid="false"');
    expect(html).toContain('type="submit"');
  });
});
