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
import { Suspense } from "react";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import { ChargementAdministration } from "@/components/chargement-administration";
import { listerCategories } from "@/services/catalogue";
import { FormulaireProduit } from "./formulaire-produit";
import styles from "./nouveau-produit.module.css";

export const metadata = {
  title: "Nouveau produit",
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

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Nouveau produit</h1>
      <p className={styles.introduction}>
        Le produit est créé en brouillon : il n&apos;apparaît pas dans la
        boutique tant qu&apos;il n&apos;a ni photo ni variante. Le contenu de la
        fiche et le prix s&apos;ajoutent ensuite.
      </p>

      <Suspense fallback={<ChargementFormulaire />}>
        <FormulaireAvecCategories />
      </Suspense>
    </main>
  );
}

/** Armature affichee pendant que les categories arrivent, LS-139. */
function ChargementFormulaire() {
  return (
    <ChargementAdministration annonce="Chargement du formulaire…" lignes={5} />
  );
}

/**
 * Le formulaire, seule partie de cet ecran qui lit la base.
 *
 * POURQUOI UN `<Suspense>` INTERNE ET NON UN `loading.tsx`, LS-139. Un fichier
 * de segment pose sa frontiere sur la page ENTIERE : le streaming demarre alors
 * des le premier `await`, et un statut ne se change plus une fois les octets
 * partis. Une base injoignable rendait donc **200** avec l'armature figee, au
 * lieu du 500 que `error.tsx` doit servir.
 *
 * Mesure en arretant reellement la base de production le 9 septembre 2026, sur
 * le catalogue public qui portait le meme defaut.
 *
 * NE PAS RETABLIR `nouveau/loading.tsx`.
 */
async function FormulaireAvecCategories() {
  const categories = await listerCategories();

  return (
    <FormulaireProduit
      categories={categories.map((c) => ({ id: c.id, nom: c.nom }))}
    />
  );
}
