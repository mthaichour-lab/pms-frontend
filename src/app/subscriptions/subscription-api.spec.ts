import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSubscription, transitionSubscription } from './subscription-api';
import { actionsForStatus, Identifier, SubscriptionConsole, SubscriptionOperationCoordinator, SubscriptionOperationGate, subscriptionActionFieldErrors, subscriptionCommand, subscriptionDraftFieldErrors, validateSubscriptionAction, validateSubscriptionDraft } from './subscription-console';

afterEach(() => vi.restoreAllMocks());

const validDraft = {
  accountId: '123e4567-e89b-42d3-a456-426614174000',
  customerId: '223e4567-e89b-42d3-a456-426614174000',
  productId: '323e4567-e89b-42d3-a456-426614174000',
  productTermsVersionId: '423e4567-e89b-42d3-a456-426614174000',
  contractVersion: '1.0', investorNisba: '70', bankNisba: '30', currency: 'DZD',
} as const;
const subscription = { ...validDraft, status: 'PRE_SIMULATION' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('subscription API', () => {
  it('guards console responses and forwards abort/correlation metadata', async () => {
    const controller = new AbortController(); const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ...subscription, status: 'PRE_SIMULATION' })));
    await expect(subscriptionCommand('', validDraft, controller.signal)).resolves.toMatchObject({ status: 'PRE_SIMULATION' }); const init = mock.mock.calls[0]?.[1]; const headers = new Headers(init?.headers); expect(init?.signal).toBe(controller.signal); expect(headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/); expect(headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/);
    mock.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'PRE_SIMULATION' }))); await expect(subscriptionCommand('', validDraft, controller.signal)).rejects.toThrow('Réponse de souscription invalide.');
  });
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
    expect(subscriptionDraftFieldErrors({ ...validDraft, currency: 'dz' }).currency).toContain('majuscules');
    expect(subscriptionDraftFieldErrors({ ...validDraft, investorNisba: '71' }).bankNisba).toContain('100 %');
  });

  it('offers only transitions compatible with the current status', () => {
    expect(actionsForStatus('PRE_SIMULATION')).toEqual(['START']);
    expect(actionsForStatus('PENDING_SUBSCRIPTION')).toEqual(['ACCEPT']);
    expect(actionsForStatus('PENDING_SUBSCRIPTION', true)).toEqual(['ACTIVATE']);
    expect(actionsForStatus('CLOSED')).toEqual([]);
  });

  it('requires action-specific evidence', () => {
    expect(validateSubscriptionAction({ type: 'DEPOSIT', businessDate: '2026-09-09', amount: '0' })).toContain('positif');
    expect(validateSubscriptionAction({ type: 'DEPOSIT', businessDate: '2026-09-09', amount: '.5' })).toContain('canonique');
    expect(validateSubscriptionAction({ type: 'DEPOSIT', businessDate: '2026-09-09', amount: '01' })).toContain('canonique');
    expect(validateSubscriptionAction({ type: 'DEPOSIT', businessDate: '2026-09-09', amount: '1.00' })).toBeUndefined();
    expect(validateSubscriptionAction({ type: 'RENEW', businessDate: '2026-09-09', maturityDate: '2026-02-30' })).toContain('date valide');
    expect(validateSubscriptionAction({ type: 'BLOCK', businessDate: '2026-09-09' })).toContain('motif');
    expect(validateSubscriptionAction({ type: 'ACCEPT', businessDate: '2026-09-09', nonGuaranteeAccepted: true, profitSharingMethodAccepted: false })).toContain('consentements');
    expect(validateSubscriptionAction({ type: 'ACCEPT', businessDate: '2026-09-09', nonGuaranteeAccepted: true, profitSharingMethodAccepted: true })).toBeUndefined();
    expect(subscriptionActionFieldErrors({ type: 'ACCEPT', businessDate: '2026-09-09', nonGuaranteeAccepted: false, profitSharingMethodAccepted: false })).toMatchObject({ nonGuaranteeAccepted: expect.any(String), profitSharingMethodAccepted: expect.any(String) });
  });

  it('links invalid inputs to their accessible error message', () => {
    const html = renderToStaticMarkup(createElement(Identifier, { id: 'account-id', label: 'Compte', value: 'incorrect', error: 'Saisissez un UUID valide.', disabled: false, onChange: () => undefined }));
    expect(html).toContain('required=""');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="uuid-hint account-id-error"');
    expect(html).toContain('id="account-id-error" role="alert"');
  });

  it('locks operations synchronously before React can render its busy state', () => {
    const gate = new SubscriptionOperationGate();
    expect(gate.tryStart()).toBe(true);
    expect(gate.tryStart()).toBe(false);
    gate.finish();
    expect(gate.tryStart()).toBe(true);
  });

  it('uses one coordinator to reject a double submit and settle busy after a draft change', async () => {
    const pending = deferred<typeof subscription>();
    const coordinator = new SubscriptionOperationCoordinator();
    const events: string[] = [];
    let requests = 0;
    const callbacks = { loading: () => events.push('loading'), success: () => events.push('success'), failure: () => events.push('failure'), settled: () => events.push('settled') };
    const first = coordinator.run(() => { requests += 1; return pending.promise; }, callbacks);
    expect(await coordinator.run(async () => { requests += 1; return subscription; }, callbacks)).toBe(false);
    coordinator.invalidate();
    pending.resolve(subscription);
    await first;
    expect(requests).toBe(1);
    expect(events).toEqual(['loading', 'settled']);
  });

  it('suppresses every state callback after unmount and supports a Strict Mode remount', async () => {
    const pending = deferred<typeof subscription>();
    const coordinator = new SubscriptionOperationCoordinator();
    const events: string[] = [];
    const callbacks = { loading: () => events.push('loading'), success: () => events.push('success'), failure: () => events.push('failure'), settled: () => events.push('settled') };
    const request = coordinator.run(() => pending.promise, callbacks);
    coordinator.unmount();
    pending.resolve(subscription);
    await request;
    expect(events).toEqual(['loading']);
    coordinator.mount();
    await coordinator.run(async () => subscription, callbacks);
    expect(events).toEqual(['loading', 'loading', 'success', 'settled']);
  });
});
