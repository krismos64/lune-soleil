"use client";

/**
 * Blocs 3 a 8 de la fiche produit, LS-105 : prix, disponibilite, choix de la
 * declinaison, ajout au panier, livraison et dimensions.
 *
 * SEUL COMPOSANT CLIENT DE LA FICHE, et il porte exactement ce que le critere 5
 * exige : « le choix de variante met a jour prix et disponibilite sans
 * rechargement complet ». Tout le reste de la page reste serveur.
 *
 * POURQUOI CES BLOCS SONT ENSEMBLE. Prix, disponibilite et dimensions dependent
 * TOUS de la variante choisie : les separer obligerait a remonter l'etat dans
 * un contexte, ou a recharger la page. Ils forment une seule unite qui change
 * d'un coup.
 *
 * L'ORDRE DES BLOCS EST CELUI DE `frontend-design.md`, et il est impose. Le
 * bloc 7, livraison, s'intercale entre l'ajout au panier et les dimensions :
 * cela peut surprendre a la lecture du code, mais c'est la table qui commande,
 * pensee pour un ecran de 320 px ou tout est empile.
 *
 * AUCUNE QUANTITE N'ARRIVE JUSQU'ICI. Le service ne transmet que l'etat derive,
 * invariant du projet : « 7 en stock » exposerait le niveau d'activite de la
 * boutique. Ce composant ne peut donc pas le divulguer, meme par erreur.
 */
import { useState, useTransition } from "react";

import type { EtatDisponibilite, VarianteFiche } from "@/services/catalogue";
import { ajouterAuPanier } from "@/app/(boutique)/panier/actions-panier";
import styles from "./fiche.module.css";

/**
 * Libelle public de chaque etat, et la classe qui le colore.
 *
 * TROIS ETATS, JAMAIS UNE QUANTITE. `frontend-design.md` fixe la liste, et
 * « Derniere piece » est le seul qui porte une information de rarete : elle est
 * vraie et utile, chaque bijou etant fait main.
 */
const LIBELLE_DISPONIBILITE: Record<EtatDisponibilite, string> = {
  EN_STOCK: "En stock",
  DERNIERE_PIECE: "Dernière pièce",
  EPUISE: "Épuisé",
};

const CLASSE_DISPONIBILITE: Record<EtatDisponibilite, string> = {
  EN_STOCK: styles.badgeEnStock!,
  DERNIERE_PIECE: styles.badgeDernierePiece!,
  EPUISE: styles.badgeEpuise!,
};

/** Formate un prix en centimes, invariant 1 : aucun flottant en calcul. */
function formaterPrix(centimes: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(centimes / 100);
}

export function SelecteurVariante({
  variantes,
}: {
  variantes: VarianteFiche[];
}) {
  /*
   * LA PREMIERE VARIANTE EST RETENUE AU DEPART, et non la premiere DISPONIBLE.
   * Ouvrir sur une declinaison differente de celle qu'affiche le selecteur
   * ferait mentir l'ecran ; et un produit dont tout est epuise n'a aucune
   * variante disponible, il faudrait alors un cas particulier de plus.
   *
   * L'ETAT PORTE UN IDENTIFIANT ET NON UN INDICE. Un indice se decale des que
   * la liste change, et pointerait sur une autre declinaison que celle choisie.
   */
  const [idChoisi, setIdChoisi] = useState(variantes[0]?.id);
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState("");

  const choisie = variantes.find((v) => v.id === idChoisi) ?? variantes[0];

  /*
   * SANS AUCUNE VARIANTE, RIEN A AFFICHER. Le cas ne devrait pas exister, C19
   * archivant un produit dont la derniere variante part, mais un rendu qui
   * planterait sur une page publique serait pire que ce garde-fou.
   */
  if (choisie === undefined) {
    return null;
  }

  const epuisee = choisie.disponibilite === "EPUISE";

  return (
    <>
      {/* Bloc 3, prix. */}
      <p className={styles.prix}>{formaterPrix(choisie.prixCentimes)}</p>

      {/*
       * Bloc 4, disponibilite. REGION LIVE, LS-85 : changer de declinaison
       * remplace ce texte sans que rien d'autre ne bouge, et sans annonce le
       * changement passerait inapercu de qui n'a pas l'ecran sous les yeux.
       */}
      {/*
       * `aria-label` DISTINGUE CETTE REGION LIVE DE CELLE DE L'AJOUT AU PANIER,
       * posee par LS-114 plus bas. Deux regions `status` sans nom sur la meme
       * page s'annoncent identiquement, et rien ne dit laquelle a parle.
       */}
      <p
        className={`${styles.badge} ${CLASSE_DISPONIBILITE[choisie.disponibilite]}`}
        role="status"
        aria-live="polite"
        aria-label="Disponibilité"
      >
        {LIBELLE_DISPONIBILITE[choisie.disponibilite]}
      </p>

      {/*
       * Bloc 5, choix de la declinaison, AFFICHE SEULEMENT S'IL Y A UN CHOIX.
       * Un selecteur a une seule option demanderait de choisir ce qui est deja
       * choisi.
       *
       * DES BOUTONS RADIO ET NON UN `<select>`. Les declinaisons sont deux ou
       * trois, toutes visibles d'un coup, et chacune porte son propre etat de
       * disponibilite : un `<select>` cacherait ces etats derriere une
       * ouverture.
       */}
      {variantes.length > 1 && (
        <fieldset className={styles.declinaisons}>
          <legend className={styles.legendeDeclinaisons}>Déclinaison</legend>
          {variantes.map((variante) => (
            <label key={variante.id} className={styles.declinaison}>
              <input
                type="radio"
                name="variante"
                value={variante.id}
                checked={variante.id === choisie.id}
                onChange={() => setIdChoisi(variante.id)}
                className={styles.radioDeclinaison}
              />
              <span className={styles.libelleDeclinaison}>
                {variante.libelle}
              </span>
              {/*
               * L'ETAT DE CHAQUE DECLINAISON EST VISIBLE SANS LA CHOISIR, et le
               * texte le dit plutot que la seule couleur : `frontend-design.md`
               * interdit de transmettre une information par la couleur seule.
               */}
              {variante.disponibilite === "EPUISE" && (
                <span className={styles.declinaisonEpuisee}>Épuisée</span>
              )}
            </label>
          ))}
        </fieldset>
      )}

      {/*
       * Bloc 6, ajout au panier. LE BOUTON ET SON ETAT SEULEMENT : la mecanique
       * de reservation appartient a la phase 3, epic LS-4. Il est pose des
       * maintenant pour ne pas reorganiser la page ensuite.
       *
       * EPUISE, LE BOUTON RESTE PRESENT ET PORTE `disabled`. La fiche demeure
       * consultable avec ses photographies, `PROTOTYPE.md` : le produit n'est
       * jamais masque, seulement rendu non achetable. Retirer le bouton
       * laisserait un trou sans expliquer pourquoi.
       */}
      {/*
       * LE BOUTON EST ACTIF DEPUIS LS-114. Il portait « Vente en ligne bientot
       * disponible » et `disabled` depuis LS-105, en attendant que le panier
       * existe : un bouton actif sans effet est un faux succes, interdit par
       * `frontend-design.md`. Le commentaire d'alors annoncait ce retrait.
       *
       * `epuisee` REDEVIENT SA SEULE CONDITION DE DESACTIVATION.
       *
       * AJOUTER AU PANIER N'IMMOBILISE AUCUN STOCK. La disponibilite affichee
       * ici peut donc etre dementie plus tard : la reservation a lieu a l'etape
       * 4 du parcours 1, et c'est elle qui tranche. Le panier revalide a chaque
       * affichage, et signale la ligne devenue incommandable.
       */}
      <button
        type="button"
        className={styles.ajouter}
        disabled={epuisee || enCours}
        aria-disabled={epuisee || enCours}
        onClick={() => {
          demarrer(async () => {
            const issue = await ajouterAuPanier(choisie.id, 1);

            /*
             * L'ANNONCE EST LA MEME POUR L'OEIL ET POUR L'OREILLE, region live
             * de LS-85 : sans elle, l'ajout ne produit aucun retour audible et
             * le visiteur ne sait pas si son clic a porte.
             */
            setMessage(
              issue.statut === "OK" ? "Ajouté au panier." : issue.message,
            );
          });
        }}
      >
        {epuisee ? "Épuisé" : "Ajouter au panier"}
      </button>

      <p
        role="status"
        aria-live="polite"
        aria-label="Ajout au panier"
        className={styles.annonceAjout}
      >
        {message}
      </p>

      {/*
       * Bloc 7, informations de livraison.
       *
       * AUCUN TARIF NI SEUIL N'EST ECRIT ICI. `frontend-design.md` l'interdit
       * nommement : ils viennent de la configuration centralisee, la meme qui
       * sert au calcul serveur des frais de port. Un seuil recopie ici
       * afficherait « offerte des 39 € » quand le panier en facturerait 45, ce
       * qui constitue une information precontractuelle fausse.
       *
       * LE COMPOSANT DE REASSURANCE EST `Should`, jalon Go-Live, et n'existe pas
       * encore. En attendant, la seule mention des MODES de livraison, qui sont
       * fixes par ADR-025 et ne dependent d'aucun tarif.
       *
       * AUCUN RENVOI VERS UNE PAGE LIVRAISON : elle n'existe pas plus que la
       * page de retractation, et un lien vers une route absente rendrait 404 sur
       * la page ou le client decide d'acheter. Le composant de reassurance
       * portera les deux le moment venu.
       */}
      <p className={styles.livraison}>
        Livraison par Mondial Relay, en Point Relais, Locker ou à domicile.
      </p>

      {/*
       * Bloc 8, dimensions. ELLES APPARTIENNENT A LA VARIANTE et non au
       * produit : un collier existe en 40 et 45 cm, et c'est precisement ce qui
       * distingue les deux declinaisons. Elles changent donc avec le choix.
       *
       * ABSENTES, LE BLOC DISPARAIT. Le champ est optionnel dans le schema, et
       * afficher « Dimensions » suivi d'un blanc n'apprend rien.
       */}
      {choisie.dimensions !== null && choisie.dimensions.trim() !== "" && (
        <section className={styles.blocDimensions}>
          <h2 className={styles.titreSection}>Dimensions</h2>
          <p className={styles.texteSection}>{choisie.dimensions}</p>
        </section>
      )}
    </>
  );
}
