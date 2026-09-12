import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authOptions } from '@/auth/options';
import { AllocationsConsole } from './allocations-console';
import { PoolLifecycleConsole } from './pool-lifecycle-console';
import styles from '../products/products.module.css';

export const metadata = { title: 'Pools et allocations | PMS' };
export const dynamic = 'force-dynamic';

export default async function AllocationsPage() {
  if (!(await getServerSession(authOptions))) redirect('/api/auth/signin/oidc?callbackUrl=/allocations');
  return <div className={styles.page}><header className={styles.header}><Link href="/">Retour au tableau de bord</Link><h1>Pools et allocations</h1><p>Consultez le mandat du pool, gérez son cycle de vie, simulez sa capacité puis enregistrez une allocation traçable.</p></header><main className={styles.main}><AllocationsConsole /><div style={{ marginTop: '1rem' }}><PoolLifecycleConsole /></div></main></div>;
}
