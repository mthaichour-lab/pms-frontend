import type {
  ShariaDecision,
  ShariaOpinion,
  ShariaReviewSubmission,
  ShariaReviewTransition,
} from '@bank/pms-api-client';

export type { ShariaDecision, ShariaOpinion, ShariaReviewSubmission, ShariaReviewTransition };

export type ShariaAction =
  | { kind: 'submit'; command: ShariaReviewSubmission }
  | { kind: 'review'; reviewId: string; command: ShariaOpinion }
  | { kind: 'decide'; reviewId: string; command: ShariaDecision };

export type ShariaField =
  | 'resourceType'
  | 'resourceId'
  | 'reviewId'
  | 'opinion'
  | 'decision'
  | 'justification'
  | 'evidenceDocumentId';

export type ShariaFieldErrors = Partial<Record<ShariaField, string>>;

export interface ShariaRequestOptions {
  readonly signal?: AbortSignal;
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
}

export class ShariaRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly correlationId?: string,
  ) {
    super(correlationId ? `${message} (référence : ${correlationId})` : message);
    this.name = 'ShariaRequestError';
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const resourceTypePattern = /^[A-Za-z][A-Za-z0-9_-]{1,63}$/;
const transitionStates = new Set(['SUBMITTED', 'REVIEWED', 'APPROVED', 'REJECTED']);

export function shariaFieldErrors(action: ShariaAction): ShariaFieldErrors {
  const errors: ShariaFieldErrors = {};

  if (action.kind === 'submit') {
    const resourceType = action.command.resourceType.trim();
    const resourceId = action.command.resourceId.trim();
    if (!resourceTypePattern.test(resourceType)) {
      errors.resourceType = 'Le type doit contenir 2 à 64 caractères alphanumériques, « _ » ou « - ».';
    }
    if (!resourceId || resourceId.length > 128) {
      errors.resourceId = 'L’identifiant de ressource est obligatoire et limité à 128 caractères.';
    }
    return errors;
  }

  if (!uuid.test(action.reviewId.trim())) {
    errors.reviewId = 'L’identifiant de revue doit être un UUID valide.';
  }

  if (action.kind === 'review') {
    const length = action.command.opinion.trim().length;
    if (length < 10 || action.command.opinion.length > 4000) {
      errors.opinion = 'L’avis doit contenir entre 10 et 4 000 caractères.';
    }
    return errors;
  }

  if (!['APPROVED', 'REJECTED'].includes(action.command.decision)) {
    errors.decision = 'Sélectionnez une décision valide.';
  }
  const justificationLength = action.command.justification.trim().length;
  if (justificationLength < 10 || action.command.justification.length > 4000) {
    errors.justification = 'La justification doit contenir entre 10 et 4 000 caractères.';
  }
  if (!uuid.test(action.command.evidenceDocumentId.trim())) {
    errors.evidenceDocumentId = 'La preuve documentaire doit être un UUID valide.';
  }
  return errors;
}

export function shariaValidationMessage(action: ShariaAction): string | undefined {
  return Object.values(shariaFieldErrors(action))[0];
}

export function nextShariaAction(state: string): ShariaAction['kind'] | undefined {
  if (state === 'SUBMITTED') return 'review';
  if (state === 'REVIEWED') return 'decide';
  return undefined;
}

function isShariaTransition(value: unknown): value is ShariaReviewTransition {
  if (!value || typeof value !== 'object') return false;
  const transition = value as Record<string, unknown>;
  return typeof transition.reviewId === 'string' && uuid.test(transition.reviewId) &&
    typeof transition.state === 'string' && transitionStates.has(transition.state);
}

export async function shariaRequest(
  action: ShariaAction,
  options: ShariaRequestOptions = {},
): Promise<ShariaReviewTransition> {
  const suffix = action.kind === 'submit' ? '' : `/${encodeURIComponent(action.reviewId.trim())}/${action.kind}`;
  const correlationId = options.correlationId ?? crypto.randomUUID();
  const response = await fetch(`/api/core/compliance/sharia-reviews${suffix}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': options.idempotencyKey ?? crypto.randomUUID(),
      'x-correlation-id': correlationId,
    },
    body: JSON.stringify(action.command),
    signal: options.signal,
  });
  const payload: unknown = await response.json().catch(() => undefined);
  const responseCorrelationId =
    (payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).correlationId === 'string'
      ? (payload as Record<string, string>).correlationId
      : undefined) ?? response.headers.get('x-correlation-id') ?? correlationId;

  if (!response.ok) {
    const problem = (payload ?? {}) as { detail?: string; title?: string };
    throw new ShariaRequestError(
      problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`,
      response.status,
      responseCorrelationId,
    );
  }
  if (!isShariaTransition(payload)) {
    throw new ShariaRequestError('Réponse de transition Charia invalide.', response.status, responseCorrelationId);
  }
  return payload;
}
