"use server";

/**
 * Adaptateur d'entree de l'espace client, droits des personnes. LS-95.
 *
 * CE FICHIER NE DECIDE RIEN, et c'est ce qui le distingue du service. Il lit les
 * en-tetes, delegue, et traduit le resultat en valeurs que l'interface sait
 * afficher. La garde d'action sensible vit dans
 * `services/suppression-compte.ts`, ou elle est exerçable par un test : une
 * garde posee ici dependrait de `next/headers`, indisponible hors requete, donc
 * ne serait jamais mesuree.
 *
 * IL NE PEUT PAS SUPPRIMER UN COMPTE TOUT SEUL, et c'est verifiable : il
 * n'importe pas `supprimerCompte`, la primitive sans garde, mais
 * `supprimerMonCompte`, le point d'entree garde. Le seul chemin qu'il ouvre
 * verifie donc la session ET la fraicheur de la preuve.
 */

import { headers } from "next/headers";

import { journaliser } from "@/lib/journal";
import { ReauthentificationRequiseError } from "@/services/reauthentification";
import { supprimerMonCompte } from "@/services/suppression-compte";

/**
 * Ce que l'interface reçoit, jamais une exception.
 *
 * Meme convention que l'ecran de reauthentification de LS-89 : une exception qui
 * traverse une Server Action produit la page d'erreur generique de Next.js, et
 * la personne perd le contexte de ce qu'elle tentait.
 */
export type ResultatSuppressionCompte =
  | { statut: "SUPPRIME" }
  /** Aucune session : il faut se reconnecter. */
  | { statut: "SESSION_ABSENTE" }
  /** Session valide mais preuve d'identite trop ancienne ou absente. */
  | { statut: "REAUTHENTIFICATION_REQUISE" }
  /** Le compte porte une reference protegee, cas de l'administratrice. */
  | { statut: "REFUSEE" }
  | { statut: "INDISPONIBLE" };

/**
 * Supprime le compte de la personne connectee.
 *
 * AUCUN PARAMETRE, invariant 2 : le compte supprime est celui de la session,
 * jamais celui qu'on demande.
 */
export async function supprimerCompteAction(): Promise<ResultatSuppressionCompte> {
  const enTetes = await headers();

  try {
    const resultat = await supprimerMonCompte(enTetes);

    switch (resultat.etat) {
      case "SUPPRIME":
        // LE COMPTE RENDU NE PORTE AUCUNE DONNEE PERSONNELLE, seulement des
        // nombres : ce journal vit en sortie standard sur un depot public.
        journaliser("info", "Compte supprime a la demande de la personne", {
          commandesDissociees: resultat.commandesDissociees,
        });
        return { statut: "SUPPRIME" };

      case "COMPTE_INTROUVABLE":
        // La session designait un compte deja parti. Rien a faire, et le dire
        // « supprime » est la verite du point de vue de la personne.
        return { statut: "SUPPRIME" };

      case "REFUSEE_REFERENCE_PROTEGEE":
        return { statut: "REFUSEE" };

      case "SESSION_ABSENTE":
        return { statut: "SESSION_ABSENTE" };
    }
  } catch (erreur) {
    /**
     * `ReauthentificationRequiseError` EST UN REFUS ATTENDU, pas une panne : la
     * garde a fait son travail. Les confondre ferait afficher « momentanement
     * indisponible » a quelqu'un dont il suffit qu'il confirme son identite.
     */
    if (erreur instanceof ReauthentificationRequiseError) {
      return { statut: "REAUTHENTIFICATION_REQUISE" };
    }

    journaliser("error", "Suppression de compte indisponible", {
      erreur: erreur instanceof Error ? erreur.name : typeof erreur,
    });
    return { statut: "INDISPONIBLE" };
  }
}
