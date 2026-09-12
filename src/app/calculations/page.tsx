import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth/options";
import { CalculationsConsole } from "./calculations-console";
import { ProfitExplanationConsole } from "./profit-explanation-console";
import styles from "../products/products.module.css";
export const metadata = { title: "Calculs et partage | PMS" };
export const dynamic = "force-dynamic";
export default async function CalculationsPage() {
  if (!(await getServerSession(authOptions)))
    redirect("/api/auth/signin/oidc?callbackUrl=/calculations");
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/">Retour au tableau de bord</Link>
        <h1>Calculs et partage</h1>
        <p>
          Consultez les preuves d’exécution et appliquez le contrôle
          Maker/Checker avant comptabilisation.
        </p>
      </header>
      <main className={styles.main}>
        <CalculationsConsole />
        <div style={{ marginTop: "1rem" }}><ProfitExplanationConsole /></div>
      </main>
    </div>
  );
}
