import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  nextShariaAction,
  ShariaRequestError,
  shariaFieldErrors,
  shariaRequest,
  shariaValidationMessage,
} from './sharia-api';

const reviewId = '123e4567-e89b-42d3-a456-426614174000';
const evidenceDocumentId = '123e4567-e89b-42d3-a456-426614174001';

afterEach(() => vi.restoreAllMocks());

describe('Sharia workflow validation', () => {
  it('validates submission fields against the API contract', () => {
    expect(shariaFieldErrors({ kind: 'submit', command: { resourceType: 'INVESTMENT_PRODUCT', resourceId: 'product-1' } })).toEqual({});
    expect(shariaFieldErrors({ kind: 'submit', command: { resourceType: '1', resourceId: ' '.repeat(129) } })).toEqual({
      resourceType: expect.stringContaining('2 à 64'),
      resourceId: expect.stringContaining('128'),
    });
  });

  it('reports every invalid review field for accessible inline feedback', () => {
    expect(shariaFieldErrors({ kind: 'review', reviewId: 'review-1', command: { opinion: 'court' } })).toEqual({
      reviewId: expect.stringContaining('UUID'),
      opinion: expect.stringContaining('10'),
    });
  });

  it('validates every decision field and preserves the legacy summary helper', () => {
    const action = {
      kind: 'decide' as const,
      reviewId,
      command: { decision: 'UNKNOWN', justification: 'court', evidenceDocumentId: 'invalid' },
    };
    expect(shariaFieldErrors(action)).toEqual({
      decision: expect.any(String),
      justification: expect.stringContaining('10'),
      evidenceDocumentId: expect.stringContaining('UUID'),
    });
    expect(shariaValidationMessage(action)).toBe(shariaFieldErrors(action).decision);
  });

  it('maps only non-terminal workflow states to their next action', () => {
    expect(nextShariaAction('SUBMITTED')).toBe('review');
    expect(nextShariaAction('REVIEWED')).toBe('decide');
    expect(nextShariaAction('APPROVED')).toBeUndefined();
    expect(nextShariaAction('REJECTED')).toBeUndefined();
    expect(nextShariaAction('UNKNOWN')).toBeUndefined();
  });
});

describe('shariaRequest', () => {
  it('sends traceable, idempotent workflow commands and forwards cancellation', async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ reviewId, state: 'SUBMITTED' }),
      { headers: { 'x-correlation-id': 'corr-response' } },
    ));

    await expect(shariaRequest(
      { kind: 'submit', command: { resourceType: 'PRODUCT', resourceId: 'product-1' } },
      { signal: controller.signal, idempotencyKey: 'idem-1', correlationId: 'corr-request' },
    )).resolves.toEqual({ reviewId, state: 'SUBMITTED' });

    const [url, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(url).toBe('/api/core/compliance/sharia-reviews');
    expect(headers.get('idempotency-key')).toBe('idem-1');
    expect(headers.get('x-correlation-id')).toBe('corr-request');
    expect(init?.signal).toBe(controller.signal);
  });

  it('trims and encodes the review identifier in transition URLs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ reviewId, state: 'REVIEWED' })));
    await shariaRequest({ kind: 'review', reviewId: ` ${reviewId} `, command: { opinion: 'Avis suffisamment détaillé' } });
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/core/compliance/sharia-reviews/${reviewId}/review`);
  });

  it('uses the response correlation header when an error body has no reference', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ title: 'Transition refusée' }),
      { status: 409, headers: { 'x-correlation-id': 'corr-server' } },
    ));

    const error = await shariaRequest(
      { kind: 'decide', reviewId, command: { decision: 'APPROVED', justification: 'Décision documentée', evidenceDocumentId } },
      { correlationId: 'corr-client' },
    ).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ShariaRequestError);
    expect(error).toMatchObject({ status: 409, correlationId: 'corr-server' });
    expect((error as Error).message).toContain('corr-server');
  });

  it('rejects malformed success payloads with the request correlation reference', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ reviewId: 'invalid', state: 'SUBMITTED' })));
    await expect(shariaRequest(
      { kind: 'submit', command: { resourceType: 'PRODUCT', resourceId: 'product-1' } },
      { correlationId: 'corr-client' },
    )).rejects.toMatchObject({
      name: 'ShariaRequestError',
      status: 200,
      correlationId: 'corr-client',
      message: expect.stringContaining('Réponse de transition Charia invalide'),
    });
  });
});
