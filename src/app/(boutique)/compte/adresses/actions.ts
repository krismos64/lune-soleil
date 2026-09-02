"use server";

/**
 * Adaptateur d'entree du carnet d'adresses. LS-59, parcours 8.
 *
 * CE FICHIER NE DECIDE RIEN. Il lit les en-tetes, delegue au service et traduit
 * le resultat en valeurs que l'interface sait afficher. Les gardes vivent dans
 * `services/carnet-adresses.ts` et dans le `where` du repository, ou elles sont
 * exerçables par un test : une garde posee ici dependrait de `next/headers`,
 * indisponible hors requete, donc ne serait jamais mesuree.
 *
 * AUCUNE ACTION NE PREND `utilisateurId` EN PARAMETRE, invariant 2 : il vient
 * de la session, et la signature elle-meme ferme le chemin qu'un identifiant
 * poste ouvrirait.
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { journaliser } from "@/lib/journal";
import { EntreeInvalideError } from "@/lib/validation";
import { exigerSession } from "@/services/autorisation";
import {
  ajouterAdresse,
  choisirAdresseParDefaut,
  modifierAdresse,
  retirerAdresse,
} from "@/services/carnet-adresses";

/**
 * Ce que l'interface recoit, jamais une exception.
 *
 * `INTROUVABLE` NE DISTINGUE PAS « n'existe pas » DE « pas la votre », meme
 * motif que l'acces aux documents : les separer dirait a qui essaie un
 * identifiant au hasard qu'il a trouve une adresse existante.
 */
export type ResultatAdresse =
  | { statut: "FAIT" }
  | { statut: "SAISIE_INVALIDE"; message: string }
  | { statut: "INTROUVABLE" }
  | { statut: "SESSION_ABSENTE" }
  | { statut: "INDISPONIBLE" };

/**
 * Extrait les champs du formulaire.
 *
 * LES CHAINES VIDES DEVIENNENT `undefined` POUR LES CHAMPS FACULTATIFS. Un
 * navigateur envoie toujours la cle, vide quand le champ n'est pas rempli :
 * sans cette traduction, `libelle: ""` passerait le schema et s'ecrirait comme
 * un libelle vide plutot que comme une absence.
 */
function extraire(donnees: FormData): Record<string, unknown> {
  const texte = (cle: string): string =>
    typeof donnees.get(cle) === "string" ? String(donnees.get(cle)).trim() : "";

  const facultatif = (cle: string): string | undefined => {
    const valeur = texte(cle);
    return valeur === "" ? undefined : valeur;
  };

  return {
    nomComplet: texte("nomComplet"),
    ligne1: texte("ligne1"),
    codePostal: texte("codePostal"),
    ville: texte("ville"),
    pays: texte("pays") === "" ? "FR" : texte("pays"),
    ...(facultatif("libelle") === undefined
      ? {}
      : { libelle: facultatif("libelle") }),
    ...(facultatif("ligne2") === undefined
      ? {}
      : { ligne2: facultatif("ligne2") }),
    ...(facultatif("telephone") === undefined
      ? {}
      : { telephone: facultatif("telephone") }),
  };
}

/**
 * Les noms de champs tels que le client les lit a l'ecran.
 *
 * LE SOCLE COMPOSE SES MESSAGES POUR LE DIAGNOSTIC, pas pour l'interface :
 * `formaterProblemes` prefixe le CHEMIN Zod, donc `codePostal` et `nomComplet`
 * en camelCase, et `EntreeInvalideError` y ajoute « Entree invalide » sans
 * accent. Le tout atterrissait tel quel sous les yeux du client, releve par la
 * revue frontend.
 *
 * LA TRADUCTION VIT ICI ET NON DANS LE SOCLE, qui sert aussi des chemins sans
 * interface, webhook et taches planifiees, ou le nom technique est precisement
 * ce qu'on veut lire dans un journal.
 */
const NOMS_VISIBLES: Record<string, string> = {
  libelle: "Le libellé",
  nomComplet: "Le nom du destinataire",
  ligne1: "L'adresse",
  ligne2: "Le complément d'adresse",
  codePostal: "Le code postal",
  ville: "La ville",
  pays: "Le pays",
  telephone: "Le téléphone",
};

/**
 * Traduit `codePostal : Un code postal ... est attendu.` en une phrase lisible.
 *
 * LE REPLI GARDE LE MESSAGE plutot que de le remplacer par un texte generique :
 * un champ ajoute au schema sans entree ici afficherait son nom technique, ce
 * qui est laid mais reste informatif. Le faire disparaitre au profit de
 * « saisie invalide » priverait le client de toute indication.
 */
function messageLisible(details: string): string {
  const separateur = details.indexOf(" : ");

  if (separateur === -1) {
    return details;
  }

  const champ = details.slice(0, separateur);
  const raison = details.slice(separateur + 3);
  const nom = NOMS_VISIBLES[champ];

  return nom === undefined ? details : `${nom} : ${raison}`;
}

/** Traduit les issues communes du service, sans dupliquer la logique. */
function traduire(etat: "FAIT" | "INTROUVABLE"): ResultatAdresse {
  return etat === "FAIT" ? { statut: "FAIT" } : { statut: "INTROUVABLE" };
}

/**
 * Enveloppe commune : session, appel, revalidation, traduction des erreurs.
 *
 * ELLE EXISTE POUR QUE LES QUATRE ACTIONS NE RECOPIENT PAS LEUR GARDE. Quatre
 * copies de la meme traduction, c'est le motif que LS-158 a corrige sur sept
 * fichiers d'administration, avec trois contrats de retour differents pour le
 * meme controle.
 */
async function agir(
  travail: (utilisateurId: string) => Promise<ResultatAdresse>,
): Promise<ResultatAdresse> {
  try {
    const identite = await exigerSession(await headers());

    if (!identite) {
      return { statut: "SESSION_ABSENTE" };
    }

    const resultat = await travail(identite.utilisateurId);

    if (resultat.statut === "FAIT") {
      revalidatePath("/compte/adresses");
    }

    return resultat;
  } catch (erreur) {
    /*
     * `EntreeInvalideError` EST UN REFUS ATTENDU, pas une panne : le message
     * nomme le champ fautif sans reproduire la valeur refusee, invariant 9.
     */
    if (erreur instanceof EntreeInvalideError) {
      return {
        statut: "SAISIE_INVALIDE",
        message: messageLisible(erreur.details),
      };
    }

    journaliser("error", "Operation de carnet indisponible", {
      erreur: erreur instanceof Error ? erreur.name : typeof erreur,
    });
    return { statut: "INDISPONIBLE" };
  }
}

export async function ajouterAdresseAction(
  donnees: FormData,
): Promise<ResultatAdresse> {
  return agir(async (utilisateurId) => {
    await ajouterAdresse(utilisateurId, extraire(donnees));
    return { statut: "FAIT" };
  });
}

export async function modifierAdresseAction(
  adresseId: string,
  donnees: FormData,
): Promise<ResultatAdresse> {
  /*
   * `adresseId` VIENT DU FORMULAIRE, ET C'EST SANS DANGER : il n'autorise rien.
   * Le service le passe au `where` AVEC l'`utilisateurId` de la session, donc
   * un identifiant d'autrui ne trouve simplement aucune ligne. C'est la
   * propriete que le parcours 8 exige, « les etapes 3, 4 et 5 recoivent un
   * identifiant d'adresse et n'en tirent aucune autorisation ».
   */
  return agir(async (utilisateurId) => {
    const resultat = await modifierAdresse(
      adresseId,
      utilisateurId,
      extraire(donnees),
    );
    return traduire(resultat.etat as "FAIT" | "INTROUVABLE");
  });
}

export async function supprimerAdresseAction(
  adresseId: string,
): Promise<ResultatAdresse> {
  return agir(async (utilisateurId) => {
    const resultat = await retirerAdresse(adresseId, utilisateurId);
    return traduire(resultat.etat as "FAIT" | "INTROUVABLE");
  });
}

export async function choisirDefautAction(
  adresseId: string,
): Promise<ResultatAdresse> {
  return agir(async (utilisateurId) => {
    const resultat = await choisirAdresseParDefaut(adresseId, utilisateurId);
    return traduire(resultat.etat as "FAIT" | "INTROUVABLE");
  });
}
