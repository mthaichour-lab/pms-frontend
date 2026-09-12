import type { AccountingAcknowledgementCommand, AccountingAcknowledgementResult, AccountingEventCommand, AccountingEventResult, ReconciliationCommand, ReconciliationResult } from '@bank/pms-api-client';
export type { AccountingAcknowledgementCommand, AccountingAcknowledgementResult, AccountingEventCommand, AccountingEventResult, ReconciliationCommand, ReconciliationResult };
const exactDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export type ReconciliationField = keyof ReconciliationCommand;
export function reconciliationFieldErrors(command: ReconciliationCommand): Partial<Record<ReconciliationField, string>> {
  const errors: Partial<Record<ReconciliationField, string>> = {};
  if (!exactDate(command.businessDate)) errors.businessDate = 'Saisissez une date métier valide.';
  if (!/^[A-Z]{3}$/.test(command.currency)) errors.currency = 'La devise doit contenir trois lettres majuscules.';
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(command.generalLedgerAmount)) errors.generalLedgerAmount = 'Saisissez un montant décimal canonique.';
  if (command.sourceReference.trim().length < 3 || command.sourceReference.length > 256) errors.sourceReference = 'La référence doit contenir entre 3 et 256 caractères.';
  if (!/^[0-9a-f]{64}$/.test(command.sourceChecksumSha256)) errors.sourceChecksumSha256 = 'Le checksum doit contenir 64 caractères hexadécimaux minuscules.';
  return errors;
}
export function validReconciliation(command: ReconciliationCommand): boolean {
  return Object.keys(reconciliationFieldErrors(command)).length === 0;
}
export async function reconcile(command: ReconciliationCommand): Promise<ReconciliationResult> {
  const response = await fetch('/api/core/accounting/reconciliations', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(command) });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) { const problem = (payload ?? {}) as { detail?: string; title?: string; correlationId?: string }; const message = problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`; throw new Error(problem.correlationId ? `${message} (référence : ${problem.correlationId})` : message); }
  return payload as ReconciliationResult;
}
export function validAccountingEvent(command: AccountingEventCommand): boolean {
  if (![command.runId, command.poolId, command.productId, command.eventId, command.entityId].every((value) => value.trim().length > 0 && value.length <= 128) || !exactDate(command.businessDate) || !Number.isInteger(command.currencyScale) || command.currencyScale < 0 || command.currencyScale > 6 || command.lines.length < 2 || command.lines.length > 1000) return false;
  const totals = new Map<string, { debit: bigint; credit: bigint }>();
  for (const line of command.lines) {
    const debit = minorUnits(line.debit, command.currencyScale), credit = minorUnits(line.credit, command.currencyScale);
    if (!/^[A-Z0-9a-f:_-]{2,128}$/.test(line.accountCode) || !/^[A-Z]{3}$/.test(line.currency) || debit === undefined || credit === undefined || (debit > 0n) === (credit > 0n)) return false;
    const total = totals.get(line.currency) ?? { debit: 0n, credit: 0n };
    totals.set(line.currency, { debit: total.debit + debit, credit: total.credit + credit });
  }
  return [...totals.values()].every((total) => total.debit === total.credit);
}
export type AccountingEventFieldErrors = {
  runId?: string; poolId?: string; productId?: string; eventId?: string; entityId?: string;
  businessDate?: string; currencyScale?: string; lines?: string;
  lineFields: Array<{ accountCode?: string; currency?: string; debit?: string; credit?: string }>;
};
export function accountingEventFieldErrors(command: AccountingEventCommand): AccountingEventFieldErrors {
  const errors: AccountingEventFieldErrors = { lineFields: command.lines.map(() => ({})) };
  for (const key of ['runId', 'poolId', 'productId', 'eventId', 'entityId'] as const) {
    if (command[key].trim().length === 0 || command[key].length > 128) errors[key] = 'Champ requis, limité à 128 caractères.';
  }
  if (!exactDate(command.businessDate)) errors.businessDate = 'Saisissez une date métier valide.';
  if (!Number.isInteger(command.currencyScale) || command.currencyScale < 0 || command.currencyScale > 6) errors.currencyScale = 'L’échelle doit être un entier entre 0 et 6.';
  if (command.lines.length < 2 || command.lines.length > 1000) errors.lines = 'Le journal doit contenir entre 2 et 1 000 lignes.';
  command.lines.forEach((line, index) => {
    const fields = errors.lineFields[index]!;
    const debit = minorUnits(line.debit, command.currencyScale);
    const credit = minorUnits(line.credit, command.currencyScale);
    if (!/^[A-Z0-9a-f:_-]{2,128}$/.test(line.accountCode)) fields.accountCode = 'Compte requis, au format comptable attendu.';
    if (!/^[A-Z]{3}$/.test(line.currency)) fields.currency = 'Devise à trois lettres majuscules requise.';
    if (debit === undefined) fields.debit = `Montant positif avec au plus ${command.currencyScale} décimales.`;
    if (credit === undefined) fields.credit = `Montant positif avec au plus ${command.currencyScale} décimales.`;
    if (debit !== undefined && credit !== undefined && (debit > 0n) === (credit > 0n)) {
      fields.debit = fields.debit ?? 'Une ligne doit porter un débit ou un crédit, exclusivement.';
      fields.credit = fields.credit ?? 'Une ligne doit porter un débit ou un crédit, exclusivement.';
    }
  });
  if (!validAccountingEvent(command) && !errors.lines && !Object.keys(errors).some((key) => key !== 'lineFields') && errors.lineFields.every((line) => Object.keys(line).length === 0)) errors.lines = 'Les débits et crédits doivent être exactement équilibrés par devise.';
  return errors;
}
function minorUnits(value: string, scale: number): bigint | undefined {
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (!match || (match[2]?.length ?? 0) > scale) return undefined;
  return BigInt(match[1]) * (10n ** BigInt(scale)) + BigInt((match[2] ?? '').padEnd(scale, '0') || '0');
}
export async function emitAccountingEvent(command: AccountingEventCommand): Promise<AccountingEventResult> {
  return accountingRequest('/api/core/accounting/events', command);
}
export function validAcknowledgement(command: AccountingAcknowledgementCommand): boolean {
  const actions = ['ACKNOWLEDGED', 'REJECTED', 'RETRIED', 'REVERSED'];
  return actions.includes(command.action) && command.externalReference.trim().length > 0 && command.externalReference.length <= 256 && (command.action !== 'REJECTED' || ((command.reason?.trim().length ?? 0) >= 10 && (command.reason?.length ?? 0) <= 2000));
}
export async function acknowledgeAccountingEvent(journalEntryId: string, command: AccountingAcknowledgementCommand): Promise<AccountingAcknowledgementResult> {
  return accountingRequest(`/api/core/accounting/journals/${encodeURIComponent(journalEntryId)}/acknowledgements`, command);
}
async function accountingRequest<TResult>(path: string, command: unknown): Promise<TResult> {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(command) });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) { const problem = (payload ?? {}) as { detail?: string; title?: string; correlationId?: string }; const message = problem.detail ?? problem.title ?? `Erreur HTTP ${response.status}`; throw new Error(problem.correlationId ? `${message} (référence : ${problem.correlationId})` : message); }
  return payload as TResult;
}
