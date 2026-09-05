/**
 * Categories du catalogue, LS-99. Parcours 3, etape 1.
 *
 * COMPOSANT SERVEUR : il exige le role, lit la base et rend. L'interaction vit
 * dans `gestion-categories.tsx`, marque client, qui ne requete rien lui-meme.
 *
 * `exigerAdministratrice` EST APPELE AVANT TOUT RENDU, motif pose par LS-70. La
 * page ET chaque Server Action portent la garde : proteger la page seule
 * laisserait ouvert l'appel direct a une action, defaut trouve en relecture de
 * LS-89.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import { listerCategories } from "@/services/catalogue";
import styles from "./categories.module.css";
import { GestionCategories } from "./gestion-categories";

export const metadata = {
  title: "Catégories du catalogue",
  robots: { index: false, follow: false },
};

/**
 * La page lit la base a chaque affichage.
 *
 * Une liste de categories mise en cache montrerait l'etat d'avant la derniere
 * creation, juste apres l'avoir faite : l'administratrice croirait son geste
 * perdu et le repeterait.
 */
export const dynamic = "force-dynamic";

export default async function PageCategories() {
  const enTetes = await headers();

  try {
    await exigerAdministratrice(enTetes);
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      redirect("/administration/connexion");
    }
    throw erreur;
  }

  const categories = await listerCategories();

  return (
    <main className={styles.page}>
      <h1 className={styles.titre}>Catégories du catalogue</h1>
      <p className={styles.introduction}>
        Les catégories rangent les produits de la boutique. Leur ordre ici est
        celui que verront les visiteurs. Une catégorie qui porte des produits ne
        peut pas être supprimée.
      </p>

      <GestionCategories categories={categories} />
    </main>
  );
}
