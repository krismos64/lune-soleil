/**
 * Autorisation : qui agit, et a quel titre. LS-70.
 *
 * INVARIANT 2, et c'est tout ce que ce module existe pour tenir : un
 * identifiant venant d'une URL, d'un formulaire ou d'un modele de langage
 * n'autorise jamais l'acces. L'identite vient de la session, recoupee cote
 * serveur. Regles E2 et E10.
 *
 * POURQUOI UN SERVICE ET PAS UN APPEL DIRECT A `auth.api.getSession`. Un appel
 * direct disperse la decision : chaque route rejugerait ce qu'est « etre
 * administratrice », et il suffit d'une qui teste `session.user.role` sans
 * verifier la session elle-meme. Ici la question a une seule reponse.
 *
 * CE QUE CE MODULE NE FAIT PAS. Il ne lit ni cookie ni `Request` : les en-tetes
 * lui sont passes par l'adaptateur d'entree, gestionnaire de route ou Server
 * Action, conformement au fichier de garde de `services/`.
 */
import { auth } from "@/lib/auth";

/** Les deux roles du projet, ADR-023. Aucun troisieme n'est prevu. */
export type RoleUtilisateur = "CLIENT" | "ADMINISTRATRICE";

/**
 * L'identite etablie d'un appelant.
 *
 * Volontairement reduite a ce dont une decision d'autorisation a besoin. Ce
 * type ne porte ni nom ni image : une vue qui les veut les relit, ce qui evite
 * qu'un champ d'affichage se retrouve a fonder une autorisation.
 */
export type IdentiteAppelant = {
  utilisateurId: string;
  email: string;
  role: RoleUtilisateur;
};

/**
 * Erreur d'autorisation, levee et non rendue.
 *
 * UNE SEULE ERREUR POUR LES DEUX CAS, absence de session et role insuffisant.
 * Distinguer « non connecte » de « connecte mais pas administratrice » dans le
 * message renseignerait un attaquant sur l'existence du compte d'administration.
 * L'appelant qui a besoin de la nuance, rediriger vers la connexion plutot
 * qu'afficher un refus, la tire de `exigerSession` qui rend `null`.
 */
export class AutorisationRefuseeError extends Error {
  constructor() {
    super("Acces refuse");
    this.name = "AutorisationRefuseeError";
  }
}

/**
 * Normalise ce que Better Auth rend en un role du projet.
 *
 * DEFAUT FERME. Une valeur absente, nulle ou inconnue ne devient pas
 * `CLIENT` par commodite mais parce que c'est le role qui n'ouvre rien de plus
 * qu'une session : regle E10, « un role absent ou inconnu ne donne aucun
 * droit ». Ne jamais faire retomber ce defaut sur `ADMINISTRATRICE`.
 *
 * Le champ arrive en `unknown` : `additionalFields` le type en union cote
 * client, mais rien ne garantit ce que la base contient si une ecriture
 * manuelle l'a corrompu.
 */
function normaliserRole(valeur: unknown): RoleUtilisateur {
  return valeur === "ADMINISTRATRICE" ? "ADMINISTRATRICE" : "CLIENT";
}

/**
 * Meme fonction, exposee pour le test.
 *
 * POURQUOI UN EXPORT DEDIE plutot que rendre `normaliserRole` publique : le
 * nom dit qu'il ne s'appelle pas depuis le code applicatif, ou l'entree passe
 * toujours par `lireIdentite`. Un export ordinaire inviterait a normaliser un
 * role venu d'ailleurs, donc a fabriquer une identite hors session.
 *
 * Le sens du defaut de cette fonction n'est visible par AUCUN parcours
 * nominal : `CLIENT` et `ADMINISTRATRICE` sortent identiques quel que soit le
 * sens du test. Seule une valeur inattendue les separe, et une mutation l'a
 * prouve en restant verte sur quinze tests.
 */
export const normaliserRolePourTest = normaliserRole;

/**
 * Lit l'identite de la session, ou `null` si aucune session valide.
 *
 * Better Auth verifie ici la signature et l'expiration du jeton et relit
 * l'utilisateur en base. Un jeton forge ou expire ne produit pas de session.
 */
export async function lireIdentite(
  enTetes: Headers,
): Promise<IdentiteAppelant | null> {
  const session = await auth.api.getSession({ headers: enTetes });

  if (!session?.user) {
    return null;
  }

  return {
    utilisateurId: session.user.id,
    email: session.user.email,
    role: normaliserRole((session.user as { role?: unknown }).role),
  };
}

/**
 * Exige une session valide, quel que soit le role.
 *
 * Rend `null` plutot que de lever : c'est le cas ou l'appelant veut rediriger
 * vers la connexion, pas afficher un refus.
 */
export async function exigerSession(
  enTetes: Headers,
): Promise<IdentiteAppelant | null> {
  return lireIdentite(enTetes);
}

/**
 * Exige le role d'administration et rend l'identite, ou `null` sur refus.
 *
 * LA TRADUCTION DU REFUS POUR LES ADAPTATEURS, LS-158 : une Server Action rend
 * une valeur d'interface, elle ne laisse pas fuir une exception. Sept fichiers
 * d'actions portaient chacun leur copie de cette traduction, avec trois
 * contrats de retour differents pour le meme controle : la reponse vit ici et
 * nulle part ailleurs.
 *
 * Session absente et role insuffisant rendent la MEME valeur, comme
 * `AutorisationRefuseeError` les confond : les separer renseignerait sur
 * l'existence du compte d'administration.
 *
 * Les en-tetes se passent en parametre, `await headers()` chez l'appelant : ce
 * module ne lit ni cookie ni `Request`, fichier de garde de `services/`.
 */
export async function exigerRole(
  enTetes: Headers,
): Promise<IdentiteAppelant | null> {
  try {
    return await exigerAdministratrice(enTetes);
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      return null;
    }
    throw erreur;
  }
}

/**
 * Exige une session dont le role est `ADMINISTRATRICE`, ou leve.
 *
 * LA VERIFICATION PORTE SUR LA SESSION, jamais sur un parametre. Aucune
 * signature de ce module n'accepte d'identifiant d'utilisateur : c'est
 * volontaire, un tel parametre serait exactement le chemin que l'invariant 2
 * interdit, et sa seule presence inviterait a le passer depuis une URL.
 */
export async function exigerAdministratrice(
  enTetes: Headers,
): Promise<IdentiteAppelant> {
  const identite = await lireIdentite(enTetes);

  if (!identite || identite.role !== "ADMINISTRATRICE") {
    throw new AutorisationRefuseeError();
  }

  return identite;
}
