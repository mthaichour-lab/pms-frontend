'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { ExclusiveProductOperation, LatestProductRead } from './async-operation';
import { productReferencesRequest, referenceValidationMessage, validProductId, type CreateProductReferenceCommand, type ProductReference, type ProductReferenceKind } from './product-api';
import styles from './products.module.css';

const kinds: readonly { value: ProductReferenceKind; label: string; group: 'Documentaire' | 'Comptable' }[] = [
  { value: 'CONTRACTUAL_DOCUMENT', label: 'Document contractuel', group: 'Documentaire' },
  { value: 'REGULATORY_DOCUMENT', label: 'Document réglementaire', group: 'Documentaire' },
  { value: 'SHARIA_DOCUMENT', label: 'Document Charia', group: 'Documentaire' },
  { value: 'ACCOUNTING_SCHEMA', label: 'Schéma comptable', group: 'Comptable' },
];
const referenceKinds = new Set<string>(kinds.map((item) => item.value));
const referenceSources = new Set(['BA', 'SHARIA_COMMITTEE', 'AAOIFI', 'IFSB']);
function nonEmpty(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function validDate(value: unknown): value is string { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const parsed = new Date(`${value}T00:00:00Z`); return parsed.toISOString().slice(0, 10) === value; }
function validReference(value: unknown): value is ProductReference { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const item = value as Record<string, unknown>; return nonEmpty(item.referenceId) && nonEmpty(item.source) && referenceSources.has(item.source) && nonEmpty(item.referenceCode) && nonEmpty(item.version) && nonEmpty(item.title) && validDate(item.effectiveFrom) && nonEmpty(item.createdBy) && typeof item.kind === 'string' && referenceKinds.has(item.kind) && nonEmpty(item.associatedAt) && !Number.isNaN(Date.parse(item.associatedAt)); }
export function isProductReferenceList(value: unknown): value is readonly ProductReference[] { return Array.isArray(value) && value.every(validReference); }

export function ProductReferencesPanel({ defaultProductId }: { defaultProductId: string }) {
  const [productId, setProductId] = useState(defaultProductId);
  const [references, setReferences] = useState<readonly ProductReference[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [referenceInvalid, setReferenceInvalid] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const reads = useRef<LatestProductRead>(null);
  const commands = useRef<ExclusiveProductOperation>(null);
  if (!reads.current) reads.current = new LatestProductRead();
  if (!commands.current) commands.current = new ExclusiveProductOperation();
  useEffect(() => () => { reads.current?.cancel(); commands.current?.cancel(); }, []);
  useEffect(() => { reads.current?.cancel(); commands.current?.cancel(); setProductId(defaultProductId.trim()); setReferences([]); setLoaded(false); setBusy(false); setValidationAttempted(false); setMessage(''); setError(''); }, [defaultProductId]);

  function changeProductId(value: string) {
    reads.current!.cancel();
    setProductId(value.trim());
    setReferences([]);
    setLoaded(false);
    setBusy(commands.current!.isActive());
    setValidationAttempted(false);
    setMessage('');
    setError('');
  }

  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationAttempted(true);
    const requestedProductId = productId.trim();
    if (!validProductId(requestedProductId)) { setError('L’identifiant du produit doit être un UUID valide.'); return; }
    if (commands.current!.isActive()) return;
    await reads.current!.run(
      async (signal) => { const value: unknown = await productReferencesRequest<unknown>(requestedProductId, '', { signal }); if (!isProductReferenceList(value)) throw new Error('Réponse des associations invalide.'); return value; },
      {
        loading: () => { setBusy(true); setLoaded(false); setReferences([]); setMessage(''); setError(''); },
        success: (value) => { setReferences(value); setLoaded(true); setMessage('Associations chargées.'); },
        failure: setError,
        settled: () => setBusy(false),
      },
    );
  }

  async function associate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const requestedProductId = productId.trim();
    const command: CreateProductReferenceCommand = { kind: String(data.get('kind')) as ProductReferenceKind, referenceId: String(data.get('referenceId')).trim() };
    const validationError = referenceValidationMessage(command);
    setValidationAttempted(true);
    setReferenceInvalid(Boolean(validationError));
    if (!validProductId(requestedProductId)) { setMessage(''); setError('L’identifiant du produit doit être un UUID valide.'); return; }
    if (validationError) { setMessage(''); setError(validationError); return; }
    reads.current!.cancel();
    await commands.current!.run(
      async (signal) => {
        const associated: unknown = await productReferencesRequest<unknown>(requestedProductId, '', { method: 'POST', body: JSON.stringify(command), signal });
        if (!associated || typeof associated !== 'object' || (associated as Record<string, unknown>).associated !== true) throw new Error('Réponse d’association invalide.');
        const value: unknown = await productReferencesRequest<unknown>(requestedProductId, '', { signal }); if (!isProductReferenceList(value)) throw new Error('Réponse des associations invalide.'); return value;
      },
      {
        loading: () => { setBusy(true); setMessage(''); setError(''); },
        success: (value) => { setReferences(value); setLoaded(true); setMessage('Référence associée au produit.'); form.reset(); setReferenceInvalid(false); },
        failure: setError,
        settled: () => setBusy(false),
      },
    );
  }

  const presentKinds = new Set(references.map((reference) => reference.kind));
  const complete = kinds.every(({ value }) => presentKinds.has(value));

  return <div className={styles.grid} aria-busy={busy}>
    <section className={styles.card} aria-labelledby="association-title">
      <h2 id="association-title">Associations documentaires et comptables</h2>
      <form className={styles.form} onSubmit={load} noValidate>
        <label className={styles.field} htmlFor="reference-product-id">Identifiant produit<input id="reference-product-id" value={productId} onChange={(event) => changeProductId(event.target.value)} required disabled={commands.current.isActive()} aria-invalid={validationAttempted && !validProductId(productId)} aria-describedby="reference-product-id-hint" /></label>
        <p id="reference-product-id-hint" className={styles.hint}>Identifiant UUID du produit.</p>
        <button className={`${styles.button} ${styles.secondary}`} disabled={busy}>Charger les associations</button>
      </form>
      <hr className={styles.separator} />
      <form className={styles.form} onSubmit={associate} noValidate>
        <label className={styles.field} htmlFor="reference-kind">Catégorie<select id="reference-kind" name="kind" required defaultValue="CONTRACTUAL_DOCUMENT" disabled={busy}>
          <optgroup label="Documentaire">{kinds.filter((item) => item.group === 'Documentaire').map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup>
          <optgroup label="Comptable">{kinds.filter((item) => item.group === 'Comptable').map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup>
        </select></label>
        <label className={styles.field} htmlFor="reference-id">Identifiant de la référence versionnée<input id="reference-id" name="referenceId" required autoComplete="off" disabled={busy} aria-invalid={referenceInvalid} aria-describedby="immutable-help" onChange={() => setReferenceInvalid(false)} /></label>
        <p id="immutable-help" className={styles.hint}>UUID immuable de la référence. Une évolution exige une nouvelle référence versionnée.</p>
        <button className={styles.button} disabled={busy || !validProductId(productId)}>{busy ? 'Traitement…' : 'Associer la référence'}</button>
      </form>
    </section>

    <section className={styles.card} aria-labelledby="compliance-title">
      <h2 id="compliance-title">Ordre de conformité</h2>
      <div aria-live="polite" aria-atomic="true">{message ? <p className={styles.notice} role="status">{message}</p> : null}{error ? <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p> : null}</div>
      <p className={styles.hint}>À la date métier, la référence applicable suit la priorité Banque d’Algérie, Comité Charia, AAOIFI, puis IFSB. Une divergence doit être arbitrée dans le workflow de conformité.</p>
      <ol className={styles.complianceSteps} aria-label="Priorité des sources de conformité">
        {['Banque d’Algérie', 'Comité Charia', 'AAOIFI', 'IFSB'].map((label, index) => <li key={label} data-state={index === 0 ? 'complete' : 'pending'}><span aria-hidden="true">{index + 1}</span><span>{label}<small>Priorité {index + 1}</small></span></li>)}
      </ol>
      {loaded ? <p className={styles.complianceSummary} role="status">Complétude des catégories : <strong>{complete ? 'Complète' : `${presentKinds.size} sur ${kinds.length}`}</strong></p> : null}
      {loaded ? references.length === 0 ? <p className={styles.hint}>Aucune association enregistrée.</p> : <ul className={styles.referenceList} aria-label="Associations enregistrées">
        {references.map((reference) => <li key={`${reference.kind}-${reference.referenceId}`}><div><strong>{kinds.find((item) => item.value === reference.kind)?.label ?? reference.kind}</strong><span>{reference.title}</span><small>{reference.source} · {reference.referenceCode} · version {reference.version}</small></div><span className={styles.badge}>{reference.effectiveFrom}</span></li>)}
      </ul> : null}
    </section>
  </div>;
}
