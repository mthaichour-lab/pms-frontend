import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authOptions } from '@/auth/options';
import { PurificationConsole } from './purification-console';
import styles from '../products/products.module.css';
export const metadata = { title: 'Purification Charia | PMS' };
export const dynamic = 'force-dynamic';
export default async function PurificationPage() { if (!(await getServerSession(authOptions))) redirect('/api/auth/signin/oidc?callbackUrl=/purifications'); return <div className={styles.page}><header className={styles.header}><Link href="/">Retour au tableau de bord</Link><h1>Purification Charia</h1><p>Identifiez les revenus non conformes, documentez leur bénéficiaire puis suivez leur règlement.</p></header><main className={styles.main}><PurificationConsole /></main></div>; }
