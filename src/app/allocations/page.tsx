import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authOptions } from '@/auth/options';
import { AllocationsConsole } from './allocations-console';
import { PoolLifecycleConsole } from './pool-lifecycle-console';
import { PoolCreateConsole } from './pool-create-console';
import styles from '../products/products.module.css';

export const metadata = { title: 'Pools et allocations | PMS' };
export const dynamic = 'force-dynamic';

export default async function AllocationsPage() {
  if (!(await getServerSession(authOptions))) redirect('/api/auth/signin/oidc?callbackUrl=/allocations');
  return <div className={styles.page}><header className={styles.header}><Link href="/">Retour au tableau de bord</Link><h1>Pools et allocations</h1><p>Créez et financez un pool, activez-le, puis simulez et enregistrez une allocation traçable.</p></header><main className={styles.main}><PoolCreateConsole /><div style={{ marginTop: '1rem' }}><PoolLifecycleConsole /></div><div style={{ marginTop: '1rem' }}><AllocationsConsole /></div></main></div>;
}
