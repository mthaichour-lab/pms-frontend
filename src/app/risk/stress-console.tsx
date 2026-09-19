'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { runStress, stressFieldValidity, validStressCommand, type StressScenarioCommand, type StressScenarioResult } from './risk-api';
import { ExclusiveRiskOperation } from './async-operation';
import { RiskError, RiskStatus } from './risk-feedback';
import styles from '../products/products.module.css';

export function StressConsole() {
  const [scenarioCode, setScenarioCode] = useState('LIQUIDITY_STRESS');
  const [businessDate, setBusinessDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('DZD');
  const [baseAmount, setBaseAmount] = useState('');
  const [bucket, setBucket] = useState('LIQUIDITY');
  const [basisPoints, setBasisPoints] = useState('-200');
  const [engineVersion, setEngineVersion] = useState('STRESS-1.0');
  const [checksum, setChecksum] = useState('');
  const [result, setResult] = useState<StressScenarioResult>();
  const [busy, setBusy] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const operations = useRef<ExclusiveRiskOperation>(null);
  if (!operations.current) operations.current = new ExclusiveRiskOperation();
  useEffect(() => () => operations.current?.cancel(), []);

  function command(): StressScenarioCommand {
    return { scenarioCode, businessDate, currency, baseAmount, shocks: [{ bucket, basisPoints: Number(basisPoints) }], engineVersion, inputChecksumSha256: checksum };
  }

  const validity = stressFieldValidity(command());
  const invalid = (field: keyof typeof validity) => validationAttempted && !validity[field];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = command();
    setValidationAttempted(true);
    setError('');
    setMessage('');
    if (!validStressCommand(input)) {
      setError('Vérifiez les codes, la date, le montant non négatif, le choc entre −10 000 et 10 000 pb, la version et le checksum SHA-256.');
      return;
    }
    await operations.current!.run(
      () => runStress(input),
      {
        loading: () => { setResult(undefined); setBusy(true); },
        success: (value) => { setResult(value); setMessage('Scénario de stress terminé.'); },
        failure: setError,
        settled: () => setBusy(false),
      },
      'Le scénario de stress a échoué.',
    );
  }

  return <div className={styles.grid} aria-busy={busy}>
    <section className={styles.card} aria-labelledby="stress-form-title">
      <h2 id="stress-form-title">Scénario de stress</h2>
      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.row}>
          <label className={styles.field}>Code scénario<input disabled={busy} required value={scenarioCode} onChange={(event) => setScenarioCode(event.target.value.toUpperCase())} aria-invalid={invalid('scenarioCode')} aria-describedby="stress-scenario-hint" /></label>
          <p id="stress-scenario-hint" className={styles.hint}>2 à 64 caractères techniques en majuscules.</p>
          <label className={styles.field}>Date métier<input disabled={busy} required type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} aria-invalid={invalid('businessDate')} aria-describedby="stress-date-hint" /></label>
          <p id="stress-date-hint" className={styles.hint}>Date calendaire au format AAAA-MM-JJ.</p>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>Montant de base<input disabled={busy} required inputMode="decimal" value={baseAmount} onChange={(event) => setBaseAmount(event.target.value)} aria-invalid={invalid('baseAmount')} aria-describedby="stress-amount-hint" /></label>
          <p id="stress-amount-hint" className={styles.hint}>Montant décimal positif ou nul.</p>
          <label className={styles.field}>Devise<input disabled={busy} required maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} aria-invalid={invalid('currency')} aria-describedby="stress-currency-hint" /></label>
          <p id="stress-currency-hint" className={styles.hint}>Code ISO sur trois lettres majuscules.</p>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>Segment de choc<input disabled={busy} required value={bucket} onChange={(event) => setBucket(event.target.value.toUpperCase())} aria-invalid={invalid('bucket')} aria-describedby="stress-bucket-hint" /></label>
          <p id="stress-bucket-hint" className={styles.hint}>2 à 64 caractères techniques en majuscules.</p>
          <label className={styles.field}>Points de base<input disabled={busy} required type="number" min={-10000} max={10000} step={1} value={basisPoints} onChange={(event) => setBasisPoints(event.target.value)} aria-invalid={invalid('basisPoints')} aria-describedby="stress-basis-points-hint" /></label>
          <p id="stress-basis-points-hint" className={styles.hint}>Nombre entier compris entre −10 000 et 10 000.</p>
        </div>
        <label className={styles.field}>Version moteur<input disabled={busy} required value={engineVersion} onChange={(event) => setEngineVersion(event.target.value)} aria-invalid={invalid('engineVersion')} aria-describedby="stress-engine-hint" /></label>
        <p id="stress-engine-hint" className={styles.hint}>1 à 64 caractères techniques.</p>
        <label className={styles.field}>Checksum SHA-256 des entrées<input disabled={busy} required spellCheck={false} className={styles.checksum} value={checksum} onChange={(event) => setChecksum(event.target.value.toLowerCase())} aria-invalid={invalid('inputChecksumSha256')} aria-describedby="stress-checksum-hint" /></label>
        <p id="stress-checksum-hint" className={styles.hint}>64 caractères hexadécimaux minuscules.</p>
        <button className={styles.button} disabled={busy}>{busy ? 'Simulation…' : 'Exécuter le stress'}</button>
      </form>
      <RiskError message={error} />
      <RiskStatus message={message} />
    </section>
    <section className={styles.card} aria-labelledby="stress-result-title">
      <h2 id="stress-result-title">Impacts calculés</h2>
      {result ? <div className={styles.product}><span className={styles.badge}>{result.state}</span><dl><dt>Scénario</dt><dd>{result.stressScenarioId}</dd></dl><ul className={styles.referenceList}>{result.results.map((line) => <li key={`${line.bucket}-${line.basisPoints}`}><div><strong>{line.bucket}</strong><small>{line.basisPoints} pb</small></div><span>{line.stressedAmount}</span><span>{line.impactAmount}</span></li>)}</ul></div> : <p className={styles.hint}>Les montants stressés et leurs impacts seront calculés par le moteur backend.</p>}
    </section>
  </div>;
}
