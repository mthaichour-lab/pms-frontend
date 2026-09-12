import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authOptions } from '@/auth/options';
import { AuditConsole } from './audit-console';
import { AuditTrailConsole } from './audit-trail-console';
import { DocumentArchiveConsole } from './document-archive-console';
import styles from '../products/products.module.css';
export const metadata = { title: 'Audit, archives et exports | PMS' };
export const dynamic = 'force-dynamic';
export default async function AuditPage() {
  if (!(await getServerSession(authOptions))) redirect('/api/auth/signin/oidc?callbackUrl=/audit');
  return <div className={styles.page}><header className={styles.header}><Link href="/">Retour au tableau de bord</Link><h1>Audit, archives et exports sécurisés</h1><p>Archivez les preuves via antivirus, Paperless et WORM, puis générez des exports vérifiables sans exposer de données personnelles.</p></header><main className={styles.main}><AuditTrailConsole /><hr className={styles.separator} /><DocumentArchiveConsole /><hr className={styles.separator} /><AuditConsole /></main></div>;
}
