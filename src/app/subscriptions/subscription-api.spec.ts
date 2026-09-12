import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSubscription, transitionSubscription } from './subscription-api';
import { actionsForStatus, SubscriptionConsole, validateSubscriptionAction, validateSubscriptionDraft } from './subscription-console';

afterEach(() => vi.restoreAllMocks());

const validDraft = {
  accountId: '123e4567-e89b-42d3-a456-426614174000',
  customerId: '223e4567-e89b-42d3-a456-426614174000',
  productId: '323e4567-e89b-42d3-a456-426614174000',
  productTermsVersionId: '423e4567-e89b-42d3-a456-426614174000',
  contractVersion: '1.0', investorNisba: '70', bankNisba: '30', currency: 'DZD',
} as const;

describe('subscription API', () => {
  it('creates subscriptions with JSON and idempotency headers', async () => {
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await createSubscription(validDraft);
    const headers = new Headers(mock.mock.calls[0]![1]?.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('uses the encoded account action route', async () => {
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await transitionSubscription('account/one', { type: 'START', businessDate: '2026-09-09' });
    expect(mock.mock.calls[0]![0]).toBe('/api/core/investment-accounts/subscriptions/account%2Fone/actions');
  });

  it('surfaces problem details with their support reference', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: 'Transition interdite', correlationId: 'corr-42' }), { status: 409 }));
    await expect(createSubscription(validDraft)).rejects.toThrow('Transition interdite (référence : corr-42)');
  });
});

describe('subscription validation and lifecycle', () => {
  it('renders a semantic initial form and an explicit lifecycle empty state', () => {
    const html = renderToStaticMarkup(createElement(SubscriptionConsole));
    expect(html).toContain('<form');
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain('required=""');
    expect(html).toContain('Créez la pré-simulation avant toute transition.');
  });

  it('validates identifiers, currency and exact Nisba', () => {
    expect(validateSubscriptionDraft(validDraft)).toBeUndefined();
    expect(validateSubscriptionDraft({ ...validDraft, accountId: 'not-an-id' })).toContain('UUID');
    expect(validateSubscriptionDraft({ ...validDraft, investorNisba: 'invalide' })).toContain('100 %');
  });

  it('offers only transitions compatible with the current status', () => {
    expect(actionsForStatus('PRE_SIMULATION')).toEqual(['START']);
    expect(actionsForStatus('PENDING_SUBSCRIPTION')).toEqual(['ACCEPT', 'ACTIVATE']);
    expect(actionsForStatus('CLOSED')).toEqual([]);
  });

  it('requires action-specific evidence', () => {
    expect(validateSubscriptionAction({ type: 'DEPOSIT', businessDate: '2026-09-09', amount: '0' })).toContain('positif');
    expect(validateSubscriptionAction({ type: 'BLOCK', businessDate: '2026-09-09' })).toContain('motif');
    expect(validateSubscriptionAction({ type: 'ACCEPT', businessDate: '2026-09-09', nonGuaranteeAccepted: true, profitSharingMethodAccepted: false })).toContain('consentements');
    expect(validateSubscriptionAction({ type: 'ACCEPT', businessDate: '2026-09-09', nonGuaranteeAccepted: true, profitSharingMethodAccepted: true })).toBeUndefined();
  });
});
