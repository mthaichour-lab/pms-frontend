'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  nextShariaAction,
  shariaFieldErrors,
  shariaRequest,
  type ShariaAction,
  type ShariaField,
  type ShariaFieldErrors,
  type ShariaReviewTransition,
} from './sharia-api';
import styles from '../products/products.module.css';

type Mode = ShariaAction['kind'];

const modeLabels: Record<Mode, string> = {
  submit: 'Soumettre',
  review: 'Émettre un avis',
  decide: 'Décider',
};

export function ShariaConsole() {
  const [mode, setMode] = useState<Mode>('submit');
  const [reviewId, setReviewId] = useState('');
  const [resourceType, setResourceType] = useState('INVESTMENT_PRODUCT');
  const [resourceId, setResourceId] = useState('');
  const [opinion, setOpinion] = useState('');
  const [decision, setDecision] = useState('APPROVED');
  const [justification, setJustification] = useState('');
  const [evidenceDocumentId, setEvidenceDocumentId] = useState('');
  const [result, setResult] = useState<ShariaReviewTransition>();
  const [lastAction, setLastAction] = useState<Mode>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ShariaFieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const inFlight = useRef<AbortController | undefined>(undefined);
  const requestSequence = useRef(0);

  useEffect(() => () => {
    requestSequence.current += 1;
    inFlight.current?.abort();
    inFlight.current = undefined;
  }, []);

  function action(): ShariaAction {
    if (mode === 'submit') return { kind: mode, command: { resourceType: resourceType.trim(), resourceId: resourceId.trim() } };
    if (mode === 'review') return { kind: mode, reviewId: reviewId.trim(), command: { opinion: opinion.trim() } };
    return {
      kind: mode,
      reviewId: reviewId.trim(),
      command: {
        decision,
        justification: justification.trim(),
        evidenceDocumentId: evidenceDocumentId.trim(),
      },
    };
  }

  function selectMode(nextMode: Mode) {
    if (busy) return;
    setMode(nextMode);
    setError('');
    setFieldErrors({});
  }

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, currentMode: Mode) {
    const modes: readonly Mode[] = ['submit', 'review', 'decide'];
    const currentIndex = modes.indexOf(currentMode);
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? modes.length - 1
        : event.key === 'ArrowRight' ? (currentIndex + 1) % modes.length
          : event.key === 'ArrowLeft' ? (currentIndex - 1 + modes.length) % modes.length
            : undefined;
    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextMode = modes[nextIndex]!;
    selectMode(nextMode);
    document.getElementById(`sharia-tab-${nextMode}`)?.focus();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;

    const request = action();
    const validation = shariaFieldErrors(request);
    setError('');
    setFieldErrors(validation);
    if (Object.keys(validation).length > 0) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }

    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    inFlight.current = controller;
    setBusy(true);
    setResult(undefined);
    setLastAction(undefined);
    try {
      const transition = await shariaRequest(request, { signal: controller.signal });
      if (sequence !== requestSequence.current || controller.signal.aborted) return;
      setResult(transition);
      setLastAction(request.kind);
      setReviewId(transition.reviewId);
      const nextMode = nextShariaAction(transition.state);
      if (nextMode) setMode(nextMode);
    } catch (cause) {
      if (sequence !== requestSequence.current || controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : 'Erreur inattendue.');
    } finally {
      if (sequence === requestSequence.current) {
        inFlight.current = undefined;
        setBusy(false);
      }
    }
  }

  const fieldError = (field: ShariaField) => fieldErrors[field];
  const fieldA11y = (field: ShariaField) => ({
    'aria-invalid': Boolean(fieldError(field)),
    'aria-describedby': fieldError(field) ? `${field}-error` : undefined,
  });
  const validationError = (field: ShariaField) =>
    fieldError(field) ? <span id={`${field}-error`} className={styles.error} role="alert">{fieldError(field)}</span> : null;

  return <>
    <div className={styles.tabs} role="tablist" aria-label="Étape de revue">
      {(['submit', 'review', 'decide'] as const).map((item, index) => <button
        key={item}
        id={`sharia-tab-${item}`}
        type="button"
        role="tab"
        aria-controls="sharia-step-panel"
        aria-selected={mode === item}
        tabIndex={mode === item ? 0 : -1}
        disabled={busy}
        onClick={() => selectMode(item)}
        onKeyDown={(event) => navigateTabs(event, item)}
      >{index + 1}. {modeLabels[item]}</button>)}
    </div>
    <div className={styles.grid}>
      <section
        id="sharia-step-panel"
        className={styles.card}
        role="tabpanel"
        aria-labelledby={`sharia-tab-${mode}`}
        aria-busy={busy}
      >
        <h2>{mode === 'submit' ? 'Nouvelle revue' : mode === 'review' ? 'Avis du réviseur' : 'Décision du Checker'}</h2>
        <form ref={formRef} className={styles.form} onSubmit={submit} noValidate>
          {mode === 'submit' ? <>
            <label className={styles.field}>Type de ressource
              <input {...fieldA11y('resourceType')} required minLength={2} maxLength={64} value={resourceType} onChange={(event) => setResourceType(event.target.value.toUpperCase())} />
              {validationError('resourceType')}
            </label>
            <label className={styles.field}>Identifiant de ressource
              <input {...fieldA11y('resourceId')} required maxLength={128} value={resourceId} onChange={(event) => setResourceId(event.target.value)} />
              {validationError('resourceId')}
            </label>
          </> : <>
            <label className={styles.field}>Identifiant de revue
              <input {...fieldA11y('reviewId')} required autoComplete="off" value={reviewId} onChange={(event) => setReviewId(event.target.value)} />
              {validationError('reviewId')}
            </label>
            {mode === 'review' ? <label className={styles.field}>Avis
              <textarea {...fieldA11y('opinion')} required minLength={10} maxLength={4000} value={opinion} onChange={(event) => setOpinion(event.target.value)} />
              {validationError('opinion')}
            </label> : <>
              <label className={styles.field}>Décision
                <select {...fieldA11y('decision')} value={decision} onChange={(event) => setDecision(event.target.value)}>
                  <option value="APPROVED">Approuver</option>
                  <option value="REJECTED">Rejeter</option>
                </select>
                {validationError('decision')}
              </label>
              <label className={styles.field}>Justification
                <textarea {...fieldA11y('justification')} required minLength={10} maxLength={4000} value={justification} onChange={(event) => setJustification(event.target.value)} />
                {validationError('justification')}
              </label>
              <label className={styles.field}>UUID de la preuve documentaire
                <input {...fieldA11y('evidenceDocumentId')} required autoComplete="off" value={evidenceDocumentId} onChange={(event) => setEvidenceDocumentId(event.target.value)} />
                {validationError('evidenceDocumentId')}
              </label>
            </>}
          </>}
          <button className={styles.button} type="submit" disabled={busy} aria-disabled={busy}>
            {busy ? 'Transmission…' : 'Enregistrer l’étape'}
          </button>
        </form>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      </section>
      <section className={styles.card} aria-live="polite" aria-busy={busy}>
        <h2>État de la revue</h2>
        {result ? <div className={styles.product}>
          <span className={styles.badge}>{result.state}</span>
          <dl><dt>Revue</dt><dd>{result.reviewId}</dd><dt>Étape exécutée</dt><dd>{lastAction ? modeLabels[lastAction] : '—'}</dd></dl>
          {nextShariaAction(result.state) && <p className={styles.hint}>Étape suivante sélectionnée : {modeLabels[nextShariaAction(result.state)!]}.</p>}
        </div> : <p className={styles.hint}>Chaque rôle ne modifie que son étape ; le backend contrôle les transitions et les autorisations.</p>}
      </section>
    </div>
  </>;
}
