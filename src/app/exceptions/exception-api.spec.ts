import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  availableExceptionTransitions,
  createException,
  ExceptionRequestError,
  exceptionFieldErrors,
  transitionException,
  transitionFieldErrors,
  validException,
  validTransition,
} from './exception-api';

const exceptionId = '123e4567-e89b-42d3-a456-426614174000';
const validCase = {
  sourceType: 'CALCULATION',
  sourceId: 'run-1',
  resourceType: 'POOL',
  resourceId: 'pool-1',
  severity: 'CRITICAL',
  title: 'Écart critique',
  description: 'Écart bloquant identifié',
} as const;

afterEach(() => vi.restoreAllMocks());

describe('exception workflow rules', () => {
  it('exposes the exact domain state machine including terminal states', () => {
    expect(availableExceptionTransitions('DETECTED')).toEqual(['QUALIFIED']);
    expect(availableExceptionTransitions('CONTROLLED')).toEqual(['CLOSED', 'IN_PROGRESS', 'ACCEPTED_RISK']);
    expect(availableExceptionTransitions('CLOSED')).toEqual([]);
    expect(availableExceptionTransitions('ACCEPTED_RISK')).toEqual([]);
  });

  it('rejects a transition that skips a domain state', () => {
    expect(transitionFieldErrors(exceptionId, { targetStatus: 'CLOSED', comment: 'Clôture documentée' }, 'DETECTED')).toEqual({
      targetStatus: expect.stringContaining('n’est pas autorisée'),
    });
    expect(validTransition({ targetStatus: 'QUALIFIED', comment: 'Exception qualifiée' }, 'DETECTED')).toBe(true);
  });

  it('requires an explicit risk acceptance reference', () => {
    expect(validTransition({ targetStatus: 'ACCEPTED_RISK', comment: 'Risque analysé et accepté' }, 'CONTROLLED')).toBe(false);
    expect(validTransition({ targetStatus: 'ACCEPTED_RISK', comment: 'Risque analysé et accepté', riskAcceptanceReference: 'RISK-2026-1' }, 'CONTROLLED')).toBe(true);
  });

  it('returns every invalid creation field for accessible feedback', () => {
    const errors = exceptionFieldErrors({
      ...validCase,
      sourceId: '',
      severity: 'UNKNOWN',
      title: 'Non',
      description: 'Court',
    });
    expect(errors).toEqual({
      sourceId: expect.any(String),
      severity: expect.any(String),
      title: expect.stringContaining('5'),
      description: expect.stringContaining('10'),
    });
    expect(validException(validCase)).toBe(true);
  });

  it('validates the exception identifier separately from transition evidence', () => {
    expect(transitionFieldErrors('not-an-id', { targetStatus: 'QUALIFIED', comment: 'Exception qualifiée' }, 'DETECTED'))
      .toMatchObject({ exceptionId: expect.stringContaining('UUID') });
  });
});

describe('exception commands', () => {
  it('sends traceable, idempotent commands and forwards cancellation', async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ exceptionId, status: 'DETECTED' }),
      { status: 201 },
    ));
    await createException(validCase, {
      signal: controller.signal,
      idempotencyKey: 'idempotency-key-1',
      correlationId: 'correlation-1',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(url).toBe('/api/core/exceptions');
    expect(headers.get('idempotency-key')).toBe('idempotency-key-1');
    expect(headers.get('x-correlation-id')).toBe('correlation-1');
    expect(init?.signal).toBe(controller.signal);
  });

  it('trims and encodes identifiers for transition commands', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'QUALIFIED' }), { status: 201 }));
    await transitionException(` ${exceptionId} `, { targetStatus: 'QUALIFIED', comment: 'Exception qualifiée' });
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/core/exceptions/${exceptionId}/transitions`);
  });

  it('surfaces server correlation references on command errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ title: 'Transition refusée' }),
      { status: 409, headers: { 'x-correlation-id': 'corr-server' } },
    ));
    const error = await transitionException(
      exceptionId,
      { targetStatus: 'QUALIFIED', comment: 'Exception qualifiée' },
      { correlationId: 'corr-client' },
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ExceptionRequestError);
    expect(error).toMatchObject({ status: 409, correlationId: 'corr-server' });
    expect((error as Error).message).toContain('corr-server');
  });

  it('rejects malformed success payloads instead of casting them', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ exceptionId: 'invalid', status: 'DETECTED' }), { status: 201 }));
    await expect(createException(validCase, { correlationId: 'corr-client' })).rejects.toMatchObject({
      name: 'ExceptionRequestError',
      status: 201,
      correlationId: 'corr-client',
      message: expect.stringContaining('Réponse de transition d’exception invalide'),
    });
  });

  it('rejects invalid commands before making a request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(createException({ ...validCase, title: 'bad' })).rejects.toMatchObject({ status: 400 });
    await expect(transitionException('not-an-id', { targetStatus: 'QUALIFIED', comment: 'Commentaire valide' })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
