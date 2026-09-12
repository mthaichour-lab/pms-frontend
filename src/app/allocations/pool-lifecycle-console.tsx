'use client';
import { FormEvent, useState } from 'react';
import { poolRequest, transitionPool, type InvestmentPool } from './allocation-api';
import styles from '../products/products.module.css';

export function PoolLifecycleConsole() {
  const [poolId,setPoolId]=useState(''),[pool,setPool]=useState<InvestmentPool>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function run(work:()=>Promise<InvestmentPool>){setBusy(true);setError('');try{setPool(await work())}catch(c){setError(c instanceof Error?c.message:'Erreur inattendue.')}finally{setBusy(false)}}
  async function load(event:FormEvent){event.preventDefault();await run(()=>poolRequest<InvestmentPool>(poolId))}
  async function transition(action:'activate'|'suspend'|'close'){await run(()=>transitionPool(poolId,action))}
  return <section className={styles.card}><h2>Cycle de vie du pool</h2><form className={styles.form} onSubmit={load}><label className={styles.field}>Identifiant du pool<input value={poolId} onChange={event=>setPoolId(event.target.value.toUpperCase())} required /></label><button className={styles.button} disabled={busy}>Charger le pool</button></form>{error&&<p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}{pool&&<div className={styles.product}><span className={styles.badge}>{pool.status}</span><dl><dt>Pool</dt><dd>{pool.displayName}</dd><dt>Financements</dt><dd>{pool.fundingSources.length}</dd></dl><div className={styles.actions}>{(pool.status==='DRAFT'||pool.status==='SUSPENDED')&&<button className={styles.button} disabled={busy} onClick={()=>void transition('activate')}>Activer</button>}{pool.status==='ACTIVE'&&<button className={styles.secondary} disabled={busy} onClick={()=>void transition('suspend')}>Suspendre</button>}{pool.status!=='CLOSED'&&<button className={styles.secondary} disabled={busy} onClick={()=>void transition('close')}>Clôturer définitivement</button>}</div></div>}</section>;
}
