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
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import { lireEtatStock, lireJournal } from "@/services/stock-multicanal";
import { GestionStocks } from "./gestion-stocks";
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

  return (
    <main className={styles.page}>
      <h1 className={styles.titre}>Stocks et marchés</h1>
      <p className={styles.introduction}>
        Suspendre la vente en ligne avant un marché ne retire aucune pièce du
        stock : seule une vente réelle le décrémente. Une vente sur un marché
        est refusée tant qu&apos;un paiement est en cours sur la même pièce.
      </p>

      <GestionStocks stocks={stocks} journal={journal} />
    </main>
  );
}
