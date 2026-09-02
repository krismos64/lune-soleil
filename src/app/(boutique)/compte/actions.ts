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
import { revalidatePath } from "next/cache";

import { journaliser } from "@/lib/journal";
import { exigerSession } from "@/services/autorisation";
import { rattacherMesCommandes } from "@/services/rattachement-commandes";
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

/**
 * Ce que le rattachement rend a l'interface. LS-56, parcours 6 etape 4.
 *
 * `ADRESSE_NON_VERIFIEE` EST UN ETAT A PART ENTIERE, pas une erreur : l'ecran
 * doit proposer de confirmer l'adresse, pas afficher un echec.
 */
export type ResultatRattachementCommandes =
  | { statut: "RATTACHEES"; nombre: number }
  | { statut: "ADRESSE_NON_VERIFIEE" }
  | { statut: "SESSION_ABSENTE" }
  | { statut: "INDISPONIBLE" };

/**
 * Rattache au compte connecte ses commandes passees sans compte.
 *
 * AUCUN PARAMETRE, invariant 2, et c'est la propriete centrale de cette action.
 * Le parcours 6 nomme explicitement la « tentative de rattachement par
 * identifiant fourni » : accepter ici une liste d'identifiants de commandes, ou
 * meme une adresse email, ouvrirait ce chemin. L'identifiant du compte ET son
 * adresse viennent tous deux de la SESSION, recoupes cote serveur.
 *
 * ELLE NE FAIT QUE DECLENCHER. Les trois conditions cumulatives vivent dans le
 * service et dans le `where` du repository, jamais ici : cet adaptateur ne
 * decide rien, garde de `app/`.
 */
export async function rattacherCommandesAction(): Promise<ResultatRattachementCommandes> {
  const enTetes = await headers();

  try {
    const identite = await exigerSession(enTetes);

    if (!identite) {
      return { statut: "SESSION_ABSENTE" };
    }

    const resultat = await rattacherMesCommandes(
      identite.utilisateurId,
      identite.email,
      "DEMANDE",
    );

    if (resultat.etat === "ADRESSE_NON_VERIFIEE") {
      return { statut: "ADRESSE_NON_VERIFIEE" };
    }

    /*
     * `revalidatePath` PARCE QUE L'HISTORIQUE DOIT REFLETER LE RATTACHEMENT.
     * Les commandes viennent d'entrer dans le perimetre du compte : sans cette
     * ligne, `/compte/commandes` afficherait encore l'etat d'avant.
     *
     * CE QU'IL FAIT AUSSI, ET QUI A ETE MAL ANTICIPE : il fait retomber a zero
     * le nombre de commandes eligibles, donc la condition d'affichage du bloc
     * de rattachement. La premiere version laissait la page decider seule sur ce
     * nombre, et la section entiere disparaissait au succes, emportant le focus
     * clavier, le message de succes et la region live qui devait l'annoncer.
     * Le geste reussi ne produisait rien de visible.
     *
     * Le composant porte desormais son propre etat `fait` et survit a la
     * revalidation, voir `bloc-rattachement.tsx`. Trouve par la revue frontend.
     */
    revalidatePath("/compte");
    revalidatePath("/compte/commandes");

    return { statut: "RATTACHEES", nombre: resultat.nombre };
  } catch (erreur) {
    journaliser("error", "Rattachement des commandes indisponible", {
      erreur: erreur instanceof Error ? erreur.name : typeof erreur,
    });
    return { statut: "INDISPONIBLE" };
  }
}
