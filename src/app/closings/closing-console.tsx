'use client';

import { FormEvent, useRef, useState } from 'react';
import { approveClosing, rejectClosing, validClosingId, validClosingJustification, type WorkflowTransition } from './closing-api';
import styles from '../products/products.module.css';

type ClosingDecision = 'approve' | 'reject';

export function closingActionsForState(state?: string): readonly ClosingDecision[] {
  return state === 'APPROVED' || state === 'ANOMALY' || state === 'CLOSED' ? [] : ['approve', 'reject'];
}

export function ClosingConsole() {
  const [closingId, setClosingId] = useState('');
  const [justification, setJustification] = useState('');
  const [transition, setTransition] = useState<WorkflowTransition>();
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const submissionLocked = useRef(false);
  const availableActions = closingActionsForState(transition?.state);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLocked.current) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const action = submitter instanceof HTMLButtonElement && submitter.value === 'reject' ? 'reject' : 'approve';
    setError(''); setMessage('');
    if (!validClosingId(closingId)) { setError('L’identifiant de clôture doit être un UUID valide.'); return; }
    if (!validClosingJustification(justification)) { setError('La justification doit contenir entre 10 et 1 000 caractères.'); return; }
    submissionLocked.current = true;
    setBusy(true);
    try {
      const result = await (action === 'approve' ? approveClosing(closingId, justification) : rejectClosing(closingId, justification));
      setTransition(result);
      setDecision(action === 'approve' ? 'APPROVED' : 'REJECTED');
      setJustification('');
      setMessage(action === 'approve' ? 'La clôture a été approuvée.' : 'La clôture a été rejetée et placée en anomalie.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La décision n’a pas pu être enregistrée.');
    } finally {
      submissionLocked.current = false;
      setBusy(false);
    }
  }

  return <div className={styles.grid} aria-busy={busy}>
    <section className={styles.card} aria-labelledby="closing-decision-title">
      <h2 id="closing-decision-title">Décision Maker/Checker</h2>
      {availableActions.length > 0 ? <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}>Identifiant de clôture<input value={closingId} onChange={(event) => { setClosingId(event.target.value.trim()); setTransition(undefined); setDecision(undefined); setMessage(''); }} required autoComplete="off" spellCheck={false} aria-describedby="closing-id-hint" /></label>
        <p id="closing-id-hint" className={styles.hint}>La clôture doit avoir terminé ses contrôles et le Checker doit être distinct du Maker.</p>
        <label className={styles.field}>Justification du Checker<textarea value={justification} onChange={(event) => setJustification(event.target.value)} required minLength={10} maxLength={1000} aria-describedby="closing-justification-hint" /></label>
        <p id="closing-justification-hint" className={styles.hint}>{justification.trim().length} / 1 000 caractères · minimum 10</p>
        <div className={styles.actions}>
          <button type="submit" name="decision" value="approve" className={styles.button} disabled={busy}>{busy ? 'Enregistrement…' : 'Approuver la clôture'}</button>
          <button type="submit" name="decision" value="reject" className={styles.secondary} disabled={busy}>{busy ? 'Enregistrement…' : 'Rejeter la clôture'}</button>
        </div>
      </form> : <p className={styles.hint}>Cette décision est enregistrée. Aucune nouvelle action n’est permise sur cet état.</p>}
      <div aria-live="polite" aria-atomic="true">
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {message && <p className={styles.notice} role="status">{message}</p>}
      </div>
    </section>

    <section className={styles.card} aria-labelledby="closing-result-title">
      <h2 id="closing-result-title">Résultat du contrôle</h2>
      {transition ? <div className={styles.product}>
        <p>État contractuel : <span className={styles.badge}>{transition.state}</span></p>
        <dl><dt>Clôture</dt><dd className={styles.checksum}>{closingId}</dd><dt>Décision demandée</dt><dd>{decision}</dd><dt>État contractuel</dt><dd>{transition.state}</dd></dl>
      </div> : <p className={styles.hint}>Le nouvel état contractuel apparaîtra ici après validation par le backend.</p>}
    </section>
  </div>;
}
