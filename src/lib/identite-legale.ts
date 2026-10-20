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
 * la politique de confidentialite. Il est ecrit dans ce module, `HEBERGEUR`, et
 * non lu dans l'environnement : voir la constante.
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
});

/**
 * L'hébergeur du site, mention de l'article 6 III de la LCEN.
 *
 * ÉCRIT ICI ET NON LU DANS L'ENVIRONNEMENT, arbitrage de Christophe du
 * 19 octobre 2026, LS-28. Les trois variables `LEGAL_HEBERGEUR_*` ont publié en
 * production « A renseigner avant ouverture » et « 00 00 00 00 00 », que le
 * schéma acceptait comme des valeurs valides. L'hébergeur n'est ni un secret ni
 * une donnée de l'exploitante : c'est un fait de l'architecture, le VPS
 * OVHcloud, et en changer passe de toute façon par un déploiement. Écrit dans le
 * code, il se teste ; `tests/e2e/informations-legales.spec.ts` le vérifie.
 *
 * L'IDENTITÉ DE L'ÉDITEUR RESTE DANS L'ENVIRONNEMENT, et ce n'est pas une
 * incohérence : elle partage sa source avec les factures, `lireEmetteur`.
 *
 * SOURCES, relevées le 19 octobre 2026. Dénomination et adresse : mentions
 * légales d'OVHcloud, https://www.ovhcloud.com/fr/terms-and-conditions/, « OVH
 * SAS 2 rue Kellermann - 59100 Roubaix - France ». Téléphone : aucune page
 * publique ne l'écrit ; numéro confirmé par Christophe depuis l'espace client,
 * forme internationale du 1007, composable depuis l'étranger. Le 1007 seul ne
 * se compose pas hors de France.
 */
export const HEBERGEUR = {
  nom: "OVH SAS",
  adresse: "2 rue Kellermann, 59100 Roubaix, France",
  telephone: "+33 9 72 10 10 07",
} as const;

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
 * Le médiateur de la consommation, article L612-1 du Code de la consommation.
 *
 * ÉCRIT ICI ET NON LU DANS L'ENVIRONNEMENT, arbitrage de Christophe du
 * 20 octobre 2026, LS-19 : même motif que `HEBERGEUR`. Les trois variables
 * `LEGAL_MEDIATEUR_*` sont restées vides sept semaines, et la page annonçait
 * une désignation en cours sans qu'aucun test ne voie le bloc renseigné. Le
 * médiateur n'est ni un secret ni une donnée personnelle, il ne figure sur
 * aucune facture, et en changer suppose une nouvelle convention, donc un
 * déploiement. Écrit dans le code, il se teste ;
 * `tests/e2e/informations-legales.spec.ts` le vérifie.
 *
 * LE TÉLÉPHONE ET L'EMAIL S'AJOUTENT AU NOM, À L'ADRESSE ET AU SITE : la
 * convention, article 3-2, engage l'adhérent à informer le consommateur des
 * modalités de saisine « (téléphone, site, adresse courriel) », en citant les
 * articles L616-1 et R616-1.
 *
 * SOURCES, relevées le 20 octobre 2026. Convention d'adhésion signée ce jour,
 * valable jusqu'au 20 octobre 2029 et reconduite tacitement, et mention à
 * reproduire donnée par l'espace professionnel du CM2C. Le nom suit la
 * convention, « de Conciliateurs » ; la liste de la CECMC du 5 octobre 2026
 * écrit « des Conciliateurs », et y range le CM2C sous A04, A08 et B01.
 * Comparatif et motif du choix : `docs/COMPARATIF-MEDIATION.md`.
 */
export const MEDIATEUR = {
  nom: "Centre de la Médiation de la Consommation de Conciliateurs de Justice (CM2C)",
  adresse: "49 rue de Ponthieu, 75008 Paris",
  telephone: "01 89 47 00 14",
  email: "litiges@cm2c.net",
  siteSaisine: "https://www.cm2c.net/declarer-un-litige.php",
} as const;
