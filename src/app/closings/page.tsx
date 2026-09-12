import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authOptions } from '@/auth/options';
import { ClosingConsole } from './closing-console';
import styles from '../products/products.module.css';

export const metadata = { title: 'Clôtures | PMS' };
export const dynamic = 'force-dynamic';

export default async function ClosingsPage() {
  if (!(await getServerSession(authOptions))) redirect('/api/auth/signin/oidc?callbackUrl=/closings');
  return <div className={styles.page}><header className={styles.header}><Link href="/">Retour au tableau de bord</Link><h1>Clôtures</h1><p>Approuvez une clôture contrôlée avec justification, traçabilité et protection contre les doubles commandes.</p></header><main className={styles.main}><ClosingConsole /></main></div>;
}
