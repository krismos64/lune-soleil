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
 * Longueur au-dela de laquelle l'adresse tentee est tronquee.
 *
 * MEME RAISONNEMENT QUE POUR L'AGENT, et son absence etait une incoherence :
 * les deux valeurs viennent du meme corps de requete, aucune n'est bornee par
 * Better Auth avant d'arriver ici. Mesure en relecture de LS-80, une adresse de
 * 200 011 caracteres ecrite telle quelle. Avec cinq tentatives par minute et
 * par adresse IP, la table qui concentre les donnees personnelles est aussi
 * celle qui grossit sans borne.
 *
 * 254 EST LA LONGUEUR MAXIMALE D'UNE ADRESSE, RFC 5321 section 4.5.3.1.3 :
 * aucune adresse legitime n'est tronquee.
 */
const LONGUEUR_MAXIMALE_EMAIL = 254;

/**
 * Ce qui remplace une saisie qui n'est manifestement pas une adresse.
 *
 * POURQUOI NE PAS ECRIRE LA VALEUR TELLE QUELLE. L'entete de ce module explique
 * que beaucoup de gens saisissent le mot de passe d'un autre site ; ils le
 * collent aussi dans le mauvais champ. Better Auth refuse alors la requete en
 * 400, mais le hook journalise quand meme, et la chaine finirait en clair dans
 * la table. Le critere 2 vise le champ `password`, ce chemin le contournait par
 * l'autre champ.
 *
 * CE QUE LA RELECTURE PERD : rien d'utile. La question posee a ce journal est
 * « une tentative a-t-elle eu lieu, depuis quelle adresse IP, avec quelle
 * issue », et toutes trois restent ecrites.
 */
export const ADRESSE_INVALIDE = "(adresse invalide)";

/**
 * Ce qui remplace l'adresse quand la tentative n'a jamais ete analysee.
 *
 * Cas d'un refus par limitation de debit : Better Auth rend le 429 avant de
 * lire le corps de la requete, l'adresse tentee n'existe donc nulle part. La
 * distinguer d'`ADRESSE_INVALIDE` importe a la relecture, qui doit pouvoir
 * separer « quelqu'un a saisi n'importe quoi » de « la cadence a ete coupee
 * avant qu'on regarde ».
 */
export const ADRESSE_NON_LUE = "(non lue, refus de cadence)";

/**
 * Ce qui remplace l'adresse quand la requete n'en portait aucune.
 *
 * Distinct des deux precedents : le champ etait absent du corps, plutot que
 * mal rempli ou jamais lu.
 */
export const ADRESSE_ABSENTE = "(inconnu)";

/**
 * Les valeurs que ce module ecrit lui-meme, a laisser passer telles quelles.
 *
 * Aucune ne porte d'arobase : sans cet ensemble, `normaliserEmailTente` les
 * prendrait toutes pour des saisies invalides et les ecraserait, effacant la
 * distinction qu'elles portent.
 */
const MARQUEURS: ReadonlySet<string> = new Set([
  ADRESSE_INVALIDE,
  ADRESSE_NON_LUE,
  ADRESSE_ABSENTE,
]);

/**
 * Normalise l'adresse tentee avant ecriture.
 *
 * LE TEST DE VALIDITE EST VOLONTAIREMENT GROSSIER, la seule presence d'un `@`.
 * Valider finement ici serait un contresens : une adresse malformee est une
 * information vraie sur la tentative, et c'est justement ce qu'un balayage
 * produit. Seul le cas « ce n'est manifestement pas une adresse » est ecarte,
 * parce que c'est celui ou un mot de passe peut se trouver.
 */
/**
 * Ce a quoi une adresse plausible ressemble, grossierement.
 *
 * TROIS CONDITIONS : une partie locale non vide, une arobase unique, un point
 * apres elle, aucune espace nulle part.
 *
 * POURQUOI PAS LA SEULE PRESENCE D'UNE AROBASE, qui etait la premiere version.
 * Les politiques de mot de passe poussent au caractere special, et `@` est
 * l'un des plus choisis : `P@ssw0rd!2026` et `Tr0ub4dor&3@x` traversaient le
 * filtre et finissaient en clair en base. Mesure en relecture de LS-80, sur la
 * vraie route. Le point exige apres l'arobase les ecarte tous les deux.
 *
 * CE QUE CE DURCISSEMENT COUTE : une adresse malformee mais credible,
 * `bob@exemple` sans domaine de premier niveau, devient elle aussi un
 * marqueur. C'est accepte, l'adresse IP et l'issue restant ecrites : la
 * relecture garde de quoi reconnaitre un balayage.
 *
 * CE N'EST PAS UNE VALIDATION D'ADRESSE et ne doit pas le devenir. Le but
 * n'est pas de juger la saisie, c'est d'eviter qu'un secret y passe.
 */
const RESSEMBLE_A_UNE_ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliserEmailTente(brut: string): string {
  // LES MARQUEURS DU MODULE TRAVERSENT SANS ETRE REECRITS. Aucun ne porte
  // d'arobase, donc la regle ci-dessous les remplacerait tous par
  // `ADRESSE_INVALIDE`, ce qui effacerait la distinction qu'ils existent pour
  // porter : « la saisie n'etait pas une adresse » et « la requete a ete
  // refusee avant qu'on la lise » ne disent pas la meme chose a la relecture.
  // Le test du refus de cadence a attrape exactement ce cas.
  if (MARQUEURS.has(brut)) {
    return brut;
  }

  // LA TRONCATURE VIENT APRES LE TEST, ET L'ORDRE COMPTE : une chaine
  // demesuree tronquee a 254 pourrait se mettre a ressembler a une adresse
  // alors que l'originale n'en etait pas une.
  if (!RESSEMBLE_A_UNE_ADRESSE.test(brut)) {
    return ADRESSE_INVALIDE;
  }

  return brut.slice(0, LONGUEUR_MAXIMALE_EMAIL);
}

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
        // Normalise ICI et non chez l'appelant : le service est le dernier
        // point avant la base, et une future tache qui ecrirait une ligne par
        // un autre chemin beneficierait de la meme borne.
        emailTente: normaliserEmailTente(tentative.emailTente),
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
 * LE QUANTIEME EST BORNE A LA MAIN, et sans cela le calcul DEBORDE. `setUTCMonth`
 * ne ramene pas une date impossible au dernier jour du mois, il la reporte sur
 * le mois suivant. Mesure : le 31 aout moins six mois rend le 3 MARS, et le
 * 31 mars rend le 1er OCTOBRE. Quatorze quantiemes par an sont concernes.
 *
 * Le sens de l'erreur etait le mauvais. La limite partait VERS L'AVANT, donc la
 * purge supprimait des lignes de MOINS de six mois, jusqu'a trois jours de trop.
 * Cela contredisait la position prise douze lignes plus bas, « a la frontiere,
 * garder une ligne de trop vaut mieux qu'en supprimer une qui pouvait servir »,
 * qui avait justement motive la comparaison stricte. Trouve en relecture de
 * LS-80 ; le test d'alors ancrait le 11 aout, quantieme qui n'expose jamais le
 * debordement.
 *
 * Le calcul par mois reste preferable a un `180 * 86400 * 1000`, qui deriverait
 * au fil des annees bissextiles.
 */
export function limiteDeConservation(maintenant: Date = new Date()): Date {
  const limite = new Date(maintenant);
  const quantieme = limite.getUTCDate();

  // Se placer au 1er AVANT de reculer : un 31 dans un mois de trente jours
  // deborderait pendant le decalage lui-meme.
  limite.setUTCDate(1);
  limite.setUTCMonth(limite.getUTCMonth() - CONSERVATION_JOURNAL_MOIS);

  // Le jour zero du mois suivant EST le dernier jour du mois courant.
  const dernierJourDuMois = new Date(
    Date.UTC(limite.getUTCFullYear(), limite.getUTCMonth() + 1, 0),
  ).getUTCDate();

  limite.setUTCDate(Math.min(quantieme, dernierJourDuMois));

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
