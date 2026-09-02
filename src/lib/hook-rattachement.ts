/**
 * Declenchement du rattachement des commandes invitees, parcours 6. LS-56.
 *
 * POURQUOI CE MODULE EXISTE SEPAREMENT DE `auth.ts`. Meme motif que
 * `hook-journal-connexion.ts` : la logique reste testable sans monter une
 * instance Better Auth complete, et `auth.ts` garde sa fonction de
 * configuration plutot que de porter des decisions metier.
 *
 * IL NE PEUT JAMAIS FAIRE ECHOUER UNE CONNEXION NI UNE VERIFICATION. Les deux
 * fonctions avalent leurs erreurs. Le rattachement est un CONFORT, pas une
 * condition d'acces : une base momentanement lente ne doit pas empecher
 * quelqu'un de se connecter, et le rejeu a la connexion suivante rattrapera de
 * toute facon ce qui n'a pas ete fait.
 *
 * Ce choix est l'inverse de celui d'une garde de securite, ou le defaut doit
 * rester ferme. Ici le defaut ferme EST de ne rien rattacher, ce qui n'ouvre
 * aucun acces : echouer silencieusement laisse simplement les commandes
 * orphelines, etat dont on sait sortir.
 */
import { journaliser } from "@/lib/journal";
import { rattacherMesCommandes } from "@/services/rattachement-commandes";

/**
 * Rattache les commandes apres une verification d'adresse ou une connexion.
 *
 * LES ERREURS SONT AVALEES ET JOURNALISEES, voir l'entete. Le nom de la classe
 * seul entre au journal, jamais le message : une erreur de base peut porter une
 * valeur, invariant 9 et `JOURNALISATION.md`.
 */
export async function rattacherSansJamaisEchouer(
  utilisateurId: string,
  email: string,
  declencheur: "VERIFICATION" | "CONNEXION",
): Promise<void> {
  try {
    await rattacherMesCommandes(utilisateurId, email, declencheur);
  } catch (erreur) {
    /*
     * `origine` ET NON `declencheur` : `masquerContexte` compare par inclusion
     * et « declencheur » contient « cle », donc la valeur sortait en
     * `[masque]`. Une ligne d'erreur qui ne dit pas d'ou vient l'echec ne sert
     * a rien. Meme motif dans `services/rattachement-commandes.ts`.
     */
    journaliser("error", "Rattachement des commandes impossible", {
      origine: declencheur,
      erreur: erreur instanceof Error ? erreur.name : typeof erreur,
    });
  }
}
