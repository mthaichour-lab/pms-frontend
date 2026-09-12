import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { approveClosing, rejectClosing, validClosingId, validClosingJustification } from './closing-api';
import { ClosingConsole, closingActionsForState } from './closing-console';

afterEach(() => vi.restoreAllMocks());

describe('closing approval rules', () => {
  it('accepts a UUID and meaningful justification', () => {
    expect(validClosingId('8c86d06e-2c2e-4aac-93d7-465c338232d9')).toBe(true);
    expect(validClosingJustification('Contrôles de clôture conformes')).toBe(true);
  });
  it('rejects incomplete approval evidence', () => {
    expect(validClosingId('closing-1')).toBe(false);
    expect(validClosingJustification('court')).toBe(false);
  });
  it('sends an idempotent command', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ state: 'APPROVED' })));
    await approveClosing('8c86d06e-2c2e-4aac-93d7-465c338232d9', 'Contrôles de clôture conformes');
    const [, init] = fetchMock.mock.calls[0]!;
    expect(new Headers(init?.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('routes a rejection to the dedicated Maker/Checker command', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ state: 'REJECTED' })));
    await rejectClosing('8c86d06e-2c2e-4aac-93d7-465c338232d9', 'Écart de rapprochement confirmé');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/reject');
  });
  it('surfaces the backend problem and correlation reference', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: 'Maker et Checker identiques', correlationId: 'corr-17' }), { status: 409 }));
    await expect(approveClosing('8c86d06e-2c2e-4aac-93d7-465c338232d9', 'Contrôles de clôture conformes')).rejects.toThrow('Maker et Checker identiques (référence : corr-17)');
  });
});

describe('closing decision component', () => {
  it('renders one semantic form with two explicit submit decisions', () => {
    const html = renderToStaticMarkup(createElement(ClosingConsole));
    expect(html.match(/<form/g)).toHaveLength(1);
    expect(html).toContain('value="approve"');
    expect(html).toContain('value="reject"');
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain('minLength="10"');
  });

  it('prevents a second decision after terminal states', () => {
    expect(closingActionsForState()).toEqual(['approve', 'reject']);
    expect(closingActionsForState('CONTROLS_PASSED')).toEqual(['approve', 'reject']);
    expect(closingActionsForState('APPROVED')).toEqual([]);
    expect(closingActionsForState('ANOMALY')).toEqual([]);
  });
});
