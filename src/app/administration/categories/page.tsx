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
import { Suspense } from "react";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import { ChargementAdministration } from "@/components/chargement-administration";
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

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Catégories du catalogue</h1>
      <p className={styles.introduction}>
        Les catégories rangent les produits de la boutique. Leur ordre ici est
        celui que verront les visiteurs. Une catégorie qui porte des produits ne
        peut pas être supprimée.
      </p>

      <Suspense fallback={<ChargementCategories />}>
        <ListeCategories />
      </Suspense>
    </main>
  );
}

/** Armature affichee pendant que la liste arrive, LS-188 puis LS-139. */
function ChargementCategories() {
  return (
    <ChargementAdministration annonce="Chargement des catégories…" lignes={4} />
  );
}

/**
 * La liste elle-meme, seule partie de cet ecran qui lit la base.
 *
 * POURQUOI UN `<Suspense>` INTERNE ET NON UN `loading.tsx`, LS-139. Un fichier
 * de segment pose sa frontiere sur la page ENTIERE : le streaming demarre alors
 * des le premier `await`, et un statut ne se change plus une fois les octets
 * partis. Une base injoignable rendait donc **200** avec l'armature figee, au
 * lieu du 500 que `error.tsx` doit servir.
 *
 * MESURE EN ARRETANT REELLEMENT LA BASE DE PRODUCTION, le 9 septembre 2026, sur
 * le catalogue public qui portait le meme defaut : 200 avec « Chargement des
 * pieces… » comme etat FINAL, quand l'accueil, sans frontiere au-dessus de lui,
 * rendait un vrai 500.
 *
 * UNE SONDE EN TETE DE PAGE NE SUFFIT PAS, essayee et mesuree : elle est
 * elle-meme un `await` SOUS la frontiere, donc elle demarre le flux avant de
 * lever. La documentation de Next.js 16, verifiee par Context7, exige un
 * controle avant « any await that may suspend ».
 *
 * LA GARDE D'AUTORISATION RESTE AU-DESSUS, dans la page : une redirection subit
 * le meme sort qu'un statut, elle ne part plus une fois le flux commence.
 *
 * NE PAS RETABLIR `categories/loading.tsx`.
 */
async function ListeCategories() {
  const categories = await listerCategories();

  return <GestionCategories categories={categories} />;
}
