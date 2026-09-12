import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authOptions } from '@/auth/options';
import { ShariaConsole } from './sharia-console';
import styles from '../products/products.module.css';
export const metadata = { title: 'Conformité Charia | PMS' };
export const dynamic = 'force-dynamic';
export default async function ShariaPage() { if (!(await getServerSession(authOptions))) redirect('/api/auth/signin/oidc?callbackUrl=/sharia'); return <div className={styles.page}><header className={styles.header}><Link href="/">Retour au tableau de bord</Link><h1>Conformité Charia</h1><p>Soumission, avis indépendant et décision documentée selon un workflow à rôles séparés.</p></header><main className={styles.main}><ShariaConsole /></main></div>; }
