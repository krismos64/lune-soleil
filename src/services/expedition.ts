/**
 * Expedition d'une commande, LS-130. Etape 11 du parcours 1.
 *
 * CE QUE CE SERVICE PORTE : la declaration par l'exploitante qu'un colis est
 * parti. Il ecrit l'expedition, horodate `expedieA` et fait avancer la commande,
 * les trois dans UNE transaction.
 *
 * LES DEUX MODES SONT DEUX FAITS DISTINCTS, ADR-025 et `PARCOURS.md`.
 * `Commande.modeLivraison` est ce que le client a choisi et paye ;
 * `Expedition.mode` est ce que le transporteur a execute. Un echec de livraison
 * a domicile rebascule vers un Point Relais change le second et JAMAIS le
 * premier : reecrire la commande ferait mentir la facture sur ce qui a ete
 * vendu.
 *
 * `livreA` N'EST ATTEIGNABLE PAR AUCUN CHEMIN D'ICI, et c'est une regle et non
 * un oubli. Cette date fait courir le delai de retractation, `legal.md` : elle
 * vient du suivi automatique de LS-131, et l'inventer d'un clic la ferait partir
 * d'une date fausse. Meme motif que `LIVREE`, ecarte des transitions manuelles
 * par LS-121.
 *
 * LA TRANSITION DE STATUT N'EST PAS REECRITE ICI : ce service consulte
 * `TRANSITIONS_ADMINISTRATRICE`, seule source de ce qui est permis. Une seconde
 * liste divergerait de la premiere, et l'ecran afficherait alors un bouton que
 * le service refuse, ou l'inverse.
 */
import { Prisma } from "@/generated/prisma/client";
import type { StatutCommande } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  EntreeInvalideError,
  schemaIdentifiant,
  schemaSaisieExpedition,
  valider,
} from "@/lib/validation";
import { historiserTransition } from "@/repositories/confirmation";
import {
  creerExpedition,
  lireCommandeAEtiqueter,
  lireExpeditionDeCommande,
  listerAExpedier,
  type CommandeAExpedier,
  type ExpeditionDeclaree,
  type SaisieExpedition,
} from "@/repositories/expedition";
import { TRANSITIONS_ADMINISTRATRICE } from "@/services/administration-commandes";
import { TransporteurIndisponibleError } from "@/integrations/sendcloud/index";
import type { ClientExpedition } from "@/integrations/sendcloud/expedition";
import { methodeExigePointRetrait } from "@/integrations/sendcloud/methodes";
import { journaliser, journaliserErreur } from "@/lib/journal";
import { LIBELLES_LIVRAISON } from "@/lib/affichage-commande";
import { deposerEnvoi } from "@/services/envoi-email";

export type { CommandeAExpedier, ExpeditionDeclaree, SaisieExpedition };

/** Ce qu'une declaration d'expedition rend. L'ecran choisit les mots. */
export type IssueExpedition =
  | { statut: "EXPEDIEE" }
  /** Aucune commande sous cet identifiant. */
  | { statut: "INTROUVABLE" }
  /**
   * La commande n'est pas dans un etat d'ou l'on expedie.
   *
   * ELLE PORTE L'ETAT REEL, pour que l'ecran puisse dire « elle est deja
   * expediee » plutot qu'un refus opaque : entre l'affichage et le clic, un
   * autre onglet a pu faire avancer la commande.
   */
  | { statut: "STATUT_INCOMPATIBLE"; statutActuel: StatutCommande }
  /** Cette commande porte deja une expedition, `commande_id` etant unique. */
  | { statut: "DEJA_EXPEDIEE" }
  /** Saisie refusee, le message dit lequel des champs. */
  | { statut: "INVALIDE"; message: string };

/**
 * Nombre de colis affiches dans la file de preparation.
 *
 * EXPORTE DEPUIS LS-163, l'ecran devant nommer le plafond qu'il annonce plutot
 * que d'ecrire « 100 » en dur, ce qui en ferait une seconde source de verite.
 */
export const LIMITE_LISTE = 100;

/**
 * Les commandes en attente de depart.
 *
 * ELLE NE LIT QUE `EN_PREPARATION`, seul etat d'ou une expedition peut naitre.
 * Y melanger les commandes confirmees ferait preparer un colis avant que
 * l'exploitante ait declare s'en occuper, et la file cesserait de dire ce qui
 * reste a faire.
 */
export type FileExpedition = {
  commandes: CommandeAExpedier[];
  /** Vrai si des colis existent au-dela de la limite affichee, LS-163. */
  tronquee: boolean;
};

export async function listerCommandesAExpedier(
  client: typeof prisma = prisma,
): Promise<FileExpedition> {
  /*
   * LA LECTURE PORTE SUR `limite + 1`, LS-163 : une ligne de plus que ce qui
   * sera rendu suffit a savoir qu'il en existe d'autres, sans compter la table.
   *
   * AUCUN FILTRE N'EST AJOUTE ICI, contrairement a l'ecran des messages, et
   * c'est un choix mesure : cette file ne lit QUE `EN_PREPARATION`, elle est
   * donc deja filtree par nature. Un filtre de plus ne revelerait rien que le
   * plafond cache, tous les colis affiches partageant le meme statut. Le
   * signalement suffit a tenir le critere 1 ; le critere 2 est tenu par le
   * traitement lui-meme, un colis expedie quittant la file et laissant remonter
   * le suivant.
   */
  const lues = await listerAExpedier(client, LIMITE_LISTE + 1);

  return {
    commandes: lues.slice(0, LIMITE_LISTE),
    tronquee: lues.length > LIMITE_LISTE,
  };
}

/** Relit l'expedition d'une commande, `null` tant qu'aucune n'existe. */
export async function lireExpedition(
  commandeId: string,
  client: typeof prisma = prisma,
): Promise<ExpeditionDeclaree | null> {
  const identifiant = valider(schemaIdentifiant, commandeId);

  return lireExpeditionDeCommande(client, identifiant);
}

/**
 * Declare qu'un colis est parti, sur geste de l'exploitante.
 *
 * `acteurId` VIENT DE LA SESSION, jamais d'un parametre d'interface,
 * invariant 2 : l'appelant a deja etabli l'identite par `exigerRole`.
 *
 * L'ECRITURE ET LA TRANSITION SONT DANS LA MEME TRANSACTION, et c'est ce qui
 * empeche l'etat le plus penible : une expedition ecrite sur une commande
 * restee « en preparation », ou l'inverse, une commande annoncee expediee sans
 * qu'aucun numero de suivi n'existe. Une panne entre les deux ecritures
 * laisserait sinon l'un des deux faits sans l'autre.
 *
 * LE STATUT DE PAIEMENT N'EST PAS TOUCHE, axes distincts de `payments.md` :
 * expedier ne dit rien de l'encaissement, qui a eu lieu bien avant.
 */
export async function declarerExpedition({
  commandeId,
  saisie,
  acteurId,
  identifiantColis = null,
  client = prisma,
}: {
  commandeId: string;
  saisie: unknown;
  acteurId: string;
  /**
   * L'identifiant du colis chez le transporteur, LS-218.
   *
   * IL EST HORS DE `saisie`, ET CE N'EST PAS UN DETAIL DE SIGNATURE.
   * `schemaSaisieExpedition` est un `strictObject` qui refuse tout champ
   * inconnu, a juste titre : `saisie` porte ce qu'une PERSONNE a tape, et cette
   * valeur-la vient du transporteur. L'y glisser faisait echouer la validation
   * en « 1 champ non reconnu », que le service traduisait en
   * `ADRESSE_INEXPLOITABLE` : un message faux sur une adresse parfaite, mesure
   * le 10 septembre 2026.
   *
   * NUL SUR UNE DECLARATION MANUELLE, ce qui distingue les deux chemins : un
   * colis remis en main propre n'a aucune etiquette a relire.
   */
  identifiantColis?: number | null;
  client?: typeof prisma;
}): Promise<IssueExpedition> {
  /*
   * L'IDENTIFIANT EST VALIDE AVANT TOUT, et il LEVE plutot que de rendre un
   * refus : un identifiant difforme ne vient pas d'une exploitante qui se
   * trompe de champ, il vient d'un appel forge. L'adaptateur le traduit.
   */
  const identifiant = valider(schemaIdentifiant, commandeId);

  /*
   * LA SAISIE, ELLE, REND UN REFUS PORTEUR DE SON MESSAGE. Un mode de retrait
   * sans point est une erreur que l'exploitante peut corriger a l'ecran, pas
   * une panne : lui rendre une exception l'obligerait a deviner.
   */
  let saisieValidee: SaisieExpedition;

  try {
    const brute = valider(schemaSaisieExpedition, saisie);

    saisieValidee = {
      ...brute,
      /*
       * UN NUMERO SANS AUCUNE LETTRE NI CHIFFRE DEVIENT NUL, jamais une chaine
       * vide ni une chaine invisible. Les trois se ressemblent a l'ecran et se
       * distinguent en base : une valeur non nulle ferait croire a un numero
       * connu, et LS-131 construirait une URL de suivi sur du vide.
       *
       * `trim()` NE SUFFIT PAS, ET C'EST MESURE. Il ne retire ni l'espace sans
       * chasse U+200B ni ses voisins, qui traversent donc la validation Zod et
       * se persistent : `"\u200B".trim() === ""` vaut FAUX. Un copier-coller
       * depuis l'interface d'un transporteur ramene couramment ce caractere, et
       * l'exploitante croit alors avoir laisse le champ vide.
       *
       * LE MEME PREDICAT QUE `champAdresse`, deliberement : il porte deja ce
       * `refine` depuis le defaut mesure le 25 aout 2026 sur `nomClient`.
       * `numeroSuivi` ne peut pas l'employer directement, etant facultatif, donc
       * la regle est appliquee ici plutot que recopiee dans le schema.
       */
      numeroSuivi:
        brute.numeroSuivi === null || !/[\p{L}\p{N}]/u.test(brute.numeroSuivi)
          ? null
          : brute.numeroSuivi,
    };
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE", message: erreur.message };
    }
    throw erreur;
  }

  try {
    return await client.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        /*
         * L'ADRESSE ET LE MODE SONT LUS ICI POUR L'EMAIL D'EXPEDITION, LS-29,
         * F-MAIL-03.
         *
         * `emailNormalise` VIENT DE LA COMMANDE ET NON DU COMPTE : une commande
         * passee sans compte n'a pas d'utilisateur rattache, et le client doit
         * etre prevenu dans les deux cas. C'est aussi l'adresse figee a l'achat,
         * invariant 3, donc celle a laquelle la personne attend son colis.
         */
        const commande = await transaction.commande.findUnique({
          where: { id: identifiant },
          select: {
            statut: true,
            emailNormalise: true,
            modeLivraison: true,
          },
        });

        if (commande === null) {
          return { statut: "INTROUVABLE" as const };
        }

        /*
         * LA TABLE DE LS-121 DECIDE, PAS UNE LISTE LOCALE. `EXPEDIEE` n'y est
         * atteignable que depuis `EN_PREPARATION` : une commande non payee ou
         * deja partie est donc refusee par la meme source que celle qui
         * gouverne les boutons de l'ecran de detail.
         */
        const permises: readonly StatutCommande[] =
          TRANSITIONS_ADMINISTRATRICE[commande.statut];

        if (!permises.includes("EXPEDIEE")) {
          return {
            statut: "STATUT_INCOMPATIBLE" as const,
            statutActuel: commande.statut,
          };
        }

        /*
         * L'EXPEDITION EST ECRITE AVANT LA TRANSITION, et l'ordre compte : c'est
         * elle qui porte l'unicite. Si une seconde declaration concurrente
         * arrive, `P2002` leve ICI, avant que le statut ne bouge, et la
         * transaction entiere est annulee.
         */
        await creerExpedition(transaction, {
          commandeId: identifiant,
          saisie: { ...saisieValidee, identifiantColis },
        });

        /*
         * L'ECRITURE PORTE LE STATUT DE DEPART DANS SON `WHERE`, meme motif que
         * `changerStatutCommande` : entre la lecture et l'ecriture, une tache
         * peut avoir fait avancer la commande, et appliquer alors une transition
         * calculee sur un etat perime la ferait reculer.
         */
        const { count } = await transaction.commande.updateMany({
          where: { id: identifiant, statut: commande.statut },
          data: { statut: "EXPEDIEE" },
        });

        if (count === 0) {
          /*
           * LA COMMANDE A BOUGE ENTRE LA LECTURE ET L'ECRITURE. Lever annule la
           * transaction, donc l'expedition ecrite juste au-dessus : sans cela
           * un colis serait declare parti sur une commande annulee entre-temps.
           */
          throw new CommandeDeplaceeError();
        }

        /*
         * L'HISTORISATION EST DANS LA MEME TRANSACTION, regle S9. `origine:
         * ADMIN` et un acteur nomme, la ou les chemins automatiques ecrivent
         * `SYSTEME` : c'est cette distinction qui permet de savoir, six mois
         * plus tard, si un colis a ete declare parti par une personne.
         */
        await historiserTransition(transaction, {
          commandeId: identifiant,
          statutPrecedent: commande.statut,
          statutNouveau: "EXPEDIEE",
          origine: "ADMIN",
          acteurId,
        });

        /*
         * L'EMAIL PART PAR L'OUTBOX, DANS CETTE TRANSACTION, ADR-033, LS-29.
         *
         * `deposerEnvoi` ET JAMAIS `envoyerDirect` : la regle E de securite.md
         * l'impose pour ce qui decoule d'une transaction. Un appel direct
         * depuis ce bloc rouvrirait le doublon qu'ADR-033 ferme, et un echec du
         * fournisseur annulerait une expedition deja declaree.
         *
         * `origine: ADMIN` PARCE QU'UNE PERSONNE DECLENCHE, a la difference des
         * taches planifiees qui ecrivent `SYSTEME`. La meme distinction que
         * l'historisation ci-dessus, et pour la meme raison : savoir six mois
         * plus tard qui a agi.
         */
        await deposerEnvoi(transaction, {
          commandeId: identifiant,
          destinataire: commande.emailNormalise,
          modele: "expedition-en-route",
          variables: {
            mode: LIBELLES_LIVRAISON[commande.modeLivraison],
            /*
             * LA CHAINE VIDE PLUTOT QUE L'ABSENCE DE CLE. Le modele lit
             * `variables.numeroSuivi ?? ""` : une remise en main propre n'a pas
             * de numero, et le message s'adapte plutot que de lever.
             */
            numeroSuivi: saisieValidee.numeroSuivi ?? "",
          },
          origine: "ADMIN",
        });

        return { statut: "EXPEDIEE" as const };
      },
    );
  } catch (erreur) {
    /*
     * `P2002` EST RATTRAPE ICI, HORS DE LA TRANSACTION, ET C'EST OBLIGATOIRE.
     * Une violation d'unicite avorte la transaction PostgreSQL entiere, `25P02`
     * : la rattraper DEDANS puis continuer echouerait a la requete suivante.
     * Verifie via Context7 sur Prisma 7, et deja mesure sur ce depot en LS-119.
     *
     * IL SIGNIFIE QU'UNE AUTRE DECLARATION A GAGNE, `commande_id` etant unique.
     * C'est le double clic et les deux onglets : le perdant sort en refus, et
     * rien de ce qu'il portait n'a ete ecrit.
     */
    if (
      erreur instanceof Prisma.PrismaClientKnownRequestError &&
      erreur.code === "P2002"
    ) {
      return { statut: "DEJA_EXPEDIEE" };
    }

    if (erreur instanceof CommandeDeplaceeError) {
      /*
       * LA COMMANDE A BOUGE, ET RIEN N'A ETE ECRIT. L'ecran relit son etat
       * reel : le dire « deja expediee » serait faux, elle peut avoir ete
       * annulee.
       */
      const commande = await client.commande.findUnique({
        where: { id: identifiant },
        select: { statut: true },
      });

      return commande === null
        ? { statut: "INTROUVABLE" }
        : { statut: "STATUT_INCOMPATIBLE", statutActuel: commande.statut };
    }

    throw erreur;
  }
}

/**
 * La commande a change d'etat entre la lecture et l'ecriture.
 *
 * ELLE EXISTE POUR ANNULER LA TRANSACTION, pas pour etre vue : `$transaction`
 * ne defait ses ecritures que sur une exception, un `return` la validerait.
 * C'est le piege « un return valide la transaction », deja rencontre ici.
 */
class CommandeDeplaceeError extends Error {
  constructor() {
    super("La commande a changé d'état pendant la déclaration d'expédition.");
    this.name = "CommandeDeplaceeError";
  }
}

/**
 * Ce qu'une creation d'etiquette rend. L'ecran choisit les mots.
 *
 * ELLE PORTE LES MEMES REFUS QUE `declarerExpedition`, plus deux qui lui sont
 * propres : le transporteur indisponible et l'adresse inexploitable. Les
 * partager fait que l'ecran traite les deux gestes de la meme façon.
 */
export type IssueEtiquette =
  | { statut: "CREEE"; numeroSuivi: string; identifiantColis: number }
  | { statut: "INTROUVABLE" }
  | { statut: "STATUT_INCOMPATIBLE"; statutActuel: StatutCommande }
  | { statut: "DEJA_EXPEDIEE" }
  /**
   * Le transporteur n'a pas repondu, ou a refuse.
   *
   * L'ETAT EST INCONNU ET NON « rien ne s'est passe », et la nuance se paie :
   * le colis a PEUT-ETRE ete cree chez Sendcloud avant que la reponse se perde.
   * L'ecran doit dire de verifier chez le transporteur avant de reessayer,
   * jamais proposer un nouveau clic comme si l'appel n'avait pas eu lieu.
   */
  | { statut: "TRANSPORTEUR_INDISPONIBLE" }
  /** L'adresse figee de la commande ne porte pas ce que l'API exige. */
  | { statut: "ADRESSE_INEXPLOITABLE"; message: string }
  /** Le mode exige un point de retrait que la commande ne porte pas. */
  | { statut: "POINT_RETRAIT_MANQUANT" };

/**
 * L'adresse figee, telle que `Commande.adresseLivraison` la porte.
 *
 * TOUS LES CHAMPS SONT OPTIONNELS, comme dans les autres lecteurs de ce
 * `Json` : la colonne est libre, et supposer un champ present produirait un
 * « undefined » envoye au transporteur plutot qu'un refus lisible.
 */
type AdresseFigee = {
  nom?: string;
  ligne1?: string;
  ligne2?: string;
  codePostal?: string;
  ville?: string;
  pays?: string;
};

/**
 * Cree le colis chez le transporteur, puis declare l'expedition.
 *
 * L'ORDRE DES TROIS ETAPES EST LE COEUR DE CE SERVICE, et il n'est pas libre :
 *
 *   1. VERIFIER en base que la commande est expediable et sans expedition
 *   2. APPELER le transporteur, ce qui DEPENSE de l'argent
 *   3. ECRIRE l'expedition avec le numero obtenu
 *
 * Verifier avant de payer est la seule protection contre une etiquette achetee
 * pour rien. L'inverse, appeler puis verifier, ferait payer un colis sur une
 * commande annulee entre-temps, et Sendcloud ne rembourse pas.
 *
 * L'APPEL RESEAU VIT HORS DE TOUTE TRANSACTION, regle de `database.md` : le
 * tenir dedans garderait un verrou de ligne pendant quinze secondes, et son
 * echec effacerait par rollback une commande que rien ne justifie de perdre.
 *
 * LA FENETRE ENTRE 1 ET 3 EST ASSUMEE ET FERMEE EN BASE. Deux clics simultanes
 * passent tous deux l'etape 1, achetent tous deux une etiquette, et le second
 * echoue a l'etape 3 sur `commande_id` unique. C'est un colis paye en trop, pas
 * une commande corrompue : l'inverse, un verrou applicatif, ne fermerait pas
 * davantage la fenetre puisqu'elle vit chez le fournisseur. L'ecran desactive
 * son bouton apres le premier clic, ce qui couvre le cas reel.
 */
export async function creerEtiquetteExpedition({
  commandeId,
  acteurId,
  clientTransporteur,
  client = prisma,
}: {
  commandeId: string;
  acteurId: string;
  clientTransporteur: ClientExpedition;
  client?: typeof prisma;
}): Promise<IssueEtiquette> {
  const identifiant = valider(schemaIdentifiant, commandeId);

  /*
   * ETAPE 1, VERIFIER AVANT DE PAYER. Ces trois refus coutent une lecture ; les
   * decouvrir apres l'appel couterait une etiquette.
   */
  const commande = await lireCommandeAEtiqueter(client, identifiant);

  if (commande === null) {
    return { statut: "INTROUVABLE" };
  }

  if (commande.expeditionExistante) {
    return { statut: "DEJA_EXPEDIEE" };
  }

  const permises: readonly StatutCommande[] =
    TRANSITIONS_ADMINISTRATRICE[commande.statut];

  if (!permises.includes("EXPEDIEE")) {
    return { statut: "STATUT_INCOMPATIBLE", statutActuel: commande.statut };
  }

  /*
   * LE MODE VIENT DE LA COMMANDE, jamais d'une saisie, critere 4. C'est ce que
   * le client a choisi et paye : le laisser choisir a l'expedition ferait
   * partir un colis par un mode qui n'a pas ete facture.
   */
  const mode = commande.modeLivraison;

  if (methodeExigePointRetrait(mode) && !commande.pointRelaisId) {
    return { statut: "POINT_RETRAIT_MANQUANT" };
  }

  const figee = (commande.adresseLivraison ?? {}) as AdresseFigee;

  /*
   * L'ADRESSE EST CONTROLEE AVANT L'APPEL, et le refus nomme le champ. Sendcloud
   * refuserait aussi, mais APRES l'aller-retour et avec un message anglais que
   * l'exploitante ne peut pas relier a son ecran. Le champ manquant se corrige
   * de toute façon a la main, la commande etant figee, invariant 3.
   */
  /*
   * LE NOM VIENT DE `nomClient` ET NON DE L'ADRESSE FIGEE, et ce n'est pas
   * interchangeable : `passerCommande` fige une COPIE de la saisie d'adresse,
   * qui ne porte pas de nom, celui-ci vivant sur la commande. Ma premiere
   * version le cherchait dans l'adresse et refusait TOUTE commande en
   * `ADRESSE_INEXPLOITABLE`, defaut revele par les tests d'integration le
   * 10 septembre 2026.
   *
   * `AdresseFigee` de `repositories/commande.ts` DECLARE POURTANT `nom`, ce qui
   * rendait l'erreur credible a la lecture : le type decrit ce que le carnet
   * d'adresses de LS-59 y mettra, pas ce que le tunnel y met aujourd'hui.
   */
  const nomDestinataire = figee.nom ?? commande.nomClient;

  const manquants = [
    nomDestinataire ? null : "le nom",
    figee.ligne1 ? null : "l'adresse",
    figee.codePostal ? null : "le code postal",
    figee.ville ? null : "la ville",
  ].filter((champ): champ is string => champ !== null);

  if (manquants.length > 0) {
    return {
      statut: "ADRESSE_INEXPLOITABLE",
      message: `L'adresse de la commande ne porte pas ${manquants.join(", ")}.`,
    };
  }

  /*
   * ETAPE 2, L'APPEL QUI DEPENSE. A partir d'ici, un echec peut laisser un
   * colis cree chez le transporteur : c'est pourquoi son refus dit « verifier »
   * et non « reessayer ».
   */
  let creation;

  try {
    creation = await clientTransporteur.creer({
      reference: commande.numero,
      mode,
      pointRetraitId: commande.pointRelaisId,
      adresse: {
        nom: nomDestinataire,
        ligne1: figee.ligne1!,
        ligne2: figee.ligne2 ?? null,
        codePostal: figee.codePostal!,
        ville: figee.ville!,
        /*
         * LE PAYS A UN REPLI, seul champ qui en porte un. ADR-025 borne la zone
         * a la France metropolitaine, Corse comprise : une adresse figee sans
         * pays vient d'une commande anterieure au champ, jamais d'un envoi
         * hors zone. Les quatre autres champs n'ont aucun repli plausible.
         */
        pays: figee.pays ?? "FR",
        email: commande.emailNormalise,
        telephone: commande.telephone,
      },
    });
  } catch (erreur) {
    if (erreur instanceof TransporteurIndisponibleError) {
      journaliserErreur("création d'étiquette refusée", erreur, {
        commandeId: identifiant,
      });
      return { statut: "TRANSPORTEUR_INDISPONIBLE" };
    }
    throw erreur;
  }

  /*
   * ETAPE 3, ECRIRE CE QUI A ETE PAYE. Elle reutilise `declarerExpedition`, qui
   * porte deja la transaction, l'historisation et la garde d'unicite : ecrire
   * ici en parallele creerait un second chemin d'ecriture, donc deux endroits
   * ou la regle se dit.
   */
  const issue = await declarerExpedition({
    commandeId: identifiant,
    acteurId,
    client,
    saisie: {
      transporteur: "Sendcloud",
      mode,
      numeroSuivi: creation.numeroSuivi,
      pointRelaisId: commande.pointRelaisId,
    },
    /*
     * L'IDENTIFIANT EST PERSISTE, et c'est ce qui rend l'etiquette recuperable
     * apres un rafraichissement. Le garder dans l'etat du composant seul rendait
     * une etiquette PAYEE introuvable des que la page bougeait, et obligeait a
     * retourner sur Sendcloud, ce que cette story existe pour supprimer.
     *
     * HORS DE `saisie`, le schema strict la refusant : elle ne vient pas d'une
     * personne mais du transporteur.
     */
    identifiantColis: creation.identifiantColis,
  });

  if (issue.statut !== "EXPEDIEE") {
    /*
     * L'ETIQUETTE EST PAYEE ET L'ECRITURE A ECHOUE, cas rare mais reel : une
     * declaration concurrente a gagne entre les etapes 1 et 3. Le journaliser
     * est le seul moyen de retrouver le colis orphelin chez le transporteur,
     * son numero n'etant nulle part en base.
     */
    journaliser("error", "étiquette créée mais expédition non écrite", {
      commandeId: identifiant,
      numeroSuivi: creation.numeroSuivi,
      statut: issue.statut,
    });

    return issue.statut === "INVALIDE"
      ? { statut: "ADRESSE_INEXPLOITABLE", message: issue.message }
      : issue;
  }

  return {
    statut: "CREEE",
    numeroSuivi: creation.numeroSuivi,
    identifiantColis: creation.identifiantColis,
  };
}
