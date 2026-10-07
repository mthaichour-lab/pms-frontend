import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { authOptions } from '@/auth/options';
import { CurrencyConsole } from './currency-console';
import styles from '../products/products.module.css';

export const metadata = { title: 'Référentiel devises | PMS' };
export const dynamic = 'force-dynamic';

export default async function ReferenceDataPage() {
  if (!(await getServerSession(authOptions))) redirect('/api/auth/signin/oidc?callbackUrl=/reference-data');
  return <div className={styles.page}><header className={styles.header}><Link href="/">Retour au tableau de bord</Link><h1>Référentiel des devises</h1><p>Créez des versions de devise datées et utilisez-les dans les pools d’investissement.</p></header><main className={styles.main}><CurrencyConsole /></main></div>;
}
