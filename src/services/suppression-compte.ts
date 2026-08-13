/**
 * Suppression d'un compte client, droit a l'effacement. LS-95, RGPD article 17,
 * regle V15, dixieme transaction critique de `.claude/rules/database.md`.
 *
 * CE QUE CETTE OPERATION EST, ET CE QU'ELLE N'EST PAS. Ce n'est pas un
 * effacement total : c'est une DISSOCIATION. Le droit a l'effacement ne prime
 * pas sur l'obligation comptable, article 17 paragraphe 3 point b, et l'article
 * L123-22 du code de commerce impose dix ans sur les factures et pieces
 * justificatives.
 *
 * Supprimer les commandes d'un client serait une infraction comptable ; ne rien
 * dissocier viderait le droit de son sens. La ligne exacte est donc :
 *
 *   PART           carnet d'adresses, sessions, comptes d'authentification,
 *                  passkeys, et l'enregistrement `Utilisateur` lui-meme
 *   RESTE, ANONYMISE   commandes, factures, avis publies, journaux
 *
 * ORDRE IMPOSE, ET IL NE SE DEVINE PAS. `Commande.dissocieA` se marque AVANT la
 * suppression, jamais apres : `ON DELETE SET NULL` remet `utilisateurId` a nul
 * mais **ne sait pas ecrire un champ**. Une commande dissociee sans ce marquage
 * redevient « sans proprietaire », donc eligible au rattachement du parcours 6 :
 * l'historique et les factures d'un client parti rouvriraient a quiconque
 * controle ensuite la meme adresse email. Marquer apres suppression est
 * impossible, le lien ayant disparu.
 *
 * LE JOURNAL DES CONNEXIONS SURVIT, EN `SET NULL`, et c'est une decision de
 * securite et non un effet de bord. Un intrus qui compromet un compte ne doit
 * pas pouvoir effacer ses traces en supprimant ce compte. Le schema le prevoit
 * deja ; un test le verrouille, critere 6.
 *
 * LA GARDE D'ACTION SENSIBLE VIT ICI, dans `supprimerMonCompte`, et non dans
 * l'adaptateur. Deux raisons :
 *
 *   1. le fichier de garde de `services/` place les decisions de securite dans
 *      cette couche, l'adaptateur d'entree ne decidant de rien
 *   2. une Server Action lit `next/headers`, indisponible hors requete : une
 *      garde posee la n'est exerçable par aucun test d'integration. Elle serait
 *      donc une discipline, pas une propriete mesuree
 *
 * `supprimerCompte` plus bas N'A PAS DE GARDE, volontairement : c'est la
 * primitive, appelee par le point d'entree garde et par personne d'autre. Le
 * controle `verifier-actions-sensibles.sh` s'ancre sur la fonction marquee.
 */
import { Prisma } from "@/generated/prisma/client";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { exigerSession } from "@/services/autorisation";
import { exigerReauthentificationRecente } from "@/services/reauthentification";

/**
 * Ce que la suppression rend a l'appelant.
 *
 * LES COMPTES NE SONT PAS TOUS SUPPRIMABLES. `ReponseAvis.auteurId` est en
 * `RESTRICT` assume : le compte d'administration devient indestructible des sa
 * premiere reponse a un avis, ce qui est voulu et documente dans
 * MODELE-CONCEPTUEL.md. Aucune suppression de compte CLIENT n'est concernee,
 * seule l'administratrice redigeant des reponses.
 *
 * Modeliser ce refus plutot que de le laisser remonter en violation de
 * contrainte donne un message comprehensible a l'ecran, et evite qu'un `catch`
 * trop large le confonde avec une panne.
 */
export type ResultatSuppression =
  | { etat: "SUPPRIME"; commandesDissociees: number }
  | { etat: "COMPTE_INTROUVABLE" }
  | { etat: "REFUSEE_REFERENCE_PROTEGEE" };

/**
 * Supprime un compte et dissocie ce qui doit survivre, en UNE transaction.
 *
 * POURQUOI UNE TRANSACTION. Entre le marquage des commandes et la suppression
 * du compte, une interruption laisserait des commandes marquees `dissocieA`
 * alors que leur proprietaire existe encore : elles deviendraient
 * definitivement non rattachables, regle V15, sans que personne n'ait supprime
 * quoi que ce soit. Le sens de l'echec compte autant que celui du succes.
 *
 * `deleteMany` PLUTOT QUE `delete` sur l'utilisateur : `delete` leve si la
 * ligne n'existe pas, ce qui obligerait a distinguer « deja supprime » d'une
 * panne. Le compte rendu suffit a le dire.
 */
export async function supprimerCompte(
  utilisateurId: string,
  maintenant: Date = new Date(),
): Promise<ResultatSuppression> {
  try {
    return await prisma.$transaction(async (tx) => {
      const existe = await tx.utilisateur.findUnique({
        where: { id: utilisateurId },
        select: { id: true },
      });

      if (!existe) {
        // AUCUNE EXCEPTION : un compte deja supprime n'est pas un incident.
        // Le refus sort par une valeur, ce qui laisse la transaction se
        // valider sans rien avoir ecrit.
        return { etat: "COMPTE_INTROUVABLE" as const };
      }

      /**
       * LE MARQUAGE VIENT EN PREMIER, voir l'entete. Le filtre `dissocieA:
       * null` evite de reecrire l'horodatage d'une commande deja dissociee :
       * la date doit dire QUAND le compte a ete supprime, et une commande ne
       * peut l'etre qu'une fois.
       */
      const { count } = await tx.commande.updateMany({
        where: { utilisateurId, dissocieA: null },
        data: { dissocieA: maintenant },
      });

      /**
       * PUIS LA SUPPRESSION, qui declenche les onze autres politiques de cle
       * etrangere : quatre `CASCADE`, carnet d'adresses, sessions, comptes
       * d'authentification et passkeys ; sept `SET NULL`, dont le journal des
       * connexions qui doit survivre.
       *
       * Le compte exact est verifie par un test qui interroge le schema, et
       * non recopie ici : une reference ajoutee plus tard sans politique
       * explicite bloquerait la suppression en `RESTRICT` par defaut.
       */
      await tx.utilisateur.deleteMany({ where: { id: utilisateurId } });

      return { etat: "SUPPRIME" as const, commandesDissociees: count };
    });
  } catch (erreur) {
    /**
     * `P2003` EST LA VIOLATION DE CLE ETRANGERE, le cas du `RESTRICT` de
     * `ReponseAvis`. Tout le reste est une panne et se propage : confondre les
     * deux ferait afficher « suppression impossible » a une exploitante dont
     * la base est simplement injoignable, et elle recommencerait sans
     * comprendre.
     */
    if (
      erreur instanceof Prisma.PrismaClientKnownRequestError &&
      erreur.code === "P2003"
    ) {
      journaliser("warn", "Suppression de compte refusee, reference protegee", {
        code: erreur.code,
      });
      return { etat: "REFUSEE_REFERENCE_PROTEGEE" };
    }

    throw erreur;
  }
}

/**
 * Supprime le compte de la personne connectee, apres avoir exige une preuve
 * d'identite recente.
 *
 * LE POINT D'ENTREE GARDE, et le seul que l'interface doit appeler. Il compose
 * trois choses dans cet ordre, qui ne se permute pas :
 *
 *   1. `exigerSession`, QUI agit. Elle rend `null` plutot que de lever, malgre
 *      son nom : c'est documente dans `autorisation.ts`
 *   2. `exigerReauthentificationRecente`, que c'est bien cette personne
 *      MAINTENANT. Sans elle, une session ouverte suffirait, et le scenario que
 *      vise ADR-027 est precisement l'ordinateur laisse ouvert
 *   3. la suppression elle-meme
 *
 * FAMILLE `IDENTIFIANTS`, ET NON UNE CINQUIEME FAMILLE. Le ticket laissait le
 * choix. Elle est definie comme « changer le mot de passe ou la passkey : ce
 * qu'un intrus fait en premier », et supprimer le compte emporte l'ensemble des
 * moyens d'authentification, `Compte` et `Passkey` en `CASCADE`. Creer une
 * famille pour une seule action se paierait en saisies quotidiennes sans rien
 * proteger de plus, le type etant « volontairement court », critere 6 de LS-81.
 *
 * IL NE PREND AUCUN IDENTIFIANT DE COMPTE, invariant 2 : le compte supprime est
 * celui de la SESSION, jamais celui qu'on demande. Une signature qui accepterait
 * un `utilisateurId` ouvrirait la suppression du compte d'autrui a qui devine un
 * identifiant.
 */
export type ResultatSuppressionGardee =
  ResultatSuppression | { etat: "SESSION_ABSENTE" };

/** @sensible IDENTIFIANTS */
export async function supprimerMonCompte(
  enTetes: Headers,
): Promise<ResultatSuppressionGardee> {
  const identite = await exigerSession(enTetes);

  if (!identite) {
    return { etat: "SESSION_ABSENTE" };
  }

  // LEVE `ReauthentificationRequiseError` quand la preuve manque ou depasse
  // quinze minutes. L'adaptateur la traduit, il ne la rattrape pas ici : une
  // exception avalee au milieu d'un service masquerait la garde.
  await exigerReauthentificationRecente(enTetes, "IDENTIFIANTS");

  return supprimerCompte(identite.utilisateurId);
}

/**
 * Les donnees d'un compte, pour repondre a une demande d'acces. Articles 15
 * et 20, critere 4.
 *
 * FORMAT LISIBLE ET REUTILISABLE, ce qu'exige l'article 20 : du JSON, structure
 * par traitement du registre plutot qu'a plat, pour que la personne comprenne
 * CE QUI est traite et POURQUOI, et non seulement quelles valeurs existent.
 *
 * CE QUE CET EXPORT NE CONTIENT JAMAIS : l'empreinte du mot de passe ni la cle
 * publique d'une passkey. Ni l'une ni l'autre n'est une donnee que la personne
 * peut reutiliser, article 20, et l'empreinte est un secret au sens de
 * l'invariant 9. Leur EXISTENCE est rapportee, jamais leur valeur.
 *
 * IL N'EST PAS DECLENCHE PAR UN ECRAN AUJOURD'HUI. Le ticket l'admet : « meme
 * si l'export est declenche a la main par l'exploitante ». La procedure est
 * ecrite dans `docs/PROCEDURE-DROITS-DES-PERSONNES.md`, et cette fonction est
 * ce qu'elle appelle. Une demande d'acces se traite en un mois, article 12
 * paragraphe 3 : un traitement manuel tient ce delai sans difficulte.
 */
export type ExportDonneesPersonnelles = {
  genereLe: string;
  compte: {
    email: string;
    nom: string | null;
    emailVerifie: boolean;
    creeA: string;
    aUnMotDePasse: boolean;
    nombreDePasskeys: number;
  };
  adresses: unknown[];
  commandes: unknown[];
  avis: unknown[];
  connexions: unknown[];
};

export async function exporterDonneesPersonnelles(
  utilisateurId: string,
  maintenant: Date = new Date(),
): Promise<ExportDonneesPersonnelles | null> {
  const utilisateur = await prisma.utilisateur.findUnique({
    where: { id: utilisateurId },
    select: {
      email: true,
      nom: true,
      emailVerifie: true,
      creeA: true,
      // LES VALEURS NE SORTENT PAS, seul leur nombre : `_count` compte sans
      // jamais charger l'empreinte ni la cle publique.
      _count: { select: { comptes: true, passkeys: true } },
    },
  });

  if (!utilisateur) {
    return null;
  }

  const [adresses, commandes, avis, connexions] = await Promise.all([
    prisma.adresseCarnet.findMany({ where: { utilisateurId } }),
    prisma.commande.findMany({
      where: { utilisateurId },
      // L'INSTANTANE LEGAL DE LA COMMANDE EST INCLUS : c'est bien une donnee
      // personnelle de la personne, adresses figees comprises, et elle a le
      // droit d'en recevoir copie meme si le document ne s'efface pas.
      include: { lignes: true },
    }),
    prisma.avis.findMany({ where: { utilisateurId } }),
    prisma.journalConnexion.findMany({
      where: { utilisateurId },
      orderBy: { creeA: "desc" },
    }),
  ]);

  return {
    genereLe: maintenant.toISOString(),
    compte: {
      email: utilisateur.email,
      nom: utilisateur.nom,
      emailVerifie: utilisateur.emailVerifie,
      creeA: utilisateur.creeA.toISOString(),
      aUnMotDePasse: utilisateur._count.comptes > 0,
      nombreDePasskeys: utilisateur._count.passkeys,
    },
    adresses,
    commandes,
    avis,
    connexions,
  };
}
