'use client';

import { FormEvent, useState } from 'react';
import { productReferencesRequest, referenceValidationMessage, type CreateProductReferenceCommand, type ProductReference, type ProductReferenceKind } from './product-api';
import styles from './products.module.css';

const kinds: readonly { value: ProductReferenceKind; label: string; group: 'Documentaire' | 'Comptable' }[] = [
  { value: 'CONTRACTUAL_DOCUMENT', label: 'Document contractuel', group: 'Documentaire' },
  { value: 'REGULATORY_DOCUMENT', label: 'Document réglementaire', group: 'Documentaire' },
  { value: 'SHARIA_DOCUMENT', label: 'Document Charia', group: 'Documentaire' },
  { value: 'ACCOUNTING_SCHEMA', label: 'Schéma comptable', group: 'Comptable' },
];

export function ProductReferencesPanel({ defaultProductId }: { defaultProductId: string }) {
  const [productId, setProductId] = useState(defaultProductId);
  const [references, setReferences] = useState<readonly ProductReference[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function execute<T>(operation: () => Promise<T>, success: string, apply: (value: T) => void) {
    setBusy(true); setMessage(''); setError('');
    try { const result = await operation(); apply(result); setMessage(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Une erreur inattendue est survenue.'); }
    finally { setBusy(false); }
  }

  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await execute(() => productReferencesRequest<ProductReference[]>(productId.trim()), 'Associations chargées.', (value) => { setReferences(value); setLoaded(true); });
  }

  async function associate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const command: CreateProductReferenceCommand = { kind: String(data.get('kind')) as ProductReferenceKind, referenceId: String(data.get('referenceId')).trim() };
    const validationError = referenceValidationMessage(command);
    if (validationError) { setMessage(''); setError(validationError); return; }
    await execute(async () => {
      await productReferencesRequest<{ associated: true }>(productId.trim(), '', { method: 'POST', body: JSON.stringify(command) });
      return productReferencesRequest<ProductReference[]>(productId.trim());
    }, 'Référence associée au produit.', (value) => { setReferences(value); setLoaded(true); form.reset(); });
  }

  const presentKinds = new Set(references.map((reference) => reference.kind));
  const complete = kinds.every(({ value }) => presentKinds.has(value));

  return <div className={styles.grid}>
    <section className={styles.card} aria-labelledby="association-title">
      <h2 id="association-title">Associations documentaires et comptables</h2>
      <form className={styles.form} onSubmit={load}>
        <label className={styles.field}>Identifiant produit<input value={productId} onChange={(event) => setProductId(event.target.value)} required /></label>
        <button className={`${styles.button} ${styles.secondary}`} disabled={busy}>Charger les associations</button>
      </form>
      <hr className={styles.separator} />
      <form className={styles.form} onSubmit={associate}>
        <label className={styles.field}>Catégorie<select name="kind" required defaultValue="CONTRACTUAL_DOCUMENT">
          <optgroup label="Documentaire">{kinds.filter((item) => item.group === 'Documentaire').map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup>
          <optgroup label="Comptable">{kinds.filter((item) => item.group === 'Comptable').map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup>
        </select></label>
        <label className={styles.field}>Identifiant de la référence versionnée<input name="referenceId" required autoComplete="off" aria-describedby="immutable-help" /></label>
        <p id="immutable-help" className={styles.hint}>Une association est immuable. Une évolution exige une nouvelle référence versionnée.</p>
        <button className={styles.button} disabled={busy || !productId.trim()}>{busy ? 'Traitement…' : 'Associer la référence'}</button>
      </form>
    </section>

    <section className={styles.card} aria-labelledby="compliance-title">
      <h2 id="compliance-title">Ordre de conformité</h2>
      <div aria-live="polite" aria-atomic="true">{message && <p className={styles.notice}>{message}</p>}{error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}</div>
      <p className={styles.hint}>À la date métier, la référence applicable suit la priorité Banque d’Algérie, Comité Charia, AAOIFI, puis IFSB. Une divergence doit être arbitrée dans le workflow de conformité.</p>
      <ol className={styles.complianceSteps} aria-label="Priorité des sources de conformité">
        {['Banque d’Algérie', 'Comité Charia', 'AAOIFI', 'IFSB'].map((label, index) => <li key={label} data-state={index === 0 ? 'complete' : 'pending'}><span aria-hidden="true">{index + 1}</span><span>{label}<small>Priorité {index + 1}</small></span></li>)}
      </ol>
      {loaded && <p className={styles.complianceSummary} role="status">Complétude des catégories : <strong>{complete ? 'Complète' : `${presentKinds.size} sur ${kinds.length}`}</strong></p>}
      {loaded && (references.length === 0 ? <p className={styles.hint}>Aucune association enregistrée.</p> : <ul className={styles.referenceList} aria-label="Associations enregistrées">
        {references.map((reference) => <li key={`${reference.kind}-${reference.referenceId}`}><div><strong>{kinds.find((item) => item.value === reference.kind)?.label ?? reference.kind}</strong><span>{reference.title}</span><small>{reference.source} · {reference.referenceCode} · version {reference.version}</small></div><span className={styles.badge}>{reference.effectiveFrom}</span></li>)}
      </ul>)}
    </section>
  </div>;
}
