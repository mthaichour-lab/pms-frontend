'use client';
import { FormEvent, useEffect, useRef, useState, type ReactNode } from 'react';
import { type CustomerProfile, type LegalRestriction } from './customer-api';
import styles from '../products/products.module.css';
import { EntityCatalog } from '../entity-catalog';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const token = /^tok_[A-Za-z0-9_-]{16,128}$/;
const segments = ['RETAIL', 'SME', 'CORPORATE', 'INSTITUTIONAL'];
const kycStatuses = ['PENDING', 'VERIFIED', 'EXPIRED', 'REJECTED'];
const restrictionKinds = ['BLOCK', 'OPPOSITION', 'SEIZURE'];
const initialProfile: CustomerProfile = { customerId: '', identityToken: '', beneficialOwnerTokens: [], representativeTokens: [], segment: 'RETAIL', kycStatus: 'PENDING', legalForm: 'PERSON', sectorCode: 'RETAIL', branchCode: '001', restrictions: [] };
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function validRestriction(value: unknown): value is LegalRestriction { return isRecord(value) && typeof value.restrictionId === 'string' && value.restrictionId.trim().length > 0 && typeof value.kind === 'string' && restrictionKinds.includes(value.kind) && typeof value.reason === 'string' && value.reason.trim().length > 0 && typeof value.effectiveFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.effectiveFrom) && (value.liftedAt === undefined || typeof value.liftedAt === 'string'); }
function isCustomerProfile(value: unknown): value is CustomerProfile { return isRecord(value) && typeof value.customerId === 'string' && uuid.test(value.customerId) && typeof value.identityToken === 'string' && token.test(value.identityToken) && Array.isArray(value.beneficialOwnerTokens) && value.beneficialOwnerTokens.every((item) => typeof item === 'string' && token.test(item)) && Array.isArray(value.representativeTokens) && value.representativeTokens.every((item) => typeof item === 'string' && token.test(item)) && typeof value.segment === 'string' && segments.includes(value.segment) && typeof value.kycStatus === 'string' && kycStatuses.includes(value.kycStatus) && typeof value.legalForm === 'string' && typeof value.sectorCode === 'string' && typeof value.branchCode === 'string' && Array.isArray(value.restrictions) && value.restrictions.every(validRestriction); }
async function customerRequest<T>(path: string, body: unknown | undefined, validate: (value: unknown) => value is T, signal: AbortSignal): Promise<T> { const correlationId = crypto.randomUUID(); const response = await fetch(`/api/core/customers${path}`, { method: body === undefined ? 'GET' : 'POST', signal, headers: body === undefined ? { accept: 'application/json', 'x-correlation-id': correlationId } : { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID(), 'x-correlation-id': correlationId }, body: body === undefined ? undefined : JSON.stringify(body) }); const payload: unknown = await response.json().catch(() => undefined); const problem = isRecord(payload) ? payload : {}; const detail = typeof problem.detail === 'string' && problem.detail.trim() ? problem.detail : typeof problem.title === 'string' && problem.title.trim() ? problem.title : `Erreur HTTP ${response.status}`; const reference = typeof problem.correlationId === 'string' && problem.correlationId.trim() ? problem.correlationId : response.headers.get('x-correlation-id') ?? correlationId; if (!response.ok) throw new Error(`${detail} (référence : ${reference})`); if (!validate(payload)) throw new Error(`Réponse client invalide. (référence : ${reference})`); return payload; }
const restrictedResponse = (value: unknown): value is { restricted: true } => isRecord(value) && value.restricted === true;

export type CustomerField = 'customerId' | 'identityToken' | 'segment' | 'kycStatus' | 'legalForm' | 'sectorCode' | 'branchCode';
export function customerFieldErrors(profile: CustomerProfile): Partial<Record<CustomerField, string>> {
  const errors: Partial<Record<CustomerField, string>> = {};
  if (!uuid.test(profile.customerId)) errors.customerId = 'Saisissez un UUID client valide.';
  if (!token.test(profile.identityToken)) errors.identityToken = 'Saisissez un jeton tok_ contenant 16 à 128 caractères sécurisés.';
  if (!segments.includes(profile.segment)) errors.segment = 'Sélectionnez un segment valide.';
  if (!kycStatuses.includes(profile.kycStatus)) errors.kycStatus = 'Sélectionnez un statut KYC valide.';
  if (!profile.legalForm.trim()) errors.legalForm = 'La forme juridique est obligatoire.';
  if (!profile.sectorCode.trim()) errors.sectorCode = 'Le secteur est obligatoire.';
  if (!profile.branchCode.trim()) errors.branchCode = 'L’agence est obligatoire.';
  return errors;
}
export function restrictionFieldErrors(kind: string, reason: string): { kind?: string; reason?: string } {
  return {
    ...(!restrictionKinds.includes(kind) ? { kind: 'Sélectionnez une nature de restriction valide.' } : {}),
    ...(!reason.trim() ? { reason: 'Le motif de la restriction est obligatoire.' } : {}),
  };
}
export function restrictionActions(restriction: LegalRestriction): readonly string[] {
  return restriction.liftedAt ? [] : ['LIFT'];
}
export function snapshotCustomerProfile(profile: CustomerProfile): CustomerProfile {
  return { ...profile, beneficialOwnerTokens: [...profile.beneficialOwnerTokens], representativeTokens: [...profile.representativeTokens], restrictions: profile.restrictions.map((restriction) => ({ ...restriction })) };
}

type OperationCallbacks = { loading: () => void; success: (profile: CustomerProfile) => void; failure: (message: string) => void; settled: () => void };
export class CustomerOperationCoordinator {
  private running = false;
  private revision = 0;
  private mounted = true;
  private controller?: AbortController;
  mount(): void { this.mounted = true; }
  invalidate(): void { this.revision += 1; this.controller?.abort(); }
  unmount(): void { this.mounted = false; this.invalidate(); this.controller?.abort(); this.controller = undefined; }
  async run(work: (signal: AbortSignal) => Promise<CustomerProfile>, callbacks: OperationCallbacks): Promise<boolean> {
    if (this.running) return false;
    this.running = true; const controller = new AbortController(); this.controller = controller;
    const expectedRevision = this.revision;
    callbacks.loading();
    try {
      const profile = await work(controller.signal);
      if (this.mounted && expectedRevision === this.revision) callbacks.success(profile);
    } catch (cause) {
      if (this.mounted && expectedRevision === this.revision) callbacks.failure(cause instanceof Error ? cause.message : 'Erreur inattendue.');
    } finally {
      this.running = false;
      if (this.controller === controller) this.controller = undefined;
      if (this.mounted) callbacks.settled();
    }
    return true;
  }
}

function errorProps(id: string, error?: string, hint?: string) {
  const describedBy = [hint, error ? `${id}-error` : undefined].filter(Boolean).join(' ') || undefined;
  return { 'aria-invalid': Boolean(error), 'aria-describedby': describedBy } as const;
}
function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  return children ? <span id={`${id}-error`} role="alert">{children}</span> : null;
}

type CustomerFieldsProps = {
  profile: CustomerProfile; errors: Partial<Record<CustomerField, string>>; busy: boolean;
  onChange: (field: CustomerField, value: string) => void;
};
export function CustomerProfileFields({ profile, errors, busy, onChange }: CustomerFieldsProps) {
  return <>
    <label className={styles.field}>UUID client<input id="customer-id" required disabled={busy} spellCheck={false} autoComplete="off" value={profile.customerId} onChange={(event) => onChange('customerId', event.target.value.trim())} {...errorProps('customer-id', errors.customerId, 'customer-id-hint')} /><FieldError id="customer-id">{errors.customerId}</FieldError></label>
    <p id="customer-id-hint" className={styles.hint}>Format UUID attendu : xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx.</p>
    <label className={styles.field}>Jeton d’identité<input id="customer-identity-token" required disabled={busy} spellCheck={false} autoComplete="off" value={profile.identityToken} onChange={(event) => onChange('identityToken', event.target.value.trim())} placeholder="tok_…" {...errorProps('customer-identity-token', errors.identityToken)} /><FieldError id="customer-identity-token">{errors.identityToken}</FieldError></label>
    <div className={styles.row}>
      <label className={styles.field}>Segment<select id="customer-segment" required disabled={busy} value={profile.segment} onChange={(event) => onChange('segment', event.target.value)} {...errorProps('customer-segment', errors.segment)}>{segments.map((value) => <option key={value}>{value}</option>)}</select><FieldError id="customer-segment">{errors.segment}</FieldError></label>
      <label className={styles.field}>KYC<select id="customer-kyc" required disabled={busy} value={profile.kycStatus} onChange={(event) => onChange('kycStatus', event.target.value)} {...errorProps('customer-kyc', errors.kycStatus)}>{kycStatuses.map((value) => <option key={value}>{value}</option>)}</select><FieldError id="customer-kyc">{errors.kycStatus}</FieldError></label>
    </div>
    <div className={styles.row}>
      <label className={styles.field}>Forme juridique<input id="customer-legal-form" required disabled={busy} value={profile.legalForm} onChange={(event) => onChange('legalForm', event.target.value)} {...errorProps('customer-legal-form', errors.legalForm)} /><FieldError id="customer-legal-form">{errors.legalForm}</FieldError></label>
      <label className={styles.field}>Secteur<input id="customer-sector" required disabled={busy} value={profile.sectorCode} onChange={(event) => onChange('sectorCode', event.target.value)} {...errorProps('customer-sector', errors.sectorCode)} /><FieldError id="customer-sector">{errors.sectorCode}</FieldError></label>
    </div>
    <label className={styles.field}>Agence<input id="customer-branch" required disabled={busy} value={profile.branchCode} onChange={(event) => onChange('branchCode', event.target.value)} {...errorProps('customer-branch', errors.branchCode)} /><FieldError id="customer-branch">{errors.branchCode}</FieldError></label>
  </>;
}

export function CustomerConsole() {
  const [draft, setDraft] = useState<CustomerProfile>(initialProfile);
  const [profile, setProfile] = useState<CustomerProfile>();
  const [reason, setReason] = useState('');
  const [kind, setKind] = useState('BLOCK');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [profileAttempted, setProfileAttempted] = useState(false);
  const [restrictionAttempted, setRestrictionAttempted] = useState(false);
  const operations = useRef(new CustomerOperationCoordinator());
  useEffect(() => { operations.current.mount(); return () => operations.current.unmount(); }, []);
  const profileErrors = customerFieldErrors(draft);
  const visibleProfileErrors = profileAttempted ? profileErrors : {};
  const restrictionErrors = restrictionFieldErrors(kind, reason);
  const visibleRestrictionErrors = restrictionAttempted ? restrictionErrors : {};
  const today = () => new Date().toISOString().slice(0, 10);

  function changeDraft(field: CustomerField, value: string) {
    operations.current.invalidate();
    setDraft((current) => ({ ...current, [field]: value }));
    setProfile(undefined);
    setMessage('');
  }
  async function run(work: (signal: AbortSignal) => Promise<CustomerProfile>, success: string) {
    await operations.current.run(work, {
      loading: () => { setBusy(true); setError(''); setMessage(''); },
      success: (result) => { setProfile(result); setDraft(result); setMessage(success); },
      failure: setError,
      settled: () => setBusy(false),
    });
  }
  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileAttempted(true);
    if (profileErrors.customerId) return setError(profileErrors.customerId);
    const customerId = draft.customerId;
    await run((signal) => customerRequest(`/${encodeURIComponent(customerId)}`, undefined, isCustomerProfile, signal), 'Profil client chargé.');
  }
  async function create() {
    setProfileAttempted(true);
    const firstError = Object.values(profileErrors)[0];
    if (firstError) return setError(firstError);
    const snapshot = snapshotCustomerProfile({ ...draft, restrictions: [] });
    await run((signal) => customerRequest('', snapshot, isCustomerProfile, signal), 'Profil client créé.');
  }
  async function addRestriction() {
    if (!profile) return;
    setRestrictionAttempted(true);
    const firstError = restrictionErrors.kind ?? restrictionErrors.reason;
    if (firstError) return setError(firstError);
    const customerId = profile.customerId;
    const restriction: LegalRestriction = { restrictionId: crypto.randomUUID(), kind, reason: reason.trim(), effectiveFrom: today() };
    await run(async (signal) => { await customerRequest(`/${encodeURIComponent(customerId)}/restrictions`, restriction, restrictedResponse, signal); return customerRequest(`/${encodeURIComponent(customerId)}`, undefined, isCustomerProfile, signal); }, 'Restriction ajoutée.');
  }
  async function lift(restriction: LegalRestriction) {
    if (!profile || !restrictionActions(restriction).includes('LIFT')) return;
    const customerId = profile.customerId, restrictionId = restriction.restrictionId, liftedAt = today();
    await run((signal) => customerRequest(`/${encodeURIComponent(customerId)}/restrictions/${encodeURIComponent(restrictionId)}/lift`, { liftedAt }, isCustomerProfile, signal), 'Restriction levée.');
  }

  return <><EntityCatalog kind="customers" selectedId={draft.customerId} disabled={busy} onSelect={(customerId) => changeDraft('customerId', customerId)} /><div className={styles.grid} aria-busy={busy}>
    <section className={styles.card} aria-labelledby="customer-profile-title">
      <h2 id="customer-profile-title">Profil client tokenisé</h2>
      <form className={styles.form} onSubmit={lookup} noValidate>
        <CustomerProfileFields profile={draft} errors={visibleProfileErrors} busy={busy} onChange={changeDraft} />
        <div className={styles.actions}>
          <button className={styles.secondary} disabled={busy}>{busy ? 'Chargement…' : 'Consulter'}</button>
          <button type="button" className={styles.button} disabled={busy} onClick={() => void create()}>{busy ? 'Traitement…' : 'Créer'}</button>
        </div>
      </form>
      <div aria-live="polite" aria-atomic="true">{error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}{message && <p className={styles.notice} role="status">{message}</p>}</div>
    </section>
    <section className={styles.card} aria-labelledby="customer-restrictions-title">
      <h2 id="customer-restrictions-title">Restrictions légales</h2>
      {profile ? <>
        <span className={styles.badge}>{profile.kycStatus}</span>
        <dl className={styles.product}><dt>Client</dt><dd>{profile.customerId}</dd><dt>Restrictions</dt><dd>{profile.restrictions.length}</dd></dl>
        <ul className={styles.referenceList}>{profile.restrictions.map((item) => <li key={item.restrictionId}><div><strong>{item.kind}</strong><small>{item.reason} · depuis {item.effectiveFrom}{item.liftedAt ? ` · levée le ${item.liftedAt}` : ''}</small></div>{restrictionActions(item).includes('LIFT') && <button type="button" className={styles.secondary} disabled={busy} onClick={() => void lift(item)}>Lever</button>}</li>)}</ul>
        <div className={styles.form}>
          <label className={styles.field}>Nature<select id="restriction-kind" required disabled={busy} value={kind} onChange={(event) => setKind(event.target.value)} {...errorProps('restriction-kind', visibleRestrictionErrors.kind)}>{restrictionKinds.map((value) => <option key={value}>{value}</option>)}</select><FieldError id="restriction-kind">{visibleRestrictionErrors.kind}</FieldError></label>
          <label className={styles.field}>Motif<textarea id="restriction-reason" required disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} {...errorProps('restriction-reason', visibleRestrictionErrors.reason)} /><FieldError id="restriction-reason">{visibleRestrictionErrors.reason}</FieldError></label>
          <button type="button" className={styles.button} disabled={busy} onClick={() => void addRestriction()}>Ajouter la restriction</button>
        </div>
      </> : <p className={styles.hint}>Chargez ou créez un profil avant d’appliquer une restriction.</p>}
    </section>
  </div></>;
}
