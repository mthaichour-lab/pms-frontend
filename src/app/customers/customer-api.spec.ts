import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCustomer, liftCustomerRestriction, restrictCustomer, type CustomerProfile } from './customer-api';
import { CustomerOperationCoordinator, CustomerProfileFields, customerFieldErrors, restrictionActions, restrictionFieldErrors, snapshotCustomerProfile } from './customer-console';

const profile: CustomerProfile = {
  customerId: '123e4567-e89b-42d3-a456-426614174000', identityToken: 'tok_1234567890123456',
  beneficialOwnerTokens: [], representativeTokens: [], segment: 'RETAIL', kycStatus: 'PENDING',
  legalForm: 'PERSON', sectorCode: 'RETAIL', branchCode: '001', restrictions: [],
};
afterEach(() => vi.restoreAllMocks());
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe('customer API', () => {
  it('uses an idempotency key', async () => {
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(profile)));
    await createCustomer(profile);
    expect(new Headers(mock.mock.calls[0]![1]?.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('lifts the selected restriction with a dated command', async () => {
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(profile)));
    await liftCustomerRestriction('customer/id', 'restriction/id', '2026-09-08');
    expect(mock.mock.calls[0]?.[0]).toContain('/customer%2Fid/restrictions/restriction%2Fid/lift');
    expect(mock.mock.calls[0]?.[1]?.body).toBe('{"liftedAt":"2026-09-08"}');
  });

  it('preserves the BFF acknowledgement contract when a restriction is added', async () => {
    const restricted = { ...profile, restrictions: [{ restrictionId: crypto.randomUUID(), kind: 'BLOCK', reason: 'Décision légale', effectiveFrom: '2026-09-14' }] };
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ restricted: true })));
    await expect(restrictCustomer(profile.customerId, restricted.restrictions[0]!)).resolves.toEqual({ restricted: true });
    expect(mock).toHaveBeenCalledOnce();
  });

  it('surfaces the backend correlation reference', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: 'Client introuvable' }), { status: 404, headers: { 'x-correlation-id': 'corr-customer-7' } }));
    await expect(createCustomer(profile)).rejects.toThrow('Client introuvable (référence : corr-customer-7)');
  });
});

describe('customer validation and transitions', () => {
  it('validates every required profile field', () => {
    expect(customerFieldErrors(profile)).toEqual({});
    expect(customerFieldErrors({ ...profile, customerId: 'invalid' }).customerId).toContain('UUID');
    expect(customerFieldErrors({ ...profile, identityToken: 'plain-personal-data' }).identityToken).toContain('jeton');
    expect(customerFieldErrors({ ...profile, branchCode: ' ' }).branchCode).toContain('obligatoire');
    expect(restrictionFieldErrors('UNKNOWN', ' ')).toMatchObject({ kind: expect.any(String), reason: expect.any(String) });
  });

  it('renders field-level accessible validation links', () => {
    const invalid = { ...profile, customerId: 'invalid', identityToken: '' };
    const html = renderToStaticMarkup(createElement(CustomerProfileFields, { profile: invalid, errors: customerFieldErrors(invalid), busy: false, onChange: () => undefined }));
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="customer-id-hint customer-id-error"');
    expect(html).toContain('id="customer-id-error" role="alert"');
    expect(html).toContain('aria-describedby="customer-identity-token-error"');
    expect(html).toContain('required=""');
  });

  it('offers lift only while a restriction is active', () => {
    const active = { restrictionId: crypto.randomUUID(), kind: 'BLOCK', reason: 'Décision légale', effectiveFrom: '2026-09-14' };
    expect(restrictionActions(active)).toEqual(['LIFT']);
    expect(restrictionActions({ ...active, liftedAt: '2026-09-15' })).toEqual([]);
  });

  it('creates a detached request snapshot', () => {
    const owners = ['tok_abcdefghijklmnop'];
    const source = { ...profile, beneficialOwnerTokens: owners };
    const snapshot = snapshotCustomerProfile(source);
    owners.push('tok_qrstuvwxyz123456');
    expect(snapshot.beneficialOwnerTokens).toEqual(['tok_abcdefghijklmnop']);
    expect(snapshot).not.toBe(source);
  });
});

describe('customer operation coordination', () => {
  const callbacks = (events: string[]) => ({ loading: () => events.push('loading'), success: () => events.push('success'), failure: () => events.push('failure'), settled: () => events.push('settled') });

  it('rejects a double submit synchronously and settles after draft invalidation', async () => {
    const pending = deferred<CustomerProfile>(), coordinator = new CustomerOperationCoordinator(), events: string[] = [];
    let requests = 0;
    const first = coordinator.run(() => { requests += 1; return pending.promise; }, callbacks(events));
    expect(await coordinator.run(async () => { requests += 1; return profile; }, callbacks(events))).toBe(false);
    coordinator.invalidate();
    pending.resolve(profile);
    await first;
    expect(requests).toBe(1);
    expect(events).toEqual(['loading', 'settled']);
  });

  it('aborts the active request when the draft is invalidated', async () => {
    const pending = deferred<CustomerProfile>(), coordinator = new CustomerOperationCoordinator();
    let signal: AbortSignal | undefined;
    const request = coordinator.run((received) => { signal = received; return pending.promise; }, callbacks([]));
    coordinator.invalidate();
    expect(signal?.aborted).toBe(true);
    pending.resolve(profile);
    await request;
  });

  it('ignores a stale response after unmount and works after a Strict Mode remount', async () => {
    const pending = deferred<CustomerProfile>(), coordinator = new CustomerOperationCoordinator(), events: string[] = [];
    const request = coordinator.run(() => pending.promise, callbacks(events));
    coordinator.unmount();
    pending.resolve(profile);
    await request;
    expect(events).toEqual(['loading']);
    coordinator.mount();
    await coordinator.run(async () => profile, callbacks(events));
    expect(events).toEqual(['loading', 'loading', 'success', 'settled']);
  });
});
