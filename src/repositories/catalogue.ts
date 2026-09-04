/**
 * Acces aux donnees du catalogue, LS-99.
 *
 * Ce fichier n'ouvre aucune transaction et ne decide rien : le service appelant
 * lui passe le client, transactionnel quand l'operation l'exige.
 *
 * POURQUOI DU SQL BRUT POUR LE SEUL REORDONNANCEMENT. `categorie.ordre` porte
 * une contrainte UNIQUE DEFERRABLE INITIALLY DEFERRED, C24, que l'API typee de
 * Prisma ne connait pas : elle n'a pas de moyen d'exprimer une ecriture dont la
 * coherence n'est vraie qu'au COMMIT. Le reste passe par l'API typee.
 */
import { Prisma } from "@/generated/prisma/client";
import type { StatutProduit } from "@/generated/prisma/enums";

/**
 * Client utilisable par ces fonctions : le client principal ou le client
 * transactionnel remis par `$transaction`.
 */
export type ClientBase = Prisma.TransactionClient;

/** Une categorie et le nombre de produits qu'elle porte. */
export type CategorieAvecCompte = {
  id: string;
  nom: string;
  slug: string;
  ordre: number;
  nombreProduits: number;
};

/**
 * Categories dans l'ordre de la boutique, avec leur compte de produits.
 *
 * `orderBy: ordre` ET RIEN D'AUTRE. Trier par nom contredirait LS-49, qui a
 * tranche que l'ordre est choisi par l'exploitante ; l'absence de tri explicite
 * laisserait PostgreSQL rendre les lignes dans l'ordre du plan d'execution, qui
 * change avec le volume.
 *
 * LE COMPTE N'EST PAS FILTRE. Un produit archive occupe toujours sa categorie
 * du point de vue de la cle etrangere : l'exclure ferait annoncer « categorie
 * vide » sur une categorie que la base refuse de supprimer, C26.
 */
export async function listerCategories(
  client: ClientBase,
): Promise<CategorieAvecCompte[]> {
  const lignes = await client.categorie.findMany({
    orderBy: { ordre: "asc" },
    include: { _count: { select: { produits: true } } },
  });

  return lignes.map((ligne) => ({
    id: ligne.id,
    nom: ligne.nom,
    slug: ligne.slug,
    ordre: ligne.ordre,
    nombreProduits: ligne._count.produits,
  }));
}

/**
 * Rang le plus eleve actuellement attribue, ou 0 si aucune categorie.
 *
 * LE MAXIMUM ET NON LE NOMBRE. Les deux divergent des qu'une categorie du
 * milieu est supprimee : trois categories aux rangs 1, 2, 3, la deuxieme
 * supprimee, un comptage rendrait 2 et le rang suivant calcule vaudrait 3, deja
 * pris. La contrainte C24 rejetterait l'ecriture.
 *
 * ZERO SUR UNE BASE VIDE, ce qui donne 1 au premier rang attribue et satisfait
 * `chk_categorie_ordre_positif`.
 */
export async function rangMaximal(client: ClientBase): Promise<number> {
  const resultat = await client.categorie.aggregate({ _max: { ordre: true } });
  return resultat._max.ordre ?? 0;
}

export async function creerCategorie(
  client: ClientBase,
  donnees: { nom: string; slug: string; ordre: number },
) {
  return client.categorie.create({ data: donnees });
}

export async function lireCategorie(client: ClientBase, id: string) {
  return client.categorie.findUnique({ where: { id } });
}

export async function renommerCategorie(
  client: ClientBase,
  id: string,
  nom: string,
) {
  return client.categorie.update({ where: { id }, data: { nom } });
}

export async function supprimerCategorie(client: ClientBase, id: string) {
  return client.categorie.delete({ where: { id } });
}

export async function compterProduits(
  client: ClientBase,
  categorieId: string,
): Promise<number> {
  // AUCUN FILTRE SUR LE STATUT, meme raison que dans `listerCategories` : la
  // cle etrangere ne fait pas de difference entre un produit archive et un
  // autre, et ce compte sert a expliquer un refus C26.
  return client.produit.count({ where: { categorieId } });
}

/**
 * Ecrit le rang d'une categorie, en SQL brut.
 *
 * POURQUOI `$executeRaw` ICI. Cette instruction s'execute au milieu d'une
 * permutation, dans un etat ou deux categories partagent momentanement un rang.
 * C'est legitime, la contrainte etant DIFFERABLE INITIALLY DEFERRED donc
 * verifiee au COMMIT. L'API typee de Prisma passerait aussi, mais le SQL rend
 * visible ce que cette ecriture a de particulier, et le commentaire tient avec.
 *
 * NE JAMAIS TRANSFORMER CET APPEL EN UPSERT. Aucun `ON CONFLICT` ne peut
 * arbitrer sur une contrainte differable, PostgreSQL le refuse explicitement.
 */
export async function ecrireRang(
  client: ClientBase,
  id: string,
  ordre: number,
): Promise<void> {
  await client.$executeRaw`UPDATE categorie SET ordre = ${ordre} WHERE id = ${id}`;
}

export async function creerProduit(
  client: ClientBase,
  donnees: { nom: string; slug: string; categorieId: string },
) {
  // `statut` N'EST PAS ECRIT : la valeur par defaut du schema, BROUILLON,
  // s'applique. L'ecrire ici ouvrirait la porte a ce qu'un appelant le choisisse
  // un jour en passant par ce parametre.
  return client.produit.create({ data: donnees });
}

/** Un produit et ses informations generales, pour l'ecran d'edition. */
export async function lireProduit(client: ClientBase, id: string) {
  return client.produit.findUnique({
    where: { id },
    select: {
      id: true,
      nom: true,
      slug: true,
      categorieId: true,
      descriptionCourte: true,
      statut: true,
    },
  });
}

/**
 * Ecrit les informations generales d'un produit, LS-100.
 *
 * NI `slug`, NI `statut`, NI `categorieId` dans la signature, et c'est
 * deliberement redit ici : le slug porte l'adresse publique, le statut a ses
 * propres conditions de transition, LS-103. C'est le genre de completude qu'une
 * relecture ajoute de bonne foi.
 *
 * AUCUNE SECTION N'EST TOUCHEE, ADR-026 decision 5. Une initialisation des
 * quatre sections placee ici ferait revenir vide celle que l'administratrice
 * vient de supprimer, a chaque enregistrement.
 */
export async function ecrireInformationsProduit(
  client: ClientBase,
  id: string,
  donnees: { nom: string; descriptionCourte: string | null },
) {
  return client.produit.update({ where: { id }, data: donnees });
}

/**
 * Etat de publication d'un produit, LS-103.
 *
 * `publieA` EST RENDU AVEC LE STATUT parce que la publication doit savoir s'il
 * existe deja : un produit archive puis republie GARDE sa date d'origine, le
 * schema le dit explicitement. La lire au moment d'ecrire evite une seconde
 * requete et rend la condition visible dans le service.
 */
export async function lireEtatPublication(client: ClientBase, id: string) {
  return client.produit.findUnique({
    where: { id },
    select: { id: true, statut: true, publieA: true, archiveA: true },
  });
}

/**
 * Ce qui manque a un produit pour etre publiable. C1, C7 et C8.
 *
 * UNE SEULE REQUETE POUR LES QUATRE CONDITIONS, et surtout des COMPTES plutot
 * que des listes : l'ecran nomme ce qui manque, il n'a pas besoin de savoir
 * QUEL media n'a pas de texte alternatif. Ramener les lignes entieres ferait
 * transiter des chemins de fichiers pour afficher un nombre.
 *
 * LES MEDIAS EN ECHEC SONT COMPTES A PART DE CEUX SANS TEXTE, C8 et C7 etant
 * deux regles distinctes : un media en echec ne se corrige qu'en le supprimant
 * et en le reteleversant, un texte alternatif manquant se saisit sur place. Les
 * fondre en un seul compte donnerait un message qui ne dit pas quoi faire.
 */
export async function compterConditionsPublication(
  client: ClientBase,
  produitId: string,
): Promise<{
  variantesVivantes: number;
  mediasTraites: number;
  mediasNonTraites: number;
  mediasSansTexte: number;
  aMediaPrincipal: boolean;
}> {
  const [
    variantesVivantes,
    mediasTraites,
    mediasNonTraites,
    mediasSansTexte,
    principal,
  ] = await Promise.all([
    client.variante.count({ where: { produitId, archiveeA: null } }),
    client.media.count({ where: { produitId, statutTraitement: "TRAITE" } }),
    client.media.count({
      where: { produitId, statutTraitement: { not: "TRAITE" } },
    }),
    // LE TEXTE VIDE COMPTE COMME MANQUANT au meme titre que `null` : le
    // schema Zod de LS-102 transforme deja une saisie vide en `null`, mais
    // une ligne ecrite autrement ne passe pas par lui.
    client.media.count({
      where: {
        produitId,
        OR: [{ texteAlternatif: null }, { texteAlternatif: "" }],
      },
    }),
    client.media.findFirst({
      where: { produitId, ordre: 1 },
      select: { id: true },
    }),
  ]);

  return {
    variantesVivantes,
    mediasTraites,
    mediasNonTraites,
    mediasSansTexte,
    aMediaPrincipal: principal !== null,
  };
}

/**
 * Ecrit le statut d'un produit et les horodatages qui l'accompagnent.
 *
 * `publieA` N'EST PASSE QUE S'IL DOIT CHANGER. Le schema est explicite : un
 * produit depublie puis republie GARDE sa date d'origine, comme `Avis.publieA`,
 * parce qu'elle porte l'anteriorite affichee et le tri des nouveautes. La
 * reecrire ferait remonter en tete des nouveautes un produit ancien.
 */
export async function ecrireStatutProduit(
  client: ClientBase,
  id: string,
  donnees: {
    statut: StatutProduit;
    publieA?: Date;
    archiveA?: Date | null;
  },
) {
  return client.produit.update({ where: { id }, data: donnees });
}

/**
 * Nombre de variantes non archivees d'un produit, C19.
 *
 * DISTINCT DE `compterConditionsPublication`, qui compte cinq choses en une
 * requete pour l'ecran. Celle-ci sert la transaction d'archivage de variante,
 * ou compter le reste serait du travail inutile.
 */
export async function compterVariantesVivantes(
  client: ClientBase,
  produitId: string,
): Promise<number> {
  return client.variante.count({ where: { produitId, archiveeA: null } });
}

/** Une ligne du catalogue public, telle que la grille l'affiche. */
export type ProduitCatalogue = {
  id: string;
  nom: string;
  slug: string;
  categorieId: string;
  categorieNom: string;
  publieA: Date | null;
  prixMinimumCentimes: number;
  quantiteDisponible: number;
  mediaChemin: string | null;
  mediaTexteAlternatif: string | null;
};

/**
 * Produits du catalogue public, LS-104.
 *
 * SEUL `ACTIF` SORT D'ICI, et le filtre vit dans la REQUETE plutot que dans le
 * service : un oubli cote appelant exposerait des brouillons, c'est-a-dire du
 * travail en cours et des prix non arretes. La condition est au plus pres de la
 * base, ou aucun chemin ne la contourne.
 *
 * UNE SEULE REQUETE, ET DU SQL BRUT. Le catalogue affiche par produit le prix le
 * plus bas de ses variantes vendables et leur disponibilite cumulee : deux
 * agregats que l'API typee de Prisma ne sait pas produire en une passe sans
 * ramener toutes les variantes puis les replier en memoire. Sur 40 references le
 * cout serait invisible, mais la logique de disponibilite se retrouverait alors
 * dans un composant, ce que l'architecture interdit.
 *
 * LA DISPONIBILITE EST `quantite_physique - quantite_reservee`, la meme formule
 * que la reservation atomique de `stock.ts`. Une piece reservee par un autre
 * client n'est pas disponible : afficher la seule quantite physique promettrait
 * un bijou deja engage dans une commande en cours de paiement.
 *
 * UNE SEULE CONDITION RETIRE UNE VARIANTE DU COMPTE : l'archivage. Ni le stock
 * nul ni la vente web desactivee ne la retirent, et la nuance a ete tranchee par
 * la revue de LS-104.
 *
 * LA VENTE WEB DESACTIVEE DONNE « EPUISE », ELLE NE FAIT PAS DISPARAITRE. La
 * table des etats de `frontend-design.md` la donne comme condition de l'etat
 * `Epuise`, au meme titre que la quantite nulle. Une premiere version ajoutait
 * `AND v.vente_web_activee = true` au JOIN : une piece partie sur un marche
 * sortait alors du catalogue, perdant son adresse publique et son referencement,
 * pour revenir plus tard sous une URL que plus personne n'avait en favori.
 *
 * C'est aussi ce que dit l'invariant 6 : suspendre la vente web et retirer du
 * catalogue sont deux gestes distincts.
 *
 * LA DISPONIBILITE, ELLE, COMPTE LA VENTE WEB. `CASE` plutot que le retrait :
 * une variante hors vente web contribue zero au stock disponible, donc le
 * produit s'affiche « Epuise » s'il n'a rien d'autre a vendre.
 *
 * UN PRODUIT SANS AUCUNE VARIANTE VIVANTE NE SORT PAS. `INNER JOIN` et non
 * `LEFT` : C19 archive un produit dont la derniere variante part, donc ce cas ne
 * devrait pas exister, et le rendre sans prix n'apporterait rien.
 *
 * LE MEDIA PRINCIPAL EST `ordre = 1`, ce que l'index partiel
 * `media_principal_unique` rend unique par produit. `LEFT JOIN` cette fois : une
 * fiche sans photo reste affichable, avec un emplacement vide, plutot que de
 * disparaitre du catalogue sans que personne ne comprenne pourquoi.
 *
 * AUCUNE LIMITE, ni `LIMIT` ni pagination. Le dimensionnement du catalogue,
 * 10 a 40 references, l'exclut explicitement, et `frontend-design.md` interdit
 * d'introduire un plafond que le schema ne porte pas.
 */
export async function listerProduitsPublies(
  client: ClientBase,
  filtre: { categorieId?: string } = {},
): Promise<ProduitCatalogue[]> {
  /*
   * LE FILTRE DE CATEGORIE EST PARAMETRE, JAMAIS CONCATENE. Il vient d'une URL
   * publique, donc d'une entree non fiable, invariant 7 : `Prisma.sql` produit
   * ici une requete parametree, et `$queryRaw` la transmet telle quelle.
   */
  const conditionCategorie = filtre.categorieId
    ? Prisma.sql`AND p.categorie_id = ${filtre.categorieId}`
    : Prisma.empty;

  const lignes = await client.$queryRaw<
    {
      id: string;
      nom: string;
      slug: string;
      categorieId: string;
      categorieNom: string;
      publieA: Date | null;
      prixMinimumCentimes: bigint | number;
      quantiteDisponible: bigint | number;
      mediaChemin: string | null;
      mediaTexteAlternatif: string | null;
    }[]
  >`
    SELECT
      p.id,
      p.nom,
      p.slug,
      p.categorie_id           AS "categorieId",
      c.nom                    AS "categorieNom",
      p.publie_a               AS "publieA",
      min(v.prix_centimes)     AS "prixMinimumCentimes",
      sum(
        CASE WHEN v.vente_web_activee
             THEN greatest(v.quantite_physique - v.quantite_reservee, 0)
             ELSE 0
        END
      )                        AS "quantiteDisponible",
      m.chemin                 AS "mediaChemin",
      m.texte_alternatif       AS "mediaTexteAlternatif"
    FROM produit p
    JOIN categorie c ON c.id = p.categorie_id
    JOIN variante v ON v.produit_id = p.id
      AND v.archivee_a IS NULL
    LEFT JOIN media m ON m.produit_id = p.id AND m.ordre = 1
    WHERE p.statut = 'ACTIF'
    ${conditionCategorie}
    GROUP BY p.id, p.nom, p.slug, p.categorie_id, c.nom, p.publie_a,
             m.chemin, m.texte_alternatif
    ORDER BY p.publie_a DESC NULLS LAST, p.nom ASC
  `;

  /*
   * `min` ET `sum` DE POSTGRESQL RENDENT DU `bigint`, que le pilote transmet en
   * `BigInt` JavaScript. Le laisser passer ferait echouer la serialisation vers
   * le composant client, « Do not know how to serialize a BigInt », et les
   * comparaisons avec des nombres ordinaires plus loin.
   */
  return lignes.map((ligne) => ({
    ...ligne,
    prixMinimumCentimes: Number(ligne.prixMinimumCentimes),
    quantiteDisponible: Number(ligne.quantiteDisponible),
  }));
}

/**
 * Categories qui portent au moins un produit `ACTIF`, LS-104.
 *
 * FILTREES SUR LE CONTENU PUBLIE, contrairement a `listerCategories` qui sert
 * l'administration et compte tout. Proposer un filtre qui ne rend aucun resultat
 * fabrique l'etat vide au lieu de l'eviter.
 */
export async function listerCategoriesPubliees(
  client: ClientBase,
): Promise<{ id: string; nom: string; slug: string }[]> {
  return client.categorie.findMany({
    where: {
      produits: {
        some: {
          statut: "ACTIF",
          // MEME REGLE QUE LE CATALOGUE : seul l'archivage retire une variante.
          // Une categorie dont les pieces sont hors vente web reste proposee,
          // ses produits s'y affichant « Epuise ».
          variantes: { some: { archiveeA: null } },
        },
      },
    },
    select: { id: true, nom: true, slug: true },
    orderBy: { ordre: "asc" },
  });
}

/**
 * Une categorie par son slug, LS-104.
 *
 * SEPAREE DE `listerCategoriesPubliees`, et la distinction porte du sens. Cette
 * derniere alimente la barre de filtres et ne rend que ce qui a du contenu ;
 * celle-ci resout la categorie DEMANDEE, qu'elle soit vide ou non.
 *
 * Une categorie dont tout le contenu vient d'etre archive doit rester
 * identifiable, sans quoi l'ecran affiche le catalogue entier au lieu de dire
 * qu'il n'y a rien dans celle qu'on a demandee.
 */
export async function lireCategorieParSlug(
  client: ClientBase,
  slug: string,
): Promise<{ id: string; nom: string; slug: string } | null> {
  return client.categorie.findUnique({
    where: { slug },
    select: { id: true, nom: true, slug: true },
  });
}

/** Une variante telle que la fiche publique doit l'afficher, LS-105. */
export type VariantePubliee = {
  id: string;
  libelle: string;
  dimensions: string | null;
  prixCentimes: number;
  quantiteDisponible: number;
};

/** Une fiche produit publique, prete a afficher, LS-105. */
export type FicheProduit = {
  id: string;
  nom: string;
  slug: string;
  descriptionCourte: string | null;
  categorieNom: string;
  categorieSlug: string;
  variantes: VariantePubliee[];
};

/**
 * Une fiche produit publique par son slug, LS-105.
 *
 * `statut = 'ACTIF'` EST DANS LA REQUETE, ET C'EST LA GARDE DE LA STORY. Un
 * produit en BROUILLON porte du travail en cours et des prix non arretes : il
 * doit rendre 404 et non sa fiche, y compris pour qui devine son slug. La
 * condition vit ici plutot que dans le service pour la meme raison qu'en
 * `listerProduitsPublies` : au plus pres de la base, aucun chemin ne la
 * contourne.
 *
 * UN PRODUIT ARCHIVE NE SORT PAS NON PLUS, son statut n'etant pas `ACTIF`.
 *
 * LA DISPONIBILITE EST CALCULEE PAR VARIANTE, non cumulee comme au catalogue.
 * La fiche doit dire l'etat de la declinaison CHOISIE : cumuler donnerait « en
 * stock » sur une fiche dont la variante affichee est epuisee.
 *
 * LA FORMULE EST CELLE DU CATALOGUE, `quantite_physique - quantite_reservee`
 * sous condition de vente web. Une piece reservee par un autre client, paiement
 * en cours, n'est pas disponible ; une variante hors vente web contribue zero
 * et s'affiche donc « Epuise » sans disparaitre, invariant 6.
 *
 * LES VARIANTES ARCHIVEES SONT EXCLUES, C13 : elles ne sont jamais supprimees
 * mais ne se vendent plus, et les proposer au choix promettrait une declinaison
 * retiree du catalogue.
 *
 * L'ORDRE EST `cree_a` PUIS `libelle`, stable et independant du plan
 * d'execution. Sans tri explicite, PostgreSQL rend les lignes dans l'ordre qui
 * l'arrange, et le sens du selecteur de variante changerait avec le volume.
 */
export async function lireFicheParSlug(
  client: ClientBase,
  slug: string,
): Promise<FicheProduit | null> {
  const produit = await client.produit.findFirst({
    where: { slug, statut: "ACTIF" },
    select: {
      id: true,
      nom: true,
      slug: true,
      descriptionCourte: true,
      categorie: { select: { nom: true, slug: true } },
    },
  });

  if (produit === null) {
    return null;
  }

  const lignes = await client.$queryRaw<
    {
      id: string;
      libelle: string;
      dimensions: string | null;
      prixCentimes: number;
      quantiteDisponible: bigint | number;
    }[]
  >`
    SELECT
      v.id,
      v.libelle,
      v.dimensions,
      v.prix_centimes AS "prixCentimes",
      CASE WHEN v.vente_web_activee
           THEN greatest(v.quantite_physique - v.quantite_reservee, 0)
           ELSE 0
      END             AS "quantiteDisponible"
    FROM variante v
    WHERE v.produit_id = ${produit.id}
      AND v.archivee_a IS NULL
    ORDER BY v.cree_a ASC, v.libelle ASC
  `;

  return {
    id: produit.id,
    nom: produit.nom,
    slug: produit.slug,
    descriptionCourte: produit.descriptionCourte,
    categorieNom: produit.categorie.nom,
    categorieSlug: produit.categorie.slug,
    /*
     * `greatest` RENDS DU `bigint`, que le pilote transmet en `BigInt`
     * JavaScript. Le laisser passer ferait echouer la serialisation vers le
     * composant client du selecteur de variante, « Do not know how to serialize
     * a BigInt », defaut deja rencontre en LS-104.
     */
    variantes: lignes.map((ligne) => ({
      ...ligne,
      quantiteDisponible: Number(ligne.quantiteDisponible),
    })),
  };
}

/** Ce que la liste d'administration affiche d'un produit, LS-183. */
export type ProduitAdministration = {
  id: string;
  nom: string;
  categorieNom: string;
  statut: StatutProduit;
  publieA: Date | null;
  modifieA: Date;
  /**
   * Prix le plus bas parmi les variantes vivantes, `null` s'il n'y en a aucune.
   *
   * NULLABLE, ET C'EST LE CAS NOMINAL D'UN PRODUIT NEUF. `creerProduit` cree le
   * produit et ses sections, JAMAIS de variante : tout produit fraichement cree
   * passe donc par cet etat. Un type non nullable obligerait a inventer un zero,
   * que l'ecran afficherait comme un prix de 0,00 euro.
   */
  prixMinimumCentimes: number | null;
  /** Variantes non archivees, `0` disant « ce produit n'a rien a vendre ». */
  variantesVivantes: number;
  /**
   * Chemin du media principal, deja suffixe d'une barre, `null` sans photo
   * SERVABLE.
   *
   * AUCUN `mediaTexteAlternatif` ICI, contrairement a la lecture publique. La
   * vignette de l'administration est DECORATIVE, le lien voisin portant deja le
   * nom du produit : le texte alternatif y serait lu deux fois. Le remonter
   * sans l'employer serait du bruit, releve par la revue d'interface.
   */
  mediaChemin: string | null;
};

/**
 * Tous les produits, pour l'ecran d'administration, LS-183.
 *
 * ELLE NE REMPLACE PAS `listerProduitsPublies`, ET LES DEUX DOIVENT COEXISTER.
 * La lecture publique filtre sur `ACTIF` au plus pres de la donnee, ce qui
 * protege des brouillons ; celle-ci montre TOUT, ce qui est son objet. Les
 * fondre exposerait du travail en cours a la boutique le jour ou un appelant
 * oublierait son filtre.
 *
 * `LEFT JOIN` SUR LES VARIANTES, ET C'EST LA DIFFERENCE QUI COMPTE. La lecture
 * publique emploie un `JOIN` : un produit sans variante en disparait, ce qui est
 * juste pour la boutique, rien n'etant vendable. Ici ce serait un defaut GRAVE,
 * et pas un cas limite : `creerProduit` ne cree AUCUNE variante, donc tout
 * produit vient de naitre dans cet etat. Avec un `JOIN`, l'ecran cense retrouver
 * un produit ferait disparaitre celui qu'on vient de creer.
 *
 * Le cas n'existe dans aucune donnee de developpement, mesure le 4 septembre
 * 2026 : huit produits, zero sans variante. Un test ecrit sur ces donnees
 * passerait au vert sans rien prouver, motif « cible de test inexistante ».
 *
 * AUCUNE LIMITE, meme regle que la lecture publique. Le dimensionnement du
 * catalogue, 10 a 40 references, l'exclut, et `frontend-design.md` interdit
 * d'introduire un plafond que le schema ne porte pas.
 *
 * `archivee_a IS NULL` PORTE SUR LA VARIANTE, jamais sur le produit : une
 * variante archivee ne compte ni dans le prix ni dans le nombre, alors que son
 * PRODUIT reste listable. Les deux archivages sont distincts, C13.
 *
 * `statut_traitement = 'TRAITE'` SUR LE MEDIA, ET C'EST UNE CORRECTION. Un
 * media `EN_ATTENTE` ou `ECHOUE` n'a AUCUN fichier sous le volume, C8 : lui
 * fabriquer une URL produirait l'icone d'image cassee du navigateur la ou
 * l'ecran doit montrer un emplacement vide.
 *
 * LA LECTURE PUBLIQUE N'A PAS CE FILTRE, ET ELLE A RAISON : son
 * `WHERE p.statut = 'ACTIF'` garantit deja des medias traites, la publication
 * exigeant `mediasNonTraites === 0`. Recopier sa jointure ICI a donc repris la
 * forme en LAISSANT TOMBER l'hypothese qui la rendait juste, cet ecran etant le
 * seul a lister des brouillons. Motif « recopier une forme en changeant son
 * hypothese ».
 *
 * LE FILTRE VIT DANS LA JOINTURE ET NON DANS LA PAGE, ce qui garde le contrat
 * lisible : `mediaChemin` non nul implique un fichier servable, sans qu'aucun
 * appelant n'ait a s'en souvenir.
 */
export async function listerProduitsAdministration(
  client: ClientBase,
  filtre: { statuts?: readonly StatutProduit[] } = {},
): Promise<ProduitAdministration[]> {
  /*
   * LE FILTRE EST PARAMETRE, JAMAIS CONCATENE. Il vient d'une URL, donc d'une
   * entree non fiable, invariant 7. `Prisma.sql` produit une requete parametree
   * et `$queryRaw` la transmet telle quelle.
   *
   * UNE LISTE VIDE NE FILTRE RIEN plutot que de rendre zero ligne : un appelant
   * qui passe un tableau vide veut « tout », et un `IN ()` serait de surcroit
   * une erreur de syntaxe SQL.
   *
   * `= ANY(...)` ET NON `IN (...)`, ET C'EST MESURE. Un tableau passe en
   * parametre unique se compare avec `ANY` ; `IN` attend une liste de valeurs
   * et PostgreSQL refuse la forme melangee :
   *
   *   ERROR: operator does not exist: "StatutProduit" = "StatutProduit"[]
   *
   * LE CAST VERS L'ENUM EST OBLIGATOIRE. Sans lui le tableau arrive en `text[]`
   * et la comparaison echoue de la meme facon, l'enum n'ayant pas d'operateur
   * d'egalite avec du texte.
   */
  const conditionStatut =
    filtre.statuts && filtre.statuts.length > 0
      ? Prisma.sql`WHERE p.statut = ANY(${Prisma.sql`ARRAY[${Prisma.join(
          filtre.statuts.map((statut) => Prisma.sql`${statut}`),
        )}]::"StatutProduit"[]`})`
      : Prisma.empty;

  const lignes = await client.$queryRaw<
    {
      id: string;
      nom: string;
      categorieNom: string;
      statut: StatutProduit;
      publieA: Date | null;
      modifieA: Date;
      prixMinimumCentimes: bigint | number | null;
      variantesVivantes: bigint | number;
      mediaChemin: string | null;
    }[]
  >`
    SELECT
      p.id,
      p.nom,
      c.nom              AS "categorieNom",
      p.statut,
      p.publie_a         AS "publieA",
      p.modifie_a        AS "modifieA",
      min(v.prix_centimes)          AS "prixMinimumCentimes",
      count(v.id)                   AS "variantesVivantes",
      m.chemin           AS "mediaChemin"
    FROM produit p
    JOIN categorie c ON c.id = p.categorie_id
    LEFT JOIN variante v ON v.produit_id = p.id AND v.archivee_a IS NULL
    LEFT JOIN media m ON m.produit_id = p.id AND m.ordre = 1
      AND m.statut_traitement = 'TRAITE'
    ${conditionStatut}
    GROUP BY p.id, p.nom, c.nom, p.statut, p.publie_a, p.modifie_a, m.chemin
    ORDER BY p.modifie_a DESC
  `;

  /*
   * `min` ET `count` RENDENT DU `bigint`, que le pilote transmet en `BigInt`.
   * Le laisser passer ferait echouer la serialisation vers un composant client,
   * defaut deja rencontre en LS-104 et LS-105.
   *
   * `min` REND `NULL` SANS AUCUNE LIGNE, et ce nul est CONSERVE : il dit « ce
   * produit n'a pas de prix », ce qu'un zero confondrait avec « il est gratuit ».
   */
  return lignes.map((ligne) => ({
    ...ligne,
    prixMinimumCentimes:
      ligne.prixMinimumCentimes === null
        ? null
        : Number(ligne.prixMinimumCentimes),
    variantesVivantes: Number(ligne.variantesVivantes),
  }));
}
