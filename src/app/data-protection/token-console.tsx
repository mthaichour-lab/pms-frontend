'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  detokenize,
  maskToken,
  personalDataClasses,
  rotateToken,
  searchToken,
  tokenActionSpec,
  tokenFieldErrors,
  tokenModes,
  tokenize,
  type DetokenizedValue,
  type PersonalDataClass,
  type TokenField,
  type TokenFieldErrors,
  type TokenMode,
  type TokenizedValue,
} from './token-api';
import styles from '../products/products.module.css';

const modeLabels: Record<TokenMode, string> = {
  tokenize: 'Tokeniser',
  search: 'Rechercher',
  detokenize: 'Déchiffrer',
  rotate: 'Rotation',
};

type OperationCallbacks<T> = {
  readonly loading: () => void;
  readonly success: (value: T) => void;
  readonly failure: (message: string) => void;
  readonly settled: () => void;
};

export class TokenOperationCoordinator {
  private controller?: AbortController;
  private revision = 0;
  private mounted = true;

  mount(): void { this.mounted = true; }

  isRunning(): boolean { return this.controller !== undefined; }

  invalidate(): void { this.revision += 1; }

  unmount(): void {
    this.mounted = false;
    this.invalidate();
    this.controller?.abort();
    this.controller = undefined;
  }

  async run<T>(
    work: (signal: AbortSignal) => Promise<T>,
    callbacks: OperationCallbacks<T>,
  ): Promise<boolean> {
    if (this.controller) return false;
    const controller = new AbortController();
    const expectedRevision = this.revision;
    this.controller = controller;
    callbacks.loading();
    try {
      const result = await work(controller.signal);
      if (this.mounted && expectedRevision === this.revision && !controller.signal.aborted) callbacks.success(result);
    } catch (cause) {
      if (this.mounted && expectedRevision === this.revision && !controller.signal.aborted) {
        callbacks.failure(cause instanceof Error ? cause.message : 'Erreur inattendue.');
      }
    } finally {
      const ownsOperation = this.controller === controller;
      if (ownsOperation) this.controller = undefined;
      if (this.mounted && ownsOperation) callbacks.settled();
    }
    return true;
  }
}

export function TokenConsole() {
  const [mode, setMode] = useState<TokenMode>('tokenize');
  const [value, setValue] = useState('');
  const [dataClass, setDataClass] = useState<PersonalDataClass>('CUSTOMER_ID');
  const [purpose, setPurpose] = useState('');
  const [result, setResult] = useState<TokenizedValue>();
  const [clearValue, setClearValue] = useState('');
  const [tokenVisible, setTokenVisible] = useState(false);
  const [clearVisible, setClearVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<TokenFieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const operations = useRef<TokenOperationCoordinator>(null);
  if (!operations.current) operations.current = new TokenOperationCoordinator();

  useEffect(() => {
    operations.current?.mount();
    setBusy(false);
    return () => operations.current?.unmount();
  }, []);

  useEffect(() => {
    if (!clearValue) return;
    const timer = window.setTimeout(() => {
      setClearVisible(false);
      setClearValue('');
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [clearValue]);

  useEffect(() => {
    if (!tokenVisible) return;
    const timer = window.setTimeout(() => setTokenVisible(false), 15_000);
    return () => window.clearTimeout(timer);
  }, [tokenVisible]);

  function selectMode(nextMode: TokenMode) {
    if (operations.current?.isRunning()) return;
    setMode(nextMode);
    setValue('');
    setResult(undefined);
    setClearValue('');
    setTokenVisible(false);
    setClearVisible(false);
    setError('');
    setFieldErrors({});
  }

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, currentMode: TokenMode) {
    const currentIndex = tokenModes.indexOf(currentMode);
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? tokenModes.length - 1
        : event.key === 'ArrowRight' ? (currentIndex + 1) % tokenModes.length
          : event.key === 'ArrowLeft' ? (currentIndex - 1 + tokenModes.length) % tokenModes.length
            : undefined;
    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextMode = tokenModes[nextIndex]!;
    selectMode(nextMode);
    document.getElementById(`token-tab-${nextMode}`)?.focus();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const submittedMode = mode;
    const submittedValue = submittedMode === 'tokenize' ? value : value.trim();
    const validation = tokenFieldErrors(submittedMode, { value: submittedValue, dataClass, purpose });
    setFieldErrors(validation);
    setError('');
    if (Object.keys(validation).length > 0) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }

    const submittedPurpose = purpose.trim();
    const work = (signal: AbortSignal) => submittedMode === 'tokenize'
      ? tokenize({ value: submittedValue, dataClass, purpose: submittedPurpose }, { signal })
      : submittedMode === 'search'
        ? searchToken({ searchDigestSha256: submittedValue, dataClass, purpose: submittedPurpose }, { signal })
        : submittedMode === 'rotate'
          ? rotateToken({ token: submittedValue, purpose: submittedPurpose }, { signal })
          : detokenize({ token: submittedValue, purpose: submittedPurpose }, { signal });
    await operations.current?.run<TokenizedValue | DetokenizedValue>(work, {
      loading: () => {
        setBusy(true);
        setResult(undefined);
        setClearValue('');
        setTokenVisible(false);
        setClearVisible(false);
        if (submittedMode === 'tokenize') setValue('');
      },
      success: (response) => {
        if (submittedMode === 'detokenize') setClearValue((response as DetokenizedValue).value);
        else setResult(response as TokenizedValue);
      },
      failure: setError,
      settled: () => setBusy(false),
    });
  }

  const fieldA11y = (field: TokenField) => ({
    'aria-invalid': fieldErrors[field] ? true as const : undefined,
    'aria-describedby': fieldErrors[field] ? `token-${field}-error` : undefined,
  });
  const validationError = (field: TokenField) => fieldErrors[field]
    ? <span id={`token-${field}-error`} className={styles.error} role="alert">{fieldErrors[field]}</span>
    : null;
  const clearFieldError = (field: TokenField) => setFieldErrors((current) => {
    if (!current[field]) return current;
    const next = { ...current };
    delete next[field];
    return next;
  });
  const specification = tokenActionSpec[mode];
  const inputLabel = specification.input === 'clear' ? 'Valeur personnelle'
    : specification.input === 'digest' ? 'Empreinte SHA-256'
      : 'Jeton';

  return <div className={styles.grid}>
    <section className={styles.card} aria-labelledby="token-operation-title" aria-busy={busy}>
      <h2 id="token-operation-title">Opération sécurisée</h2>
      <div className={styles.tabs} role="tablist" aria-label="Opération sur les données protégées">
        {tokenModes.map((item) => <button
          key={item}
          id={`token-tab-${item}`}
          type="button"
          role="tab"
          aria-controls="token-operation-panel"
          aria-selected={mode === item}
          tabIndex={mode === item ? 0 : -1}
          disabled={busy}
          onClick={() => selectMode(item)}
          onKeyDown={(event) => navigateTabs(event, item)}
        >{modeLabels[item]}</button>)}
      </div>
      <form
        ref={formRef}
        id="token-operation-panel"
        className={styles.form}
        role="tabpanel"
        aria-labelledby={`token-tab-${mode}`}
        aria-busy={busy}
        onSubmit={submit}
        noValidate
      >
        {specification.needsDataClass && <label className={styles.field}>Classe de données
          <select id="token-data-class" {...fieldA11y('dataClass')} disabled={busy} value={dataClass} onChange={(event) => { clearFieldError('dataClass'); setDataClass(event.target.value as PersonalDataClass); }}>
            {personalDataClasses.map((item) => <option key={item}>{item}</option>)}
          </select>
          {validationError('dataClass')}
        </label>}
        <label className={styles.field}>{inputLabel}
          <input
            id="token-value"
            {...fieldA11y('value')}
            type={specification.input === 'clear' ? 'password' : 'text'}
            required
            maxLength={specification.input === 'clear' ? 4096 : undefined}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            value={value}
            onChange={(event) => { clearFieldError('value'); setValue(event.target.value); }}
          />
          {validationError('value')}
        </label>
        <label className={styles.field}>Finalité auditée
          <textarea
            id="token-purpose"
            {...fieldA11y('purpose')}
            required
            minLength={5}
            maxLength={64}
            placeholder="Ex. KYC_VERIFICATION"
            disabled={busy}
            value={purpose}
            onChange={(event) => { clearFieldError('purpose'); setPurpose(event.target.value.toUpperCase()); }}
          />
          {validationError('purpose')}
        </label>
        <button className={styles.button} disabled={busy}>{busy ? 'Traitement…' : 'Exécuter'}</button>
      </form>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert" aria-live="assertive">{error}</p>}
    </section>
    <section className={styles.card} aria-labelledby="token-result-title" aria-live="polite">
      <h2 id="token-result-title">Résultat protégé</h2>
      {result ? <div className={styles.product}>
        <span className={styles.badge}>{result.dataClass}</span>
        <dl>
          <dt>Jeton</dt>
          <dd className={styles.checksum}>{tokenVisible ? result.token : maskToken(result.token)}</dd>
          <dt>Version de clé</dt>
          <dd>{result.vaultKeyVersion}</dd>
        </dl>
        <button type="button" className={styles.button} aria-pressed={tokenVisible} onClick={() => setTokenVisible((visible) => !visible)}>
          {tokenVisible ? 'Masquer le jeton' : 'Afficher le jeton pendant 15 secondes'}
        </button>
      </div> : clearValue ? <div className={styles.notice}>
        <strong>Valeur claire temporaire</strong>
        {clearVisible ? <p className={styles.checksum}>{clearValue}</p> : <p>Valeur masquée par défaut.</p>}
        <button type="button" className={styles.button} aria-pressed={clearVisible} onClick={() => setClearVisible((visible) => !visible)}>
          {clearVisible ? 'Masquer immédiatement' : 'Afficher avant effacement'}
        </button>
        <small>La valeur est définitivement retirée de l’interface 30 secondes après sa réception.</small>
      </div> : <p className={styles.hint}>Aucune donnée claire n’est conservée durablement par cette interface. Chaque opération est autorisée et auditée côté serveur.</p>}
    </section>
  </div>;
}
