"use server";

/**
 * Adaptateur d'entree de la reauthentification CLIENT, LS-164.
 *
 * POURQUOI UN FICHIER SEPARE DE CELUI D'ADMINISTRATION, alors que les deux
 * appellent le meme service. Celui de `administration/` commence par
 * `exigerAdministratrice`, et c'est ce qui le rend inutilisable ici : un client
 * y est refuse en `SESSION_ABSENTE` puis renvoye vers la connexion de
 * l'administration. C'est exactement le defaut que LS-164 corrige, et le
 * reutiliser tel quel le reconduirait.
 *
 * CE FICHIER N'EXIGE DONC AUCUN ROLE, et c'est volontaire. La reauthentification
 * client sert un droit que le RGPD garantit a tous, article 17 : exiger
 * `ADMINISTRATRICE` interdirait la suppression de compte a toute la population
 * qu'elle concerne. `verifier-actions-sensibles.sh` ne l'exige que sous
 * `administration/`, precisement pour cette raison, et son commentaire de sens 4
 * nomme le cas.
 *
 * CE QU'IL N'AFFAIBLIT PAS. `prouverIdentiteParMotDePasse` verifie le mot de
 * passe CONTRE `session.user.id`, jamais contre un identifiant fourni : la
 * preuve obtenue vaut pour la session qui l'a demandee et pour aucune autre.
 * C'est le critere 4, et il tient par la signature du service, pas par une
 * garde ajoutee ici.
 *
 * IL NE PEUT PAS ENREGISTRER UNE PREUVE TOUT SEUL, et c'est verifiable : il
 * n'importe pas `enregistrerPreuveIdentite`. Le seul chemin qu'il ouvre passe
 * par une fonction qui verifie d'abord.
 *
 * PAS DE PASSKEY ICI, ADR-023. L'authentification client se fait par email et
 * mot de passe seuls ; la passkey est le chemin de l'administration, ADR-021.
 * `prouverIdentiteParPasskey` n'est donc pas expose de ce cote : il accorde une
 * preuve sur le seul constat qu'une session est NEUVE, ce qui, sur un compte
 * client sans passkey, se satisfait d'une simple reconnexion par mot de passe.
 * Ce serait un second chemin plus faible vers la meme preuve.
 */

import { headers } from "next/headers";

import { journaliser } from "@/lib/journal";
import {
  prouverIdentiteParMotDePasse,
  type ResultatPreuve,
} from "@/services/preuve-identite";

/**
 * Ce que l'interface reçoit, jamais une exception.
 *
 * Meme convention que les deux autres adaptateurs de l'espace client : une
 * exception qui traverse une Server Action produit la page d'erreur generique
 * de Next.js, et la personne perd le contexte de l'action sensible qu'elle
 * voulait mener.
 */
export type ResultatReauthentificationClient =
  | { statut: "ETABLIE" }
  | { statut: "REFUSEE" }
  /** Aucune session : il faut se reconnecter, pas se reauthentifier. */
  | { statut: "SESSION_ABSENTE" }
  | { statut: "INVALIDE" }
  | { statut: "INDISPONIBLE" }
  /** Cadence anormale, LS-92. Le delai est dit, jamais le plafond. */
  | { statut: "TROP_DE_TENTATIVES"; reessayerDansSecondes: number };

/**
 * Longueur maximale acceptee pour le champ de mot de passe.
 *
 * Bornee AVANT tout traitement : sans cela, une chaine demesuree partirait au
 * hachage, dont le cout croit avec la taille de l'entree. La valeur suit
 * `LONGUEUR_MAXIMALE_MOT_DE_PASSE` de `lib/mot-de-passe.ts`, non importee ici
 * pour garder cet adaptateur sans dependance au paquet du navigateur.
 */
const LONGUEUR_MAXIMALE = 128;

function traduire(resultat: ResultatPreuve): ResultatReauthentificationClient {
  switch (resultat.etat) {
    case "ETABLIE":
      return { statut: "ETABLIE" };
    case "REFUSEE":
      return { statut: "REFUSEE" };
    case "SESSION_ABSENTE":
      return { statut: "SESSION_ABSENTE" };
    case "TROP_DE_TENTATIVES":
      return {
        statut: "TROP_DE_TENTATIVES",
        reessayerDansSecondes: resultat.reessayerDansSecondes,
      };
  }
}

/**
 * Etablit une preuve d'identite par mot de passe, pour un compte client.
 *
 * LE MOT DE PASSE N'EST NI JOURNALISE NI MESURE, invariant 9. La validation se
 * limite a ce qui evite un travail inutile : une chaine vide ou demesuree est
 * refusee sans atteindre le hachage, et le refus ne dit pas pourquoi.
 *
 * AUCUN IDENTIFIANT DE COMPTE EN PARAMETRE, invariant 2 : la session dit qui
 * demande, et le service verifie le mot de passe contre elle.
 */
export async function etablirPreuveClientParMotDePasse(
  motDePasse: unknown,
): Promise<ResultatReauthentificationClient> {
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
    return traduire(await prouverIdentiteParMotDePasse(enTetes, motDePasse));
  } catch (erreur) {
    // Une panne reelle, base injoignable par exemple. `prouverIdentite...`
    // ne leve que dans ce cas, un mot de passe faux rendant `REFUSEE`.
    journaliser("error", "Reauthentification client indisponible", {
      erreur: erreur instanceof Error ? erreur.name : typeof erreur,
    });
    return { statut: "INDISPONIBLE" };
  }
}
