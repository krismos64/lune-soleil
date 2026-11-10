/**
 * Bandeau « Une commande vous attend », LS-315, volet 1.
 *
 * LE DEFAUT QU'IL FERME, mesure en production le 10 novembre 2026 : un client
 * sorti du paiement sans passer par le bouton de retour trouvait un panier vide
 * et sa piece affichee epuisee, sans aucun lien vers sa commande. Le bandeau
 * lui rend les deux chemins, reprendre le paiement ou annuler.
 *
 * COMPOSANT SERVEUR, IL NE LIT RIEN : la page appelante lit la commande par
 * le cookie signe, `lireCommandeEnAttente`, et la lui passe. Une commande qui
 * n'est plus reprenable n'arrive jamais jusqu'ici.
 */
import Link from "next/link";

import { formaterHeure } from "@/lib/affichage-commande";
import type { CommandeEnAttente } from "@/services/annulation-commande";
import { BoutonAnnulerCommande } from "./bouton-annuler-commande";
import styles from "./commande-en-attente.module.css";

export function BandeauCommandeEnAttente({
  commande,
  contexte,
}: {
  commande: CommandeEnAttente;
  /** Sur la fiche, la piece affichee est celle que la commande tient. */
  contexte: "panier" | "fiche";
}) {
  const heure = formaterHeure(commande.reserveeJusqua);

  /*
   * SUR LA FICHE, UN PARAGRAPHE ET NON UN `h2` : le bandeau y precede le `h1`
   * du bijou, et un titre de niveau 2 avant le niveau 1 inverse la navigation
   * par titres, WCAG 1.3.1. Releve par `ls-frontend-revue`. Au panier, il suit
   * le `h1` « Votre panier » et reste un vrai `h2`.
   */
  const Titre = contexte === "fiche" ? "p" : "h2";

  return (
    <section
      aria-labelledby="titre-commande-en-attente"
      className={styles.bandeau}
    >
      <Titre id="titre-commande-en-attente" className={styles.titre}>
        {contexte === "fiche"
          ? "Cette pièce est réservée pour votre commande"
          : "Une commande vous attend"}
      </Titre>

      <p className={styles.texte}>
        Commande <strong>{commande.numero}</strong> : vos pièces restent
        réservées jusqu&apos;à{" "}
        <time dateTime={commande.reserveeJusqua.toISOString()}>{heure}</time>.
        Vous pouvez payer maintenant, ou annuler pour les retrouver dans votre
        panier.
      </p>

      <div className={styles.actions}>
        <Link href="/commande/confirmation" className={styles.reprendre}>
          Reprendre le paiement
        </Link>
        <BoutonAnnulerCommande />
      </div>
    </section>
  );
}
