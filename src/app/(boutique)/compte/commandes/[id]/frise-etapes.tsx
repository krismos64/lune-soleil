/**
 * Frise d'etapes du detail de commande client, LS-190, critere 4 de LS-180.
 *
 * COMPOSANT SERVEUR : il derive des etapes de faits deja lus et rend. Aucune
 * interaction, donc aucune marque client, et la frise reste dans le HTML servi.
 *
 * ELLE N'AFFICHE QUE DES ETAPES QUE LE CODE SAIT RENSEIGNER, critere 3 de la
 * story, et c'est la raison pour laquelle elle a attendu LS-58 et LS-131.
 * Construire la frise avant que le suivi n'existe aurait affiche des etapes que
 * rien ne remplit : le client aurait lu un suivi FIGE et cru son colis bloque,
 * ce qui est pire qu'une absence.
 *
 * UNE ETAPE INCONNUE EST DONC ABSENTE, jamais rendue « en attente ». La nuance
 * porte : « en attente » affirme que l'etape VIENDRA, ce que le site ne sait pas
 * pour une commande annulee ni pour un colis dont le transporteur se tait.
 *
 * LES QUATRE FAITS QUE LE CODE SAIT RENSEIGNER, et rien d'autre :
 *
 *   commande confirmee      `Commande.statut` sorti d'EN_ATTENTE_PAIEMENT
 *   colis remis au transport `Expedition.expedieA`
 *   dernier statut connu     `Expedition.statutTransporteur`, texte libre
 *   remise constatee         `Expedition.livreA`, ADR-042
 *
 * LE PROTOTYPE EN MONTRAIT DAVANTAGE, « colis prepare » et « disponible au
 * point relais » notamment. Aucun des deux n'a de source : `EN_PREPARATION` est
 * un statut que l'exploitante pose a la main et qui ne survit pas a
 * l'expedition, et la disponibilite au relais vit dans le TEXTE du statut
 * transporteur, que le site n'interprete pas, ADR-042 refusant de deduire une
 * remise d'un libelle.
 */
import type { StatutCommande } from "@/generated/prisma/enums";

import { formaterDate } from "@/lib/affichage-commande";

import styles from "../../compte.module.css";

/** Ce qu'une etape rendue porte, une fois derivee. */
type Etape = {
  /** Cle de rendu, stable et technique. */
  cle: string;
  libelle: string;
  /**
   * Date de l'etape, `null` quand elle est atteinte sans date connue.
   *
   * LE CAS EXISTE REELLEMENT : une commande `EXPEDIEE` dont `expedieA` est nul,
   * l'exploitante ayant saisi l'expedition sans date. L'etape est vraie, sa date
   * ne l'est pas : afficher « le null » serait faux, la taire ne l'est pas.
   */
  date: Date | null;
  /**
   * `true` quand l'etape est FAITE, `false` quand elle est en cours.
   *
   * AUCUNE TROISIEME VALEUR, ET C'EST LE CRITERE 3. Une etape « a venir »
   * n'existe pas dans cette frise : ce qui n'est pas atteint n'est pas rendu.
   */
  faite: boolean;
};

/**
 * Ce que la frise recoit, sous-ensemble de ce que la page a deja lu.
 *
 * `StatutCommande` ET NON `string`, correction de la revue frontend du
 * 11 septembre 2026. Ma premiere version elargissait le type, ce qui desarmait
 * `tsc` : la revue a mesure qu'un `"ANULEE"` mal orthographie compilait
 * SILENCIEUSEMENT, et qu'une commande annulee aurait alors rendu la frise
 * complete, exactement ce que le commentaire ci-dessous declare interdit.
 *
 * `affichage-commande.ts`, voisin de ce fichier, documente ce piege en tete et
 * s'en protege par un `Record` type sur l'enum : la parade etait a portee de
 * main, et l'elargissement l'annulait.
 */
export type EtatCommandePourFrise = {
  statut: StatutCommande;
  creeA: Date;
  expedition: {
    expedieA: Date | null;
    statutTransporteur: string | null;
    livreA: Date | null;
  } | null;
};

/**
 * Derive les etapes affichables de l'etat reel de la commande.
 *
 * EXPORTEE POUR ETRE TESTEE SANS RENDU. La regle qui compte est ici, dans le
 * choix des etapes, pas dans le balisage : un test de composant prouverait le
 * balisage et laisserait la regle sans preuve.
 */
export function derriverEtapes(commande: EtatCommandePourFrise): Etape[] {
  /*
   * UNE COMMANDE ANNULEE N'A PAS DE FRISE, ET C'EST UN ETAT NON NOMINAL DU
   * CRITERE 4. Afficher « confirmee » puis s'arreter laisserait croire a une
   * livraison en attente, alors que rien ne viendra. Le statut, affiche juste
   * au-dessus par le recapitulatif, dit deja ce qui s'est passe.
   */
  if (commande.statut === "ANNULEE") {
    return [];
  }

  /*
   * UNE COMMANDE NON PAYEE N'A PAS DE FRISE NON PLUS, ET LA RAISON EST QU'ELLE
   * N'A FRANCHI AUCUNE ETAPE, jamais leur nombre.
   *
   * MA PREMIERE VERSION ECRIVAIT « une frise a une seule pastille n'apprend
   * rien », releve par la revue frontend du 11 septembre 2026 : c'etait faux,
   * une commande `CONFIRMEE` sans expedition rend legitimement UNE etape, et
   * elle apprend quelque chose, le paiement est passe. Un commentaire qui donne
   * une raison inexacte est ce qui produit les franchissements de bonne foi
   * repertories dans ce depot.
   */
  if (commande.statut === "EN_ATTENTE_PAIEMENT") {
    return [];
  }

  const etapes: Etape[] = [
    {
      cle: "confirmee",
      libelle: "Commande confirmée",
      /*
       * `creeA` ET NON UNE DATE DE PAIEMENT. La commande est creee dans la
       * transaction du tunnel, et le paiement la confirme quelques secondes
       * plus tard : l'ecart n'est pas lisible a l'echelle du jour affiche, et
       * `Paiement.confirmeA` n'est pas lu par cet ecran.
       */
      date: commande.creeA,
      faite: true,
    },
  ];

  const expedition = commande.expedition;

  /*
   * SANS EXPEDITION, LA FRISE S'ARRETE A LA CONFIRMATION. C'est l'etat non
   * nominal « expedition sans suivi » du critere 4 : la commande est payee, le
   * colis n'est pas parti, et aucune etape suivante n'est affirmable.
   */
  if (expedition === null) {
    return etapes;
  }

  etapes.push({
    cle: "expediee",
    libelle: "Colis remis au transporteur",
    date: expedition.expedieA,
    faite: true,
  });

  /*
   * LE DERNIER STATUT DU TRANSPORTEUR EST UNE ETAPE A PART ENTIERE, et son
   * libelle vient du transporteur, jamais d'une table du site. ADR-042 refuse
   * de deduire une remise d'un libelle : le texte s'affiche tel quel, et c'est
   * l'etape SUIVANTE qui constate la remise.
   *
   * ELLE EST EN COURS TANT QUE LA REMISE N'EST PAS CONSTATEE, ce qui est le
   * seul emploi de `faite: false` dans cette frise.
   */
  if (expedition.statutTransporteur !== null) {
    etapes.push({
      cle: "transport",
      libelle: expedition.statutTransporteur,
      date: null,
      faite: expedition.livreA !== null,
    });
  }

  /*
   * LA REMISE NE S'AFFICHE QUE CONSTATEE, ADR-042. Une etape « remise au
   * destinataire » affichee en attente sur un colis dont le transporteur se
   * tait serait exactement le suivi FIGE que cette story existe pour eviter.
   */
  if (expedition.livreA !== null) {
    etapes.push({
      cle: "livree",
      libelle: "Remise au destinataire",
      date: expedition.livreA,
      faite: true,
    });
  }

  return etapes;
}

export function FriseEtapes({ commande }: { commande: EtatCommandePourFrise }) {
  const etapes = derriverEtapes(commande);

  if (etapes.length === 0) {
    return null;
  }

  return (
    <section className={styles.section} aria-labelledby="titre-frise">
      <h2 id="titre-frise">Étapes</h2>

      {/*
       * UNE LISTE ORDONNEE, ET NON UNE SUITE DE `div`. L'ordre EST
       * l'information : un lecteur d'ecran annonce « 2 sur 4 », ce qu'aucune
       * pastille coloree ne dit. Le balisage porte le sens, le CSS ne fait que
       * le montrer.
       */}
      <ol className={styles.frise}>
        {etapes.map((etape) => (
          <li
            key={etape.cle}
            className={`${styles.etape} ${
              etape.faite ? styles.etapeFaite : styles.etapeEnCours
            }`}
          >
            {/*
             * L'ETAT EST DIT PAR DU TEXTE, jamais par la seule couleur. La
             * pastille est decorative, `aria-hidden`, et le mot qui la double
             * est visuellement masque : la couleur informe l'oeil, le texte
             * informe le lecteur d'ecran, et aucun des deux ne porte seul le
             * sens. Regle WCAG 1.4.1, « pas d'information par la couleur
             * seule ».
             */}
            <span className={styles.pastille} aria-hidden="true" />
            <span className={styles.annonceEtape}>
              {etape.faite ? "Étape franchie : " : "Étape en cours : "}
            </span>

            <span className={styles.libelleEtape}>{etape.libelle}</span>

            {etape.date !== null && (
              <span className={styles.dateEtape}>
                {formaterDate(etape.date)}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
