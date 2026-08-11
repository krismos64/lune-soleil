/**
 * Lecture de l'issue d'une tentative de connexion. LS-80.
 *
 * CE MODULE N'IMPORTE RIEN DU PROJET, ET NE DOIT JAMAIS LE FAIRE. Meme motif
 * que `mot-de-passe.ts` : la fonction est pure, et la separer de
 * `hook-journal-connexion.ts` permet de la tester sans base de donnees.
 *
 * Le hook, lui, tire `services/journal-connexion.ts`, donc Prisma, donc
 * `DATABASE_URL`. Un test unitaire qui l'importerait exigerait une base pour
 * verifier une comparaison de champs, et la suite unitaire du projet doit
 * rester lancable sur une machine sans Docker. Le script de mutation l'a
 * attrape : il lance `test:unitaire` sans base pour etablir son etat de
 * reference.
 *
 * `APIError` vient de Better Auth et non du projet : c'est le type que la
 * bibliotheque rend, il n'y a pas de moyen de le reconnaitre sans l'importer.
 */
import { APIError } from "better-auth/api";

/** Issue d'une tentative, alignee sur l'enum `IssueConnexion` du schema. */
export type IssueTentative = "REUSSITE" | "ECHEC";

/**
 * Ce que la reponse de Better Auth dit du compte concerne.
 *
 * SUR UNE REUSSITE, `newSession` porte l'utilisateur reel : c'est la seule
 * source fiable de l'identifiant, et elle vient du serveur, jamais du corps de
 * la requete, invariant 2.
 *
 * SUR UN ECHEC, il n'y a AUCUN identifiant a rapporter, et c'est correct.
 * Better Auth ne dit pas si l'echec vient d'une adresse inconnue ou d'un mot
 * de passe faux, et il a raison de ne pas le dire : la difference renseignerait
 * un attaquant sur l'existence du compte.
 */
export type ResultatTentative = {
  issue: IssueTentative;
  utilisateurId: string | null;
  emailConfirme: string | null;
};

/**
 * Lit l'issue de la tentative dans le contexte de sortie du hook.
 *
 * DEUX SIGNAUX, ET LEUR ORDRE COMPTE. Un `APIError` rendu par la route est un
 * echec sans ambiguite, et il l'emporte sur tout le reste.
 *
 * POURQUOI PAS « PAS D'ERREUR DONC REUSSITE ». Le greffon a deux facteurs
 * remet `newSession` a `null` en emettant son defi, sans lever d'erreur : la
 * connexion n'est alors PAS acquise, un second facteur reste a fournir.
 * Traiter ce cas en reussite ecrirait une connexion qui n'a pas eu lieu. Le
 * greffon n'est pas installe aujourd'hui, la formulation le devance
 * volontairement plutot que de dependre de ce qui est absent.
 *
 * DEFAUT FERME : tout ce qui n'est pas une session identifiee est un echec.
 * Sur un parcours nominal, inverser les deux branches produit exactement le
 * meme effet visible, une ligne de journal. Seule la valeur de `issue` les
 * separe, motif qui a laisse quinze tests verts sur une mutation en LS-70.
 */
export function lireResultat(contexte: {
  returned?: unknown;
  // `user` peut valoir `undefined` explicitement, et le type doit le dire :
  // `exactOptionalPropertyTypes` etant actif, un simple `?` interdirait
  // d'ecrire `{ user: undefined }`, forme que Better Auth produit pourtant.
  newSession?:
    { user?: { id?: unknown; email?: unknown } | undefined } | null | undefined;
}): ResultatTentative {
  if (contexte.returned instanceof APIError) {
    return { issue: "ECHEC", utilisateurId: null, emailConfirme: null };
  }

  const utilisateur = contexte.newSession?.user;

  if (typeof utilisateur?.id === "string") {
    return {
      issue: "REUSSITE",
      utilisateurId: utilisateur.id,
      emailConfirme:
        typeof utilisateur.email === "string" ? utilisateur.email : null,
    };
  }

  // Ni erreur ni session : la connexion n'est pas acquise. Voir le defi a deux
  // facteurs plus haut.
  return { issue: "ECHEC", utilisateurId: null, emailConfirme: null };
}
