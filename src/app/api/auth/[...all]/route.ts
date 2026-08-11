/**
 * Point de montage des routes de Better Auth, LS-70.
 *
 * Ce fichier est un ADAPTATEUR D'ENTREE, au sens de l'architecture du projet :
 * il branche la bibliotheque sur le routeur de Next.js et ne porte aucune
 * decision. Toute la configuration vit dans `src/lib/auth.ts`.
 *
 * Le chemin `/api/auth/[...all]` est celui que Better Auth attend par defaut.
 * Le changer imposerait de le declarer aussi dans `baseURL` et dans le client :
 * trois endroits a tenir en phase pour aucun gain.
 *
 * UNE SEULE CHOSE S'AJOUTE ICI, LS-80 : la journalisation des tentatives
 * refusees par la limitation de debit. Elle ne peut pas vivre ailleurs, voir
 * `journaliserRefusLimitation`. L'adaptateur reste sans decision, il observe.
 */
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import { journaliserRefusLimitation } from "@/lib/hook-journal-connexion";

const CODE_TROP_DE_REQUETES = 429;

const gestionnaires = toNextJsHandler(auth);

/**
 * Enveloppe le gestionnaire pour journaliser les refus de cadence, regle E13.
 *
 * POURQUOI ICI ET NULLE PART AILLEURS. Better Auth applique la limitation de
 * debit dans le `onRequest` de son routeur ; `better-call` rend alors la
 * reponse 429 et sort SANS appeler l'endpoint, les hooks `after`, ni meme
 * `onResponse`. Aucun point d'extension de la bibliotheque ne voit ces
 * requetes, et elles echappaient donc entierement au journal jusqu'a la
 * relecture de LS-80. Ce sont pourtant celles qui caracterisent une attaque
 * automatisee : le volume refuse est le signal.
 *
 * L'ECRITURE EST ATTENDUE AVANT DE RENDRE LA REPONSE. Une ecriture detachee
 * serait interrompue par la fin de l'invocation sur un hebergement sans
 * exécution differee, et la ligne disparaitrait precisement sous la charge
 * d'une attaque. Le cout est une insertion sur une requete deja refusee, donc
 * une par fenetre de limitation et par adresse.
 *
 * ELLE NE PEUT PAS FAIRE ECHOUER LA REPONSE : `journaliserRefusLimitation`
 * delegue a `enregistrerTentativeConnexion`, qui avale ses erreurs, regle E15.
 */
function journaliserLesRefus(
  gestionnaire: (requete: Request) => Promise<Response>,
) {
  return async (requete: Request): Promise<Response> => {
    const reponse = await gestionnaire(requete);

    if (reponse.status === CODE_TROP_DE_REQUETES) {
      await journaliserRefusLimitation(requete, auth.options);
    }

    return reponse;
  };
}

export const POST = journaliserLesRefus(gestionnaires.POST);
export const GET = journaliserLesRefus(gestionnaires.GET);
