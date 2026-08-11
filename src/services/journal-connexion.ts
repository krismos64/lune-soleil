/**
 * Journal des connexions, purge comprise. LS-80, ADR-027 decision 2.
 *
 * CE QUE CE MODULE PROTEGE. Un compte compromis ne fait aucun bruit : la
 * connexion de l'intrus ressemble a celle de l'exploitante. Ce journal est ce
 * qui permet, apres coup, de repondre a « qui s'est connecte, depuis ou, et
 * combien de fois a-t-on echoue avant ». Il precise la mesure compensatoire 4
 * d'ADR-021, et en etend la portee aux comptes client.
 *
 * LES ECHECS COMPTENT AUTANT QUE LES REUSSITES, regle E13. Dix echecs suivis
 * d'une reussite est le motif d'une attaque qui a fini par aboutir. Un journal
 * qui ne garderait que les reussites ne montrerait que la fin de l'histoire, au
 * moment ou il n'y a plus rien a empecher.
 *
 * CE QU'IL N'ECRIT JAMAIS : le mot de passe essaye, meme faux, meme tronque.
 * Aucune signature de ce module n'accepte de mot de passe, et c'est volontaire
 * : un parametre facultatif suffirait a ce qu'un appelant le passe « pour
 * deboguer ». Les erreurs de saisie sont a un caractere du vrai mot de passe,
 * et beaucoup de gens saisissent celui d'un autre site ; la table deviendrait
 * une liste de mots de passe presque justes en face d'adresses connues, sur un
 * depot public. Invariant 9.
 *
 * CE MODULE NE LIT NI COOKIE NI `Request`, conformement au fichier de garde de
 * `services/` : les valeurs lui sont passees par l'adaptateur d'entree.
 */
import type { IssueConnexion, MoyenConnexion } from "@/generated/prisma/enums";
import { journaliserErreur } from "@/lib/journal";
import { prisma } from "@/lib/prisma";

export type { IssueConnexion, MoyenConnexion };

/**
 * Duree de conservation d'une ligne du journal, regle E14.
 *
 * SIX MOIS, ET CE CHIFFRE NE S'INVENTE PAS. Source : deliberation CNIL
 * n 2021-122 du 14 octobre 2021 portant recommandation relative a la
 * journalisation, point 8, qui recommande « une duree comprise entre six mois
 * et un an ». Le bas de la fourchette est retenu par ADR-027 : ce projet n'a
 * personne pour exploiter un an de journal en temps reel, et le volume
 * conserve est lui-meme un risque puisque la table concentre adresses IP et
 * habitudes de connexion.
 *
 * CE N'EST PAS UNE OBLIGATION CHIFFREE de la loi mais une recommandation, et
 * six mois est un choix motive a l'interieur de ce qu'elle propose. Le
 * modifier releve d'un arbitrage trace, pas d'un ajustement de confort.
 *
 * EXPORTEE POUR QUE LES TESTS S'Y ANCRENT plutot que de recopier 180 jours : un
 * nombre recopie dans un test continue de passer le jour ou la constante
 * change, et le test cesse alors de verifier la duree reellement appliquee.
 */
export const CONSERVATION_JOURNAL_MOIS = 6;

/**
 * Ce qu'une tentative de connexion laisse comme trace.
 *
 * AUCUN CHAMP DE MOT DE PASSE, voir l'entete. Le type est la premiere ligne de
 * defense : il n'y a pas de champ ou le mettre.
 */
export type TentativeConnexion = {
  /** L'adresse SAISIE, qui n'est pas toujours celle d'un compte existant. */
  emailTente: string;
  /** Nul quand l'adresse ne correspond a aucun compte, cas d'un balayage. */
  utilisateurId: string | null;
  moyen: MoyenConnexion;
  issue: IssueConnexion;
  /** Nul est un cas NORMAL, voir `enregistrerTentativeConnexion`. */
  adresseIp: string | null;
  agentUtilisateur: string | null;
};

/**
 * Longueur au-dela de laquelle l'agent utilisateur est tronque.
 *
 * La chaine vient du client, donc sans borne : rien n'empeche d'envoyer un
 * en-tete de plusieurs mega-octets a chaque tentative echouee, ce qui ferait
 * enfler la table sans qu'aucune limite ne s'y oppose. Deux cent cinquante
 * caracteres couvrent tout agent reel avec de la marge.
 */
const LONGUEUR_MAXIMALE_AGENT = 250;

/**
 * Ecrit une ligne de journal. NE LEVE JAMAIS, regle E15.
 *
 * C'EST LA PROPRIETE CENTRALE DE CETTE FONCTION, critere d'acceptation 5, et
 * elle va a rebours de l'instinct. Une trace de securite qui ne peut pas
 * s'ecrire est un probleme de diagnostic ; une connexion qui echoue parce que
 * la trace n'a pas pu s'ecrire est un probleme d'exploitation, et il ferme la
 * porte a l'exploitante au pire moment, celui ou la base souffre deja. Meme
 * principe que la regle E4 pour l'email.
 *
 * L'ECHEC PART DANS LE JOURNAL TECHNIQUE, en `error`, plutot que d'etre avale
 * en silence. Un `catch` vide rendrait une panne d'ecriture indetectable, ce
 * qui reviendrait a n'avoir aucun journal tout en croyant en avoir un.
 * `journaliserErreur` ne garde que le NOM de la classe d'erreur : le message
 * d'une violation PostgreSQL porte la valeur en conflit, donc ici une adresse
 * email.
 *
 * ELLE N'EST PAS APPELEE DANS UNE TRANSACTION DE CONNEXION, et ne doit pas
 * l'etre : une insertion qui echoue a l'interieur annulerait la transaction
 * englobante, ce qui contredirait exactement ce que cette fonction promet.
 */
export async function enregistrerTentativeConnexion(
  tentative: TentativeConnexion,
): Promise<void> {
  try {
    await prisma.journalConnexion.create({
      data: {
        emailTente: tentative.emailTente,
        utilisateurId: tentative.utilisateurId,
        moyen: tentative.moyen,
        issue: tentative.issue,
        adresseIp: tentative.adresseIp,
        agentUtilisateur:
          tentative.agentUtilisateur?.slice(0, LONGUEUR_MAXIMALE_AGENT) ?? null,
      },
    });
  } catch (erreur) {
    // Le contexte ne porte que l'issue et le moyen : `emailTente` serait
    // masque par `journal.ts` de toute facon, la cle contenant « email ».
    journaliserErreur("Ecriture du journal de connexion impossible", erreur, {
      issue: tentative.issue,
      moyen: tentative.moyen,
    });
  }
}

/**
 * Une ligne telle que l'ecran d'administration la consomme.
 *
 * `emailCompte` VIENT DE LA JOINTURE et non de `emailTente` : les deux
 * different quand un compte a change d'adresse, et confondre les deux ferait
 * afficher l'adresse tentee comme si c'etait celle du compte.
 */
export type LigneJournalConnexion = {
  id: string;
  emailTente: string;
  emailCompte: string | null;
  moyen: MoyenConnexion;
  issue: IssueConnexion;
  adresseIp: string | null;
  agentUtilisateur: string | null;
  creeA: Date;
};

/**
 * Nombre de lignes rendues par defaut a l'ecran.
 *
 * BORNE OBLIGATOIRE, meme sur une boutique mono-tenant. La table grossit d'une
 * ligne par tentative, echecs compris : une attaque automatisee en produit des
 * milliers en une nuit, et une page sans limite les chargerait toutes.
 */
export const LIGNES_JOURNAL_PAR_PAGE = 50;

/**
 * Lit les tentatives les plus recentes, pour l'ecran d'administration.
 *
 * CETTE FONCTION N'AUTORISE RIEN, invariant 2. Elle n'accepte aucun
 * identifiant d'utilisateur et ne filtre par personne : l'appelant doit avoir
 * appele `exigerAdministratrice` avant. Un parametre `utilisateurId` ici
 * serait exactement le chemin que l'invariant 2 interdit, et sa seule presence
 * inviterait a le passer depuis une URL.
 *
 * TRI DECROISSANT SERVI PAR `journal_connexion_cree_a_idx`. C'est l'ordre
 * utile : la question posee a cet ecran est « que s'est-il passe recemment ».
 */
export async function lireTentativesRecentes(
  limite: number = LIGNES_JOURNAL_PAR_PAGE,
): Promise<LigneJournalConnexion[]> {
  const lignes = await prisma.journalConnexion.findMany({
    orderBy: { creeA: "desc" },
    take: limite,
    select: {
      id: true,
      emailTente: true,
      moyen: true,
      issue: true,
      adresseIp: true,
      agentUtilisateur: true,
      creeA: true,
      utilisateur: { select: { email: true } },
    },
  });

  return lignes.map(({ utilisateur, ...ligne }) => ({
    ...ligne,
    emailCompte: utilisateur?.email ?? null,
  }));
}

/**
 * Date avant laquelle une ligne doit avoir disparu, regle E14.
 *
 * EXPORTEE POUR LE TEST, qui a besoin d'antidater des lignes de part et
 * d'autre de la limite sans recopier le calcul. Recopier « six mois » dans le
 * test le ferait passer meme si la fonction en appliquait douze.
 *
 * `setUTCMonth` ET NON `setMonth`, invariant 8, et l'ecart est reel et mesure.
 * `setMonth` travaille en heure LOCALE : partant du 11 aout, ou Paris est a
 * UTC+2, il rend le 11 fevrier a UTC+1, decalant la limite d'une heure au
 * passage a l'heure d'hiver. Le premier test ecrit ici l'a attrape. Une heure
 * de derive ne perd rien de grave sur six mois, mais elle rend le calcul
 * dependant du fuseau de la machine : le meme code donnerait un autre resultat
 * sur un serveur en UTC, ce que l'invariant 8 interdit.
 *
 * Le calcul par mois plutot qu'en jours gere les longueurs inegales : six mois
 * avant le 31 aout donne le 28 fevrier, et non une date inexistante. Un
 * `180 * 86400 * 1000` deriverait au fil des annees bissextiles.
 */
export function limiteDeConservation(maintenant: Date = new Date()): Date {
  const limite = new Date(maintenant);
  limite.setUTCMonth(limite.getUTCMonth() - CONSERVATION_JOURNAL_MOIS);
  return limite;
}

/**
 * Supprime les lignes au-dela de la duree de conservation, regle E14.
 *
 * ELLE LEVE, A LA DIFFERENCE DE L'ECRITURE, et la difference est voulue. Une
 * ecriture qui echoue ne doit pas bloquer une connexion en cours ; une purge
 * qui echoue doit se voir, parce que son silence laisserait la boutique
 * conserver des donnees personnelles au-dela de la duree annoncee au registre
 * des traitements. La tache planifiee qui l'appellera, LS-72, traite l'erreur.
 *
 * `deleteMany` ET NON UNE BOUCLE : une seule instruction, servie par
 * `journal_connexion_cree_a_idx`. Le volume attendu se compte en milliers de
 * lignes par an, aucun decoupage par lots n'est justifie ici.
 *
 * COMPARAISON STRICTE `lt` et non `lte` : une ligne ecrite exactement a la
 * limite est conservee. A la frontiere, garder une ligne de trop vaut mieux
 * qu'en supprimer une qui pouvait servir.
 */
export async function purgerJournalConnexion(
  maintenant: Date = new Date(),
): Promise<number> {
  const { count } = await prisma.journalConnexion.deleteMany({
    where: { creeA: { lt: limiteDeConservation(maintenant) } },
  });

  return count;
}
