/**
 * Ou vivent les etats de session partages. LS-81, LS-89, LS-111.
 *
 * UN MODULE A PART ET NON UNE CONSTANTE DANS LE FICHIER DE PREPARATION :
 * Playwright refuse qu'un fichier de test en importe un autre, « should not
 * import test file ». Les deux fichiers concernes etant des tests, le chemin
 * partage doit vivre dans un module qui n'en est pas un.
 *
 * IGNORES PAR GIT : ces etats portent un cookie de session valide, ils sont
 * recrees a chaque execution et n'ont aucune raison d'entrer dans un depot
 * public, invariant 9.
 */
export const FICHIER_SESSION = "tests/e2e/.session-cliente.json";

/**
 * Session d'ADMINISTRATION, LS-111. Distincte de la precedente, et elles ne
 * peuvent pas fusionner : les fichiers qui verifient le refus d'un visiteur
 * ordinaire sur un ecran protege ont besoin d'une session SANS le role, et
 * promouvoir la session cliente les ferait passer pour la mauvaise raison.
 */
export const FICHIER_SESSION_ADMINISTRATION =
  "tests/e2e/.session-administration.json";

/**
 * Cookie signe de la commande en attente de paiement, LS-118.
 *
 * ECRIT PAR `commande.setup.ts` : le cookie est signe HMAC avec le secret
 * d'application, un fichier de test de largeur ne peut pas le fabriquer sans
 * importer du code serveur. Ignore par git, comme les etats de session : il
 * designe une commande de test, mais la forme signee n'a rien a faire dans un
 * depot public.
 */
export const FICHIER_COMMANDE = "tests/e2e/.commande-test.json";

/**
 * La commande EN_ATTENTE_PAIEMENT que la page de confirmation affiche, LS-118.
 *
 * AMORCEE EN BASE ET NON PASSEE PAR LE TUNNEL, deliberement : cliquer
 * « Commander » a chaque execution consommerait le stock du catalogue de test
 * et laisserait des reservations de trente minutes derriere chaque largeur,
 * jusqu'a faire basculer le badge « En stock » d'un test voisin. La variante
 * est DEDIEE et son produit reste en `BROUILLON` : rien n'apparait au
 * catalogue, rien ne se partage.
 */
export const COMMANDE_TEST = {
  categorieId: "e1a2b3c4-1118-4aaa-8888-000000000001",
  produitId: "e1a2b3c4-1118-4bbb-8888-000000000002",
  varianteId: "e1a2b3c4-1118-4ccc-8888-000000000003",
  commandeId: "e1a2b3c4-1118-4ddd-8888-000000000004",
  ligneId: "e1a2b3c4-1118-4eee-8888-000000000005",
  reservationId: "e1a2b3c4-1118-4fff-8888-000000000006",
  numero: "C-TEST-0118",
} as const;

/**
 * La commande CONFIRMEE et FACTUREE que l'ecran de remboursement affiche, LS-160.
 *
 * DISTINCTE DE `COMMANDE_TEST`, ET C'EST TOUT SON INTERET. Celle-ci est
 * volontairement `EN_ATTENTE_PAIEMENT` pour la page de confirmation : sur elle,
 * l'ecran de remboursement rend la branche « aucune facture emise », un
 * paragraphe. Le FORMULAIRE, ses deux champs et son avertissement ne seraient
 * mesures a aucune largeur.
 *
 * LE MOTIF EST DEJA DOCUMENTE SUR CE DEPOT. La revue frontend de LS-121 avait
 * trouve un contraste a 4,04:1 qu'`axe-core` ne voyait pas, le chemin n'etant
 * jamais rendu faute de commande remboursee en donnees de test. Mesurer un
 * ecran qui ne rend jamais la branche interessante ne prouve rien.
 *
 * ELLE PORTE SA PROPRE VARIANTE, meme raison que la precedente : rien de
 * partage, aucun stock du catalogue de test consomme.
 */
export const COMMANDE_FACTUREE_TEST = {
  categorieId: "e1a2b3c4-1160-4aaa-8888-000000000001",
  produitId: "e1a2b3c4-1160-4bbb-8888-000000000002",
  varianteId: "e1a2b3c4-1160-4ccc-8888-000000000003",
  commandeId: "e1a2b3c4-1160-4ddd-8888-000000000004",
  ligneId: "e1a2b3c4-1160-4eee-8888-000000000005",
  paiementId: "e1a2b3c4-1160-4fff-8888-000000000006",
  factureId: "e1a2b3c4-1160-4a11-8888-000000000007",
  numero: "C-TEST-0160",
  numeroFacture: "F-TEST-0160",
} as const;

/**
 * La commande EN_PREPARATION que la file d'expedition affiche, LS-130.
 *
 * DISTINCTE DES DEUX PRECEDENTES, ET POUR LA MEME RAISON QU'ELLES SE
 * DISTINGUENT ENTRE ELLES. `listerCommandesAExpedier` ne lit QUE les commandes
 * `EN_PREPARATION` : sur une commande en attente de paiement ou simplement
 * confirmee, la file rend son etat vide, un paragraphe. Le FORMULAIRE, ses
 * quatre champs et son bouton ne seraient mesures a AUCUNE largeur.
 *
 * C'EST LE MOTIF DE LS-121 ET DE LS-160, rencontre une troisieme fois : un
 * contraste a 4,04:1 avait echappe a `axe-core` faute d'une commande remboursee
 * en donnees de test. Mesurer un ecran qui ne rend jamais la branche
 * interessante ne prouve rien.
 *
 * ELLE NE PEUT PAS ETRE PARTAGEE avec `COMMANDE_FACTUREE_TEST` : declarer son
 * expedition la ferait passer `EXPEDIEE`, donc disparaitre de la file, et le
 * detail de commande que LS-160 mesure changerait de branche au passage. Deux
 * faits distincts, deux commandes.
 *
 * ELLE PORTE SA PROPRE VARIANTE, meme raison que les precedentes : rien de
 * partage, aucun stock du catalogue de test consomme.
 */
export const COMMANDE_A_EXPEDIER_TEST = {
  categorieId: "e1a2b3c4-1130-4aaa-8888-000000000001",
  produitId: "e1a2b3c4-1130-4bbb-8888-000000000002",
  varianteId: "e1a2b3c4-1130-4ccc-8888-000000000003",
  commandeId: "e1a2b3c4-1130-4ddd-8888-000000000004",
  ligneId: "e1a2b3c4-1130-4eee-8888-000000000005",
  paiementId: "e1a2b3c4-1130-4fff-8888-000000000006",
  numero: "C-TEST-0130",
} as const;

/**
 * La SECONDE commande EN_PREPARATION, LS-130. Elle existe pour une seule raison.
 *
 * UNE FILE A UNE SEULE CARTE NE PROUVE RIEN DE CE QUI COMPTE ICI. La page rend
 * un formulaire PAR commande, donc plusieurs `id`, `label` et regions live
 * voisins : avec une carte, `getByLabel("Transporteur")` en mode strict passe
 * QUEL QUE SOIT l'etat des identifiants.
 *
 * MESURE ET NON SUPPOSE, le 2 septembre 2026 : les identifiants remplaces par
 * des constantes fixes, les trois tests de rendu restaient VERTS. Le composant
 * etait correct, la preuve ne l'etait pas.
 *
 * ELLE REND AUSSI LA MESURE DE DEBORDEMENT HONNETE : le commentaire annonce
 * « la densite la plus forte de l'administration », ce qu'une carte unique ne
 * produit pas.
 *
 * SON MODE EST `POINT_RELAIS`, DELIBEREMENT DIFFERENT du premier : le champ de
 * point de retrait est alors rendu d'entree sur cette carte, ce qui met les
 * deux formulaires dans des etats DISTINCTS et croise donc reellement leurs
 * identifiants.
 */
export const SECONDE_COMMANDE_A_EXPEDIER_TEST = {
  categorieId: "e1a2b3c4-1131-4aaa-8888-000000000001",
  produitId: "e1a2b3c4-1131-4bbb-8888-000000000002",
  varianteId: "e1a2b3c4-1131-4ccc-8888-000000000003",
  commandeId: "e1a2b3c4-1131-4ddd-8888-000000000004",
  ligneId: "e1a2b3c4-1131-4eee-8888-000000000005",
  paiementId: "e1a2b3c4-1131-4fff-8888-000000000006",
  numero: "C-TEST-0131",
  pointRelaisId: "FR-TEST-9131",
} as const;

/**
 * Les DEUX messages de contact que la rubrique Messages affiche, LS-97.
 *
 * DEUX ET NON UN, et c'est la lecon directe de LS-130. La page rend un bloc de
 * classement PAR message, donc plusieurs `id` et regions live voisins : avec un
 * seul message, une assertion sur un libelle passe QUEL QUE SOIT l'etat des
 * identifiants. Mesure faite le 2 septembre 2026 sur l'ecran d'expedition, les
 * identifiants remplaces par des constantes fixes laissaient les tests verts.
 *
 * LEURS STATUTS DIFFERENT, `NOUVEAU` et `LU` : les deux cartes proposent donc
 * des gestes DIFFERENTS, `GESTES` etant indexee sur le statut. C'est ce qui
 * croise reellement leurs identifiants, plutot que de rendre deux fois le meme
 * bloc.
 */
export const MESSAGES_TEST = {
  nouveau: {
    id: "e1a2b3c4-1197-4aaa-8888-000000000001",
    nom: "TEST Sacha Martin",
    email: "e2e-ls97-nouveau@exemple.test",
    sujet: "Question sur un collier",
    corps: "Bonjour, ce collier existe-t-il en 45 cm ? Merci beaucoup.",
  },
  lu: {
    id: "e1a2b3c4-1197-4bbb-8888-000000000002",
    nom: "TEST Alix Bernard",
    email: "e2e-ls97-lu@exemple.test",
    sujet: "Delai de livraison",
    corps: "Bonjour, sous quel delai partent les commandes ? Merci.",
  },
} as const;

/**
 * Identifiants du produit de test rendu dans l'editeur, LS-111.
 *
 * FIGES ET NON ENGENDRES A CHAQUE EXECUTION. Le fichier de test doit construire
 * l'URL `/administration/produits/<id>` sans lire un artefact produit par la
 * preparation : un identifiant transmis par fichier ajouterait un second canal
 * a maintenir pour ne rien prouver de plus. La preparation reprend donc ces
 * valeurs a chaque execution, `ON CONFLICT` en tete.
 *
 * DE VRAIS UUID, piege connu du projet : `schemaIdentifiant` refuse une chaine
 * comme `e2e-produit-1`, et le refus « Un identifiant valide est attendu » se
 * prend d'abord pour un defaut du code.
 */
export const PRODUIT_TEST = {
  categorieId: "b7f1c4d2-3a56-4e88-9c01-7d2e5f8a1b30",
  produitId: "c8e2d5a3-4b67-4f99-8d12-6e3f4a9b2c41",
  varianteId: "d9f3e6b4-5c78-4a11-9e23-5f4a3b8c1d52",
  slug: "e2e-ls111-produit-de-controle",
  nom: "TEST Produit de contrôle LS-111",
} as const;

/**
 * Produits PUBLIES du catalogue public, LS-104.
 *
 * DISTINCTS DE `PRODUIT_TEST`, qui reste en `BROUILLON` et sert precisement de
 * test negatif : il ne doit jamais apparaitre dans le catalogue.
 *
 * TROIS PIECES POUR TROIS ETATS DE DISPONIBILITE, dans deux categories : c'est
 * le minimum pour exercer la grille, les filtres et les trois badges sans
 * fabriquer un catalogue de demonstration. Les noms sont neutres et inventes,
 * aucune donnee du prototype n'entre ici, interdit du projet.
 */
export const CATALOGUE_TEST = {
  categorieA: {
    id: "a1b2c3d4-1111-4aaa-8888-111111111111",
    nom: "TEST Catégorie A",
    slug: "e2e-ls104-categorie-a",
  },
  categorieB: {
    id: "a1b2c3d4-2222-4aaa-8888-222222222222",
    nom: "TEST Catégorie B",
    slug: "e2e-ls104-categorie-b",
  },
  /** Plusieurs pieces, badge « En stock ». */
  enStock: {
    id: "b1b2c3d4-1111-4bbb-8888-111111111111",
    varianteId: "c1b2c3d4-1111-4ccc-8888-111111111111",
    nom: "TEST Pièce en stock",
    slug: "e2e-ls104-en-stock",
    prixCentimes: 4900,
  },
  /**
   * Photo de la piece en stock, LS-104.
   *
   * UNE SEULE PIECE EN PORTE UNE : le catalogue doit exercer ses deux branches,
   * la carte avec `<picture>` et la carte sans photo. Le chemin se termine par
   * une barre, comme celui que le traitement ecrit, la carte y concatenant
   * `320.avif` et les autres declinaisons.
   */
  mediaEnStock: {
    id: "d1b2c3d4-1111-4ddd-8888-111111111111",
    chemin: "produits/e2e-ls104/",
    texteAlternatif: "Vue de face de la pièce",
  },
  /** Exactement une piece, badge « Dernière pièce », le cas ordinaire ici. */
  dernierePiece: {
    id: "b1b2c3d4-2222-4bbb-8888-222222222222",
    varianteId: "c1b2c3d4-2222-4ccc-8888-222222222222",
    nom: "TEST Pièce unique",
    slug: "e2e-ls104-derniere-piece",
    prixCentimes: 12900,
  },
  /**
   * Categorie qui EXISTE mais ne porte aucun produit, LS-104.
   *
   * Elle produit l'etat vide REEL, celui d'une categorie dont tout a ete vendu
   * ou archive, a distinguer d'un slug inconnu qui rend le catalogue entier.
   */
  categorieVide: {
    id: "a1b2c3d4-3333-4aaa-8888-333333333333",
    nom: "TEST Catégorie vide",
    slug: "e2e-ls104-categorie-vide",
  },
  /** Stock nul, badge « Épuisé ». Reste au catalogue, sans disparaitre. */
  epuise: {
    id: "b1b2c3d4-3333-4bbb-8888-333333333333",
    varianteId: "c1b2c3d4-3333-4ccc-8888-333333333333",
    nom: "TEST Pièce épuisée",
    slug: "e2e-ls104-epuise",
    prixCentimes: 7500,
  },
} as const;

/**
 * Ce que la FICHE produit ajoute au catalogue, LS-105.
 *
 * POSE SUR `CATALOGUE_TEST.enStock`, deja publie et deja photographie : le
 * catalogue exerce sa carte, la fiche exerce son detail. Deux jeux separes
 * feraient diverger les deux ecrans sur des donnees differentes.
 *
 * UNE SECONDE VARIANTE, EPUISEE ET PLUS CHERE. C'est le minimum pour exercer le
 * bloc 5, le choix de declinaison, et pour prouver que prix, disponibilite et
 * dimensions suivent le CHOIX et non le produit. Une seule variante masquerait
 * entierement ce comportement, qui est le critere 5 de la story.
 *
 * QUATRE SECTIONS DONT DEUX QUI NE DOIVENT PAS S'AFFICHER, C22 et C23 : une
 * masquee et une dont le contenu n'est qu'espaces. Sans elles, le rendu du
 * bloc 9 serait teste sur le seul cas nominal.
 */
export const FICHE_TEST = {
  descriptionCourte: "Anneau martelé à la main, finition satinée.",
  /**
   * SECONDE PHOTOGRAPHIE, SANS LAQUELLE LE TEST DES VIGNETTES NE PROUVE RIEN.
   *
   * La galerie n'affiche ses vignettes qu'a partir de DEUX photographies : avec
   * une seule, le test des noms accessibles de LS-85 se passait en `skip` sur
   * les trois largeurs, donc la correction n'etait verifiee nulle part. Un test
   * toujours ignore vaut un test absent.
   */
  mediaSecond: {
    id: "d1b2c3d4-2222-4ddd-8888-222222222222",
    chemin: "produits/e2e-ls105-second/",
    texteAlternatif: "Vue de profil de la pièce",
  },
  /** La variante deja posee par `poserCataloguePublie`, renommee et dimensionnee. */
  varianteEnStock: {
    libelle: "TEST Taille 52",
    dimensions: "Diamètre 16,5 mm",
  },
  /** Seconde declinaison : plus chere, epuisee, dimensions differentes. */
  varianteEpuisee: {
    id: "c1b2c3d4-4444-4ccc-8888-444444444444",
    reference: "TEST-LS105-T54",
    libelle: "TEST Taille 54",
    dimensions: "Diamètre 17,2 mm",
    prixCentimes: 5400,
  },
  sections: {
    visiblePremiere: {
      titre: "TEST Matières",
      contenu: "Argent 925 recyclé.\nPierre de lune naturelle.",
    },
    visibleSeconde: {
      titre: "TEST Fabrication",
      contenu: "Façonné à la main en atelier.",
    },
    /** C22 : masquee, son titre ne doit apparaitre nulle part. */
    masquee: {
      titre: "TEST Section masquée",
      contenu: "Ce texte ne doit jamais être servi.",
    },
    /** C23 : contenu fait d'espaces, vide au sens de la regle. */
    vide: {
      titre: "TEST Section vide",
      contenu: "   \n  ",
    },
  },
} as const;
