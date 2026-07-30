import styles from "./page.module.css";

/*
 * Page d'attente. Elle prouve que l'application se construit et se sert, rien
 * de plus. Le catalogue, la fiche produit et le tunnel appartiennent à la
 * phase 2. Composant serveur, aucune interaction.
 */

export default function Page() {
  return (
    <main className={styles.main}>
      <h1 className={styles.titre}>Lune &amp; Soleil</h1>
      <p className={styles.accroche}>
        Bijoux artisanaux faits main, créés à l&apos;unité.
      </p>
      <p className={styles.mention}>Boutique en cours de construction.</p>
    </main>
  );
}
