import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AllocationsConsole } from './allocations-console';
import { PoolLifecycleConsole, poolActionsForStatus } from './pool-lifecycle-console';

describe('allocation consoles', () => {
  it('exposes only legal pool transitions', () => { expect(poolActionsForStatus('DRAFT')).toEqual(['activate', 'close']); expect(poolActionsForStatus('ACTIVE')).toEqual(['suspend', 'close']); expect(poolActionsForStatus('SUSPENDED')).toEqual(['activate', 'close']); expect(poolActionsForStatus('CLOSED')).toEqual([]); });
  it('describes allocation constraints accessibly', () => { const html = renderToStaticMarkup(createElement(AllocationsConsole)); expect(html).toContain('aria-describedby="allocation-asset-hint"'); expect(html).toContain('aria-describedby="allocation-percentage-hint"'); expect(html).toContain('inputMode="decimal"'); expect(html).toContain('minLength="10"'); expect(html).toContain('aria-live="assertive"'); });
  it('describes lifecycle pool validation', () => { const html = renderToStaticMarkup(createElement(PoolLifecycleConsole)); expect(html).toContain('aria-describedby="lifecycle-pool-hint"'); expect(html).toContain('maxLength="32"'); });
});
