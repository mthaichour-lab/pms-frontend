import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authOptions } from '@/auth/options';
import { QuotationConsole } from './quotation-console';
import styles from '../products/products.module.css';
export const metadata = { title: 'Simulation de taux cible | PMS' };
export const dynamic = 'force-dynamic';
export default async function QuotationPage() { if (!(await getServerSession(authOptions))) redirect('/api/auth/signin/oidc?callbackUrl=/quotations'); return <div className={styles.page}><header className={styles.header}><Link href="/">Retour au tableau de bord</Link><h1>Simulation de taux cible</h1><p>Évaluez la capacité réelle, la clé de partage recommandée et le niveau de gouvernance requis.</p></header><main className={styles.main}><QuotationConsole /></main></div>; }
