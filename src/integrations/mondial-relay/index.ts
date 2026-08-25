/**
 * Points de retrait Mondial Relay, LS-115. Etape 3b du parcours 1.
 *
 * POURQUOI UNE INTERFACE ET PAS UN APPEL DIRECT. Le compte Mondial Relay
 * n'existe pas : il attend l'ouverture du compte bancaire professionnel, LS-27
 * et LS-18. LS-27 interdit explicitement « aucun identifiant fictif, aucune
 * reponse d'API inventee ». Ce module livre donc le contrat, la degradation en
 * panne et son test ; l'appel HTTP reel s'ecrira quand le compte existera, et
 * rien d'autre ne bougera. Meme motif que `integrations/email` pour ADR-008.
 *
 * CE MODULE DEGRADE, IL NE BLOQUE PAS. C'est la raison d'etre des trois modes
 * d'ADR-025 dont un sans appel externe : `PARCOURS.md` pose qu'une panne du
 * transporteur « degrade le choix au lieu de bloquer la vente ». Une exception
 * qui remonterait jusqu'a la page ferait perdre le tunnel entier a un visiteur
 * qui peut encore commander a domicile.
 *
 * IL NE DECIDE PAS DE L'AFFICHAGE. Il rend un etat, l'ecran choisit les mots.
 */
import { MODES_SANS_POINT_RETRAIT, exigePointRetrait } from "@/lib/livraison";
import { journaliserErreur } from "@/lib/journal";
import type { ModeLivraison } from "@/generated/prisma/enums";

/**
 * Un point de retrait tel que le projet en a besoin.
 *
 * COPIE COMPLETE ET NON UN SEUL IDENTIFIANT. `PARCOURS.md` etape 3b : « le
 * point de retrait est copie avec son libelle et son adresse, pas seulement son
 * identifiant. Un point qui ferme rendrait autrement illisible une commande
 * passee ». LS-117 figera cet objet dans `Commande.pointRelaisAdresse`.
 */
export type PointRetrait = {
  identifiant: string;
  nom: string;
  ligne1: string;
  codePostal: string;
  ville: string;
};

/**
 * Ce que le transporteur sait faire, vu du projet.
 *
 * L'INTERFACE EST PENSEE POUR LE PROJET ET NON POUR LE FOURNISSEUR, regle du
 * README de `integrations/`. Le reste du code ne connait jamais le nom du
 * prestataire, ce qui laisse ADR-025 ouvrir un second transporteur sans
 * reecriture.
 */
export interface FournisseurPointsRetrait {
  rechercher(demande: {
    codePostal: string;
    mode: ModeLivraison;
  }): Promise<PointRetrait[]>;
}

/**
 * Le transporteur ne repond pas.
 *
 * DISTINCTE D'UNE ERREUR DE PROGRAMMATION, meme motif que
 * `FournisseurEmailIndisponibleError` : elle dit « reessayer plus tard a du
 * sens », la ou un mode invalide ne s'arrangera pas au deuxieme essai.
 */
export class TransporteurIndisponibleError extends Error {
  constructor(cause?: unknown) {
    super("Transporteur indisponible");
    this.name = "TransporteurIndisponibleError";
    this.cause = cause;
  }
}

/** Resultat d'une recherche, degradee ou non. */
export type ResultatPointsRetrait = {
  /**
   * `false` uniquement en cas de panne.
   *
   * UNE RECHERCHE SANS RESULTAT RESTE `true`. « Aucun point pres de ce code
   * postal » est une reponse exacte du transporteur, « service indisponible »
   * un incident. Les confondre ferait renoncer un visiteur a qui il suffirait
   * de reessayer.
   */
  disponible: boolean;
  points: PointRetrait[];
  /** Modes encore choisissables, jamais vide, meme transporteur eteint. */
  modesEncoreProposables: readonly ModeLivraison[];
  /** Message pret a afficher, sans jargon, ou `undefined` si tout va bien. */
  message?: string;
};

/**
 * Message affiche au visiteur quand le transporteur ne repond pas.
 *
 * SANS JARGON TECHNIQUE, exigence explicite du parcours 1. Il ne reprend jamais
 * le message de l'exception : un code d'erreur reseau n'aide pas le visiteur et
 * laisserait fuiter la trace du fournisseur dans une page publique.
 */
const MESSAGE_INDISPONIBLE =
  "Le choix d'un point de retrait est momentanément indisponible. " +
  "La livraison à domicile reste possible.";

/** Delai au-dela duquel le transporteur est tenu pour indisponible. */
const DELAI_MAXIMUM_MS = 4000;

const CODE_POSTAL_METROPOLE = /^(?!97|98)\d{5}$/;

/**
 * Cherche les points de retrait pres d'un code postal.
 *
 * NE LEVE JAMAIS SUR UNE PANNE DU TRANSPORTEUR, c'est le critere 6 de LS-115.
 * Elle leve en revanche sur une entree hors domaine, qui signale un defaut de
 * l'appelant et non un incident.
 *
 * LA BORNE DE TEMPS COMPTE AUTANT QUE LA GESTION D'ERREUR. Un fournisseur qui
 * ne repond pas, sans echouer, suspendrait le rendu serveur et donnerait au
 * visiteur un ecran vide : c'est une panne, traitee comme telle.
 */
export async function chercherPointsRetrait({
  codePostal,
  mode,
  fournisseur,
  delaiMaximumMs = DELAI_MAXIMUM_MS,
}: {
  codePostal: string;
  mode: ModeLivraison;
  fournisseur: FournisseurPointsRetrait;
  delaiMaximumMs?: number;
}): Promise<ResultatPointsRetrait> {
  /*
   * APPELER LE TRANSPORTEUR POUR UN DOMICILE EST UN DEFAUT D'APPELANT, pas un
   * incident : la contrainte `chk_commande_mode_point_relais` refuse deja un
   * DOMICILE porteur d'un point de retrait. Lever nomme le defaut tout de
   * suite plutot que de le laisser produire une liste inutilisable.
   */
  if (!exigePointRetrait(mode)) {
    throw new RangeError(
      `Le mode ${mode} n'admet pas de point de retrait, aucun appel au transporteur n'est justifie.`,
    );
  }

  /*
   * LE CODE POSTAL EST FILTRE AVANT L'APPEL, meme regle que
   * `schemaCodePostalMetropole` : promettre une livraison hors de la zone
   * desservie par ADR-025 serait une information precontractuelle fausse.
   */
  if (!CODE_POSTAL_METROPOLE.test(codePostal)) {
    throw new RangeError(
      "Un code postal de France metropolitaine est attendu.",
    );
  }

  try {
    const points = await avecDelaiMaximum(
      fournisseur.rechercher({ codePostal, mode }),
      delaiMaximumMs,
    );

    return {
      disponible: true,
      points,
      modesEncoreProposables: TOUS_LES_MODES,
    };
  } catch (cause) {
    /*
     * LA CAUSE VA AU JOURNAL TECHNIQUE, JAMAIS A L'ECRAN. Le diagnostic reste
     * possible cote serveur pendant que le visiteur lit une phrase utile.
     */
    journaliserErreur("points de retrait indisponibles", cause, {
      mode,
    });

    return {
      disponible: false,
      points: [],
      modesEncoreProposables: MODES_SANS_POINT_RETRAIT,
      message: MESSAGE_INDISPONIBLE,
    };
  }
}

/** Les trois modes d'ADR-025, quand le transporteur repond. */
const TOUS_LES_MODES = [
  "POINT_RELAIS",
  "LOCKER",
  "DOMICILE",
] as const satisfies readonly ModeLivraison[];

/**
 * Borne une promesse dans le temps.
 *
 * ELLE NE PEUT PAS ANNULER L'APPEL SOUS-JACENT, une promesse ne s'interrompt
 * pas. Elle borne l'attente de l'appelant, ce qui suffit ici : le rendu
 * continue, et la reponse tardive du transporteur est ignoree.
 */
function avecDelaiMaximum<T>(
  promesse: Promise<T>,
  delaiMs: number,
): Promise<T> {
  return new Promise<T>((resoudre, rejeter) => {
    const minuterie = setTimeout(() => {
      rejeter(new TransporteurIndisponibleError("délai dépassé"));
    }, delaiMs);

    promesse.then(
      (valeur) => {
        clearTimeout(minuterie);
        resoudre(valeur);
      },
      (cause: unknown) => {
        clearTimeout(minuterie);
        rejeter(new TransporteurIndisponibleError(cause));
      },
    );
  });
}
