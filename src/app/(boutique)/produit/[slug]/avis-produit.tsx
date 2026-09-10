/**
 * Bloc 11 de la fiche produit, les avis verifies. LS-61.
 *
 * COMPOSANT SERVEUR : il lit les avis publies et rend. Aucune interaction, donc
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
  DELAI_PUBLICATION_JOURS,
  lireAvisPublies,
  resumerAvis,
} from "@/services/avis";
import { formaterDate } from "@/lib/affichage-commande";

import styles from "./fiche.module.css";

export async function AvisProduit({ varianteIds }: { varianteIds: string[] }) {
  const avis = await lireAvisPublies(varianteIds);

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
       * critere de classement applique.
       */}
      <p className={styles.mentionAvis}>
        Ces avis sont vérifiés : ils ne sont déposables qu&apos;après une
        commande réellement livrée, et chacun est relu avant publication, sous{" "}
        {DELAI_PUBLICATION_JOURS} jours au plus. Aucune contrepartie n&apos;est
        accordée en échange d&apos;un avis. Ils sont classés du plus récent au
        plus ancien.
      </p>

      <ul className={styles.listeAvis}>
        {avis.map((ligne) => (
          <li key={ligne.id} className={styles.avis}>
            <p className={styles.noteAvis}>{ligne.note} sur 5</p>

            {/*
             * LES DEUX DATES SONT AFFICHEES ET DISTINGUEES, article D111-10 1°.
             * La date de l'EXPERIENCE est celle de la remise du colis, celle de
             * PUBLICATION celle de la mise en ligne : les confondre, ou n'en
             * afficher qu'une, est le manquement le plus facile a commettre ici.
             */}
            <p className={styles.datesAvis}>
              Expérience du {formaterDate(ligne.experienceA)}, publié le{" "}
              {formaterDate(ligne.publieA)}.
            </p>

            {ligne.commentaire !== null && (
              <p className={styles.commentaireAvis}>{ligne.commentaire}</p>
            )}

            {/*
             * LA REPONSE DE L'EXPLOITANTE S'AFFICHE SI ELLE EXISTE, regle R14.
             * Aucun ecran n'en cree aujourd'hui, l'usage n'etant pas decide :
             * ce rendu existe pour que la donnee ne reste pas invisible le jour
             * ou la decision sera prise, et il ne coute rien tant qu'aucune
             * reponse n'est ecrite.
             */}
            {ligne.reponse !== null && (
              <div className={styles.reponseAvis}>
                <p className={styles.auteurReponse}>Réponse de la boutique</p>
                <p className={styles.texteReponse}>{ligne.reponse.contenu}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
