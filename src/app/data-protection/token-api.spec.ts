import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  detokenize,
  maskToken,
  personalDataClasses,
  tokenActionSpec,
  tokenFieldErrors,
  tokenize,
  TokenRequestError,
  validDigest,
  validPurpose,
  validToken,
  validVaultKeyVersion,
} from './token-api';
import { TokenConsole, TokenOperationCoordinator } from './token-console';

const token = 'tok_1234567890abcdef';
const tokenized = { token, dataClass: 'CUSTOMER_ID', vaultKeyVersion: 'key-v2' };

afterEach(() => vi.restoreAllMocks());

describe('personal data protection rules', () => {
  it('matches purpose, token and digest constraints from the API contract', () => {
    expect(validPurpose('KYC_VERIFICATION')).toBe(true);
    expect(validPurpose('KYC verification')).toBe(false);
    expect(validToken(token)).toBe(true);
    expect(validDigest('a'.repeat(64))).toBe(true);
    expect(validDigest('A'.repeat(64))).toBe(false);
    expect(validVaultKeyVersion('key-v2.1')).toBe(true);
    expect(validVaultKeyVersion('key/v2')).toBe(false);
  });

  it('exposes the action machine and approved personal-data classes', () => {
    expect(tokenActionSpec.tokenize).toEqual({ needsDataClass: true, input: 'clear', result: 'token' });
    expect(tokenActionSpec.detokenize).toEqual({ needsDataClass: false, input: 'token', result: 'clear' });
    expect(personalDataClasses).toEqual(['CUSTOMER_ID', 'NATIONAL_ID', 'ACCOUNT_HOLDER_NAME', 'CONTACT']);
  });

  it('returns field-specific validation errors for each input kind', () => {
    expect(tokenFieldErrors('tokenize', { value: '', dataClass: 'UNSUPPORTED', purpose: 'short' })).toEqual({
      purpose: expect.any(String),
      dataClass: expect.any(String),
      value: expect.stringContaining('obligatoire'),
    });
    expect(tokenFieldErrors('search', { value: 'invalid', dataClass: 'CUSTOMER_ID', purpose: 'KYC_VERIFICATION' }))
      .toEqual({ value: expect.stringContaining('64') });
    expect(tokenFieldErrors('rotate', { value: 'invalid', dataClass: '', purpose: 'KEY_ROTATION' }))
      .toEqual({ value: expect.stringContaining('format') });
  });

  it('masks tokens without exposing their full value', () => {
    const masked = maskToken(token);
    expect(masked).toBe('tok_••••••••cdef');
    expect(masked).not.toContain('1234567890ab');
  });
});

describe('token commands', () => {
  it('uses traceable idempotent POST requests and forwards cancellation', async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(tokenized), { status: 201 }));
    await tokenize(
      { value: 'customer', dataClass: 'CUSTOMER_ID', purpose: 'ACCOUNT_ONBOARDING' },
      { signal: controller.signal, idempotencyKey: 'idempotency-key-1', correlationId: 'correlation-1' },
    );
    const [url, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(url).toBe('/api/core/tokenization/tokenize');
    expect(init?.method).toBe('POST');
    expect(headers.get('idempotency-key')).toBe('idempotency-key-1');
    expect(headers.get('x-correlation-id')).toBe('correlation-1');
    expect(init?.signal).toBe(controller.signal);
  });

  it('accepts a structurally valid controlled clear-value response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ value: 'customer-42' }), { status: 201 }));
    await expect(detokenize({ token, purpose: 'LEGAL_REQUEST' })).resolves.toEqual({ value: 'customer-42' });
  });

  it('surfaces the server correlation reference on failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ title: 'Accès refusé' }),
      { status: 403, headers: { 'x-correlation-id': 'corr-server' } },
    ));
    const error = await detokenize(
      { token, purpose: 'LEGAL_REQUEST' },
      { correlationId: 'corr-client' },
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(TokenRequestError);
    expect(error).toMatchObject({ status: 403, correlationId: 'corr-server' });
    expect((error as Error).message).toContain('corr-server');
  });

  it('rejects malformed success payloads rather than exposing unchecked data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ value: 42 }), { status: 201 }));
    await expect(detokenize(
      { token, purpose: 'LEGAL_REQUEST' },
      { correlationId: 'corr-client' },
    )).rejects.toMatchObject({
      name: 'TokenRequestError',
      status: 201,
      correlationId: 'corr-client',
      message: expect.stringContaining('Réponse de protection des données invalide'),
    });
  });

  it('rejects an empty or oversized clear value returned by the server', async () => {
    for (const value of ['', 'x'.repeat(4097)]) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ value }), { status: 201 }));
      await expect(detokenize({ token, purpose: 'LEGAL_REQUEST' })).rejects.toBeInstanceOf(TokenRequestError);
    }
  });
});

describe('token console safety', () => {
  it('renders keyboard tabs, required fields and a live result region', () => {
    const html = renderToStaticMarkup(createElement(TokenConsole));
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('required=""');
    expect(html).toContain('id="token-value"');
    expect(html).toContain('id="token-purpose"');
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain(token);
  });

  it('rejects duplicate submissions and suppresses a stale result', async () => {
    let resolve!: (value: typeof tokenized) => void;
    const pending = new Promise<typeof tokenized>((done) => { resolve = done; });
    const coordinator = new TokenOperationCoordinator();
    const events: string[] = [];
    const callbacks = {
      loading: () => events.push('loading'),
      success: () => events.push('success'),
      failure: () => events.push('failure'),
      settled: () => events.push('settled'),
    };
    const first = coordinator.run(() => pending, callbacks);
    expect(coordinator.isRunning()).toBe(true);
    expect(await coordinator.run(async () => tokenized, callbacks)).toBe(false);
    coordinator.invalidate();
    resolve(tokenized);
    await first;
    expect(coordinator.isRunning()).toBe(false);
    expect(events).toEqual(['loading', 'settled']);
  });

  it('aborts on unmount, suppresses callbacks, and supports a Strict Mode remount', async () => {
    let signal: AbortSignal | undefined;
    let resolveFirst!: (value: typeof tokenized) => void;
    let resolveSecond!: (value: typeof tokenized) => void;
    const firstPending = new Promise<typeof tokenized>((done) => { resolveFirst = done; });
    const secondPending = new Promise<typeof tokenized>((done) => { resolveSecond = done; });
    const coordinator = new TokenOperationCoordinator();
    const events: string[] = [];
    const callbacks = {
      loading: () => events.push('loading'),
      success: () => events.push('success'),
      failure: () => events.push('failure'),
      settled: () => events.push('settled'),
    };
    const firstRequest = coordinator.run((currentSignal) => { signal = currentSignal; return firstPending; }, callbacks);
    coordinator.unmount();
    expect(signal?.aborted).toBe(true);
    coordinator.mount();
    const secondRequest = coordinator.run(() => secondPending, callbacks);
    resolveFirst(tokenized);
    await firstRequest;
    expect(events).toEqual(['loading', 'loading']);
    resolveSecond(tokenized);
    await secondRequest;
    expect(events).toEqual(['loading', 'loading', 'success', 'settled']);
  });
});
