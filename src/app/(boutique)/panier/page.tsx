/**
 * Page du panier, LS-114. Etape 3 du parcours 1.
 *
 * COMPOSANT SERVEUR. Les seuls elements interactifs sont les formulaires de
 * quantite et de retrait, isoles dans `lignes-panier.tsx`.
 *
 * ELLE REVALIDE A CHAQUE AFFICHAGE, jamais de cache : le prix et la
 * disponibilite sont ce que la base dit maintenant, pas ce que le cookie porte.
 * C'est le critere 5 de la story.
 */
import Link from "next/link";
import { cookies } from "next/headers";

import { BandeauReassurance } from "@/components/bandeau-reassurance";
import { formaterMontant } from "@/lib/montant";
import { NOM_COOKIE_PANIER, decoderPanier } from "@/lib/panier-cookie";
import { revalider } from "@/services/panier";
import { lireSeuilFranchise } from "@/services/parametres";
import { LignesPanier } from "./lignes-panier";
import styles from "./panier.module.css";

export const metadata = {
  title: "Votre panier",
  description: "Les pièces que vous avez sélectionnées.",
  /*
   * LS-137, critère 4. `noindex` : le contenu de cette page vient d'un cookie,
   * elle est donc différente pour chaque visiteur et vide pour un robot. Une
   * indexation ferait remonter « Votre panier est vide » sur le nom de la
   * boutique. `follow` reste vrai : les liens vers le catalogue restent utiles
   * à suivre.
   */
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

export default async function PagePanier() {
  const magasin = await cookies();
  const lignesCookie = decoderPanier(magasin.get(NOM_COOKIE_PANIER)?.value);
  const [panier, seuilFranchise] = await Promise.all([
    revalider(lignesCookie),
    lireSeuilFranchise(),
  ]);

  if (panier.lignes.length === 0) {
    /*
     * ETAT VIDE, ET NON UN TABLEAU VIDE. `frontend-design.md` l'impose : un
     * texte court et une action qui remet en mouvement, jamais une page nue.
     */
    return (
      <main id="contenu" tabIndex={-1} className={styles.page}>
        <h1 className={styles.titre}>Votre panier</h1>
        <p className={styles.vide}>Votre panier est vide pour le moment.</p>
        <Link href="/catalogue" className={styles.actionPrincipale}>
          Découvrir les créations
        </Link>
      </main>
    );
  }

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Votre panier</h1>

      {/*
       * L'AVERTISSEMENT VIENT AVANT LES LIGNES, et porte `role="status"` : un
       * lecteur d'ecran l'annonce a l'arrivee sur la page, plutot que de le
       * decouvrir apres avoir parcouru tout le panier.
       */}
      {panier.aChange && (
        <p
          role="status"
          aria-label="Changement dans votre panier"
          className={styles.avertissement}
        >
          Certaines pièces ont changé depuis votre dernière visite. Le
          récapitulatif ci-dessous est à jour.
        </p>
      )}

      <LignesPanier lignes={panier.lignes} />

      <div className={styles.total}>
        <p className={styles.libelleTotal}>Total des pièces</p>
        <p className={styles.montantTotal}>
          {formaterMontant(panier.totalArticlesCentimes)}
        </p>
      </div>

      {/*
       * LES FRAIS DE PORT NE SONT PAS ANNONCES ICI. Ils dependent du mode de
       * livraison, choisi a l'etape 3b, et leur configuration appartient a
       * LS-27 et LS-115. Ecrire un montant ou un seuil en dur creerait la
       * divergence que `frontend-design.md` interdit, information
       * precontractuelle fausse.
       */}
      <p className={styles.mentionLivraison}>
        Les frais de livraison sont calculés à l&apos;étape suivante, selon le
        mode choisi.
      </p>

      {/*
       * LE PASSAGE A LA COMMANDE APPARTIENT A LS-115. Le lien est ecrit
       * maintenant parce que la page se conçoit une fois ; il rend une 404
       * jusqu'a la livraison du tunnel, comme les liens de fiche produit entre
       * LS-104 et LS-105.
       */}
      <Link href="/commande" className={styles.actionPrincipale}>
        Passer la commande
      </Link>

      <Link href="/catalogue" className={styles.actionSecondaire}>
        Continuer mes achats
      </Link>

      {/*
       * LE BANDEAU ENTIER, APRES LES ACTIONS ET NON AVANT, LS-251. Entre le
       * total et « Passer la commande », ses six elements repousseraient le
       * bouton principal de pres de 500 px hors de l'ecran a 320 px. Le panier
       * vide ne le porte pas : il n'y a rien a rassurer avant un choix.
       */}
      <div className={styles.reassurance}>
        <BandeauReassurance seuilFranchiseCentimes={seuilFranchise} />
      </div>
    </main>
  );
}
