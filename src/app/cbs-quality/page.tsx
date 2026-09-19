import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/auth/options';
import { CbsQualityConsole } from './cbs-quality-console';
import styles from './cbs-quality.module.css';

export const metadata = { title: 'Qualité des données CBS | PMS' };
export const dynamic = 'force-dynamic';

export default async function CbsQualityPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/api/auth/signin/oidc?callbackUrl=/cbs-quality');
  return <div className={styles.page}>
    <header className={styles.header}>
      <Link href="/">Retour au tableau de bord</Link>
      <p>Supervision des ingestions</p>
      <h1>Qualité des données CBS</h1>
      <span>Contrôlez la complétude des manifestes, les quarantaines et les anomalies avant calcul.</span>
    </header>
    <main><CbsQualityConsole /></main>
  </div>;
}
