import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authOptions } from '@/auth/options';
import { PublishedRiskDashboardConsole } from './published-risk-dashboard';
import { RiskConsole } from './risk-console';
import { StressConsole } from './stress-console';
import styles from '../products/products.module.css';
export const metadata = { title: 'Risques et DCR | PMS' };
export const dynamic = 'force-dynamic';
export default async function RiskPage() {
  if (!(await getServerSession(authOptions))) redirect('/api/auth/signin/oidc?callbackUrl=/risk');
  return <div className={styles.page}><header className={styles.header}><Link href="/">Retour au tableau de bord</Link><h1>Risques et DCR</h1><p>Consultez le dernier run publié, calculez le ratio de couverture et exécutez des scénarios de stress.</p></header><main className={styles.main}><PublishedRiskDashboardConsole /><hr className={styles.separator} /><RiskConsole /><hr className={styles.separator} /><StressConsole /></main></div>;
}
