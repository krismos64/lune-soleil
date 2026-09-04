/**
 * Ecritures et lectures du document comptable, LS-126, etape 8 du parcours 1.
 *
 * Ce fichier n'ouvre aucune transaction et ne decide rien : le service appelant
 * lui passe le client transactionnel, et c'est lui qui juge si le document doit
 * etre emis.
 *
 * IL N'Y A AUCUNE SUPPRESSION DANS CE FICHIER, ET UNE SEULE MODIFICATION.
 * L'invariant 4 est absolu : une facture n'est jamais modifiee ni supprimee,
 * une correction produit un avoir.
 *
 * L'UNIQUE `update` PORTE SUR `cheminPdf`, LS-129, et il ne contredit pas cet
 * invariant : ce champ ne fait PAS partie de l'instantane legal, il dit ou se
 * trouve le fichier. Le document reste immuable, sa representation sur disque
 * est renseignee apres coup, regle F8. Aucune autre colonne n'est modifiable
 * ici, le `select` de l'ecriture le montrant. Le jour ou
 * `montantAvoirCentimes` devra bouger, ce sera par la transaction qui cree
 * l'avoir, LS-128, et sous le `CHECK` qui le borne.
 */
import type { Prisma } from "@/generated/prisma/client";
import { schemaInstantaneLegal, type InstantaneLegal } from "@/lib/validation";
import type { ClientBase } from "@/repositories/stock";

/** Ce qu'une facture expose une fois lue, sans son instantane. */
export type FactureEmise = {
  id: string;
  numero: string;
  montantTotalCentimes: number;
};

/**
 * Retrouve la facture d'une commande, s'il y en a une.
 *
 * LA LECTURE PRECEDE L'ECRITURE, ET CE N'EST PAS UN CHOIX DE STYLE. Une
 * violation d'unicite dans une transaction PostgreSQL AVORTE LA TRANSACTION
 * ENTIERE, code `25P02` : toute instruction suivante echoue par « current
 * transaction is aborted », y compris celles qui n'ont rien a voir. Rattraper
 * `P2002` puis continuer ne marche donc pas ici. Le motif est deja ecrit dans
 * `repositories/confirmation.ts` pour le mouvement de stock, mesure le 27 aout
 * 2026 : la suppression des reservations echouait juste apres.
 *
 * LA CONTRAINTE `facture_commande_id_key` RESTE LA SECONDE LIGNE DE DEFENSE, et
 * elle n'est pas redondante : entre cette lecture et l'ecriture, un autre chemin
 * peut inserer la meme facture. La lecture porte le cas nominal du croisement,
 * la contrainte porte la concurrence reelle, et l'echec de la transaction est
 * alors le bon comportement puisque le prestataire rejouera.
 */
export async function lireFactureDeCommande(
  client: ClientBase,
  commandeId: string,
): Promise<FactureEmise | null> {
  return client.facture.findUnique({
    where: { commandeId },
    select: { id: true, numero: true, montantTotalCentimes: true },
  });
}

/**
 * Ecrit la facture, document immuable.
 *
 * `montantAvoirCentimes` N'EST PAS RENSEIGNE ICI, son defaut valant zero en
 * base : une facture nait sans avoir. Le poser explicitement a zero
 * dupliquerait la valeur par defaut du schema, qui resterait alors a
 * synchroniser a la main.
 *
 * `cheminPdf` RESTE NUL, ET C'EST UN ETAT ATTENDU, regle F8. La facture existe
 * en base avant son rendu : l'invariant 4 porte sur l'instantane, pas sur le
 * fichier. Le rendu et sa reprise sont le sujet de LS-129, et un champ nul y
 * declenche une `AlerteCritique` plutot que d'invalider le document.
 */
export async function ecrireFacture(
  client: ClientBase,
  parametres: {
    commandeId: string;
    numero: string;
    montantTotalCentimes: number;
    instantaneLegal: InstantaneLegal;
  },
): Promise<FactureEmise> {
  return client.facture.create({
    data: {
      commandeId: parametres.commandeId,
      numero: parametres.numero,
      montantTotalCentimes: parametres.montantTotalCentimes,
      /*
       * LE CAST EST CELUI DE PRISMA POUR UNE COLONNE `Json`, et il ne masque
       * aucune incertitude : la valeur a ete validee par `schemaInstantaneLegal`
       * dans le service AVANT d'arriver ici. Le typage de Prisma pour `Json`
       * n'admet pas un type d'objet nomme, ce qui n'enleve rien a la garantie.
       */
      instantaneLegal:
        parametres.instantaneLegal as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, numero: true, montantTotalCentimes: true },
  });
}

/** Ce qu'il faut pour rendre le document, et rien de plus. */
export type FactureARendre = {
  id: string;
  numero: string;
  emiseA: Date;
  instantaneLegal: InstantaneLegal;
  /** Nul tant qu'aucun rendu n'a abouti, regle F8 : l'etat « PDF en echec ». */
  cheminPdf: string | null;
};

/**
 * Relit une facture pour son rendu, LS-129.
 *
 * ELLE REND L'INSTANTANE ET NON LA COMMANDE, invariant 3. Le gabarit ne doit
 * avoir aucun moyen de relire le catalogue : lui passer un `commandeId` suffirait
 * a ce qu'un jour quelqu'un remonte au produit courant, et la facture emise
 * changerait avec lui.
 *
 * `cheminPdf` EST RENDU AVEC LE RESTE, dans la MEME lecture. Le lire a part
 * demanderait deux requetes dont la seconde pourrait voir un etat plus recent
 * que la premiere : le service deciderait alors de rendre sur un etat, et
 * ecrirait sur un autre.
 *
 * IL NE VAUT PAS GARANTIE D'EXCLUSION pour autant. Entre cette lecture et
 * l'ecriture du fichier, un autre chemin peut rendre le meme document : c'est
 * l'ecriture atomique du stockage qui rend ce croisement inoffensif, les deux
 * rendus produisant le meme contenu au meme endroit.
 */
export async function lireFactureARendre(
  client: ClientBase,
  factureId: string,
): Promise<FactureARendre | null> {
  const facture = await client.facture.findUnique({
    where: { id: factureId },
    select: {
      id: true,
      numero: true,
      emiseA: true,
      instantaneLegal: true,
      cheminPdf: true,
    },
  });

  if (facture === null) {
    return null;
  }

  return {
    id: facture.id,
    numero: facture.numero,
    emiseA: facture.emiseA,
    cheminPdf: facture.cheminPdf,
    /*
     * LE CONTENU EST REVALIDE A LA RELECTURE, et ce n'est pas de la defiance
     * envers l'ecriture. La colonne est un `Json` libre : une migration future,
     * une reprise de donnees ou une version d'instantane plus ancienne y
     * mettraient une forme que le gabarit ne sait pas rendre. Echouer ICI laisse
     * `cheminPdf` nul et leve une alerte, ce qui est le comportement voulu ;
     * echouer dans le gabarit produirait la meme chose par accident, sans dire
     * pourquoi.
     */
    instantaneLegal: schemaInstantaneLegal.parse(facture.instantaneLegal),
  };
}

/**
 * Pose le chemin du PDF rendu, LS-129.
 *
 * SEULE ECRITURE DE MODIFICATION DE CE FICHIER, et elle ne contredit pas
 * l'invariant 4 : `cheminPdf` ne fait PAS partie de l'instantane legal. Le
 * document reste immuable, seule sa representation sur disque est renseignee.
 *
 * LE NUMERO N'EST JAMAIS TOUCHE, critere 5 de LS-129. Une regeneration repasse
 * ici et ne modifie que ce champ : la clause `select` ne porte que `cheminPdf`,
 * et il n'existe aucun chemin de code capable de reattribuer un rang.
 */
export async function poserCheminPdfFacture(
  client: ClientBase,
  factureId: string,
  cheminRelatif: string,
): Promise<void> {
  await client.facture.update({
    where: { id: factureId },
    data: { cheminPdf: cheminRelatif },
    select: { cheminPdf: true },
  });
}

/** Ce qu'il faut pour servir un document deja rendu, LS-132. */
export type FactureAServir = {
  id: string;
  numero: string;
  /** Nul tant qu'aucun rendu n'a abouti, regle F8 : il n'y a alors rien a servir. */
  cheminPdf: string | null;
};

/**
 * Retrouve la facture d'une commande pour la servir, LS-132.
 *
 * DISTINCTE DE `lireFactureDeCommande`, qui rend le montant pour decider d'une
 * emission, et de `lireFactureARendre`, qui part d'un identifiant de facture et
 * rend l'instantane complet pour le gabarit. Servir un fichier ne demande ni le
 * montant ni l'instantane : les charger exposerait l'identite du client a un
 * chemin qui n'en a pas besoin.
 *
 * ELLE PART DE LA COMMANDE parce que c'est le jeton qui designe la commande,
 * regle L11. Le controle de propriete est ainsi structurel : aucun identifiant
 * de facture ne circule, donc aucun ne peut etre substitue, invariant 2.
 */
export async function lireFactureAServir(
  client: ClientBase,
  commandeId: string,
): Promise<FactureAServir | null> {
  /*
   * LA COMMANDE DISSOCIEE NE SERT PLUS SES DOCUMENTS, ajout de LS-57 et
   * SECONDE LIGNE DE DEFENSE.
   *
   * La premiere est la revocation des jetons dans la transaction de
   * suppression, `services/suppression-compte.ts`. Celle-ci la double parce
   * qu'une revocation oubliee par un chemin futur, un jeton reemis apres coup
   * par exemple, rouvrirait le trou entier : ici la garde est vraie quel que
   * soit l'etat du jeton.
   *
   * CE QUE CELA FERME, mesure par `ls-critical-reviewer` : un lien de facture
   * recu par email restait valide jusqu'a trente jours apres que la personne
   * ait exerce son droit a l'effacement, et servait un PDF portant son nom, son
   * adresse figee et ses montants.
   *
   * `findFirst` ET NON `findUnique` : la condition porte desormais sur la
   * commande liee, ce qu'une recherche par cle unique n'exprime pas.
   */
  return client.facture.findFirst({
    where: { commandeId, commande: { dissocieA: null } },
    select: { id: true, numero: true, cheminPdf: true },
  });
}

/**
 * Une piece comptable de la liste d'administration, LS-184.
 *
 * FACTURE ET AVOIR PARTAGENT CE TYPE, et le prototype les melange dans une
 * seule liste chronologique : c'est la forme juste, une comptabilite se lit par
 * date d'emission et non par nature de document.
 *
 * `montantCentimes` EST SIGNE, negatif pour un avoir. Ce n'est pas un artifice
 * d'affichage : un avoir RETIRE de l'encaisse, et le total de la periode se
 * calcule en additionnant ces montants tels quels. Une valeur absolue
 * obligerait chaque appelant a retrouver le sens, ce qu'un oubli ferait compter
 * un remboursement comme une recette.
 */
export type PieceComptable = {
  id: string;
  type: "FACTURE" | "AVOIR";
  numero: string;
  emiseA: Date;
  /** Signe : positif pour une facture, negatif pour un avoir. */
  montantCentimes: number;
  /** Le numero de la commande a laquelle la piece se rattache. */
  numeroCommande: string;
  /** Le nom fige a la commande, invariant 3, jamais le nom actuel du compte. */
  nomClient: string;
  /** Nul signifie un rendu PDF en echec, LS-129, jamais un document absent. */
  cheminPdf: string | null;
  /** Pour un avoir, le numero de la facture qu'il corrige. Nul sur une facture. */
  numeroFactureCorrigee: string | null;
};

/**
 * Les pieces comptables emises sur une periode, LS-184.
 *
 * LES DEUX TABLES SONT LUES SEPAREMENT PUIS FUSIONNEES, et il n'y a pas de
 * meilleure voie : `Facture` et `Avoir` sont deux entites distinctes, sans
 * ancetre commun. Une union SQL brute rendrait les colonnes typees a la main,
 * ce que `.claude/rules/database.md` reserve aux cas ou l'ORM ne suffit pas ;
 * ici il suffit, deux requetes indexees sur `emise_a` et `emis_a`.
 *
 * LA COMMANDE DISSOCIEE RESTE LISTEE, ET C'EST L'INVERSE DE
 * `lireFactureAServir`. Celle-la sert le CLIENT par lien signe, et une personne
 * ayant exerce son droit a l'effacement ne doit plus recevoir ses documents.
 * Celle-ci sert l'EXPLOITANTE, qui doit pouvoir presenter ses pieces a
 * l'administration fiscale : l'article L123-22 du code de commerce impose de
 * les conserver dix ans, et l'article 17 paragraphe 3 point b du RGPD ecarte
 * l'effacement quand la loi impose la conservation. Retirer ces factures de la
 * liste creerait un trou dans une numerotation qui doit etre continue.
 *
 * LE NOM VIENT DE `Commande.nomClient`, FIGE A L'ACHAT, jamais du compte : le
 * profil peut avoir change depuis, et un document comptable porte le nom qu'il
 * portait a l'emission, invariant 3. Ce champ est deja la copie figee, la
 * jointure est donc exacte tout en evitant de charger l'instantane legal
 * entier, qui porte toutes les lignes de la commande.
 *
 * LE PLAFOND EST APPLIQUE PAR REQUETE PUIS APRES FUSION, ce qui peut rendre
 * moins de lignes que `limite` en apparence : c'est voulu et l'appelant le sait
 * par `limiteAtteinte`. Prendre `limite` de chaque table garantit que les
 * `limite` plus recentes toutes tables confondues sont bien dans le lot.
 */
export async function listerPiecesComptables(
  client: ClientBase,
  options: { depuis?: Date; jusqua?: Date; limite: number },
): Promise<{ pieces: PieceComptable[]; limiteAtteinte: boolean }> {
  const { depuis, jusqua, limite } = options;

  /*
   * LA BORNE HAUTE EST INCLUSIVE COTE APPELANT, ET C'EST LUI QUI LA CONSTRUIT.
   * Ce fichier ne decide rien : il reçoit deux instants et filtre. Le service
   * traduit « le mois de juillet » en deux instants, ce qui garde ici une
   * requete sans regle metier.
   */
  const fenetre =
    depuis || jusqua
      ? {
          ...(depuis ? { gte: depuis } : {}),
          ...(jusqua ? { lte: jusqua } : {}),
        }
      : undefined;

  const [factures, avoirs] = await Promise.all([
    client.facture.findMany({
      where: fenetre ? { emiseA: fenetre } : {},
      orderBy: { emiseA: "desc" },
      take: limite + 1,
      select: {
        id: true,
        numero: true,
        emiseA: true,
        montantTotalCentimes: true,
        cheminPdf: true,
        commande: { select: { numero: true, nomClient: true } },
      },
    }),
    client.avoir.findMany({
      where: fenetre ? { emisA: fenetre } : {},
      orderBy: { emisA: "desc" },
      take: limite + 1,
      select: {
        id: true,
        numero: true,
        emisA: true,
        montantCentimes: true,
        cheminPdf: true,
        facture: {
          select: {
            numero: true,
            commande: { select: { numero: true, nomClient: true } },
          },
        },
      },
    }),
  ]);

  /*
   * `take: limite + 1` SUR CHAQUE TABLE : la ligne excedentaire ne s'affiche
   * pas, elle REPOND A LA QUESTION « y en a-t-il d'autres ». Compter par un
   * `count` separe couterait une requete de plus et repondrait sur un instant
   * different, motif de LS-163.
   */
  const limiteAtteinte = factures.length > limite || avoirs.length > limite;

  const pieces: PieceComptable[] = [
    ...factures.map((facture) => ({
      id: facture.id,
      type: "FACTURE" as const,
      numero: facture.numero,
      emiseA: facture.emiseA,
      montantCentimes: facture.montantTotalCentimes,
      numeroCommande: facture.commande.numero,
      nomClient: facture.commande.nomClient,
      cheminPdf: facture.cheminPdf,
      numeroFactureCorrigee: null,
    })),
    ...avoirs.map((avoir) => ({
      id: avoir.id,
      type: "AVOIR" as const,
      numero: avoir.numero,
      emiseA: avoir.emisA,
      /*
       * LE SIGNE EST POSE ICI, une seule fois. Le montant est stocke POSITIF en
       * base, `chk_facture_avoir_borne` le comparant au total de la facture :
       * c'est la lecture qui lui donne son sens comptable, et le faire une
       * seule fois evite qu'un appelant l'oublie en sommant.
       */
      montantCentimes: -avoir.montantCentimes,
      numeroCommande: avoir.facture.commande.numero,
      nomClient: avoir.facture.commande.nomClient,
      cheminPdf: avoir.cheminPdf,
      numeroFactureCorrigee: avoir.facture.numero,
    })),
  ]
    .sort((a, b) => b.emiseA.getTime() - a.emiseA.getTime())
    .slice(0, limite);

  return { pieces, limiteAtteinte };
}
