import Link from 'next/link';
import styles from '../products/products.module.css';

export const metadata = { title: 'Accès refusé | PMS' };
export default function ForbiddenPage() {
  return <div className={styles.page}><header className={styles.header}><p>Erreur 403</p><h1>Accès refusé</h1><p>Votre rôle ne permet pas d’ouvrir ce parcours. L’événement peut être rapproché dans la piste d’audit.</p><Link href="/">Retour au tableau de bord</Link></header></div>;
}
