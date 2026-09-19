'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  availableExceptionTransitions,
  createException,
  exceptionFieldErrors,
  exceptionStatuses,
  transitionException,
  transitionFieldErrors,
  type ExceptionField,
  type ExceptionFieldErrors,
  type ExceptionSeverity,
  type ExceptionStatus,
  type ExceptionTransition,
  type TransitionField,
  type TransitionFieldErrors,
} from './exception-api';
import styles from '../products/products.module.css';

const severities: readonly ExceptionSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function ExceptionConsole() {
  const [sourceType, setSourceType] = useState('CALCULATION');
  const [sourceId, setSourceId] = useState('');
  const [resourceType, setResourceType] = useState('POOL');
  const [resourceId, setResourceId] = useState('');
  const [severity, setSeverity] = useState<ExceptionSeverity>('MEDIUM');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [exceptionId, setExceptionId] = useState('');
  const [currentStatus, setCurrentStatus] = useState<ExceptionStatus>('DETECTED');
  const [targetStatus, setTargetStatus] = useState<ExceptionStatus | ''>('QUALIFIED');
  const [comment, setComment] = useState('');
  const [riskReference, setRiskReference] = useState('');
  const [result, setResult] = useState<ExceptionTransition>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [messageContext, setMessageContext] = useState<'detection' | 'transition'>('detection');
  const [detectionErrors, setDetectionErrors] = useState<ExceptionFieldErrors>({});
  const [transitionErrors, setTransitionErrors] = useState<TransitionFieldErrors>({});
  const detectionForm = useRef<HTMLFormElement>(null);
  const transitionForm = useRef<HTMLFormElement>(null);
  const inFlight = useRef<AbortController | undefined>(undefined);
  const requestSequence = useRef(0);

  useEffect(() => () => {
    requestSequence.current += 1;
    inFlight.current?.abort();
    inFlight.current = undefined;
  }, []);

  function changeCurrentStatus(status: ExceptionStatus) {
    const available = availableExceptionTransitions(status);
    setCurrentStatus(status);
    setTargetStatus(available[0] ?? '');
    setTransitionErrors({});
  }

  function applyResult(value: ExceptionTransition) {
    const status = value.status as ExceptionStatus;
    setResult(value);
    if (value.exceptionId) setExceptionId(value.exceptionId);
    changeCurrentStatus(status);
  }

  async function run(
    work: (signal: AbortSignal) => Promise<ExceptionTransition>,
    successMessage: string,
    context: 'detection' | 'transition',
  ) {
    if (inFlight.current) return;
    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    inFlight.current = controller;
    setBusy(true);
    setError('');
    setSuccess('');
    setMessageContext(context);
    try {
      const value = await work(controller.signal);
      if (sequence !== requestSequence.current || controller.signal.aborted) return;
      applyResult(value);
      setSuccess(successMessage);
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

  function detect(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const value = {
      sourceType: sourceType.trim(),
      sourceId: sourceId.trim(),
      resourceType: resourceType.trim(),
      resourceId: resourceId.trim(),
      severity,
      title: title.trim(),
      description: description.trim(),
    };
    const validation = exceptionFieldErrors(value);
    setDetectionErrors(validation);
    setError('');
    setSuccess('');
    if (Object.keys(validation).length > 0) {
      requestAnimationFrame(() => detectionForm.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    void run((signal) => createException(value, { signal }), 'Exception détectée et enregistrée.', 'detection');
  }

  function transition(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const value = {
      targetStatus,
      comment: comment.trim(),
      ...(targetStatus === 'ACCEPTED_RISK' ? { riskAcceptanceReference: riskReference.trim() } : {}),
    };
    const validation = transitionFieldErrors(exceptionId, value, currentStatus);
    setTransitionErrors(validation);
    setError('');
    setSuccess('');
    if (Object.keys(validation).length > 0) {
      requestAnimationFrame(() => transitionForm.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    void run(
      (signal) => transitionException(exceptionId, value, { signal }),
      'Transition enregistrée dans l’historique.',
      'transition',
    );
  }

  const detectionA11y = (field: ExceptionField) => ({
    'aria-invalid': detectionErrors[field] ? true as const : undefined,
    'aria-describedby': detectionErrors[field] ? `exception-${field}-error` : undefined,
  });
  const transitionA11y = (field: TransitionField) => ({
    'aria-invalid': transitionErrors[field] ? true as const : undefined,
    'aria-describedby': transitionErrors[field] ? `transition-${field}-error` : undefined,
  });
  const detectionError = (field: ExceptionField) => detectionErrors[field]
    ? <span id={`exception-${field}-error`} className={styles.error}>{detectionErrors[field]}</span>
    : null;
  const transitionError = (field: TransitionField) => transitionErrors[field]
    ? <span id={`transition-${field}-error`} className={styles.error}>{transitionErrors[field]}</span>
    : null;
  const availableStatuses = availableExceptionTransitions(currentStatus);
  const terminal = availableStatuses.length === 0;

  return <div className={styles.grid}>
    <section className={styles.card} aria-busy={busy}>
      <h2>Détecter une exception</h2>
      <form ref={detectionForm} className={styles.form} onSubmit={detect} noValidate>
        <div className={styles.row}>
          <label className={styles.field}>Type de source
            <input {...detectionA11y('sourceType')} required value={sourceType} onChange={(event) => setSourceType(event.target.value.toUpperCase())} />
            {detectionError('sourceType')}
          </label>
          <label className={styles.field}>Identifiant source
            <input {...detectionA11y('sourceId')} required value={sourceId} onChange={(event) => setSourceId(event.target.value)} />
            {detectionError('sourceId')}
          </label>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>Type de ressource
            <input {...detectionA11y('resourceType')} required value={resourceType} onChange={(event) => setResourceType(event.target.value.toUpperCase())} />
            {detectionError('resourceType')}
          </label>
          <label className={styles.field}>Identifiant ressource
            <input {...detectionA11y('resourceId')} required value={resourceId} onChange={(event) => setResourceId(event.target.value)} />
            {detectionError('resourceId')}
          </label>
        </div>
        <label className={styles.field}>Sévérité
          <select {...detectionA11y('severity')} value={severity} onChange={(event) => setSeverity(event.target.value as ExceptionSeverity)}>
            {severities.map((value) => <option key={value}>{value}</option>)}
          </select>
          {detectionError('severity')}
        </label>
        <label className={styles.field}>Titre
          <input {...detectionA11y('title')} required minLength={5} value={title} onChange={(event) => setTitle(event.target.value)} />
          {detectionError('title')}
        </label>
        <label className={styles.field}>Description
          <textarea {...detectionA11y('description')} required minLength={10} value={description} onChange={(event) => setDescription(event.target.value)} />
          {detectionError('description')}
        </label>
        <button className={styles.button} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer la détection'}</button>
      </form>
      {messageContext === 'detection' && success && <p className={styles.notice} role="status">{success}</p>}
      {messageContext === 'detection' && error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    </section>
    <section className={styles.card} aria-busy={busy}>
      <h2>Faire progresser le traitement</h2>
      <form ref={transitionForm} className={styles.form} onSubmit={transition} noValidate>
        <label className={styles.field}>Exception (UUID)
          <input {...transitionA11y('exceptionId')} required autoComplete="off" value={exceptionId} onChange={(event) => setExceptionId(event.target.value)} />
          {transitionError('exceptionId')}
        </label>
        <label className={styles.field}>État actuel
          <select value={currentStatus} onChange={(event) => changeCurrentStatus(event.target.value as ExceptionStatus)}>
            {exceptionStatuses.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <label className={styles.field}>Nouvel état
          <select {...transitionA11y('targetStatus')} value={targetStatus} disabled={terminal} onChange={(event) => setTargetStatus(event.target.value as ExceptionStatus)}>
            {terminal
              ? <option value="">Aucune transition disponible</option>
              : availableStatuses.map((status) => <option key={status}>{status}</option>)}
          </select>
          {transitionError('targetStatus')}
        </label>
        <label className={styles.field}>Commentaire de preuve
          <textarea {...transitionA11y('comment')} required minLength={10} value={comment} onChange={(event) => setComment(event.target.value)} />
          {transitionError('comment')}
        </label>
        {targetStatus === 'ACCEPTED_RISK' && <label className={styles.field}>Référence d’acceptation du risque
          <input {...transitionA11y('riskAcceptanceReference')} required value={riskReference} onChange={(event) => setRiskReference(event.target.value)} />
          {transitionError('riskAcceptanceReference')}
        </label>}
        <button className={styles.button} disabled={busy || terminal}>
          {busy ? 'Transition…' : terminal ? 'État terminal' : 'Appliquer la transition'}
        </button>
      </form>
      {result && <div className={styles.product} aria-live="polite">
        <span className={styles.badge}>{result.status}</span>
        {exceptionId && <p className={styles.checksum}>{exceptionId}</p>}
      </div>}
      {messageContext === 'transition' && success && <p className={styles.notice} role="status">{success}</p>}
      {messageContext === 'transition' && error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    </section>
  </div>;
}
