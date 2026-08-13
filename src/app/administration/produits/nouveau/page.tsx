/**
 * Creation d'un produit, LS-99. Parcours 3, etape 2.
 *
 * ECRAN DISTINCT DE CELUI DES CATEGORIES, comme le prototype le montre : ce
 * sont deux intentions differentes, ranger le catalogue d'un cote, ajouter une
 * piece de l'autre.
 *
 * `exigerAdministratrice` AVANT TOUT RENDU, et chaque Server Action porte la
 * meme garde de son cote.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import { listerCategories } from "@/services/catalogue";
import { FormulaireProduit } from "./formulaire-produit";
import styles from "./nouveau-produit.module.css";

export const metadata = {
  title: "Nouveau produit, administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PageNouveauProduit() {
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
      <h1 className={styles.titre}>Nouveau produit</h1>
      <p className={styles.introduction}>
        Le produit est créé en brouillon : il n&apos;apparaît pas dans la boutique
        tant qu&apos;il n&apos;a ni photo ni variante. Le contenu de la fiche et le prix
        s&apos;ajoutent ensuite.
      </p>

      <FormulaireProduit
        categories={categories.map((c) => ({ id: c.id, nom: c.nom }))}
      />
    </main>
  );
}
