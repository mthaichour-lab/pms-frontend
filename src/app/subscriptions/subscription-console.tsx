'use client';

import { FormEvent, useMemo, useRef, useState } from 'react';
import {
  createSubscription,
  transitionSubscription,
  type CreateInvestmentSubscription,
  type InvestmentSubscription,
  type InvestmentSubscriptionAction,
} from './subscription-api';
import styles from '../products/products.module.css';

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const canonicalAmount = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

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

export function validateSubscriptionDraft(input: CreateInvestmentSubscription): string | undefined {
  if (![input.accountId, input.customerId, input.productId, input.productTermsVersionId].every((id) => UUID.test(id))) {
    return 'Les quatre identifiants doivent être des UUID valides.';
  }
  if (!input.contractVersion.trim()) return 'La version du contrat est obligatoire.';
  if (!/^[A-Z]{3}$/.test(input.currency)) return 'La devise doit contenir trois lettres majuscules.';
  const investorNisba = Number(input.investorNisba), bankNisba = Number(input.bankNisba);
  if (!Number.isFinite(investorNisba) || !Number.isFinite(bankNisba) || investorNisba < 0 || bankNisba < 0 || Math.abs(investorNisba + bankNisba - 100) > 1e-9) return 'Les Nisba doivent totaliser exactement 100 %.';
  return undefined;
}

export function validateSubscriptionAction(action: InvestmentSubscriptionAction): string | undefined {
  if ((action.type === 'DEPOSIT' || action.type === 'WITHDRAW') && !positiveAmount.test(action.amount ?? '')) return 'Un montant strictement positif est obligatoire.';
  if ((action.type === 'BLOCK' || action.type === 'UNBLOCK') && !(action.reason?.trim())) return 'Le motif est obligatoire.';
  if (action.type === 'RENEW' && !/^\d{4}-\d{2}-\d{2}$/.test(action.maturityDate ?? '')) return 'La nouvelle échéance est obligatoire.';
  if (action.type === 'SUCCESSION' && !(action.caseReference?.trim())) return 'La référence de succession est obligatoire.';
  if (action.type === 'ACCEPT' && (!action.nonGuaranteeAccepted || !action.profitSharingMethodAccepted)) return 'Les deux consentements contractuels sont obligatoires.';
  return undefined;
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
  const availableActions = useMemo(() => actionsForStatus(subscription?.status ?? ''), [subscription?.status]);
  const selectedAction = availableActions.includes(actionType) ? actionType : availableActions[0] ?? '';

  function changeDraft<K extends keyof CreateInvestmentSubscription>(key: K, value: CreateInvestmentSubscription[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function run(work: () => Promise<InvestmentSubscription>, success: string) {
    setBusy(true); setError(''); setMessage('');
    try { setSubscription(await work()); setMessage(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'La commande n’a pas pu être exécutée.'); }
    finally { setBusy(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateSubscriptionDraft(draft);
    if (validation) { setError(validation); return; }
    await run(() => createSubscription(draft), 'Pré-simulation créée. Vous pouvez démarrer le cycle de souscription.');
  }

  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subscription || !selectedAction) return;
    const command: InvestmentSubscriptionAction = {
      type: selectedAction, businessDate: new Date().toISOString().slice(0, 10),
      ...(selectedAction === 'ACCEPT' ? { acceptedAt: new Date().toISOString(), nonGuaranteeAccepted, profitSharingMethodAccepted } : {}),
      ...(['DEPOSIT', 'WITHDRAW'].includes(selectedAction) ? { amount } : {}),
      ...(['BLOCK', 'UNBLOCK'].includes(selectedAction) ? { reason } : {}),
      ...(selectedAction === 'RENEW' ? { maturityDate } : {}),
      ...(selectedAction === 'SUCCESSION' ? { caseReference } : {}),
    };
    const validation = validateSubscriptionAction(command);
    if (validation) { setError(validation); return; }
    await run(() => transitionSubscription(subscription.accountId, command), `${actionLabels[selectedAction]} : transition enregistrée.`);
  }

  return <div className={styles.grid} aria-busy={busy}>
    <section className={styles.card} aria-labelledby="subscription-create-title">
      <h2 id="subscription-create-title">Nouvelle souscription</h2>
      <form className={styles.form} onSubmit={create} noValidate>
        <Identifier label="Compte" value={draft.accountId} onChange={(value) => changeDraft('accountId', value)} />
        <Identifier label="Client" value={draft.customerId} onChange={(value) => changeDraft('customerId', value)} />
        <Identifier label="Produit" value={draft.productId} onChange={(value) => changeDraft('productId', value)} />
        <Identifier label="Version des conditions" value={draft.productTermsVersionId} onChange={(value) => changeDraft('productTermsVersionId', value)} />
        <div className={styles.row}>
          <label className={styles.field}>Version du contrat<input required value={draft.contractVersion} onChange={(event) => changeDraft('contractVersion', event.target.value)} /></label>
          <label className={styles.field}>Devise<input required maxLength={3} value={draft.currency} onChange={(event) => changeDraft('currency', event.target.value.toUpperCase())} /></label>
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
          <label className={styles.field}>Transition autorisée<select value={selectedAction} onChange={(event) => setActionType(event.target.value)}>{availableActions.map((value) => <option key={value} value={value}>{actionLabels[value]}</option>)}</select></label>
          {['DEPOSIT', 'WITHDRAW'].includes(selectedAction) && <label className={styles.field}>Montant<input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>}
          {['BLOCK', 'UNBLOCK'].includes(selectedAction) && <label className={styles.field}>Motif<textarea required value={reason} onChange={(event) => setReason(event.target.value)} /></label>}
          {selectedAction === 'RENEW' && <label className={styles.field}>Nouvelle échéance<input required type="date" value={maturityDate} onChange={(event) => setMaturityDate(event.target.value)} /></label>}
          {selectedAction === 'SUCCESSION' && <label className={styles.field}>Référence du dossier<input required value={caseReference} onChange={(event) => setCaseReference(event.target.value)} /></label>}
          {selectedAction === 'ACCEPT' && <fieldset><legend>Consentements contractuels</legend><label><input type="checkbox" checked={nonGuaranteeAccepted} onChange={(event) => setNonGuaranteeAccepted(event.target.checked)} /> Absence de garantie du capital acceptée</label><label><input type="checkbox" checked={profitSharingMethodAccepted} onChange={(event) => setProfitSharingMethodAccepted(event.target.checked)} /> Méthode de partage des profits acceptée</label></fieldset>}
          <button className={styles.button} disabled={busy}>{busy ? 'Transition en cours…' : actionLabels[selectedAction]}</button>
        </form> : <p className={styles.hint}>Ce cycle est terminé ; aucune transition supplémentaire n’est disponible.</p>}
      </> : <p className={styles.hint}>Créez la pré-simulation avant toute transition.</p>}
    </section>
  </div>;
}

function Identifier({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className={styles.field}>{label}<input required spellCheck={false} autoComplete="off" aria-describedby="uuid-hint" value={value} onChange={(event) => onChange(event.target.value.trim())} /></label>;
}

function Feedback({ error, message }: { error: string; message: string }) {
  return <div aria-live="polite" aria-atomic="true">{error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}{message && <p className={styles.notice} role="status">{message}</p>}<p id="uuid-hint" className={styles.hint}>Format attendu : UUID, par exemple 123e4567-e89b-42d3-a456-426614174000.</p></div>;
}
