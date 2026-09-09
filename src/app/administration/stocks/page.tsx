/**
 * Stocks et marches, LS-106. Parcours 2.
 *
 * COMPOSANT SERVEUR : il exige le role, lit la base et rend. L'interaction vit
 * dans `gestion-stocks.tsx`, marque client, qui ne requete rien lui-meme.
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
import { lireEtatStock, lireJournal } from "@/services/stock-multicanal";
import { GestionStocks } from "./gestion-stocks";
import { ChargementAdministration } from "@/components/chargement-administration";
import styles from "./stocks.module.css";

export const metadata = {
  title: "Stocks et marchés, administration",
  robots: { index: false, follow: false },
};

/**
 * La page lit la base a chaque affichage.
 *
 * UN ETAT DE STOCK MIS EN CACHE EST PIRE QU'AILLEURS : l'administratrice
 * enregistre une vente sur un stand et doit voir la quantite bouger. Un ecran
 * fige lui ferait ressaisir la meme vente.
 */
export const dynamic = "force-dynamic";

export default async function PageStocks() {
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
      <h1 className={styles.titre}>Stocks et marchés</h1>
      <p className={styles.introduction}>
        Suspendre la vente en ligne avant un marché ne retire aucune pièce du
        stock : seule une vente réelle le décrémente. Une vente sur un marché
        est refusée tant qu&apos;un paiement est en cours sur la même pièce.
      </p>

      <Suspense fallback={<ChargementStocks />}>
        <EtatDesStocks />
      </Suspense>
    </main>
  );
}

/** Armature affichee pendant que les stocks arrivent, LS-139. */
function ChargementStocks() {
  return (
    <ChargementAdministration annonce="Chargement des stocks…" lignes={5} />
  );
}

/**
 * L'etat des stocks, seule partie de cet ecran qui lit la base.
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
 * NE PAS RETABLIR `stocks/loading.tsx`.
 */
async function EtatDesStocks() {
  /*
   * LES DEUX LECTURES SONT PARALLELES, elles ne dependent pas l'une de l'autre.
   * Les enchainer doublerait l'attente sans rien garantir de plus : aucune
   * coherence transactionnelle n'est requise entre l'etat courant et
   * l'historique, qui sont deux vues distinctes.
   */
  const [stocks, journal] = await Promise.all([
    lireEtatStock(),
    lireJournal({ limite: 50 }),
  ]);

  return <GestionStocks stocks={stocks} journal={journal} />;
}
