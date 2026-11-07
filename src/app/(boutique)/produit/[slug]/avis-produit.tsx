/**
 * Bloc 11 de la fiche produit, les avis verifies. LS-61.
 *
 * COMPOSANT SERVEUR : il rend les avis publies que la page lui passe, LS-310. Aucune interaction, donc
 * aucune marque client, et la liste reste dans le HTML servi, ce qui la rend
 * indexable et lisible sans JavaScript.
 *
 * SEULS LES AVIS PUBLIES ARRIVENT ICI, regle R4, et le filtre vit dans le
 * repository plutot que dans ce composant : une garde d'affichage se contourne
 * en ajoutant un second appelant, une garde de requete non.
 *
 * LES QUATRE MENTIONS DE L'ARTICLE D111-10 1° SONT PRESENTES, et c'est la
 * raison d'etre de la moitie de ce fichier. Pres de chaque avis doivent figurer
 * l'existence d'une procedure de controle, la date de publication, celle de
 * l'experience de consommation, et le critere de classement. En omettre une
 * expose au manquement que l'article sanctionne.
 *
 * LE CLASSEMENT ANNONCE EST CELUI QUI EST APPLIQUE, chronologique du plus
 * recent au plus ancien, et il vient du `orderBy` du repository. Changer l'un
 * sans l'autre produirait une information fausse : c'est le piege « commentaire
 * qui enumere les valeurs », transpose a une mention legale.
 *
 * AUCUN FAUX AVIS, JAMAIS, y compris en preproduction : rien dans ce fichier ne
 * fabrique de donnee d'exemple, et la section entiere disparait quand aucun avis
 * publie n'existe.
 */

import {
  ListeAvisBoutique,
  MentionAvisVerifies,
} from "@/components/avis-boutique";
import { resumerAvis, type AvisPublie } from "@/services/avis";

import styles from "./fiche.module.css";

/**
 * LA LISTE ARRIVE DEJA LUE, depuis LS-310 : la page la lit une fois pour cette
 * section et pour la note du JSON-LD `Product`, qui ne peuvent donc pas
 * diverger.
 */
export function AvisProduit({ avis }: { avis: AvisPublie[] }) {
  /*
   * AUCUN AVIS PUBLIE, AUCUNE SECTION. Afficher « aucun avis pour le moment »
   * sur une boutique qui ouvre attirerait l'oeil sur un vide, et l'article
   * D111-10 n'impose aucune mention en l'absence d'avis : ses obligations
   * portent sur l'affichage d'avis, pas sur leur absence.
   */
  if (avis.length === 0) {
    return null;
  }

  const synthese = resumerAvis(avis);

  return (
    <section className={styles.section} aria-labelledby="titre-avis">
      <h2 id="titre-avis" className={styles.titreSection}>
        Avis vérifiés
      </h2>

      {synthese.moyenne !== null && (
        <p className={styles.syntheseAvis}>
          {/*
           * LA MOYENNE EST FORMATEE EN FRANCAIS, virgule decimale : un « 4.5 »
           * a l'anglaise sur une boutique francaise se lit comme une erreur de
           * saisie, et le lecteur d'ecran l'annonce mal.
           */}
          <strong>
            {synthese.moyenne.toLocaleString("fr-FR", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}{" "}
            sur 5
          </strong>{" "}
          pour {synthese.nombre} avis
          {synthese.nombre > 1 ? " publiés" : " publié"}.
        </p>
      )}

      {/*
       * MENTION OBLIGATOIRE, article D111-10 1°, PRES DES AVIS et non dans une
       * rubrique lointaine. Elle dit les trois choses que le texte exige a cet
       * endroit : l'existence de la procedure de controle, sa nature, et le
       * critere de classement applique. Le texte vit dans
       * `MentionAvisVerifies`, partage avec la page des avis et l'accueil,
       * LS-313 : une seule source pour une mention legale.
       */}
      <MentionAvisVerifies className={styles.mentionAvis} />

      {/*
       * LES MÊMES CARTES QUE LA PAGE DES AVIS, LS-314, sans la pièce, que la
       * fiche porte déjà, et SANS ANIMATION : ADR-045 n'admet aucun décor
       * animé sur la fiche produit. Dates, réponse et lien de signalement
       * (L111-7-2) sont rendus par `ListeAvisBoutique`.
       */}
      <ListeAvisBoutique avis={avis} />
    </section>
  );
}
