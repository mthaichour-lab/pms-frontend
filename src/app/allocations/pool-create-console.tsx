'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CreateInvestmentPool, InvestmentPool, PoolFundingSource } from '@bank/pms-api-client';
import { EntityCatalog, notifyCatalogChanged } from '../entity-catalog';
import { poolRequest, validIsoDate, validPoolId } from './allocation-api';
import { ExclusiveOperationManager, LatestOperationManager } from './async-operation';
import styles from '../products/products.module.css';

export function splitAssetCodes(value: string): readonly string[] {
  return value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
}
export function validatePoolDraft(value: CreateInvestmentPool): string | undefined {
  if (!validPoolId(value.poolId)) return 'Le code du pool doit contenir 2 à 32 lettres majuscules, chiffres, tirets ou soulignements.';
  if (!value.displayName.trim()) return 'Le nom du pool est obligatoire.';
  if (!/^[A-Z]{3}$/.test(value.currency)) return 'Choisissez une devise sur trois lettres.';
  if (!value.strategyCode.trim()) return 'La stratégie du pool est obligatoire.';
  if (!validIsoDate(value.validFrom) || value.validUntil !== undefined && (!validIsoDate(value.validUntil) || value.validUntil < value.validFrom)) return 'La période doit contenir des dates valides, avec une fin postérieure ou égale au début.';
  if (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/.test(value.mudaribProfitShare) || Number(value.mudaribProfitShare) > 100) return 'La part Moudarib doit être comprise entre 0 et 100 %, avec six décimales maximum.';
  if (new Set(value.eligibleAssetCodes).size !== value.eligibleAssetCodes.length || value.eligibleAssetCodes.some((code) => !code.trim())) return 'Les codes des actifs éligibles doivent être distincts et non vides.';
  return undefined;
}
export function validatePoolFunding(value: PoolFundingSource): string | undefined {
  if (!/^[A-Za-z0-9._:-]{2,64}$/.test(value.sourceId)) return 'La référence du financement doit contenir 2 à 64 lettres, chiffres, points, tirets, deux-points ou soulignements.';
  if (!['BANK_EQUITY', 'IAH_RESTRICTED', 'IAH_UNRESTRICTED'].includes(value.type)) return 'Sélectionnez une catégorie de financement valide.';
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(value.amount) || !/[1-9]/.test(value.amount)) return 'Le montant doit être strictement positif, avec un point décimal et douze décimales maximum.';
  if (value.type === 'IAH_RESTRICTED' && value.mandateAssetCodes.length === 0) return 'Un financement restreint nécessite au moins un code actif dans le mandat.';
  if (value.type !== 'IAH_RESTRICTED' && value.mandateAssetCodes.length > 0) return 'Le mandat est réservé aux financements restreints.';
  return undefined;
}
export async function createPool(command: CreateInvestmentPool, signal: AbortSignal, idempotencyKey: string): Promise<InvestmentPool> {
  const response = await fetch('/api/core/investment-pools', { method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-correlation-id': crypto.randomUUID(), 'idempotency-key': idempotencyKey }, body: JSON.stringify(command) });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const problem = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    throw new Error(typeof problem.detail === 'string' ? problem.detail : `Création impossible (HTTP ${response.status}).`);
  }
  if (!payload || typeof payload !== 'object' || (payload as InvestmentPool).poolId !== command.poolId || !Array.isArray((payload as InvestmentPool).fundingSources) || typeof (payload as InvestmentPool).status !== 'string') throw new Error('Réponse de création du pool invalide.');
  return payload as InvestmentPool;
}

export function PoolCreateConsole() {
  const [pool, setPool] = useState<InvestmentPool>();
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [fundingType, setFundingType] = useState('BANK_EQUITY');
  const commands = useRef(new ExclusiveOperationManager());
  const reads = useRef(new LatestOperationManager());
  const createAttempt = useRef<{ body: string; key: string } | undefined>(undefined);
  const fundingAttempt = useRef<{ body: string; key: string } | undefined>(undefined);
  useEffect(() => () => { commands.current.cancel(); reads.current.cancel(); }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const command: CreateInvestmentPool = {
      poolId: String(data.get('poolId') ?? '').trim().toUpperCase(), displayName: String(data.get('displayName') ?? '').trim(), currency: String(data.get('currency') ?? ''), strategyCode: String(data.get('strategyCode') ?? '').trim(),
      validFrom: String(data.get('validFrom') ?? ''), ...(data.get('validUntil') ? { validUntil: String(data.get('validUntil')) } : {}), eligibleAssetCodes: splitAssetCodes(String(data.get('eligibleAssetCodes') ?? '')), mudaribProfitShare: String(data.get('mudaribProfitShare') ?? '').trim(),
    };
    const validation = validatePoolDraft(command);
    if (validation) { setError(validation); setMessage(''); return; }
    const body = JSON.stringify(command);
    if (createAttempt.current?.body !== body) createAttempt.current = { body, key: crypto.randomUUID() };
    const key = createAttempt.current.key;
    await commands.current.run((signal) => createPool(command, signal, key), {
      loading: () => { reads.current.cancel(); setBusy(true); setError(''); setMessage(''); },
      success: (created) => { setPool(created); setSelectedId(created.poolId); notifyCatalogChanged('investment-pools'); setMessage('Pool créé en brouillon. Ajoutez un financement, puis activez-le dans le cycle de vie.'); },
      failure: setError, settled: () => setBusy(false),
    });
  }
  async function selectPool(id: string) {
    if (commands.current.isActive()) return;
    setSelectedId(id); setPool(undefined);
    await reads.current.run((signal) => poolRequest<InvestmentPool>(id, '', undefined, { signal }), {
      loading: () => { setBusy(true); setError(''); setMessage(''); }, success: setPool, failure: setError, settled: () => setBusy(false),
    });
  }
  async function fund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pool || pool.status === 'CLOSED') return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const funding: PoolFundingSource = { sourceId: String(data.get('sourceId') ?? '').trim(), type: fundingType, amount: String(data.get('amount') ?? '').trim(), mandateAssetCodes: fundingType === 'IAH_RESTRICTED' ? splitAssetCodes(String(data.get('mandateAssetCodes') ?? '')) : [] };
    const validation = validatePoolFunding(funding);
    if (validation) { setError(validation); setMessage(''); return; }
    const body = JSON.stringify({ poolId: pool.poolId, funding });
    if (fundingAttempt.current?.body !== body) fundingAttempt.current = { body, key: crypto.randomUUID() };
    const key = fundingAttempt.current.key;
    await commands.current.run((signal) => poolRequest<InvestmentPool>(pool.poolId, '/funding-sources', funding, { signal, idempotencyKey: key }), {
      loading: () => { reads.current.cancel(); setBusy(true); setError(''); setMessage(''); },
      success: (updated) => { setPool(updated); notifyCatalogChanged('investment-pools'); setMessage('Financement enregistré. Le pool peut être activé si son mandat est complet.'); form.reset(); setFundingType('BANK_EQUITY'); },
      failure: setError, settled: () => setBusy(false),
    });
  }
  return <section aria-label="Créer et financer un pool" aria-busy={busy}>
    <div className={styles.grid}>
      <section className={styles.card}><h2>Créer un pool</h2><form className={styles.form} onSubmit={create} noValidate>
        <label className={styles.field}>Code du pool<input name="poolId" required maxLength={32} disabled={busy} placeholder="Ex. POOL_IMMOBILIER" /></label>
        <label className={styles.field}>Nom du pool<input name="displayName" required disabled={busy} /></label>
        <div className={styles.row}><label className={styles.field}>Devise<select name="currency" disabled={busy} defaultValue="DZD"><option>DZD</option><option>EUR</option><option>USD</option></select></label><label className={styles.field}>Code stratégie<input name="strategyCode" required disabled={busy} placeholder="Ex. DIVERSIFIED" /></label></div>
        <div className={styles.row}><label className={styles.field}>Date de début<input name="validFrom" type="date" required disabled={busy} defaultValue={new Date().toISOString().slice(0, 10)} /></label><label className={styles.field}>Date de fin (facultative)<input name="validUntil" type="date" disabled={busy} /></label></div>
        <label className={styles.field}>Actifs éligibles<textarea name="eligibleAssetCodes" disabled={busy} placeholder="Codes actifs séparés par une virgule" /></label>
        <label className={styles.field}>Part Moudarib (%)<input name="mudaribProfitShare" inputMode="decimal" defaultValue="30" required disabled={busy} /></label>
        <button className={styles.button} disabled={busy}>Créer le pool en brouillon</button>
      </form></section>
      <section className={styles.card}><h2>Financer un pool</h2><EntityCatalog compact label="Pool à financer" kind="investment-pools" selectedId={selectedId} disabled={busy} onSelect={(id) => void selectPool(id)} />
        {pool && <><p>Pool : <strong>{pool.displayName}</strong> · <span className={styles.badge}>{pool.status}</span> · {pool.fundingSources.length} financement(s)</p><form className={styles.form} onSubmit={fund} noValidate><fieldset disabled={busy || pool.status === 'CLOSED'}>
          <label className={styles.field}>Référence du financement<input name="sourceId" required maxLength={64} placeholder="Ex. APPORT-2026-001" /></label>
          <label className={styles.field}>Catégorie<select value={fundingType} onChange={(event) => setFundingType(event.target.value)}><option value="BANK_EQUITY">Fonds propres de la banque</option><option value="IAH_UNRESTRICTED">Investisseurs — non restreint</option><option value="IAH_RESTRICTED">Investisseurs — restreint</option></select></label>
          <label className={styles.field}>Montant ({pool.currency})<input name="amount" inputMode="decimal" required /></label>
          {fundingType === 'IAH_RESTRICTED' && <label className={styles.field}>Mandat : codes actifs autorisés<textarea name="mandateAssetCodes" required placeholder="Codes séparés par une virgule" /></label>}
          <button className={styles.button} disabled={busy || pool.status === 'CLOSED'}>Ajouter le financement</button>
        </fieldset></form>{pool.status === 'CLOSED' && <p className={styles.hint}>Un pool clôturé ne reçoit plus de financement.</p>}</>}
      </section>
    </div>
    <div aria-live="polite">{error && <p role="alert" className={`${styles.notice} ${styles.error}`}>{error}</p>}{message && <p role="status" className={styles.notice}>{message}</p>}</div>
  </section>;
}
