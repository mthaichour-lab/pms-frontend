import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/auth/options';
import { ProductsConsole } from './products-console';
import styles from './products.module.css';

export const metadata = { title: 'Produits d’investissement | PMS' };
export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/api/auth/signin/oidc?callbackUrl=/products');

  return <div className={styles.page}>
    <header className={styles.header}>
      <Link href="/">← Retour au tableau de bord</Link>
      <h1>Produits d’investissement</h1>
      <p>Configurez les produits, contrôlez leur cycle de vie et simulez chaque version contractuelle avant publication.</p>
    </header>
    <main className={styles.main}><ProductsConsole /></main>
  </div>;
}
