import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authOptions } from '@/auth/options';
import { ReportingConsole } from './reporting-console';
import { PlanningScenarioConsole } from './planning-scenario-console';
import { HistoricalForecastConsole } from './historical-forecast-console';
import { TenorCurveConsole } from './tenor-curve-console';
import styles from '../products/products.module.css';
export const metadata = { title: 'Reporting réglementaire | PMS' };
export const dynamic = 'force-dynamic';
export default async function ReportingPage() { if (!(await getServerSession(authOptions))) redirect('/api/auth/signin/oidc?callbackUrl=/reporting'); return <div className={styles.page}><header className={styles.header}><Link href="/">Retour au tableau de bord</Link><h1>Reporting et planification</h1><p>Générez un instantané vérifiable, publiez-le avec sa preuve et préparez les scénarios budgétaires à douze mois.</p></header><main className={styles.main}><ReportingConsole /><PlanningScenarioConsole /><HistoricalForecastConsole /><TenorCurveConsole /></main></div>; }
