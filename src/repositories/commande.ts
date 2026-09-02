/**
 * Acces aux donnees des commandes, LS-117.
 *
 * IL N'OUVRE AUCUNE TRANSACTION, garde de `repositories/` : le service appelant
 * lui passe le client transactionnel, toutes ces ecritures devant partager la
 * transaction unique d'ADR-024.
 */
import { Prisma } from "@/generated/prisma/client";
import type { ModeLivraison, StatutCommande } from "@/generated/prisma/enums";
import type { ClientBase } from "@/repositories/stock";

/** Un document numerote par annee, ADR-031. Trois types prevus, un employe. */
export type TypeDocument = "COMMANDE" | "FACTURE" | "AVOIR";

/**
 * Reserve le prochain numero de sequence pour un type et une annee.
 *
 * LE VERROU DE LIGNE EST LE MECANISME, ADR-031. `UPDATE ... RETURNING` prend un
 * verrou tenu jusqu'au `COMMIT` : deux transactions concurrentes s'ordonnent au
 * lieu de lire la meme valeur, et une transaction annulee rend son numero. Une
 * `SEQUENCE` PostgreSQL, non transactionnelle, laisserait un trou a chaque refus
 * de stock, cas frequent sur un catalogue de pieces uniques.
 *
 * `ON CONFLICT` CREE LA LIGNE DE L'ANNEE au premier document plutot que
 * d'exiger un amorcage manuel, dont l'oubli bloquerait toute vente le
 * 1er janvier.
 *
 * A APPELER AVANT DE RESERVER LES VARIANTES, jamais entre deux reservations.
 * L'ordre global est compteur puis variantes triees : l'inverser dans un seul
 * chemin suffirait a creer un cycle d'interblocage avec les autres.
 */
export async function reserverNumero(
  client: ClientBase,
  type: TypeDocument,
): Promise<{ annee: number; rang: number }> {
  /*
   * L'ANNEE VIENT DE POSTGRESQL, jamais de Node, regle de `database.md` :
   * « `now()` est l'horloge de PostgreSQL, jamais celle de Node. Deux
   * conteneurs dont les horloges derivent compareraient des instants
   * incomparables. »
   *
   * LE CAS CONCRET EST LE PASSAGE D'ANNEE. Deux conteneurs decales de quelques
   * centaines de millisecondes le 31 decembre a 23:59:59 ecriraient l'un
   * `C-2027-0001`, l'autre `C-2026-0043` : deux lignes de compteur coexistent
   * et une commande de janvier porte un numero de l'annee revolue, ce qui casse
   * la lecture sequentielle par annee qu'ADR-031 pose comme raison d'etre.
   * Releve par `ls-critical-reviewer` le 25 aout 2026.
   */
  const lignes = await client.$queryRaw<{ annee: number; dernier: number }[]>`
    INSERT INTO compteur_numero (type, annee, dernier)
    VALUES (${type}, EXTRACT(YEAR FROM now())::int, 1)
    ON CONFLICT (type, annee)
      DO UPDATE SET dernier = compteur_numero.dernier + 1
    RETURNING annee, dernier
  `;

  const ligne = lignes[0];

  /*
   * L'INSTRUCTION REND TOUJOURS UNE LIGNE, l'`INSERT ... ON CONFLICT DO UPDATE`
   * ecrivant dans les deux branches. Un vide signalerait une base incoherente,
   * pas un cas metier : le refus explicite vaut mieux qu'un `!` qui ferait
   * surgir l'erreur plus loin, sur un numero `undefined` ecrit en base.
   */
  if (ligne === undefined) {
    throw new Error(`Aucun numero rendu par le compteur ${type}.`);
  }

  return { annee: ligne.annee, rang: ligne.dernier };
}

/**
 * Ce qu'une ligne de commande fige, lu dans la transaction.
 *
 * LU DANS LA TRANSACTION ET NON REPRIS DU PANIER REVALIDE, et la nuance
 * compte : la revalidation de l'etape 3 a pu avoir lieu plusieurs minutes plus
 * tot. Ce qui est fige doit etre l'etat au moment de l'ecriture, sous le meme
 * verrou que la reservation.
 */
export type DonneesFigees = {
  varianteId: string;
  reference: string;
  libelleVariante: string;
  libelleProduit: string;
  prixCentimes: number;
};

/**
 * Lit les donnees a figer pour un ensemble de variantes, EN LES VERROUILLANT.
 *
 * AUCUN FILTRE DE VENDABILITE ICI. C'est l'`UPDATE` conditionnel de la
 * reservation qui decide si la piece est disponible, ADR-006 : dupliquer la
 * regle ici en ferait deux, dont l'une pourrait diverger.
 *
 * `FOR UPDATE OF v` EST INDISPENSABLE, et son absence etait un defaut releve
 * par `ls-critical-reviewer` le 25 aout 2026. En `READ COMMITTED`, une lecture
 * nue voit la version validee a l'instant du `SELECT` ; l'`UPDATE` de
 * reservation, lui, voit la version la plus recente. Une revision de prix
 * validee entre les deux instants faisait figer l'ANCIEN prix sur une commande
 * ecrite APRES la revision : 4900 sur la commande quand le catalogue affichait
 * deja 5900.
 *
 * Le verrou ferme cette fenetre : la ligne ne peut plus changer entre la
 * lecture et la reservation.
 *
 * `OF v` RESTREINT LE VERROU A `variante`, sans quoi `produit` serait verrouille
 * aussi : deux commandes portant deux variantes d'un MEME produit se
 * serialiseraient sans raison, et une modification de fiche produit attendrait
 * la fin d'une commande.
 *
 * L'ORDRE DE PRISE RESTE CELUI DU SERVICE, qui passe les identifiants deja
 * tries : `ORDER BY` ici ne garantirait rien, PostgreSQL verrouillant dans
 * l'ordre de son plan d'execution. C'est pourquoi cette fonction ne trie pas
 * elle-meme, elle exige un appelant qui l'a fait.
 */
export async function lireDonneesAFiger(
  client: ClientBase,
  varianteIdsTries: readonly string[],
): Promise<DonneesFigees[]> {
  return client.$queryRaw<DonneesFigees[]>`
    SELECT v.id            AS "varianteId",
           v.reference,
           v.libelle       AS "libelleVariante",
           p.nom           AS "libelleProduit",
           v.prix_centimes AS "prixCentimes"
      FROM variante v
      JOIN produit p ON p.id = v.produit_id
     WHERE v.id IN (${Prisma.join([...varianteIdsTries])})
       FOR UPDATE OF v
  `;
}

/** Une adresse figee sur la commande, copie et non reference. */
export type AdresseFigee = {
  nom: string;
  ligne1: string;
  ligne2?: string;
  codePostal: string;
  ville: string;
  pays: string;
};

/** Ce que la commande porte a sa creation. */
export type CommandeAEcrire = {
  id: string;
  numero: string;
  emailNormalise: string;
  nomClient: string;
  telephone: string | null;
  adresseLivraison: AdresseFigee;
  adresseFacturation: AdresseFigee;
  sousTotalCentimes: number;
  modeLivraison: ModeLivraison;
  pointRelaisId: string | null;
  pointRelaisAdresse: Prisma.InputJsonValue | null;
  fraisPortCentimes: number;
  totalCentimes: number;
  cgvAccepteesA: Date;
  cgvVersion: string;
};

/**
 * Ecrit la commande.
 *
 * `montantTaxeCentimes` RESTE A ZERO, franchise en base de TVA, article 293 B
 * du CGI. Il n'existe ni taux ni booleen d'inclusion, `database.md` l'interdit
 * explicitement : un franchissement futur du seuil sera un parametrage.
 */
export async function ecrireCommande(
  client: ClientBase,
  commande: CommandeAEcrire,
): Promise<void> {
  await client.commande.create({
    data: {
      id: commande.id,
      numero: commande.numero,
      statut: "EN_ATTENTE_PAIEMENT",
      emailNormalise: commande.emailNormalise,
      nomClient: commande.nomClient,
      telephone: commande.telephone,
      adresseLivraison: commande.adresseLivraison,
      adresseFacturation: commande.adresseFacturation,
      sousTotalCentimes: commande.sousTotalCentimes,
      modeLivraison: commande.modeLivraison,
      pointRelaisId: commande.pointRelaisId,
      ...(commande.pointRelaisAdresse === null
        ? {}
        : { pointRelaisAdresse: commande.pointRelaisAdresse }),
      fraisPortCentimes: commande.fraisPortCentimes,
      totalCentimes: commande.totalCentimes,
      montantTaxeCentimes: 0,
      cgvAccepteesA: commande.cgvAccepteesA,
      cgvVersion: commande.cgvVersion,
    },
  });
}

/** Une ligne de commande, deja figee par le service. */
export type LigneAEcrire = {
  commandeId: string;
  varianteId: string;
  referenceFigee: string;
  libelleProduitFige: string;
  libelleVarianteFige: string;
  prixFigeCentimes: number;
  quantite: number;
};

/**
 * Ecrit les lignes de la commande.
 *
 * `createMany` ET NON UNE BOUCLE : une seule instruction, donc un seul
 * aller-retour a l'interieur d'une transaction qui tient deja des verrous de
 * ligne sur les variantes. Chaque milliseconde passee dans la transaction est
 * une milliseconde d'attente pour l'acheteur concurrent.
 */
export async function ecrireLignes(
  client: ClientBase,
  lignes: readonly LigneAEcrire[],
): Promise<void> {
  await client.ligneCommande.createMany({ data: [...lignes] });
}

/** Ce que le demarrage d'un paiement lit d'une commande, LS-118. */
export type CommandeAPayer = {
  id: string;
  numero: string;
  statut: StatutCommande;
  emailNormalise: string;
  totalCentimes: number;
  fraisPortCentimes: number;
  lignes: readonly {
    libelleProduitFige: string;
    libelleVarianteFige: string;
    prixFigeCentimes: number;
    quantite: number;
  }[];
};

/**
 * Lit une commande et ses lignes figees pour creer sa session de paiement.
 *
 * LES LIBELLES SONT LES COPIES FIGEES, invariant 3 : la page de paiement
 * affiche ce que la commande a fige, jamais le catalogue courant, qui a pu
 * changer entre la commande et le paiement.
 */
export async function lireCommandeAPayer(
  client: ClientBase,
  commandeId: string,
): Promise<CommandeAPayer | null> {
  const commande = await client.commande.findUnique({
    where: { id: commandeId },
    select: {
      id: true,
      numero: true,
      statut: true,
      emailNormalise: true,
      totalCentimes: true,
      fraisPortCentimes: true,
      lignes: {
        select: {
          id: true,
          libelleProduitFige: true,
          libelleVarianteFige: true,
          prixFigeCentimes: true,
          quantite: true,
        },
      },
    },
  });

  return commande;
}

/**
 * Une commande passee sans compte, eligible au rattachement du parcours 6.
 *
 * ELLE NE PORTE AUCUNE ADRESSE NI AUCUN MONTANT DETAILLE. Cette liste s'affiche
 * AVANT que la personne n'ait prouve quoi que ce soit sur ces commandes : elle
 * dit « des commandes existent sur votre adresse verifiee », et rien de plus.
 * Y ajouter l'adresse de livraison ferait de l'ecran une fuite pour qui
 * controle une boite email sans etre le client d'origine.
 */
export type CommandeRattachable = {
  id: string;
  numero: string;
  creeA: Date;
  totalCentimes: number;
};

/**
 * Les commandes qu'un email verifie peut revendiquer, parcours 6 etape 3.
 *
 * LES TROIS CONDITIONS SONT ICI, ET AUCUNE N'EST DERIVABLE DES AUTRES :
 *
 *   emailNormalise   la commande a ete passee avec cette adresse
 *   utilisateurId    nul, elle n'appartient a personne
 *   dissocieA        nul, elle n'a JAMAIS appartenu a personne
 *
 * LA TROISIEME EST CELLE QUI SE PERD. `ON DELETE SET NULL` remet
 * `utilisateurId` a nul quand un compte est supprime : sans le filtre sur
 * `dissocieA`, une commande dissociee redeviendrait « sans proprietaire », donc
 * eligible. L'historique et les factures d'un client parti rouvriraient a
 * quiconque controle ensuite la meme adresse, regle V15. « Jamais rattachee »
 * est strictement plus fort que « sans proprietaire ».
 *
 * LA VERIFICATION DE L'ADRESSE N'EST PAS ICI, elle appartient au service : ce
 * fichier ne decide rien, garde de `repositories/`. La condition est bien
 * cumulative, elle est simplement portee une couche au-dessus.
 */
export async function listerCommandesRattachables(
  client: ClientBase,
  emailNormalise: string,
): Promise<CommandeRattachable[]> {
  return client.commande.findMany({
    where: { emailNormalise, utilisateurId: null, dissocieA: null },
    select: { id: true, numero: true, creeA: true, totalCentimes: true },
    orderBy: { creeA: "desc" },
  });
}

/**
 * Rattache a un compte les commandes eligibles, parcours 6 etape 4.
 *
 * LE `where` REPETE LES TROIS CONDITIONS, il ne se contente pas des
 * identifiants lus a l'etape 3. Ce n'est pas une precaution decorative : entre
 * la lecture et l'ecriture, un webhook ou une suppression de compte peut avoir
 * change l'etat d'une commande. Filtrer sur les seuls `id` rattacherait alors
 * une commande devenue ineligible, et le `count` rendu mentirait.
 *
 * IL NE PREND AUCUNE LISTE D'IDENTIFIANTS, invariant 2. La selection est
 * recalculee cote serveur a partir de l'email verifie de la SESSION : accepter
 * des identifiants venus du navigateur serait exactement le chemin que le
 * parcours 6 nomme « tentative de rattachement par identifiant fourni ».
 *
 * `updateMany` EST IDEMPOTENT ICI par construction : une seconde execution ne
 * trouve plus aucune ligne, `utilisateurId` n'etant plus nul, et rend zero.
 */
export async function rattacherCommandes(
  client: ClientBase,
  emailNormalise: string,
  utilisateurId: string,
): Promise<number> {
  const { count } = await client.commande.updateMany({
    where: { emailNormalise, utilisateurId: null, dissocieA: null },
    data: { utilisateurId },
  });

  return count;
}

/**
 * Une commande telle que son proprietaire la voit en liste. LS-57.
 *
 * ELLE NE PORTE NI ADRESSE NI EMAIL NI TELEPHONE, a la difference de
 * `CommandeEnListe` du cote administration. Ce ne sont pas les memes lecteurs :
 * l'exploitante prepare un colis et a besoin de l'adresse, le client sait ou il
 * habite. Une projection qui charge plus que necessaire finit affichee.
 */
export type CommandeDuClient = {
  id: string;
  numero: string;
  statut: StatutCommande;
  totalCentimes: number;
  creeA: Date;
};

/**
 * Les commandes d'un compte, les plus recentes d'abord. LS-57, critere 1.
 *
 * `utilisateurId` VIENT DE LA SESSION, jamais d'un parametre d'URL : c'est
 * l'appelant qui le garantit, et la signature n'accepte rien d'autre qui
 * pourrait servir de critere.
 *
 * `dissocieA: null` EST UNE CONDITION A PART ENTIERE, critere 5. Une commande
 * dissociee garde son `utilisateurId` a nul apres la suppression du compte,
 * donc ce filtre ne sert pas a ecarter les commandes d'autrui ; il ferme le cas
 * ou un compte serait recree et repointe. Le redondant apparent est ce qui rend
 * la regle vraie quel que soit l'etat de la base.
 */
export async function listerCommandesDuClient(
  client: ClientBase,
  utilisateurId: string,
): Promise<CommandeDuClient[]> {
  return client.commande.findMany({
    where: { utilisateurId, dissocieA: null },
    select: {
      id: true,
      numero: true,
      statut: true,
      totalCentimes: true,
      creeA: true,
    },
    orderBy: { creeA: "desc" },
  });
}

/**
 * Le detail d'une commande tel que son proprietaire le voit. LS-57, critere 2.
 *
 * DISTINCT DE `DetailCommande` du cote administration, et la difference n'est
 * pas cosmetique : celui-la porte `emailNormalise`, `telephone`, les historiques
 * de statut avec leur acteur et les transitions declenchables. Rien de cela
 * n'appartient a l'ecran du client, et reutiliser la projection de
 * l'administration exposerait ces champs a un chemin qui ne les exige pas.
 *
 * L'ADRESSE FIGEE Y EST, elle : le client doit pouvoir verifier ou son colis
 * part, et c'est SA donnee.
 */
export type DetailCommandeDuClient = {
  id: string;
  numero: string;
  statut: StatutCommande;
  adresseLivraison: Prisma.JsonValue;
  modeLivraison: ModeLivraison;
  pointRelaisAdresse: Prisma.JsonValue;
  sousTotalCentimes: number;
  fraisPortCentimes: number;
  totalCentimes: number;
  creeA: Date;
  lignes: {
    /** L'identifiant sert de cle de rendu, plus stable qu'un rang. */
    id: string;
    libelleProduitFige: string;
    libelleVarianteFige: string;
    prixFigeCentimes: number;
    quantite: number;
  }[];
  /**
   * L'expedition, quand elle a ete declaree, LS-130.
   *
   * `expedieA` EST NULLABLE MEME QUAND LA LIGNE EXISTE : le schema le prevoit,
   * et le type le dit plutot que de le supposer. Une assertion non nulle ici
   * aurait produit un « Invalid Date » a l'ecran le jour ou une expedition est
   * creee sans date.
   *
   * `livreA` RESTE NUL AUJOURD'HUI, aucun chemin ne l'ecrit : c'est LS-33 qui
   * decidera comment le site apprend qu'un colis est livre. Le champ est lu des
   * maintenant pour que l'ecran n'ait pas a changer ce jour-la.
   *
   * `mode` EST CELUI QUE LE TRANSPORTEUR A EXECUTE, distinct de
   * `Commande.modeLivraison` que le client a paye, ADR-025. Les deux sont
   * affiches quand ils different : un rebasculement vers un Point Relais doit
   * se voir, la commande n'etant jamais reecrite.
   */
  expedition: {
    mode: ModeLivraison;
    numeroSuivi: string | null;
    expedieA: Date | null;
    livreA: Date | null;
  } | null;
  facture: {
    id: string;
    numero: string;
    /** Nul quand le rendu a echoue, regle F8 : etat affichable, pas une absence. */
    cheminPdf: string | null;
    emiseA: Date;
    avoirs: {
      id: string;
      numero: string;
      montantCentimes: number;
      cheminPdf: string | null;
      emisA: Date;
    }[];
  } | null;
};

/**
 * Lit une commande SI elle appartient a ce compte, sinon rend `null`.
 *
 * LA GARDE EST DANS LE `where`, ET C'EST TOUT L'INTERET DE CETTE SIGNATURE.
 * `utilisateurId` n'est pas un filtre d'affichage ajoute apres coup : il fait
 * partie de la clause qui trouve la ligne. Une variante qui lirait d'abord la
 * commande puis comparerait le proprietaire laisserait un chemin ou la
 * comparaison est oubliee, et c'est le defaut que l'invariant 2 nomme.
 *
 * `dissocieA: null` FERME LE CAS DU COMPTE SUPPRIME, critere 5 : une commande
 * dissociee n'apparait dans aucun espace client, meme si un `utilisateurId`
 * venait a y etre reecrit.
 *
 * LE `null` NE DISTINGUE PAS « inexistante » DE « pas la votre », et c'est
 * volontaire : l'appelant rend 404 dans les deux cas. Un 403 sur la commande
 * d'autrui revelerait son existence, meme motif que la route de facture signee.
 *
 * LES LIGNES VIENNENT DE `LigneCommande`, JAMAIS DU CATALOGUE, invariant 3 :
 * ce sont les copies figees au moment de la commande.
 */
export async function lireCommandeDuClient(
  client: ClientBase,
  commandeId: string,
  utilisateurId: string,
): Promise<DetailCommandeDuClient | null> {
  return client.commande.findFirst({
    where: { id: commandeId, utilisateurId, dissocieA: null },
    select: {
      id: true,
      numero: true,
      statut: true,
      adresseLivraison: true,
      modeLivraison: true,
      pointRelaisAdresse: true,
      sousTotalCentimes: true,
      fraisPortCentimes: true,
      totalCentimes: true,
      creeA: true,
      lignes: {
        select: {
          id: true,
          libelleProduitFige: true,
          libelleVarianteFige: true,
          prixFigeCentimes: true,
          quantite: true,
        },
      },
      expedition: {
        select: {
          mode: true,
          numeroSuivi: true,
          expedieA: true,
          livreA: true,
        },
      },
      facture: {
        select: {
          id: true,
          numero: true,
          cheminPdf: true,
          emiseA: true,
          /*
           * LES AVOIRS SONT RATTACHES A LEUR FACTURE D'ORIGINE, invariant 4 :
           * une facture n'est jamais modifiee ni remplacee, une correction
           * produit un avoir. L'ecran doit montrer ce lien, sans quoi un client
           * rembourse verrait une facture au montant plein sans explication.
           */
          avoirs: {
            select: {
              id: true,
              numero: true,
              montantCentimes: true,
              cheminPdf: true,
              emisA: true,
            },
            orderBy: { emisA: "desc" },
          },
        },
      },
    },
  });
}

/**
 * La facture d'une commande, SI cette commande appartient a ce compte. LS-57.
 *
 * ELLE PART DE LA COMMANDE ET NON DE LA FACTURE, et ce sens porte la garde :
 * `Facture` ne connait son proprietaire que par sa commande. Partir de la
 * facture obligerait a remonter le lien puis a comparer, donc a ecrire
 * l'autorisation a la main, et c'est la que la comparaison s'oublie. Ici
 * l'appartenance est dans le `where`, invariant 2.
 *
 * Meme motif que `lireFactureAServir` de `repositories/facture.ts`, qui porte
 * la variante du jeton signe : les deux chemins ont chacun leur preuve.
 */
export async function lireFactureDuClient(
  client: ClientBase,
  commandeId: string,
  utilisateurId: string,
): Promise<{ numero: string; cheminPdf: string | null } | null> {
  const commande = await client.commande.findFirst({
    where: { id: commandeId, utilisateurId, dissocieA: null },
    select: { facture: { select: { numero: true, cheminPdf: true } } },
  });

  return commande?.facture ?? null;
}

/**
 * Un avoir, SI la commande de sa facture appartient a ce compte. LS-57.
 *
 * LA CHAINE EST PARCOURUE EN ENTIER, avoir -> facture -> commande ->
 * utilisateur, en UNE requete. Un avoir n'appartient a personne directement :
 * sauter un maillon en supposant qu'il suit sa facture ferait dependre la garde
 * d'une hypothese non ecrite.
 */
export async function lireAvoirDuClient(
  client: ClientBase,
  avoirId: string,
  utilisateurId: string,
): Promise<{ numero: string; cheminPdf: string | null } | null> {
  return client.avoir.findFirst({
    where: {
      id: avoirId,
      facture: { commande: { utilisateurId, dissocieA: null } },
    },
    select: { numero: true, cheminPdf: true },
  });
}
