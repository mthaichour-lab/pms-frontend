import type { CreateExceptionCase, ExceptionTransition, ExceptionTransitionCommand } from '@bank/pms-api-client';

export type { CreateExceptionCase, ExceptionTransition, ExceptionTransitionCommand };

export const exceptionStatuses = [
  'DETECTED',
  'QUALIFIED',
  'ASSIGNED',
  'IN_PROGRESS',
  'CORRECTED',
  'CONTROLLED',
  'CLOSED',
  'ACCEPTED_RISK',
] as const;

export type ExceptionStatus = typeof exceptionStatuses[number];
export type ExceptionSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ExceptionField = keyof CreateExceptionCase;
export type TransitionField = 'exceptionId' | 'currentStatus' | keyof ExceptionTransitionCommand;
export type ExceptionFieldErrors = Partial<Record<ExceptionField, string>>;
export type TransitionFieldErrors = Partial<Record<TransitionField, string>>;

export interface ExceptionRequestOptions {
  readonly signal?: AbortSignal;
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
}

export class ExceptionRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly correlationId?: string,
  ) {
    super(correlationId ? `${message} (référence : ${correlationId})` : message);
    this.name = 'ExceptionRequestError';
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const severities: readonly ExceptionSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const transitions: Record<ExceptionStatus, readonly ExceptionStatus[]> = {
  DETECTED: ['QUALIFIED'],
  QUALIFIED: ['ASSIGNED'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['CORRECTED'],
  CORRECTED: ['CONTROLLED'],
  CONTROLLED: ['CLOSED', 'IN_PROGRESS', 'ACCEPTED_RISK'],
  CLOSED: [],
  ACCEPTED_RISK: [],
};

export function availableExceptionTransitions(status: ExceptionStatus): readonly ExceptionStatus[] {
  return transitions[status] ?? [];
}

export function exceptionFieldErrors(value: CreateExceptionCase): ExceptionFieldErrors {
  const errors: ExceptionFieldErrors = {};
  for (const field of ['sourceType', 'sourceId', 'resourceType', 'resourceId'] as const) {
    if (typeof value[field] !== 'string' || !value[field].trim()) errors[field] = 'Ce champ est obligatoire.';
  }
  if (!severities.includes(value.severity as ExceptionSeverity)) errors.severity = 'Sélectionnez une sévérité valide.';
  if (value.title.trim().length < 5) errors.title = 'Le titre doit contenir au moins 5 caractères.';
  if (value.description.trim().length < 10) errors.description = 'La description doit contenir au moins 10 caractères.';
  return errors;
}

export function transitionFieldErrors(
  exceptionId: string,
  value: ExceptionTransitionCommand,
  currentStatus?: ExceptionStatus,
): TransitionFieldErrors {
  const errors: TransitionFieldErrors = {};
  const targetStatus = value.targetStatus as ExceptionStatus;
  if (!uuid.test(exceptionId.trim())) errors.exceptionId = 'L’identifiant de l’exception doit être un UUID valide.';
  if (!exceptionStatuses.includes(targetStatus) || targetStatus === 'DETECTED') {
    errors.targetStatus = 'Sélectionnez un nouvel état valide.';
  } else if (currentStatus && !transitions[currentStatus].includes(targetStatus)) {
    errors.targetStatus = `La transition ${currentStatus} → ${targetStatus} n’est pas autorisée.`;
  }
  if (value.comment.trim().length < 10) errors.comment = 'Le commentaire doit contenir au moins 10 caractères.';
  if (targetStatus === 'ACCEPTED_RISK' && !value.riskAcceptanceReference?.trim()) {
    errors.riskAcceptanceReference = 'La référence d’acceptation du risque est obligatoire.';
  }
  return errors;
}

export function validException(value: CreateExceptionCase): boolean {
  return Object.keys(exceptionFieldErrors(value)).length === 0;
}

export function validTransition(value: ExceptionTransitionCommand, currentStatus?: ExceptionStatus): boolean {
  return Object.keys(transitionFieldErrors('123e4567-e89b-42d3-a456-426614174000', value, currentStatus)).length === 0;
}

function isExceptionTransition(value: unknown, requireId: boolean): value is ExceptionTransition {
  if (!value || typeof value !== 'object') return false;
  const transition = value as Record<string, unknown>;
  const validStatus = typeof transition.status === 'string' && exceptionStatuses.includes(transition.status as ExceptionStatus);
  const validId = transition.exceptionId === undefined || typeof transition.exceptionId === 'string' && uuid.test(transition.exceptionId);
  return validStatus && validId && (!requireId || typeof transition.exceptionId === 'string');
}

async function command(
  path: string,
  body: unknown,
  options: ExceptionRequestOptions,
  requireId: boolean,
): Promise<ExceptionTransition> {
  const correlationId = options.correlationId ?? crypto.randomUUID();
  const response = await fetch(`/api/core/exceptions${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': options.idempotencyKey ?? crypto.randomUUID(),
      'x-correlation-id': correlationId,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  const payload: unknown = await response.json().catch(() => undefined);
  const responseCorrelationId =
    (payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).correlationId === 'string'
      ? (payload as Record<string, string>).correlationId
      : undefined) ?? response.headers.get('x-correlation-id') ?? correlationId;

  if (!response.ok) {
    const problem = (payload ?? {}) as { detail?: string; title?: string };
    throw new ExceptionRequestError(
      problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`,
      response.status,
      responseCorrelationId,
    );
  }
  if (!isExceptionTransition(payload, requireId)) {
    throw new ExceptionRequestError('Réponse de transition d’exception invalide.', response.status, responseCorrelationId);
  }
  return payload;
}

export const createException = (value: CreateExceptionCase, options: ExceptionRequestOptions = {}) =>
  Object.keys(exceptionFieldErrors(value)).length > 0
    ? Promise.reject(new ExceptionRequestError('Données de création d’exception invalides.', 400, options.correlationId))
    : command('', value, options, true);

export const transitionException = (
  exceptionId: string,
  value: ExceptionTransitionCommand,
  options: ExceptionRequestOptions = {},
) => Object.keys(transitionFieldErrors(exceptionId, value)).length > 0
  ? Promise.reject(new ExceptionRequestError('Données de transition d’exception invalides.', 400, options.correlationId))
  : command(`/${encodeURIComponent(exceptionId.trim())}/transitions`, value, options, false);
