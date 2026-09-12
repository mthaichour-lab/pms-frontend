import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authOptions } from '@/auth/options';
import { AccountingEventConsole } from './accounting-event-console';
import { ReconciliationConsole } from './reconciliation-console';
import styles from '../products/products.module.css';
export const metadata = { title: 'Rapprochement comptable | PMS' };
export const dynamic = 'force-dynamic';
export default async function ReconciliationPage() {
  if (!(await getServerSession(authOptions))) redirect('/api/auth/signin/oidc?callbackUrl=/reconciliation');
  return <div className={styles.page}><header className={styles.header}><Link href="/">Retour au tableau de bord</Link><h1>Rapprochement comptable</h1><p>Pilotez les événements, leurs accusés et la preuve de rapprochement du grand livre.</p></header><main className={styles.main}><AccountingEventConsole /><hr className={styles.separator} /><ReconciliationConsole /></main></div>;
}
