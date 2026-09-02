/**
 * Cas d'usage de l'envoi d'email, ADR-033. LS-51 et LS-82.
 *
 * DEUX CHEMINS, ET LE PARTAGE EST LA DECISION D'ADR-033 :
 *
 *   `deposerEnvoi`      ce qui decoule d'une transaction metier. L'intention
 *                       s'ecrit AVEC l'effet, la tache l'expedie ensuite
 *   `envoyerDirect`     ce qu'une personne attend a l'ecran, verification
 *                       d'adresse et reinitialisation de mot de passe
 *
 * Un client qui vient de payer accepte d'attendre une minute sa confirmation.
 * Quelqu'un qui a clique sur « mot de passe oublie » regarde sa boite tout de
 * suite : passer ce message par l'outbox le ferait paraitre casse.
 *
 * CES DEUX MESSAGES NE PORTENT AUCUNE COMMANDE, donc aucune ligne
 * `JournalEmail` ne les couvre et la quatrieme cle d'idempotence ne s'y applique
 * pas. Le doublon n'y est de toute facon pas le risque : deux liens de
 * reinitialisation valides valent mieux qu'aucun.
 */
import { Prisma, StatutEmail } from "@/generated/prisma/client";
import {
  FournisseurEmailIndisponibleError,
  type EnvoyeurEmail,
  type MessageEmail,
  type ModeleEmail,
} from "@/integrations/email";
import { estReessayable, motifSansSecret } from "@/integrations/email/smtp";
import { journaliser, journaliserErreur } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import {
  envoisBloques,
  marquerEchoue,
  marquerEnvoye,
  prendreEnvoisAExpedier,
  type EnvoiPris,
} from "@/repositories/envoi-email";

/**
 * Combien de messages une execution traite au plus.
 *
 * CE PLAFOND PROTEGE LE QUOTA DE L'OFFRE MX PLAN, environ 200 messages par
 * heure, chiffre releve a la documentation OVHcloud et trace dans ADR-008. A
 * raison d'un cycle par minute, vingt messages par cycle plafonnent a 1 200 par
 * heure : au-dessus du quota, donc le plafond ne protege rien a lui seul, mais
 * il borne la duree d'un cycle et evite qu'un arriere accumule ne parte d'un
 * coup. Le volume attendu, quelques dizaines de commandes par mois, reste deux
 * ordres de grandeur en dessous.
 */
const LOT = 20;

/**
 * Nombre d'appels SMTP par ligne avant abandon.
 *
 * TROIS ET NON UNE BOUCLE INFINIE. Une adresse durablement injoignable serait
 * reprise a chaque cycle, indefiniment, et consommerait le quota au detriment
 * des envois legitimes. Apres trois echecs, la ligne reste `ECHOUE` sans etre
 * reprise, et le renvoi manuel de la regle E6 reste ouvert.
 */
const TENTATIVES_MAX = 3;

/**
 * Au-dela de ce delai, une ligne `ENVOI_EN_COURS` est declaree bloquee.
 *
 * DIX MINUTES POUR UN APPEL QUI DURE QUELQUES SECONDES, deux ordres de grandeur
 * de marge, meme raisonnement que les durees de verrou de LS-72. Trop court,
 * l'alerte se declencherait sur un serveur simplement lent ; trop long, une
 * confirmation resterait invisible une demi-journee.
 */
const DELAI_GARDE_SECONDES = 600;

/** Client principal ou client transactionnel remis par `$transaction`. */
type ClientBase = Prisma.TransactionClient;

/**
 * Ecrit l'intention d'envoi. A APPELER DANS LA TRANSACTION METIER.
 *
 * C'EST TOUT LE MECANISME D'ADR-033 : l'intention et l'effet metier partagent
 * la transaction, donc les deux existent ou aucun des deux. Appeler cette
 * fonction avec le client principal depuis une transaction ouverte ailleurs
 * casserait la garantie sans rien signaler, d'ou le parametre explicite.
 *
 * ELLE NE LEVE PAS SUR UN DOUBLON, et cette exception au comportement habituel
 * est deliberee. `envoi_en_attente_actif_unique` refuse une seconde intention
 * pour la meme commande et le meme modele : ce refus signifie « l'email est
 * deja prevu », ce qui est le resultat voulu. Laisser remonter `P2002`
 * annulerait la transaction ENTIERE, donc la confirmation de commande, pour un
 * email en double. Une commande payee non confirmee est bien plus grave qu'un
 * email non envoye, regle E4.
 *
 * `commandeId` EST NULLABLE DEPUIS LS-97, et cet elargissement change le
 * comportement de la cle d'unicite plutot que de l'affaiblir. Un message de
 * contact ne decoule d'AUCUNE commande : le formulaire est public, personne
 * n'est connecte.
 *
 * PostgreSQL TRAITE LES `NULL` COMME DISTINCTS dans un index unique, donc deux
 * notifications de contact ne se refusent JAMAIS l'une l'autre, quel que soit
 * leur modele. C'est le comportement voulu ici et l'inverse de celui des
 * commandes : deux personnes ecrivant a une minute d'intervalle doivent produire
 * deux notifications, la ou deux confirmations de la MEME commande n'en
 * produisent qu'une.
 *
 * L'idempotence du contact ne repose donc pas sur cette cle, mais sur le fait
 * qu'un message est un evenement neuf a chaque envoi. Le double clic est borne
 * par la limitation de debit, pas par l'unicite.
 */
export async function deposerEnvoi(
  transaction: ClientBase,
  intention: {
    commandeId: string | null;
    destinataire: string;
    modele: ModeleEmail;
    variables: Record<string, string>;
    origine: "SYSTEME" | "RECONCILIATION" | "ADMIN";
  },
): Promise<void> {
  try {
    await transaction.envoiEnAttente.create({
      data: {
        commandeId: intention.commandeId,
        destinataire: intention.destinataire,
        modele: intention.modele,
        variables: intention.variables,
        origine: intention.origine,
      },
    });
  } catch (erreur) {
    const estDoublon =
      erreur instanceof Prisma.PrismaClientKnownRequestError &&
      erreur.code === "P2002";

    if (!estDoublon) {
      throw erreur;
    }

    journaliser("info", "intention d'envoi deja presente, ignoree", {
      modele: intention.modele,
    });
  }
}

/** Ce qu'un cycle d'expedition rend a l'appelant. */
export type ResultatExpedition = {
  envoyes: number;
  echoues: number;
  bloques: number;
};

/**
 * Expedie les messages en attente. Corps de la tache planifiee.
 *
 * L'ORDRE DES QUATRE TEMPS EST LE MECANISME, et aucun ne se deplace :
 *
 *   1. prendre et marquer `ENVOI_EN_COURS`, dans SA PROPRE transaction
 *   2. COMMIT, donc la marque est durable avant tout appel reseau
 *   3. appeler le serveur SMTP
 *   4. ecrire le resultat, trace et statut ensemble
 *
 * MARQUER APRES L'APPEL REPRODUIRAIT LE DEFAUT QU'ADR-033 FERME, deplace de
 * quelques lignes : une panne entre l'envoi et le marquage laisserait la ligne
 * reprenable, et le client recevrait deux messages.
 *
 * L'APPEL SMTP N'EST PAS DANS UNE TRANSACTION, jamais. Une transaction ouverte
 * pendant un appel reseau tient un verrou le temps du reseau, ce qui est le
 * defaut releve en LS-118 : la transaction s'ouvre APRES, pour ecrire le
 * resultat.
 *
 * ELLE NE LEVE PAS. Une tache planifiee n'a personne devant elle, et l'echec
 * d'UN message ne doit pas priver les dix-neuf autres de leur envoi.
 */
export async function expedierEnvoisEnAttente(
  envoyeur: EnvoyeurEmail,
  client: typeof prisma = prisma,
): Promise<ResultatExpedition> {
  const pris = await client.$transaction((transaction) =>
    prendreEnvoisAExpedier(transaction, LOT, TENTATIVES_MAX),
  );

  let envoyes = 0;
  let echoues = 0;

  for (const envoi of pris) {
    const parti = await expedierUn(envoyeur, client, envoi);

    if (parti) {
      envoyes += 1;
    } else {
      echoues += 1;
    }
  }

  const bloques = await signalerEnvoisBloques(client);

  return { envoyes, echoues, bloques };
}

/**
 * Un message : appel, puis ecriture du resultat.
 *
 * LA TRACE ET LE STATUT S'ECRIVENT DANS UNE MEME TRANSACTION. Les separer
 * laisserait un etat ou la ligne dit `ENVOYE` sans trace, ou l'inverse, et
 * c'est precisement la divergence que cette story existe pour supprimer.
 *
 * L'ECHEC D'ECRITURE DE LA TRACE NE PROPAGE PAS, critere 3 de LS-82 : une base
 * momentanement indisponible ne doit pas faire echouer la tache entiere. La
 * ligne reste `ENVOI_EN_COURS` et sortira par l'alerte, ce qui est le
 * comportement sur : ne rien reenvoyer sur lequel on a un doute.
 */
async function expedierUn(
  envoyeur: EnvoyeurEmail,
  client: typeof prisma,
  envoi: EnvoiPris,
): Promise<boolean> {
  const message: MessageEmail = {
    destinataire: envoi.destinataire,
    modele: envoi.modele as ModeleEmail,
    variables: envoi.variables,
  };

  let erreurEnvoi: unknown = null;

  try {
    await envoyeur.envoyer(message);
  } catch (erreur) {
    erreurEnvoi = erreur;
  }

  try {
    await client.$transaction(async (transaction) => {
      if (erreurEnvoi === null) {
        await marquerEnvoye(transaction, envoi.id);
        await ecrireTrace(transaction, envoi, StatutEmail.ENVOYE, null);
        return;
      }

      const cause =
        erreurEnvoi instanceof FournisseurEmailIndisponibleError
          ? erreurEnvoi.cause
          : erreurEnvoi;
      const motif = motifSansSecret(cause);

      // UNE ERREUR DEFINITIVE EPUISE LES TENTATIVES D'UN COUP, critere 4 de
      // LS-82 : un mot de passe faux le restera au troisieme essai, et chaque
      // reprise entame le quota horaire de l'offre. `tentatives` monte donc au
      // plafond, ce qui rend la ligne non reprenable sans changer son statut.
      const definitive = !estReessayable(cause);

      await marquerEchoue(
        transaction,
        envoi.id,
        motif,
        definitive ? { epuiserTentatives: TENTATIVES_MAX } : {},
      );

      await ecrireTrace(transaction, envoi, StatutEmail.ECHOUE, motif);
    });
  } catch (erreur) {
    journaliserErreur("Ecriture du resultat d'envoi impossible", erreur, {
      modele: envoi.modele,
    });
  }

  return erreurEnvoi === null;
}

/**
 * Ecrit la trace metier, `JournalEmail`.
 *
 * ELLE NE PORTE PAS `origine` DEPUIS L'OUTBOX PAR HASARD : c'est cette colonne
 * qui alimente le filtre de `journal_email_systeme_unique`, et donc la
 * quatrieme cle d'idempotence. La recopier depuis la ligne d'outbox garde le
 * chemin d'entree reel, `SYSTEME` ou `RECONCILIATION`, ce que la decision D
 * existe pour distinguer.
 *
 * LE DOUBLON EST ABSORBE, pas propage. Si la cle refuse la ligne, c'est que le
 * meme email est deja parti : l'information utile est deja en base et lever
 * annulerait aussi le changement de statut de l'outbox, remettant la ligne en
 * etat reprenable. La boucle serait alors sans fin.
 */
async function ecrireTrace(
  transaction: ClientBase,
  envoi: EnvoiPris,
  statut: StatutEmail,
  motif: string | null,
): Promise<void> {
  const ligne = await transaction.envoiEnAttente.findUnique({
    where: { id: envoi.id },
    select: { origine: true },
  });

  if (ligne === null) {
    return;
  }

  await transaction.journalEmail.create({
    data: {
      commandeId: envoi.commandeId,
      destinataire: envoi.destinataire,
      modele: envoi.modele,
      statut,
      origine: ligne.origine,
      motifEchec: motif,
    },
  });
}

/**
 * Leve une alerte par ligne bloquee au-dela du delai de garde.
 *
 * POURQUOI UNE ALERTE ET NON UNE REPRISE. Une ligne restee `ENVOI_EN_COURS`
 * signifie que le processus est tombe pendant l'appel : personne ne sait si le
 * message est parti. La rejouer risquerait le doublon qu'ADR-033 ferme,
 * l'abandonner risquerait le silence. ADR-033 refuse de trancher a la place de
 * l'administratrice, qui dispose du renvoi manuel, regle E6.
 *
 * L'ALERTE EST IDEMPOTENTE PAR SON TYPE ET SA CIBLE : `leverAlerteCritique` de
 * LS-119 refuse un doublon sur la meme cible non acquittee, donc un cycle par
 * minute ne produit pas une alerte par minute.
 */
async function signalerEnvoisBloques(client: typeof prisma): Promise<number> {
  const bloques = await envoisBloques(client, DELAI_GARDE_SECONDES);

  for (const envoi of bloques) {
    try {
      await client.alerteCritique.create({
        data: {
          type: "ENVOI_EMAIL_BLOQUE",
          message:
            `Envoi ${envoi.modele} bloque depuis plus de ` +
            `${DELAI_GARDE_SECONDES / 60} minutes. Le message est peut-etre ` +
            `parti : verifier avant tout renvoi manuel.`,
          gravite: "AVERTISSEMENT",
          typeCible: "EnvoiEnAttente",
          idCible: envoi.id,
        },
      });
    } catch (erreur) {
      // Une alerte deja levee sur la meme cible : rien a signaler de plus.
      journaliser("info", "alerte d'envoi bloque deja presente", {
        modele: envoi.modele,
      });
      void erreur;
    }
  }

  return bloques.length;
}

/**
 * Envoi immediat, hors outbox. Verification d'adresse et mot de passe oublie.
 *
 * ELLE NE LEVE JAMAIS, et c'est la regle E4 appliquee a l'authentification :
 * une panne du serveur d'email ne doit pas faire echouer une inscription ni une
 * connexion. L'appelant, `lib/auth.ts`, n'a rien a rattraper.
 *
 * ELLE ECRIT LA TRACE SANS COMMANDE. `commandeId` reste nul, ces messages
 * n'etant lies a aucun achat : la cle d'idempotence, ancree sur la commande, ne
 * s'y applique donc pas, et c'est correct. Deux liens de reinitialisation
 * valides sont sans consequence, contrairement a deux confirmations de commande.
 */
export async function envoyerDirect(
  envoyeur: EnvoyeurEmail,
  message: MessageEmail,
  client: typeof prisma = prisma,
): Promise<void> {
  let motif: string | null = null;

  try {
    await envoyeur.envoyer(message);
  } catch (erreur) {
    const cause =
      erreur instanceof FournisseurEmailIndisponibleError
        ? erreur.cause
        : erreur;
    motif = motifSansSecret(cause);

    journaliserErreur("Envoi direct en echec", erreur, {
      modele: message.modele,
    });
  }

  try {
    await client.journalEmail.create({
      data: {
        destinataire: message.destinataire,
        modele: message.modele,
        statut: motif === null ? StatutEmail.ENVOYE : StatutEmail.ECHOUE,
        origine: "SYSTEME",
        motifEchec: motif,
      },
    });
  } catch (erreur) {
    // CRITERE 3 DE LS-82 : la trace qui ne s'ecrit pas degrade le diagnostic,
    // elle ne ferme pas la porte a l'utilisateur. Meme principe que la regle
    // E15 pour le journal de connexions.
    journaliserErreur("Trace d'envoi direct impossible", erreur, {
      modele: message.modele,
    });
  }
}
