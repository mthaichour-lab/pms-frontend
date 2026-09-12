import styles from '../products/products.module.css';

export function ReportingError({ message }: { readonly message: string }) {
  return message ? <p className={`${styles.notice} ${styles.error}`} role="alert" aria-live="assertive" aria-atomic="true">{message}</p> : null;
}

export function ReportingStatus({ message }: { readonly message: string }) {
  return message ? <p className={styles.notice} role="status" aria-live="polite">{message}</p> : null;
}
