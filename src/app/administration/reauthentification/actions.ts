"use server";

/**
 * Adaptateur d'entree de la reauthentification, LS-89.
 *
 * CE FICHIER EST UN ADAPTATEUR : il lit une entree non fiable, la valide, et
 * delegue. La decision de securite, verifier puis noter la preuve, vit dans
 * `services/preuve-identite.ts` et nulle part ailleurs.
 *
 * IL NE PEUT PAS ENREGISTRER UNE PREUVE TOUT SEUL, et c'est verifiable : il
 * n'importe pas `enregistrerPreuveIdentite`. Le seul chemin qu'il ouvre passe
 * par une fonction qui verifie d'abord.
 *
 * IL EXIGE LE ROLE `ADMINISTRATRICE`, ET PAS SEULEMENT LA PAGE. Une Server
 * Action est invocable DIRECTEMENT, sans passer par le rendu de l'ecran :
 * proteger la page seule laisserait ce chemin ouvert. Defaut trouve en
 * relecture, ou ni la page ni ces deux fonctions ne filtraient le role, et ou
 * un client inscrit sur la boutique pouvait se fabriquer une preuve d'identite
 * avec son propre mot de passe.
 */

import { headers } from "next/headers";

import { journaliser } from "@/lib/journal";
import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import {
  prouverIdentiteParMotDePasse,
  prouverIdentiteParPasskey,
  type ResultatPreuve,
} from "@/services/preuve-identite";

/**
 * Ce que l'interface recoit, jamais une exception.
 *
 * Une Server Action dont l'exception traverse produit la page d'erreur
 * generique de Next.js : l'exploitante perdrait le contexte de l'action
 * sensible qu'elle voulait mener. Les issues previsibles sont des VALEURS.
 */
export type ResultatReauthentification =
  | { statut: "ETABLIE" }
  | { statut: "REFUSEE" }
  /**
   * Aucune session d'administration : soit rien du tout, soit une session sans
   * le role. Les deux cas rendent la MEME valeur, comme
   * `AutorisationRefuseeError` confond les deux : distinguer renseignerait sur
   * l'existence du compte d'administration.
   */
  | { statut: "SESSION_ABSENTE" }
  | { statut: "INVALIDE" }
  | { statut: "INDISPONIBLE" };

/**
 * Longueur maximale acceptee pour le champ de mot de passe.
 *
 * Bornee AVANT tout traitement : sans cela, une chaine demesuree partirait au
 * hachage, dont le cout croit avec la taille de l'entree. La valeur suit
 * `LONGUEUR_MAXIMALE_MOT_DE_PASSE` de `lib/mot-de-passe.ts`, non importee ici
 * pour garder cet adaptateur sans dependance au paquet du navigateur.
 */
const LONGUEUR_MAXIMALE = 128;

function traduire(resultat: ResultatPreuve): ResultatReauthentification {
  switch (resultat.etat) {
    case "ETABLIE":
      return { statut: "ETABLIE" };
    case "REFUSEE":
      return { statut: "REFUSEE" };
    case "SESSION_ABSENTE":
      return { statut: "SESSION_ABSENTE" };
  }
}

/**
 * Etablit une preuve d'identite par mot de passe.
 *
 * LE MOT DE PASSE N'EST NI JOURNALISE NI MESURE, invariant 9. La validation se
 * limite a ce qui evite un travail inutile : une chaine vide ou demesuree est
 * refusee sans atteindre le hachage, et le refus ne dit pas pourquoi.
 */
export async function etablirPreuveParMotDePasse(
  motDePasse: unknown,
): Promise<ResultatReauthentification> {
  if (
    typeof motDePasse !== "string" ||
    motDePasse.length === 0 ||
    motDePasse.length > LONGUEUR_MAXIMALE
  ) {
    // AUCUN DETAIL sur ce qui a echoue, et surtout pas la longueur recue :
    // elle renseignerait sur le mot de passe tente.
    return { statut: "INVALIDE" };
  }

  const enTetes = await headers();

  try {
    // LE ROLE SE VERIFIE AVANT LE MOT DE PASSE, et pas seulement dans la page :
    // une Server Action est invocable directement, proteger le rendu seul
    // laisserait ce chemin ouvert. Un appelant sans le role n'a de surcroit
    // aucune raison d'atteindre le hachage, seul travail couteux de ce chemin.
    await exigerAdministratrice(enTetes);
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      return { statut: "SESSION_ABSENTE" };
    }
    throw erreur;
  }

  try {
    return traduire(await prouverIdentiteParMotDePasse(enTetes, motDePasse));
  } catch (erreur) {
    // Une panne reelle, base injoignable par exemple. `prouverIdentite...`
    // ne leve que dans ce cas, un mot de passe faux rendant `REFUSEE`.
    journaliser("error", "Reauthentification indisponible", {
      moyen: "MOT_DE_PASSE",
      erreur: erreur instanceof Error ? erreur.name : typeof erreur,
    });
    return { statut: "INDISPONIBLE" };
  }
}

/**
 * Note la preuve apres une authentification par passkey deja negociee.
 *
 * ELLE N'ACCORDE RIEN PAR ELLE-MEME : le service exige que la session soit
 * NEUVE, donc issue de la negociation qui vient d'avoir lieu. Un appel depuis
 * une session ouverte de longue date est refuse.
 */
export async function etablirPreuveParPasskey(): Promise<ResultatReauthentification> {
  const enTetes = await headers();

  try {
    await exigerAdministratrice(enTetes);
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      return { statut: "SESSION_ABSENTE" };
    }
    throw erreur;
  }

  try {
    return traduire(await prouverIdentiteParPasskey(enTetes));
  } catch (erreur) {
    journaliser("error", "Reauthentification indisponible", {
      moyen: "PASSKEY",
      erreur: erreur instanceof Error ? erreur.name : typeof erreur,
    });
    return { statut: "INDISPONIBLE" };
  }
}
