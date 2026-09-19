'use client';

import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  type CreateInvestmentSubscription,
  type InvestmentSubscription,
  type InvestmentSubscriptionAction,
} from './subscription-api';
import styles from '../products/products.module.css';

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const canonicalAmount = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function validSubscription(value: unknown): value is InvestmentSubscription { return isRecord(value) && typeof value.accountId === 'string' && UUID.test(value.accountId) && typeof value.customerId === 'string' && UUID.test(value.customerId) && typeof value.productId === 'string' && UUID.test(value.productId) && typeof value.productTermsVersionId === 'string' && UUID.test(value.productTermsVersionId) && typeof value.contractVersion === 'string' && typeof value.investorNisba === 'string' && typeof value.bankNisba === 'string' && typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency) && typeof value.status === 'string' && value.status.trim().length > 0; }
export async function subscriptionCommand(path: string, body: unknown, signal: AbortSignal): Promise<InvestmentSubscription> { const correlationId = crypto.randomUUID(); const response = await fetch(`/api/core/investment-accounts/subscriptions${path}`, { method: 'POST', signal, headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID(), 'x-correlation-id': correlationId }, body: JSON.stringify(body) }); const payload: unknown = await response.json().catch(() => undefined); const problem = isRecord(payload) ? payload : {}; const detail = typeof problem.detail === 'string' && problem.detail.trim() ? problem.detail : typeof problem.title === 'string' && problem.title.trim() ? problem.title : `Erreur HTTP ${response.status}`; const reference = typeof problem.correlationId === 'string' && problem.correlationId.trim() ? problem.correlationId : response.headers.get('x-correlation-id') ?? correlationId; if (!response.ok) throw new Error(`${detail} (référence : ${reference})`); if (!validSubscription(payload)) throw new Error(`Réponse de souscription invalide. (référence : ${reference})`); return payload; }

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export class SubscriptionOperationGate {
  private running = false;

  tryStart(): boolean {
    if (this.running) return false;
    this.running = true;
    return true;
  }

  finish(): void {
    this.running = false;
  }
}

type OperationCallbacks = {
  readonly loading: () => void;
  readonly success: (result: InvestmentSubscription) => void;
  readonly failure: (message: string) => void;
  readonly settled: () => void;
};

export class SubscriptionOperationCoordinator {
  private readonly gate = new SubscriptionOperationGate();
  private revision = 0;
  private mounted = true;
  private controller?: AbortController;

  mount(): void { this.mounted = true; }
  invalidate(): void { this.revision += 1; }
  unmount(): void { this.mounted = false; this.invalidate(); this.controller?.abort(); this.controller = undefined; }

  async run(work: (signal: AbortSignal) => Promise<InvestmentSubscription>, callbacks: OperationCallbacks): Promise<boolean> {
    if (!this.gate.tryStart()) return false;
    const expectedRevision = this.revision;
    const controller = new AbortController();
    this.controller = controller;
    callbacks.loading();
    try {
      const result = await work(controller.signal);
      if (this.mounted && this.revision === expectedRevision) callbacks.success(result);
    }
    catch (cause) {
      if (this.mounted && this.revision === expectedRevision) callbacks.failure(cause instanceof Error ? cause.message : 'La commande n’a pas pu être exécutée.');
    }
    finally {
      this.gate.finish();
      if (this.controller === controller) this.controller = undefined;
      if (this.mounted) callbacks.settled();
    }
    return true;
  }
}

const actionLabels: Readonly<Record<string, string>> = {
  START: 'Démarrer la souscription', ACCEPT: 'Accepter les conditions', ACTIVATE: 'Activer le compte',
  DEPOSIT: 'Enregistrer un dépôt', WITHDRAW: 'Enregistrer un retrait', RENEW: 'Renouveler',
  BLOCK: 'Bloquer', UNBLOCK: 'Débloquer', MATURE: 'Arriver à échéance',
  SUCCESSION: 'Ouvrir une succession', CLOSE: 'Clôturer',
};

export function actionsForStatus(status: string, termsAccepted = false): readonly string[] {
  switch (status) {
    case 'PRE_SIMULATION': return ['START'];
    case 'PENDING_SUBSCRIPTION': return termsAccepted ? ['ACTIVATE'] : ['ACCEPT'];
    case 'ACTIVE': return ['DEPOSIT', 'WITHDRAW', 'RENEW', 'BLOCK', 'MATURE', 'SUCCESSION', 'CLOSE'];
    case 'BLOCKED': return ['UNBLOCK', 'SUCCESSION', 'CLOSE'];
    case 'MATURED': return ['RENEW', 'SUCCESSION', 'CLOSE'];
    case 'SUCCESSION': return ['CLOSE'];
    default: return [];
  }
}

export type SubscriptionDraftField = keyof CreateInvestmentSubscription;
export function subscriptionDraftFieldErrors(input: CreateInvestmentSubscription): Partial<Record<SubscriptionDraftField, string>> {
  const errors: Partial<Record<SubscriptionDraftField, string>> = {};
  for (const key of ['accountId', 'customerId', 'productId', 'productTermsVersionId'] as const) {
    if (!UUID.test(input[key])) errors[key] = 'Saisissez un UUID valide.';
  }
  if (!input.contractVersion.trim()) errors.contractVersion = 'La version du contrat est obligatoire.';
  if (!/^[A-Z]{3}$/.test(input.currency)) errors.currency = 'La devise doit contenir trois lettres majuscules.';
  const investorNisba = Number(input.investorNisba), bankNisba = Number(input.bankNisba);
  if (!canonicalAmount.test(input.investorNisba) || !Number.isFinite(investorNisba) || investorNisba < 0) errors.investorNisba = 'Saisissez une Nisba positive canonique.';
  if (!canonicalAmount.test(input.bankNisba) || !Number.isFinite(bankNisba) || bankNisba < 0) errors.bankNisba = 'Saisissez une Nisba positive canonique.';
  if (!errors.investorNisba && !errors.bankNisba && Math.abs(investorNisba + bankNisba - 100) > 1e-9) {
    errors.investorNisba = 'Les deux Nisba doivent totaliser exactement 100 %.';
    errors.bankNisba = 'Les deux Nisba doivent totaliser exactement 100 %.';
  }
  return errors;
}

export function validateSubscriptionDraft(input: CreateInvestmentSubscription): string | undefined {
  const errors = subscriptionDraftFieldErrors(input);
  if (errors.accountId || errors.customerId || errors.productId || errors.productTermsVersionId) return 'Les quatre identifiants doivent être des UUID valides.';
  if (errors.investorNisba || errors.bankNisba) return 'Les Nisba doivent totaliser exactement 100 %.';
  return errors.contractVersion ?? errors.currency;
}

export type SubscriptionActionFieldErrors = { amount?: string; reason?: string; maturityDate?: string; caseReference?: string; nonGuaranteeAccepted?: string; profitSharingMethodAccepted?: string };
export function subscriptionActionFieldErrors(action: InvestmentSubscriptionAction): SubscriptionActionFieldErrors {
  const errors: SubscriptionActionFieldErrors = {};
  if ((action.type === 'DEPOSIT' || action.type === 'WITHDRAW') && (!canonicalAmount.test(action.amount ?? '') || Number(action.amount) <= 0)) errors.amount = 'Un montant canonique strictement positif est obligatoire.';
  if ((action.type === 'BLOCK' || action.type === 'UNBLOCK') && !(action.reason?.trim())) errors.reason = 'Le motif est obligatoire.';
  if (action.type === 'RENEW' && !isCalendarDate(action.maturityDate ?? '')) errors.maturityDate = 'La nouvelle échéance doit être une date valide.';
  if (action.type === 'SUCCESSION' && !(action.caseReference?.trim())) errors.caseReference = 'La référence de succession est obligatoire.';
  if (action.type === 'ACCEPT' && !action.nonGuaranteeAccepted) errors.nonGuaranteeAccepted = 'L’absence de garantie du capital doit être acceptée.';
  if (action.type === 'ACCEPT' && !action.profitSharingMethodAccepted) errors.profitSharingMethodAccepted = 'La méthode de partage des profits doit être acceptée.';
  return errors;
}

export function validateSubscriptionAction(action: InvestmentSubscriptionAction): string | undefined {
  const errors = subscriptionActionFieldErrors(action);
  if (errors.nonGuaranteeAccepted || errors.profitSharingMethodAccepted) return 'Les deux consentements contractuels sont obligatoires.';
  return errors.amount ?? errors.reason ?? errors.maturityDate ?? errors.caseReference;
}

function errorProps(id: string, error?: string, hintId?: string) {
  const describedBy = [hintId, error ? `${id}-error` : undefined].filter(Boolean).join(' ') || undefined;
  return { 'aria-invalid': Boolean(error), 'aria-describedby': describedBy } as const;
}
function FieldError({ id, children }: { readonly id: string; readonly children?: ReactNode }) {
  return children ? <span id={`${id}-error`} role="alert">{children}</span> : null;
}

export function SubscriptionConsole() {
  const [draft, setDraft] = useState<CreateInvestmentSubscription>({ accountId: '', customerId: '', productId: '', productTermsVersionId: '', contractVersion: '1.0', investorNisba: '70', bankNisba: '30', currency: 'DZD' });
  const [subscription, setSubscription] = useState<InvestmentSubscription>();
  const [actionType, setActionType] = useState('START');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [maturityDate, setMaturityDate] = useState('');
  const [caseReference, setCaseReference] = useState('');
  const [nonGuaranteeAccepted, setNonGuaranteeAccepted] = useState(false);
  const [profitSharingMethodAccepted, setProfitSharingMethodAccepted] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [draftAttempted, setDraftAttempted] = useState(false);
  const [actionAttempted, setActionAttempted] = useState(false);
  const operations = useRef(new SubscriptionOperationCoordinator());
  useEffect(() => { operations.current.mount(); return () => operations.current.unmount(); }, []);
  const availableActions = useMemo(() => actionsForStatus(subscription?.status ?? '', termsAccepted), [subscription?.status, termsAccepted]);
  const selectedAction = availableActions.includes(actionType) ? actionType : availableActions[0] ?? '';
  const draftErrors = subscriptionDraftFieldErrors(draft);
  const visibleDraftError = (key: SubscriptionDraftField) => draftAttempted ? draftErrors[key] : undefined;

  function buildAction(): InvestmentSubscriptionAction {
    return {
      type: selectedAction, businessDate: new Date().toISOString().slice(0, 10),
      ...(selectedAction === 'ACCEPT' ? { acceptedAt: new Date().toISOString(), nonGuaranteeAccepted, profitSharingMethodAccepted } : {}),
      ...(['DEPOSIT', 'WITHDRAW'].includes(selectedAction) ? { amount } : {}),
      ...(['BLOCK', 'UNBLOCK'].includes(selectedAction) ? { reason } : {}),
      ...(selectedAction === 'RENEW' ? { maturityDate } : {}),
      ...(selectedAction === 'SUCCESSION' ? { caseReference } : {}),
    };
  }
  const actionErrors = subscriptionActionFieldErrors(buildAction());
  const visibleActionError = <K extends keyof SubscriptionActionFieldErrors>(key: K) => actionAttempted ? actionErrors[key] : undefined;

  function changeDraft<K extends keyof CreateInvestmentSubscription>(key: K, value: CreateInvestmentSubscription[K]) {
    operations.current.invalidate();
    setSubscription(undefined);
    setTermsAccepted(false);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function run(work: (signal: AbortSignal) => Promise<InvestmentSubscription>, success: string, acceptedTerms = false) {
    await operations.current.run(work, {
      loading: () => { setBusy(true); setError(''); setMessage(''); },
      success: (result) => { setSubscription(result); setTermsAccepted(acceptedTerms && result.status === 'PENDING_SUBSCRIPTION'); setMessage(success); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDraftAttempted(true);
    const validation = validateSubscriptionDraft(draft);
    if (validation) { setError(validation); return; }
    await run((signal) => subscriptionCommand('', draft, signal), 'Pré-simulation créée. Vous pouvez démarrer le cycle de souscription.');
  }

  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subscription || !selectedAction) return;
    setActionAttempted(true);
    const command = buildAction();
    const validation = validateSubscriptionAction(command);
    if (validation) { setError(validation); return; }
    await run((signal) => subscriptionCommand(`/${encodeURIComponent(subscription.accountId)}/actions`, command, signal), `${actionLabels[selectedAction]} : transition enregistrée.`, selectedAction === 'ACCEPT');
  }

  return <div className={styles.grid} aria-busy={busy}>
    <section className={styles.card} aria-labelledby="subscription-create-title">
      <h2 id="subscription-create-title">Nouvelle souscription</h2>
      <form className={styles.form} onSubmit={create} noValidate>
        <Identifier id="subscription-account-id" label="Compte" value={draft.accountId} error={visibleDraftError('accountId')} disabled={busy} onChange={(value) => changeDraft('accountId', value)} />
        <Identifier id="subscription-customer-id" label="Client" value={draft.customerId} error={visibleDraftError('customerId')} disabled={busy} onChange={(value) => changeDraft('customerId', value)} />
        <Identifier id="subscription-product-id" label="Produit" value={draft.productId} error={visibleDraftError('productId')} disabled={busy} onChange={(value) => changeDraft('productId', value)} />
        <Identifier id="subscription-terms-id" label="Version des conditions" value={draft.productTermsVersionId} error={visibleDraftError('productTermsVersionId')} disabled={busy} onChange={(value) => changeDraft('productTermsVersionId', value)} />
        <div className={styles.row}>
          <label className={styles.field}>Version du contrat<input id="subscription-contract-version" required disabled={busy} value={draft.contractVersion} onChange={(event) => changeDraft('contractVersion', event.target.value)} {...errorProps('subscription-contract-version', visibleDraftError('contractVersion'))} /><FieldError id="subscription-contract-version">{visibleDraftError('contractVersion')}</FieldError></label>
          <label className={styles.field}>Devise<input id="subscription-currency" required disabled={busy} maxLength={3} value={draft.currency} onChange={(event) => changeDraft('currency', event.target.value.toUpperCase())} {...errorProps('subscription-currency', visibleDraftError('currency'))} /><FieldError id="subscription-currency">{visibleDraftError('currency')}</FieldError></label>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>Nisba investisseur (%)<input id="subscription-investor-nisba" required disabled={busy} inputMode="decimal" value={draft.investorNisba} onChange={(event) => changeDraft('investorNisba', event.target.value)} {...errorProps('subscription-investor-nisba', visibleDraftError('investorNisba'))} /><FieldError id="subscription-investor-nisba">{visibleDraftError('investorNisba')}</FieldError></label>
          <label className={styles.field}>Nisba banque (%)<input id="subscription-bank-nisba" required disabled={busy} inputMode="decimal" value={draft.bankNisba} onChange={(event) => changeDraft('bankNisba', event.target.value)} {...errorProps('subscription-bank-nisba', visibleDraftError('bankNisba'))} /><FieldError id="subscription-bank-nisba">{visibleDraftError('bankNisba')}</FieldError></label>
        </div>
        <button className={styles.button} disabled={busy}>{busy ? 'Pré-simulation…' : 'Pré-simuler la souscription'}</button>
      </form>
      <Feedback error={error} message={message} />
    </section>

    <section className={styles.card} aria-labelledby="subscription-lifecycle-title">
      <h2 id="subscription-lifecycle-title">Cycle de vie</h2>
      {subscription ? <>
        <p role="status">État actuel : <span className={styles.badge}>{subscription.status}</span></p>
        {availableActions.length > 0 ? <form className={styles.form} onSubmit={transition}>
          <label className={styles.field}>Transition autorisée<select disabled={busy} value={selectedAction} onChange={(event) => { setActionType(event.target.value); setActionAttempted(false); }}>{availableActions.map((value) => <option key={value} value={value}>{actionLabels[value]}</option>)}</select></label>
          {['DEPOSIT', 'WITHDRAW'].includes(selectedAction) && <label className={styles.field}>Montant<input id="subscription-action-amount" required disabled={busy} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} {...errorProps('subscription-action-amount', visibleActionError('amount'))} /><FieldError id="subscription-action-amount">{visibleActionError('amount')}</FieldError></label>}
          {['BLOCK', 'UNBLOCK'].includes(selectedAction) && <label className={styles.field}>Motif<textarea id="subscription-action-reason" required disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} {...errorProps('subscription-action-reason', visibleActionError('reason'))} /><FieldError id="subscription-action-reason">{visibleActionError('reason')}</FieldError></label>}
          {selectedAction === 'RENEW' && <label className={styles.field}>Nouvelle échéance<input id="subscription-action-maturity" required disabled={busy} type="date" value={maturityDate} onChange={(event) => setMaturityDate(event.target.value)} {...errorProps('subscription-action-maturity', visibleActionError('maturityDate'))} /><FieldError id="subscription-action-maturity">{visibleActionError('maturityDate')}</FieldError></label>}
          {selectedAction === 'SUCCESSION' && <label className={styles.field}>Référence du dossier<input id="subscription-action-case" required disabled={busy} value={caseReference} onChange={(event) => setCaseReference(event.target.value)} {...errorProps('subscription-action-case', visibleActionError('caseReference'))} /><FieldError id="subscription-action-case">{visibleActionError('caseReference')}</FieldError></label>}
          {selectedAction === 'ACCEPT' && <fieldset disabled={busy}><legend>Consentements contractuels</legend><label><input id="subscription-non-guarantee" required type="checkbox" checked={nonGuaranteeAccepted} onChange={(event) => setNonGuaranteeAccepted(event.target.checked)} {...errorProps('subscription-non-guarantee', visibleActionError('nonGuaranteeAccepted'))} /> Absence de garantie du capital acceptée<FieldError id="subscription-non-guarantee">{visibleActionError('nonGuaranteeAccepted')}</FieldError></label><label><input id="subscription-profit-sharing" required type="checkbox" checked={profitSharingMethodAccepted} onChange={(event) => setProfitSharingMethodAccepted(event.target.checked)} {...errorProps('subscription-profit-sharing', visibleActionError('profitSharingMethodAccepted'))} /> Méthode de partage des profits acceptée<FieldError id="subscription-profit-sharing">{visibleActionError('profitSharingMethodAccepted')}</FieldError></label></fieldset>}
          <button className={styles.button} disabled={busy}>{busy ? 'Transition en cours…' : actionLabels[selectedAction]}</button>
        </form> : <p className={styles.hint}>Ce cycle est terminé ; aucune transition supplémentaire n’est disponible.</p>}
      </> : <p className={styles.hint}>Créez la pré-simulation avant toute transition.</p>}
    </section>
  </div>;
}

export function Identifier({ id, label, value, error, disabled, onChange }: { id: string; label: string; value: string; error?: string; disabled: boolean; onChange: (value: string) => void }) {
  return <label className={styles.field}>{label}<input id={id} required disabled={disabled} spellCheck={false} autoComplete="off" value={value} onChange={(event) => onChange(event.target.value.trim())} {...errorProps(id, error, 'uuid-hint')} /><FieldError id={id}>{error}</FieldError></label>;
}

function Feedback({ error, message }: { error: string; message: string }) {
  return <div aria-live="polite" aria-atomic="true">{error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}{message && <p className={styles.notice} role="status">{message}</p>}<p id="uuid-hint" className={styles.hint}>Format attendu : UUID, par exemple 123e4567-e89b-42d3-a456-426614174000.</p></div>;
}
