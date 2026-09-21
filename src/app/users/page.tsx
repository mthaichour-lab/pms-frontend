import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/auth/options';
import { UsersConsole } from './users-console';
import styles from '../products/products.module.css';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Utilisateurs et habilitations | PMS' };
export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.error) redirect('/api/auth/signin?callbackUrl=/users');
  if (!session.user.roles.includes('SYSTEM_ADMIN')) redirect('/forbidden');
  return <div className={styles.page}><header className={styles.header}><h1>Utilisateurs et habilitations</h1><p>Créez les comptes de connexion, affectez leurs rôles et définissez leurs périmètres d’intervention.</p></header><main className={styles.main}><UsersConsole /></main></div>;
}
