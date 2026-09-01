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

import { NOM_COOKIE_PANIER, decoderPanier } from "@/lib/panier-cookie";
import { revalider } from "@/services/panier";
import { LignesPanier } from "./lignes-panier";
import styles from "./panier.module.css";

export const metadata = {
  title: "Votre panier, Lune & Soleil",
  description: "Les pièces que vous avez sélectionnées.",
};

export const dynamic = "force-dynamic";

/** Le prix en euros, a partir des centimes entiers de l'invariant 1. */
function prixAffiche(centimes: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(centimes / 100);
}

export default async function PagePanier() {
  const magasin = await cookies();
  const lignesCookie = decoderPanier(magasin.get(NOM_COOKIE_PANIER)?.value);
  const panier = await revalider(lignesCookie);

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
          {prixAffiche(panier.totalArticlesCentimes)}
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
    </main>
  );
}
