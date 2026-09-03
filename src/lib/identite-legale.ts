/**
 * Identite legale publiee dans les mentions legales, LS-28.
 *
 * ELLE EST DISTINCTE DE `schemaEmetteurFacture`, ET CE N'EST PAS UNE
 * DUPLICATION. Les deux decrivent la meme entreprise et servent deux obligations
 * differentes :
 *
 *   - l'emetteur de facture est FIGE dans l'instantane legal au moment de
 *     l'emission, invariant 3, et ne doit jamais changer retroactivement
 *   - les mentions legales affichent l'etat COURANT, et un demenagement doit s'y
 *     voir immediatement
 *
 * LES QUATRE CHAMPS COMMUNS SONT LUS A LA MEME SOURCE, `lireEmetteur`, pour que
 * le site et les factures ne puissent pas annoncer deux identites differentes.
 * Ce module n'ajoute que ce que la facture n'a pas besoin de porter.
 *
 * LE TELEPHONE EST OBLIGATOIRE, ARTICLE L221-5 DU CODE DE LA CONSOMMATION,
 * verifie sur Legifrance le 3 septembre 2026 : le 4° du I enumere « les
 * informations relatives a son identite, a ses coordonnees postales,
 * TELEPHONIQUES et electroniques », sans les presenter comme alternatives.
 * L'exploitante demandait a ne pas le publier « sauf si c'est obligatoire » : il
 * l'est, et le retirer exposerait a l'article L221-20.
 *
 * L'HEBERGEUR EST UNE MENTION DISTINCTE, article 6 III de la loi du 21 juin 2004
 * pour la confiance dans l'economie numerique : nom, denomination sociale,
 * adresse et telephone. Il ne suffit pas de le citer parmi les sous-traitants de
 * la politique de confidentialite.
 *
 * AUCUNE VALEUR PAR DEFAUT ICI. Une identite legale fausse est une infraction,
 * et un repli silencieux publierait « Non renseigne » sur une page qui engage
 * l'entreprise : l'absence doit se voir au deploiement, jamais a l'ecran.
 */
import { z } from "zod";

import { lireEmetteur } from "@/services/facture";

/**
 * Ce que les mentions legales ajoutent a l'identite de facturation.
 *
 * `strictObject` COMME LE RESTE DU SOCLE : une cle inconnue est refusee plutot
 * qu'ignoree, ce qui evite qu'une variable mal nommee passe pour renseignee.
 */
const schemaComplementLegal = z.strictObject({
  /** « Entreprise individuelle, sous le regime de la micro-entreprise ». */
  formeJuridique: z.string().min(1).max(160),
  /**
   * Registre d'immatriculation, en toutes lettres.
   *
   * NE PAS ECRIRE « repertoire des metiers », formule PERIMEE depuis la reforme
   * du guichet unique : c'est le Registre national des entreprises, RNE.
   */
  registre: z.string().min(1).max(160),
  /** Code APRM de l'activite artisanale. */
  codeActivite: z.string().min(1).max(20),
  /**
   * Telephone publie, obligatoire, article L221-5.
   *
   * FORMAT LIBRE ET NON UN MOTIF STRICT : la valeur est affichee telle quelle,
   * jamais composee par le code, et imposer une forme ferait echouer le
   * deploiement sur un espacement.
   */
  telephone: z.string().min(6).max(32),
  /** Nom ou denomination sociale de l'hebergeur. */
  hebergeurNom: z.string().min(1).max(160),
  /** Adresse postale complete de l'hebergeur. */
  hebergeurAdresse: z.string().min(1).max(200),
  /** Telephone de l'hebergeur, mention imposee par la LCEN. */
  hebergeurTelephone: z.string().min(6).max(32),
});

/** L'identite complete telle que la page des mentions legales l'affiche. */
export type IdentiteLegale = z.infer<typeof schemaComplementLegal> & {
  raisonSociale: string;
  siret: string;
  adresse: string;
  emailContact: string;
};

/**
 * Identite legale absente ou mal formee.
 *
 * UNE CLASSE DEDIEE, comme `EmetteurNonConfigureError` : l'appelant distingue
 * une configuration manquante d'une panne, la premiere se corrigeant par un
 * deploiement.
 */
export class IdentiteLegaleNonConfigureeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentiteLegaleNonConfigureeError";
  }
}

/**
 * Lit l'identite legale complete, ou leve.
 *
 * LA LECTURE EST FAITE A CHAQUE APPEL et non au chargement du module, meme motif
 * que `lireEmetteur` : une constante de module figerait la valeur au demarrage
 * du processus et masquerait une correction faite sans redemarrage.
 *
 * LE MESSAGE NE PORTE AUCUNE VALEUR LUE, invariant 9. Il nomme les champs
 * fautifs, ce qui suffit a corriger.
 */
export function lireIdentiteLegale(): IdentiteLegale {
  const emetteur = lireEmetteur();

  const resultat = schemaComplementLegal.safeParse({
    formeJuridique: process.env.LEGAL_FORME_JURIDIQUE,
    registre: process.env.LEGAL_REGISTRE,
    codeActivite: process.env.LEGAL_CODE_ACTIVITE,
    telephone: process.env.LEGAL_TELEPHONE,
    hebergeurNom: process.env.LEGAL_HEBERGEUR_NOM,
    hebergeurAdresse: process.env.LEGAL_HEBERGEUR_ADRESSE,
    hebergeurTelephone: process.env.LEGAL_HEBERGEUR_TELEPHONE,
  });

  if (!resultat.success) {
    const champs = resultat.error.issues
      .map((probleme) => probleme.path.join("."))
      .join(", ");

    throw new IdentiteLegaleNonConfigureeError(
      `Identite legale absente ou invalide : ${champs}. ` +
        "Renseigner les variables LEGAL_* avant de publier les mentions legales.",
    );
  }

  return { ...resultat.data, ...emetteur };
}

/**
 * Coordonnees du mediateur de la consommation, obligatoires en CGV.
 *
 * ARTICLE L612-1 : tout professionnel vendant a des consommateurs garantit un
 * recours effectif a un dispositif de mediation, et publie ses coordonnees.
 * L'obligation existe meme si aucun litige ne survient jamais.
 *
 * ELLE EST FACULTATIVE DANS LA CONFIGURATION, ET C'EST DELIBERE. L'exploitante
 * n'a choisi aucun mediateur au 3 septembre 2026, LS-19 lui proposant un
 * comparatif : la page doit donc pouvoir se publier en DISANT que la designation
 * est en cours, plutot que de refuser de se rendre ou d'inventer un nom.
 *
 * CE N'EST PAS UNE CONFORMITE PARTIELLE ACCEPTABLE A L'OUVERTURE. Les CGV ne
 * peuvent pas etre publiees sans mediateur, et LS-28 reste ouverte tant que ces
 * valeurs manquent.
 */
export type Mediateur = {
  nom: string;
  adresse: string;
  siteSaisine: string;
};

export function lireMediateur(): Mediateur | null {
  const nom = process.env.LEGAL_MEDIATEUR_NOM;
  const adresse = process.env.LEGAL_MEDIATEUR_ADRESSE;
  const siteSaisine = process.env.LEGAL_MEDIATEUR_SITE;

  /*
   * LES TROIS ENSEMBLE OU AUCUN. Une designation partielle, un nom sans adresse
   * de saisine, laisserait le client sans moyen d'exercer son recours tout en
   * donnant l'apparence de la conformite.
   */
  if (!nom || !adresse || !siteSaisine) {
    return null;
  }

  return { nom, adresse, siteSaisine };
}
