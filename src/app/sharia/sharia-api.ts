import type { ShariaDecision, ShariaOpinion, ShariaReviewSubmission, ShariaReviewTransition } from '@bank/pms-api-client';
export type { ShariaDecision, ShariaOpinion, ShariaReviewSubmission, ShariaReviewTransition };
export type ShariaAction = { kind: 'submit'; command: ShariaReviewSubmission } | { kind: 'review'; reviewId: string; command: ShariaOpinion } | { kind: 'decide'; reviewId: string; command: ShariaDecision };
export function shariaValidationMessage(action: ShariaAction): string | undefined {
  if (action.kind === 'submit') return action.command.resourceType.trim().length >= 2 && action.command.resourceId.trim().length > 0 ? undefined : 'La ressource à examiner est obligatoire.';
  if (!action.reviewId.trim()) return 'L’identifiant de revue est obligatoire.';
  if (action.kind === 'review') return action.command.opinion.trim().length >= 10 ? undefined : 'L’avis doit contenir au moins 10 caractères.';
  if (!['APPROVED', 'REJECTED'].includes(action.command.decision)) return 'La décision est invalide.';
  if (action.command.justification.trim().length < 10) return 'La justification doit contenir au moins 10 caractères.';
  if (!/^[0-9a-f-]{36}$/i.test(action.command.evidenceDocumentId)) return 'La preuve documentaire doit être un UUID.';
}
export async function shariaRequest(action: ShariaAction): Promise<ShariaReviewTransition> {
  const suffix = action.kind === 'submit' ? '' : `/${encodeURIComponent(action.reviewId)}/${action.kind}`;
  const response = await fetch(`/api/core/compliance/sharia-reviews${suffix}`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(action.command) });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) { const problem = (payload ?? {}) as { detail?: string; title?: string; correlationId?: string }; const message = problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`; throw new Error(problem.correlationId ? `${message} (référence : ${problem.correlationId})` : message); }
  return payload as ShariaReviewTransition;
}
