'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { approveClosing, rejectClosing, validClosingId, validClosingJustification, type WorkflowTransition } from './closing-api';
import styles from '../products/products.module.css';

type ClosingDecision = 'approve' | 'reject';
type ClosingResult = {
  readonly closingId: string;
  readonly transition: WorkflowTransition;
  readonly decision: 'APPROVED' | 'REJECTED';
};

export function closingActionsForState(state?: string): readonly ClosingDecision[] {
  return state === 'APPROVED' || state === 'REJECTED' || state === 'ANOMALY' || state === 'CLOSED' ? [] : ['approve', 'reject'];
}

export function ClosingConsole() {
  const [closingId, setClosingId] = useState('');
  const [justification, setJustification] = useState('');
  const [result, setResult] = useState<ClosingResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const activeRequest = useRef<AbortController | undefined>(undefined);
  const requestVersion = useRef(0);
  const submissionLocked = useRef(false);
  const availableActions = closingActionsForState(result?.transition.state);

  useEffect(() => () => {
    requestVersion.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = undefined;
    submissionLocked.current = false;
  }, []);

  function changeClosingId(value: string) {
    requestVersion.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = undefined;
    submissionLocked.current = false;
    setClosingId(value.trim());
    setResult(undefined);
    setJustification('');
    setBusy(false);
    setError('');
    setMessage('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLocked.current) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const action = submitter instanceof HTMLButtonElement && submitter.value === 'reject' ? 'reject' : 'approve';
    const requestedClosingId = closingId.trim();
    const submittedJustification = justification.trim();
    setError('');
    setMessage('');
    if (!validClosingId(requestedClosingId)) { setError('L’identifiant de clôture doit être un UUID valide.'); return; }
    if (!validClosingJustification(submittedJustification)) { setError('La justification doit contenir entre 10 et 1 000 caractères.'); return; }

    const version = requestVersion.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    submissionLocked.current = true;
    setBusy(true);
    try {
      const transition = await (action === 'approve'
        ? approveClosing(requestedClosingId, submittedJustification, controller.signal)
        : rejectClosing(requestedClosingId, submittedJustification, controller.signal));
      if (requestVersion.current !== version || controller.signal.aborted) return;
      setResult({ closingId: requestedClosingId, transition, decision: action === 'approve' ? 'APPROVED' : 'REJECTED' });
      setJustification('');
      setMessage(action === 'approve' ? 'La clôture a été approuvée.' : 'La clôture a été rejetée et placée en anomalie.');
    } catch (cause) {
      if (requestVersion.current === version && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'La décision n’a pas pu être enregistrée.');
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = undefined;
        submissionLocked.current = false;
        setBusy(false);
      }
    }
  }

  return <div className={styles.grid} aria-busy={busy}>
    <section className={styles.card} aria-labelledby="closing-decision-title">
      <h2 id="closing-decision-title">Décision Maker/Checker</h2>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}>Identifiant de clôture<input value={closingId} onChange={(event) => changeClosingId(event.target.value)} required autoComplete="off" spellCheck={false} aria-describedby="closing-id-hint" /></label>
        <p id="closing-id-hint" className={styles.hint}>La clôture doit avoir terminé ses contrôles et le Checker doit être distinct du Maker.</p>
        <label className={styles.field}>Justification du Checker<textarea value={justification} onChange={(event) => setJustification(event.target.value)} required minLength={10} maxLength={1000} aria-describedby="closing-justification-hint" /></label>
        <p id="closing-justification-hint" className={styles.hint}>{justification.trim().length} / 1 000 caractères · minimum 10</p>
        {availableActions.length > 0 ? <div className={styles.actions}>
          <button type="submit" name="decision" value="approve" className={styles.button} disabled={busy}>{busy ? 'Enregistrement…' : 'Approuver la clôture'}</button>
          <button type="submit" name="decision" value="reject" className={styles.secondary} disabled={busy}>{busy ? 'Enregistrement…' : 'Rejeter la clôture'}</button>
        </div> : <p className={styles.hint}>Cette décision est enregistrée. Saisissez un autre identifiant pour traiter une nouvelle clôture.</p>}
      </form>
      <div aria-live="polite" aria-atomic="true">
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {message && <p className={styles.notice} role="status">{message}</p>}
      </div>
    </section>

    <section className={styles.card} aria-labelledby="closing-result-title" aria-live="polite">
      <h2 id="closing-result-title">Résultat du contrôle</h2>
      {result ? <div className={styles.product}>
        <p>État contractuel : <span className={styles.badge}>{result.transition.state}</span></p>
        <dl><dt>Clôture</dt><dd className={styles.checksum}>{result.closingId}</dd><dt>Décision demandée</dt><dd>{result.decision}</dd><dt>État contractuel</dt><dd>{result.transition.state}</dd></dl>
      </div> : <p className={styles.hint}>Le nouvel état contractuel apparaîtra ici après validation par le backend.</p>}
    </section>
  </div>;
}
