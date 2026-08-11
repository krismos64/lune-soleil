/**
 * Reauthentification avant action sensible. LS-81, ADR-027 decision 3.
 *
 * CE QUE CE MODULE PROTEGE. Une session ouverte prouve qu'on s'est connecte un
 * jour, pas que la personne devant l'ecran est bien l'exploitante maintenant.
 * Le scenario vise est l'ordinateur reste ouvert : quelqu'un s'assied et
 * rembourse, exporte le fichier client ou change les coordonnees bancaires.
 * Quatre familles d'actions redemandent donc une preuve d'identite recente.
 *
 * POURQUOI PAS `freshAge` DE BETTER AUTH, qui existe pourtant et vise
 * explicitement les operations sensibles. Son middleware compare
 * `session.createdAt`, jamais `updatedAt`, verifie via Context7 sur le code de
 * `freshSessionMiddleware`. Seule une reconnexion complete y remet le compteur
 * a zero : une exploitante connectee depuis vingt-cinq heures serait bloquee
 * sans qu'aucun geste ne la debloque, sauf se deconnecter entierement. Le
 * ticket demande l'inverse, une preuve qui rouvre une fenetre.
 *
 * CE MODULE NE LIT NI COOKIE NI `Request`, conformement au fichier de garde de
 * `services/` : les en-tetes lui sont passes par l'adaptateur d'entree.
 */
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AutorisationRefuseeError } from "@/services/autorisation";

/**
 * Les quatre familles d'actions sensibles, ADR-027 decision 3.
 *
 * CE TYPE EST LA SOURCE DU CONTROLE DE COMPLETUDE. `scripts/verifier-actions-
 * sensibles.sh` releve ces valeurs ici et les confronte au code reel : une
 * action declaree sensible qui n'appelle pas `exigerReauthentificationRecente`
 * fait echouer le controle, et une famille declaree ici sans aucune action ne
 * passe pas inapercue non plus.
 *
 * VOLONTAIREMENT COURT, critere d'acceptation 6. Chaque ajout se paie en
 * saisies quotidiennes pour l'exploitante, et une protection qu'on subit finit
 * contournee. Une cinquieme famille demande un arbitrage, pas une ligne de
 * plus.
 */
export type FamilleActionSensible =
  /** Changer le mot de passe ou la passkey : ce qu'un intrus fait en premier. */
  | "IDENTIFIANTS"
  /** Exporter ou consulter en masse les donnees clients, risque nomme par ADR-021. */
  | "DONNEES_CLIENTS"
  /** Rembourser ou emettre un avoir : une ecriture irreversible qui sort de l'argent. */
  | "REMBOURSEMENT"
  /** Modifier les parametres de la boutique, dont les coordonnees bancaires. */
  | "PARAMETRES_BOUTIQUE";

/**
 * Duree pendant laquelle une preuve d'identite reste valable.
 *
 * QUINZE MINUTES : assez pour enchainer plusieurs actions sensibles d'affilee
 * sans se reauthentifier a chaque clic, trop court pour qu'un ordinateur laisse
 * ouvert le temps d'un dejeuner reste utilisable.
 *
 * EXPORTEE POUR QUE LES TESTS S'Y ANCRENT plutot que de recopier la valeur : un
 * nombre recopie continue de passer le jour ou la constante change.
 */
export const FENETRE_REAUTHENTIFICATION_MS = 15 * 60 * 1000;

/**
 * Erreur levee quand l'identite n'a pas ete prouvee recemment.
 *
 * DISTINCTE DE `AutorisationRefuseeError`, et la nuance est fonctionnelle et
 * non cosmetique : l'appelante EST autorisee, il lui manque une preuve
 * recente. L'interface doit proposer de se reauthentifier, pas afficher un
 * refus d'acces qui laisserait croire a une erreur de compte.
 *
 * Elle ne porte aucun detail sur la session ni sur le compte : le message part
 * vers un navigateur.
 */
export class ReauthentificationRequiseError extends Error {
  constructor(readonly famille: FamilleActionSensible) {
    super("Reauthentification requise");
    this.name = "ReauthentificationRequiseError";
  }
}

/**
 * Vrai si la preuve d'identite est encore dans sa fenetre de validite.
 *
 * DEFAUT FERME, et c'est tout l'interet de sortir cette comparaison : `null`
 * n'est pas fraiche. Une session qui n'a jamais prouve d'identite, dont celles
 * deja ouvertes au moment de la migration, n'ouvre aucune action sensible.
 *
 * Exportee pour le test : le sens de la comparaison n'est visible par aucun
 * parcours nominal, exactement le motif qui a laisse quinze tests verts sur une
 * mutation en LS-70.
 */
export function preuveEncoreValable(
  reauthentifieeLe: Date | null,
  maintenant: Date = new Date(),
): boolean {
  if (reauthentifieeLe === null) {
    return false;
  }

  return maintenant.getTime() - reauthentifieeLe.getTime() < FENETRE_REAUTHENTIFICATION_MS;
}

/**
 * Exige que l'identite ait ete prouvee recemment sur cette session, ou leve.
 *
 * LA VERIFICATION PORTE SUR LA SESSION, jamais sur un parametre : cette
 * signature n'accepte aucun identifiant d'utilisateur ni de session, ce qui
 * serait le chemin que l'invariant 2 interdit.
 *
 * L'HORODATAGE EST RELU EN BASE et non pris dans l'objet de session que Better
 * Auth met en cache dans un cookie. Un cookie de session est signe, donc non
 * forgeable, mais il porte l'etat du moment de son emission : une
 * reauthentification faite dans un autre onglet n'y figurerait pas, et pire, une
 * session revoquee cote serveur continuerait de presenter une preuve valide
 * jusqu'a l'expiration du cache.
 */
export async function exigerReauthentificationRecente(
  enTetes: Headers,
  famille: FamilleActionSensible,
): Promise<void> {
  const session = await auth.api.getSession({ headers: enTetes });

  if (!session?.session) {
    // Aucune session valide : c'est un refus d'autorisation ordinaire, pas un
    // manque de preuve recente. Distinguer les deux evite de proposer une
    // reauthentification a quelqu'un qui n'est pas connecte du tout.
    throw new AutorisationRefuseeError();
  }

  const enregistree = await prisma.session.findUnique({
    where: { id: session.session.id },
    select: { reauthentifieeLe: true },
  });

  // Session disparue entre la lecture de Better Auth et celle-ci, revocation
  // concurrente par exemple. Defaut ferme : pas de ligne, pas de preuve.
  if (!enregistree || !preuveEncoreValable(enregistree.reauthentifieeLe)) {
    throw new ReauthentificationRequiseError(famille);
  }
}

/**
 * Enregistre une preuve d'identite fraiche sur la session courante.
 *
 * DEUX CHEMINS Y MENENT, et c'est ce qui satisfait le critere 4 :
 *
 *   - la passkey, en repassant par `/sign-in/passkey`, qui cree une session
 *     neuve ; l'appelant note la preuve sur cette nouvelle session ;
 *   - le mot de passe, via `auth.api.verifyPassword` cote serveur, qui
 *     confirme sans creer de session.
 *
 * CETTE FONCTION NE VERIFIE RIEN ELLE-MEME, elle enregistre un fait deja
 * etabli. C'est volontaire et c'est le point a ne pas rater a la relecture :
 * son appelant DOIT avoir verifie la preuve juste avant. L'appeler sans
 * verification prealable equivaudrait a se declarer reauthentifie tout seul,
 * ce que le controle de completude ne peut pas detecter. Les deux seuls
 * appelants prevus sont les points d'entree de reauthentification eux-memes.
 */
export async function enregistrerPreuveIdentite(
  sessionId: string,
  maintenant: Date = new Date(),
): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { reauthentifieeLe: maintenant },
  });
}
