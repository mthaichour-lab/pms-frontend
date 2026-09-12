import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authOptions } from '@/auth/options';
import { RevenuesConsole } from './revenues-console';
import styles from '../products/products.module.css';
export const metadata = { title: 'Revenus et charges | PMS' };
export const dynamic = 'force-dynamic';
export default async function RevenuesPage() { if (!(await getServerSession(authOptions))) redirect('/api/auth/signin/oidc?callbackUrl=/revenues'); return <div className={styles.page}><header className={styles.header}><Link href="/">Retour au tableau de bord</Link><h1>Revenus et charges</h1><p>Importez les revenus reconnus, documentez leurs ajustements et contrôlez les charges déductibles du pool.</p></header><main className={styles.main}><RevenuesConsole /></main></div>; }
