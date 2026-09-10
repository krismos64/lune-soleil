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
import type {
  Prisma,
  StatutAvis,
  StatutSignalement,
} from "@/generated/prisma/client";
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
  /**
   * `true` quand AUCUNE ligne de la commande ne porte encore d'invitation.
   *
   * IL DECIDE DE L'ENVOI DE L'EMAIL, et pas de la creation des invitations.
   * Un cycle qui RATTRAPE une ligne oubliee doit creer son invitation sans
   * renvoyer un second email : `envoi_en_attente_actif_unique` ne couvre que
   * les statuts `EN_ATTENTE` et `ENVOI_EN_COURS`, donc une premiere invitation
   * deja passee a `ENVOYE` ne bloque plus rien. Le client recevrait deux fois
   * la meme sollicitation. Mesure par la revue critique du 11 septembre 2026.
   */
  premiereInvitation: boolean;
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
      /*
       * LE COMPTE DES LIGNES DEJA INVITEES, qui distingue un premier cycle
       * d'un rattrapage. Il ne peut pas se deduire de `lignes` ci-dessus, ce
       * tableau etant deja filtre sur les lignes SANS invitation.
       */
      _count: {
        select: { lignes: { where: { invitation: { isNot: null } } } },
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
        premiereInvitation: commande._count.lignes === 0,
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

  /*
   * UN MOTIF ABSENT NE S'ECRIT PAS, IL EST OMIS, correction de la revue
   * critique du 11 septembre 2026, mesuree par sonde.
   *
   * LE DEFAUT : `motifDecision` etait ecrit inconditionnellement, donc une
   * REPUBLICATION, qui n'a legitimement aucun motif a porter, ecrasait par
   * `null` le motif du RETRAIT precedent. C'etait la seule trace de la raison
   * pour laquelle l'avis avait ete retire, et la regle R5 existe precisement
   * pour l'exiger.
   *
   * L'ASYMETRIE AVEC `publieA` ETAIT LE PIEGE. Les deux colonnes sont ecrites
   * par cette meme fonction, l'une protegee par sa clause `publieA: null` et
   * l'autre pas : muter la clause protegee ne revele jamais l'absence de
   * protection sur la voisine. Motif « regle a deux versants » de ce depot.
   *
   * UN MOTIF EXPLICITEMENT FOURNI CONTINUE D'ETRE ECRIT, y compris sur une
   * publication : omettre la cle et ecrire `null` sont deux gestes distincts,
   * et seul le second efface.
   */
  const donnees: Prisma.AvisUpdateInput = {
    statut: parametres.statut,
    decideA: maintenant,
    ...(parametres.motifDecision === null
      ? {}
      : { motifDecision: parametres.motifDecision }),
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

/**
 * Le numero d'une commande et son proprietaire, pour l'ecran et l'auteur.
 *
 * ELLE VIT ICI ET NON DANS LE SERVICE, frontiere du projet : `services/` porte
 * les cas d'usage, `repositories/` l'acces aux donnees. Le controle
 * `verifier-regles.sh` l'a rappele en refusant un appel de modele Prisma depuis
 * `services/avis.ts`, et il avait raison.
 *
 * `dissocieA` REMONTE PLUTOT QUE D'ETRE FILTRE ICI. Le service en tire deux
 * conclusions distinctes : ne pas rattacher l'avis a un compte sans titulaire,
 * et laisser l'ecran fonctionner malgre tout, un client parti gardant le droit
 * de deposer l'avis d'une commande qu'il a reellement reçue. Filtrer ici
 * confondrait les deux.
 */
export async function lireCommandePourAvis(
  client: ClientBase,
  commandeId: string,
): Promise<{
  numero: string;
  utilisateurId: string | null;
  dissocieA: Date | null;
} | null> {
  return client.commande.findUnique({
    where: { id: commandeId },
    select: { numero: true, utilisateurId: true, dissocieA: true },
  });
}

/**
 * Ecrit un signalement d'avis, LS-77, article L111-7-2.
 *
 * `statut` N'EST PAS PASSE : le defaut du schema vaut `NOUVEAU`, et le poser
 * explicitement dupliquerait un defaut qui resterait a synchroniser a la main.
 *
 * ELLE N'ECRIT RIEN SUR L'AVIS, et c'est la propriete la plus importante de ce
 * fichier sur ce domaine. Un signalement n'est pas une decision de moderation :
 * depublier automatiquement ferait de ce formulaire public un moyen de retirer
 * les avis d'un concurrent.
 */
export async function ecrireSignalement(
  client: ClientBase,
  parametres: {
    avisId: string;
    qualite: string;
    email: string;
    motif: string;
  },
): Promise<{ id: string }> {
  return client.signalementAvis.create({
    data: {
      avisId: parametres.avisId,
      qualite: parametres.qualite,
      email: parametres.email,
      motif: parametres.motif,
    },
    select: { id: true },
  });
}

/** Un signalement tel que l'ecran d'administration le presente. */
export type SignalementLu = {
  id: string;
  qualite: string;
  email: string;
  motif: string;
  statut: StatutSignalement;
  suiteDonnee: string | null;
  examineA: Date | null;
  creeA: Date;
  avisId: string;
  noteAvis: number;
  commentaireAvis: string | null;
  statutAvis: StatutAvis;
  libelleProduitFige: string;
};

/**
 * Les signalements d'un statut donne, pour l'ecran d'administration.
 *
 * ELLE REMONTE L'AVIS VISE AVEC LE SIGNALEMENT. Juger un doute sans lire l'avis
 * qu'il conteste est impossible, et obliger l'exploitante a ouvrir un second
 * ecran pour cela rendrait le traitement si couteux qu'il ne se ferait pas.
 *
 * L'ORDRE EST CHRONOLOGIQUE CROISSANT sur `creeA` : la file se traite dans
 * l'ordre d'arrivee, meme motif que la moderation des avis.
 */
export async function listerSignalements(
  client: ClientBase,
  statuts: StatutSignalement[],
): Promise<SignalementLu[]> {
  const signalements = await client.signalementAvis.findMany({
    where: { statut: { in: statuts } },
    select: {
      id: true,
      qualite: true,
      email: true,
      motif: true,
      statut: true,
      suiteDonnee: true,
      examineA: true,
      creeA: true,
      avisId: true,
      avis: {
        select: {
          note: true,
          commentaire: true,
          statut: true,
          ligneCommande: { select: { libelleProduitFige: true } },
        },
      },
    },
    orderBy: { creeA: "asc" },
  });

  return signalements.map((ligne) => ({
    id: ligne.id,
    qualite: ligne.qualite,
    email: ligne.email,
    motif: ligne.motif,
    statut: ligne.statut,
    suiteDonnee: ligne.suiteDonnee,
    examineA: ligne.examineA,
    creeA: ligne.creeA,
    avisId: ligne.avisId,
    noteAvis: ligne.avis.note,
    commentaireAvis: ligne.avis.commentaire,
    statutAvis: ligne.avis.statut,
    libelleProduitFige: ligne.avis.ligneCommande.libelleProduitFige,
  }));
}

/**
 * Clot un signalement apres examen, C43 et C44.
 *
 * `statut` ET `examineA` SONT ECRITS ENSEMBLE, contrainte C43 qui l'exige en
 * EQUIVALENCE : un signalement examine sans date ne dirait pas quand, et une
 * date sur un signalement `NOUVEAU` affirmerait un examen qui n'a pas eu lieu.
 *
 * `examineA` NE SE REECRIT PAS, meme motif que `publieA` sur un avis : il porte
 * le PREMIER examen. La clause `examineA: null` le garantit sans lecture
 * prealable, et sans elle chaque changement d'avis rajeunirait le traitement.
 */
export async function cloturerSignalement(
  client: ClientBase,
  parametres: {
    signalementId: string;
    statut: StatutSignalement;
    suiteDonnee: string | null;
    maintenant?: Date;
  },
): Promise<void> {
  const maintenant = parametres.maintenant ?? new Date();

  /*
   * LES DEUX COLONNES S'ECRIVENT DANS LA MEME INSTRUCTION, ET LA CONTRAINTE
   * C43 L'IMPOSE. Ma premiere version les separait, comme `publieA` sur un
   * avis : le premier `update` posait `RETENU` sans date, et le CHECK, qui est
   * une EQUIVALENCE verifiee ligne a ligne, refusait aussitot.
   *
   * LA CONTRAINTE A EU RAISON CONTRE MON CODE, mesure le 11 septembre 2026.
   * C'est precisement son role : elle interdit d'affirmer un examen sans dire
   * quand. Le motif d'un avis, lui, n'a aucun CHECK equivalent, ce qui a permis
   * au defaut d'ecrasement d'y vivre jusqu'a la revue critique.
   *
   * `examineA` NE SE REECRIT PAS POUR AUTANT : il porte le PREMIER examen. La
   * lecture prealable est ici INDISPENSABLE, la clause `examineA: null` d'un
   * `updateMany` ne pouvant pas cohabiter avec l'ecriture du statut.
   */
  const existant = await client.signalementAvis.findUnique({
    where: { id: parametres.signalementId },
    select: { examineA: true },
  });

  if (existant === null) {
    /*
     * LE `P2025` QUE L'APPELANT ATTEND, leve par `update` sur une ligne
     * absente. Le rendre ici plutot que de laisser passer un `update` qui
     * echouerait de toute facon garde le message d'erreur de Prisma, que le
     * service traduit deja.
     */
    await client.signalementAvis.update({
      where: { id: parametres.signalementId },
      data: { statut: parametres.statut },
    });

    return;
  }

  await client.signalementAvis.update({
    where: { id: parametres.signalementId },
    data: {
      statut: parametres.statut,
      examineA: existant.examineA ?? maintenant,
      /*
       * LA SUITE N'EST ECRITE QUE SI ELLE EXISTE, meme motif que
       * `motifDecision` sur un avis : ecrire `null` effacerait celle d'un
       * examen precedent, defaut mesure par la revue critique du 11 septembre
       * 2026 sur la moderation.
       */
      ...(parametres.suiteDonnee === null
        ? {}
        : { suiteDonnee: parametres.suiteDonnee }),
    },
  });
}

/**
 * L'avis vise par un signalement, s'il est PUBLIE.
 *
 * LE FILTRE SUR `PUBLIE` EST UN CONTROLE D'AUTORISATION, pas une commodite.
 * Accepter un signalement sur un avis `DEPOSE` confirmerait son existence a
 * quelqu'un qui n'a pas pu le lire : le formulaire deviendrait un oracle sur la
 * file de moderation, et sur l'existence d'un avis que l'exploitante n'a pas
 * encore relu.
 *
 * ELLE NE REND QUE L'IDENTIFIANT. L'appelant n'a besoin de rien d'autre :
 * remonter la note ou le commentaire exposerait le contenu d'un avis a une
 * fonction dont le seul travail est de dire « cet avis est signalable ».
 */
export async function lireAvisPubliePourSignalement(
  client: ClientBase,
  avisId: string,
): Promise<{ id: string } | null> {
  return client.avis.findFirst({
    where: { id: avisId, statut: "PUBLIE" },
    select: { id: true },
  });
}

/**
 * Un avis publie, tel que l'ecran de signalement le rappelle.
 *
 * ELLE REND LE CONTENU LA OU `lireAvisPubliePourSignalement` ne rend que
 * l'identifiant, ET LA DISTINCTION EST DELIBEREE. Cette lecture sert a
 * AFFICHER l'avis conteste, l'autre a decider s'il est signalable : donner le
 * contenu a la seconde exposerait un avis a une fonction qui n'en a pas besoin.
 *
 * MEME FILTRE SUR `PUBLIE`, pour la meme raison : un avis en attente de
 * relecture ne doit pas devenir lisible par quiconque forge une URL.
 */
export async function lireAvisASignaler(
  client: ClientBase,
  avisId: string,
): Promise<{
  id: string;
  note: number;
  commentaire: string | null;
  publieA: Date | null;
  experienceA: Date;
  libelleProduitFige: string;
} | null> {
  const avis = await client.avis.findFirst({
    where: { id: avisId, statut: "PUBLIE" },
    select: {
      id: true,
      note: true,
      commentaire: true,
      publieA: true,
      experienceA: true,
      ligneCommande: { select: { libelleProduitFige: true } },
    },
  });

  if (avis === null) {
    return null;
  }

  return {
    id: avis.id,
    note: avis.note,
    commentaire: avis.commentaire,
    publieA: avis.publieA,
    experienceA: avis.experienceA,
    libelleProduitFige: avis.ligneCommande.libelleProduitFige,
  };
}
