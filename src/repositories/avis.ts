/**
 * Acces aux avis et a leurs invitations. LS-61, regles R1 a R20.
 *
 * Ce fichier n'ouvre aucune transaction et ne decide rien : il traduit une
 * intention de lecture ou d'ecriture en requete. C'est `services/avis.ts` qui
 * juge si un depot est legitime et qui compose la transaction du point 7.
 *
 * DEUX ENTITES QUI NE SE CONFONDENT PAS. `InvitationAvis` porte le DROIT de
 * deposer, une par ligne de commande, regle R16. `Avis` porte le depot lui-meme,
 * un par ligne, regle R2. L'etat d'usage de l'invitation n'est ecrit NULLE PART
 * ici : il vit sur `JetonAcces.utiliseA`, regle R18, et le dupliquer creerait
 * deux sources pouvant diverger.
 */
import type { Prisma, StatutAvis } from "@/generated/prisma/client";
import type { ClientBase } from "@/repositories/stock";

/**
 * Une ligne de commande eligible a l'invitation, telle que la tache la lit.
 *
 * ELLE PORTE LE LIBELLE FIGE ET NON LE NOM ACTUEL DU CATALOGUE, invariant 3 :
 * l'email nomme la piece telle qu'elle a ete achetee, et un renommage du
 * catalogue ne doit pas reecrire une invitation deja partie.
 */
export type LigneEligible = {
  id: string;
  commandeId: string;
  libelleProduitFige: string;
  libelleVarianteFige: string;
};

/**
 * Une commande dont la livraison est constatee et qui n'a pas encore ete
 * invitee, avec ses lignes.
 *
 * LE GROUPEMENT PAR COMMANDE N'EST PAS UN CONFORT D'AFFICHAGE, il est impose
 * par la cle d'idempotence des emails. `envoi_en_attente_actif_unique` et
 * `journal_email_systeme_unique` portent toutes deux sur `(commandeId, modele)`
 * : trois intentions du meme modele sur la meme commande verraient les deux
 * dernieres AVALEES EN SILENCE par `deposerEnvoi`, qui traite P2002 comme un
 * doublon normal. Le client recevrait une invitation sur trois et rien ne
 * rougirait. Un seul email porte donc toutes les lignes de la commande.
 */
export type CommandeAInviter = {
  commandeId: string;
  numero: string;
  emailNormalise: string;
  livreA: Date;
  lignes: LigneEligible[];
};

/**
 * Les commandes livrees dont au moins une ligne n'a pas encore d'invitation.
 *
 * TROIS FILTRES, ET CHACUN FERME UN DEFAUT DISTINCT.
 *
 * `expedition.livreA` NON NUL est la regle R17, et c'est la seule date qui
 * atteste une remise reelle. Les articles D111-9 a D111-12 imposent une date
 * d'experience EXACTE : le repli du delai de retractation, qui estime une date
 * quand le transporteur se tait, N'A PAS COURS ICI, une date estimee etant
 * fausse au sens de ces articles.
 *
 * `invitation: null` SUR LA LIGNE est la regle R16. Le filtre porte sur la
 * LIGNE et non sur la commande : une commande deja invitee dont une ligne
 * aurait echappe au premier cycle doit pouvoir etre completee.
 *
 * `dissocieA: null` ECARTE LES COMMANDES D'UN COMPTE SUPPRIME. Inviter apres
 * une suppression de compte ferait partir un email vers une adresse dont la
 * personne a demande l'effacement, et le lien rouvrirait un depot sur un
 * historique volontairement coupe.
 *
 * ELLE NE FILTRE PAS SUR LE STATUT DE LA COMMANDE, et c'est delibere. Une
 * expedition dont `livreA` est renseigne EST une commande livree : ajouter une
 * condition sur `statut` ferait dependre l'invitation de deux sources pouvant
 * diverger, alors que la date de remise est le fait qui compte.
 */
export async function listerCommandesAInviter(
  client: ClientBase,
  limite: number,
): Promise<CommandeAInviter[]> {
  const commandes = await client.commande.findMany({
    where: {
      dissocieA: null,
      expedition: { livreA: { not: null } },
      lignes: { some: { invitation: null } },
    },
    select: {
      id: true,
      numero: true,
      emailNormalise: true,
      expedition: { select: { livreA: true } },
      lignes: {
        where: { invitation: null },
        select: {
          id: true,
          commandeId: true,
          libelleProduitFige: true,
          libelleVarianteFige: true,
        },
        orderBy: { creeA: "asc" },
      },
    },
    orderBy: { creeA: "asc" },
    take: limite,
  });

  return commandes.flatMap((commande) => {
    const livreA = commande.expedition?.livreA;

    /*
     * LE GARDE-FOU EST ICI ET NON DANS UN `!`. Le filtre garantit deja que
     * `livreA` est non nul, mais le type rendu par Prisma reste nullable :
     * assener un `!` masquerait le jour ou le filtre changerait, la ou ce test
     * fait simplement disparaitre la commande.
     */
    if (livreA === null || livreA === undefined) {
      return [];
    }

    return [
      {
        commandeId: commande.id,
        numero: commande.numero,
        emailNormalise: commande.emailNormalise,
        livreA,
        lignes: commande.lignes,
      },
    ];
  });
}

/**
 * Ecrit une invitation neuve, regle R16.
 *
 * `nombreEnvois` PART A UN ET NON A ZERO. Il compte les TENTATIVES, et la
 * creation est suivie d'une tentative d'envoi dans le meme cycle : le laisser a
 * zero ferait apparaitre comme jamais tentee une invitation deja partie, et le
 * plafond de renvoi serait decale d'une unite.
 *
 * `dernierEnvoiA` RESTE NUL, il est renseigne HORS TRANSACTION quand le
 * fournisseur a accepte le message. Il distingue une invitation creee d'une
 * invitation partie, et la preuve d'envoi vit dans `JournalEmail`.
 */
export async function ecrireInvitation(
  client: ClientBase,
  parametres: {
    ligneCommandeId: string;
    jetonAccesId: string;
  },
): Promise<{ id: string }> {
  return client.invitationAvis.create({
    data: {
      ligneCommandeId: parametres.ligneCommandeId,
      jetonAccesId: parametres.jetonAccesId,
      nombreEnvois: 1,
    },
    select: { id: true },
  });
}

/**
 * Renseigne la date du dernier envoi abouti, HORS TRANSACTION.
 *
 * ELLE EST SEPAREE DE `ecrireInvitation` PARCE QU'UN ENVOI D'EMAIL NE PEUT
 * APPARTENIR A AUCUNE TRANSACTION PostgreSQL. Son resultat arrive apres, et la
 * regle E4 pose qu'un echec d'email ne bloque jamais.
 *
 * ELLE ECRIT PAR `commandeId` ET NON PAR IDENTIFIANT D'INVITATION : un seul
 * email porte toutes les lignes d'une commande, donc toutes leurs invitations
 * ont abouti ensemble ou pas du tout.
 */
export async function marquerEnvoiAbouti(
  client: ClientBase,
  commandeId: string,
  maintenant: Date = new Date(),
): Promise<number> {
  const { count } = await client.invitationAvis.updateMany({
    where: { ligneCommande: { commandeId } },
    data: { dernierEnvoiA: maintenant },
  });

  return count;
}

/** Ce qu'une lecture d'invitation rend au service, pour composer l'ecran. */
export type InvitationLue = {
  id: string;
  ligneCommandeId: string;
  libelleProduitFige: string;
  libelleVarianteFige: string;
  /** Date de remise reelle, servira `experienceA`, article D111-10. */
  livreA: Date | null;
  /** Un avis deja depose sur cette ligne, regle R2. */
  avisExistant: { id: string; statut: StatutAvis } | null;
};

/**
 * Les invitations d'une commande, avec l'avis deja depose s'il existe.
 *
 * ELLE SERT L'ECRAN DE DEPOT, qui presente ensemble les pieces d'une meme
 * commande. La lecture porte sur la COMMANDE parce que c'est ce que le jeton
 * autorise : `JetonAcces.commandeId` designe une commande, jamais une ligne.
 *
 * ELLE REND L'AVIS EXISTANT PLUTOT QUE DE FILTRER LES LIGNES DEJA NOTEES. Une
 * ligne deja notee doit s'afficher comme telle, sans quoi le client qui revient
 * sur son lien verrait une piece disparaitre sans explication.
 */
export async function lireInvitationsDeCommande(
  client: ClientBase,
  commandeId: string,
): Promise<InvitationLue[]> {
  const invitations = await client.invitationAvis.findMany({
    where: { ligneCommande: { commandeId } },
    select: {
      id: true,
      ligneCommandeId: true,
      ligneCommande: {
        select: {
          libelleProduitFige: true,
          libelleVarianteFige: true,
          commande: { select: { expedition: { select: { livreA: true } } } },
          avis: { select: { id: true, statut: true } },
        },
      },
    },
    orderBy: { creeA: "asc" },
  });

  return invitations.map((invitation) => ({
    id: invitation.id,
    ligneCommandeId: invitation.ligneCommandeId,
    libelleProduitFige: invitation.ligneCommande.libelleProduitFige,
    libelleVarianteFige: invitation.ligneCommande.libelleVarianteFige,
    livreA: invitation.ligneCommande.commande.expedition?.livreA ?? null,
    avisExistant: invitation.ligneCommande.avis,
  }));
}

/**
 * Ecrit un avis neuf, regles R2, R3 et R4.
 *
 * `statut` N'EST PAS PASSE : le defaut du schema vaut `DEPOSE`, regle R4, et le
 * poser explicitement dupliquerait un defaut qui resterait alors a synchroniser
 * a la main. L'arbitrage de l'exploitante du 3 septembre 2026 est sans
 * ambiguite, un avis est publie APRES RELECTURE, jamais immediatement.
 *
 * `experienceA` EST OBLIGATOIRE ET VIENT DE `Expedition.livreA`, article
 * D111-10 : la date affichee pres de l'avis doit etre celle de l'experience
 * reelle. La passer depuis l'appelant plutot que de la relire ici garde le
 * service maitre de la regle, et le repository muet sur le metier.
 *
 * `utilisateurId` EST NULLABLE : un achat sans compte produit un avis, et la
 * preuve d'achat vient de la ligne de commande, jamais du compte, regle R12.
 */
export async function ecrireAvis(
  client: ClientBase,
  parametres: {
    ligneCommandeId: string;
    utilisateurId: string | null;
    note: number;
    commentaire: string | null;
    experienceA: Date;
  },
): Promise<{ id: string }> {
  return client.avis.create({
    data: {
      ligneCommandeId: parametres.ligneCommandeId,
      utilisateurId: parametres.utilisateurId,
      note: parametres.note,
      commentaire: parametres.commentaire,
      experienceA: parametres.experienceA,
    },
    select: { id: true },
  });
}

/** Un avis tel que l'ecran de moderation le presente. */
export type AvisAModerer = {
  id: string;
  note: number;
  commentaire: string | null;
  statut: StatutAvis;
  motifDecision: string | null;
  experienceA: Date;
  deposeA: Date;
  publieA: Date | null;
  decideA: Date | null;
  modifieA: Date | null;
  libelleProduitFige: string;
  libelleVarianteFige: string;
  numeroCommande: string;
};

/**
 * Les avis d'un statut donne, pour l'ecran de moderation.
 *
 * L'ORDRE EST CHRONOLOGIQUE CROISSANT SUR `deposeA` : la file de moderation se
 * traite dans l'ordre d'arrivee, et un avis depose il y a trois jours ne doit
 * pas se retrouver derriere celui de ce matin.
 */
export async function listerAvisParStatut(
  client: ClientBase,
  statuts: StatutAvis[],
): Promise<AvisAModerer[]> {
  const avis = await client.avis.findMany({
    where: { statut: { in: statuts } },
    select: {
      id: true,
      note: true,
      commentaire: true,
      statut: true,
      motifDecision: true,
      experienceA: true,
      deposeA: true,
      publieA: true,
      decideA: true,
      modifieA: true,
      ligneCommande: {
        select: {
          libelleProduitFige: true,
          libelleVarianteFige: true,
          commande: { select: { numero: true } },
        },
      },
    },
    orderBy: { deposeA: "asc" },
  });

  return avis.map((ligne) => ({
    id: ligne.id,
    note: ligne.note,
    commentaire: ligne.commentaire,
    statut: ligne.statut,
    motifDecision: ligne.motifDecision,
    experienceA: ligne.experienceA,
    deposeA: ligne.deposeA,
    publieA: ligne.publieA,
    decideA: ligne.decideA,
    modifieA: ligne.modifieA,
    libelleProduitFige: ligne.ligneCommande.libelleProduitFige,
    libelleVarianteFige: ligne.ligneCommande.libelleVarianteFige,
    numeroCommande: ligne.ligneCommande.commande.numero,
  }));
}

/**
 * Applique une decision de moderation, regles R5, R9 et R7.
 *
 * `statut` ET `decideA` SONT ECRITS ENSEMBLE, regle R9 : un statut change sans
 * date de decision rend le traitement intracable, et l'obligation d'information
 * sur les avis non publies suppose de savoir QUAND la decision a ete prise.
 *
 * `publieA` NE S'ECRASE JAMAIS, regle R7. Il porte la PREMIERE publication : un
 * avis publie, modifie, puis republie garde sa date d'origine, ce que la clause
 * `publieA: null` garantit sans lecture prealable. Sans elle, chaque
 * republication rajeunirait l'avis et fausserait le classement chronologique
 * que l'article D111-10 impose d'annoncer.
 *
 * LE MOTIF EST EXIGE PAR LE SERVICE, PAS ICI, regle R5. Un repository qui
 * refuserait une ecriture porterait une decision metier, ce que le README de ce
 * dossier interdit.
 */
export async function appliquerDecision(
  client: ClientBase,
  parametres: {
    avisId: string;
    statut: StatutAvis;
    motifDecision: string | null;
    maintenant?: Date;
  },
): Promise<void> {
  const maintenant = parametres.maintenant ?? new Date();

  const donnees: Prisma.AvisUpdateInput = {
    statut: parametres.statut,
    motifDecision: parametres.motifDecision,
    decideA: maintenant,
  };

  await client.avis.update({
    where: { id: parametres.avisId },
    data: donnees,
  });

  if (parametres.statut === "PUBLIE") {
    /*
     * SECONDE ECRITURE, CONDITIONNEE PAR `publieA: null`, ET NON UN CHAMP DE
     * L'UPDATE PRECEDENT. `update` ne sait pas exprimer « ecris cette colonne
     * seulement si elle est nulle » : la condition vit dans le `where` d'un
     * `updateMany`, qui ne touche rien quand la date existe deja.
     */
    await client.avis.updateMany({
      where: { id: parametres.avisId, publieA: null },
      data: { publieA: maintenant },
    });
  }
}

/** Un avis publie, tel que la fiche produit l'affiche. */
export type AvisPublie = {
  id: string;
  note: number;
  commentaire: string | null;
  /** Article D111-10 1°, la date de publication s'affiche pres de l'avis. */
  publieA: Date;
  /** Article D111-10 1°, la date de l'experience de consommation aussi. */
  experienceA: Date;
  reponse: { contenu: string; publieeA: Date } | null;
};

/**
 * Les avis publies d'une variante, pour la fiche produit.
 *
 * LE FILTRE PORTE SUR `statut: PUBLIE` ET SUR RIEN D'AUTRE, regle R4 : un avis
 * `DEPOSE`, `REFUSE` ou `RETIRE` n'est jamais visible publiquement. C'est la
 * seule lecture publique des avis, et elle ne rend NI l'identifiant de la ligne
 * de commande NI celui du client : les deux relieraient un avis a un achat
 * nominatif sur une page publique.
 *
 * L'ORDRE EST CHRONOLOGIQUE DECROISSANT sur `publieA`, ce qui est le critere de
 * classement que l'article D111-10 1° impose d'annoncer. Le changer sans
 * changer la mention affichee produirait une information fausse.
 *
 * ELLE PASSE PAR `varianteId` DE LA LIGNE, decision G : une variante archivee
 * conserve ses avis, `varianteId` restant resolvable, regle C13.
 */
export async function listerAvisPublies(
  client: ClientBase,
  varianteIds: string[],
): Promise<AvisPublie[]> {
  if (varianteIds.length === 0) {
    return [];
  }

  const avis = await client.avis.findMany({
    where: {
      statut: "PUBLIE",
      ligneCommande: { varianteId: { in: varianteIds } },
    },
    select: {
      id: true,
      note: true,
      commentaire: true,
      publieA: true,
      experienceA: true,
      reponse: { select: { contenu: true, publieeA: true } },
    },
    orderBy: { publieA: "desc" },
  });

  return avis.flatMap((ligne) => {
    /*
     * UN AVIS `PUBLIE` SANS `publieA` EST UNE INCOHERENCE, et il est ECARTE
     * plutot que rendu avec une date inventee. L'article D111-10 impose
     * d'afficher la date de publication : afficher celle du depot a la place
     * serait une information fausse, et un repli sur la date du jour le serait
     * davantage.
     */
    if (ligne.publieA === null) {
      return [];
    }

    return [
      {
        id: ligne.id,
        note: ligne.note,
        commentaire: ligne.commentaire,
        publieA: ligne.publieA,
        experienceA: ligne.experienceA,
        reponse: ligne.reponse,
      },
    ];
  });
}
