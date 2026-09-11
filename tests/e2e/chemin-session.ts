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
/**
 * La demande de retractation amorcee sur la commande facturee, LS-135.
 *
 * ELLE N'A PAS SA PROPRE COMMANDE, contrairement aux amorces voisines : le
 * remboursement exige un paiement encaisse et une facture, que
 * `COMMANDE_FACTUREE_TEST` porte deja. Greffer coute une ligne, dupliquer en
 * couterait cinquante pour le meme etat.
 */
export const DEMANDE_RETRACTATION_TEST = {
  demandeId: "e1a2b3c4-1135-4aaa-8888-000000000001",
} as const;

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
 * La commande EXPEDIEE dont le suivi est SYNCHRONISE, LS-216 et LS-58.
 *
 * SIXIEME COMMANDE, ET LA MEME LECON QUE LES CINQ PRECEDENTES. Aucune des
 * autres ne porte d'expedition avec `statut_transporteur` et `synchronise_a`
 * renseignes : le bloc d'acheminement ne serait rendu a AUCUNE largeur, et le
 * signalement de suivi bloque encore moins. Mesurer un ecran qui ne rend jamais
 * la branche interessante ne prouve rien, motif de LS-121, LS-130 et LS-160.
 *
 * ELLE NE PEUT ETRE GREFFEE SUR AUCUNE AUTRE. `COMMANDE_FACTUREE_TEST` porte la
 * demande de retractation de LS-135 et l'ecran de remboursement de LS-160 : lui
 * declarer une expedition changerait la branche que ces deux stories mesurent.
 * Les deux commandes `EN_PREPARATION` disparaitraient de la file d'expedition
 * en passant `EXPEDIEE`, et `COMMANDE_TEST` est `EN_ATTENTE_PAIEMENT`, etat
 * dans lequel aucun colis n'est jamais parti.
 *
 * `synchronise_a` EST VIEUX DE PLUSIEURS JOURS, DELIBEREMENT. C'est ce qui rend
 * le signalement de suivi bloque VISIBLE a l'ecran, critere 4 de LS-216 : une
 * date fraiche afficherait la branche nominale, celle qui ne prouve rien du
 * signalement. Le colis n'est pas livre, `livre_a` restant nul, sans quoi
 * `fraicheurSuivi` rendrait « frais » quelle que soit la date.
 *
 * SON MODE EXECUTE DIFFERE DE CELUI DE LA COMMANDE, `POINT_RELAIS` contre
 * `DOMICILE` : c'est le rebasculement d'ADR-025, critere 5, qui n'est rendu par
 * aucune autre donnee de test. Le point de retrait est renseigne parce que
 * `chk_expedition_mode_point_relais` est une EQUIVALENCE portant sur les deux
 * modes de retrait, `LOCKER` compris malgre ce que son nom laisse croire.
 */
/**
 * La commande EXPEDIEE SANS NUMERO DE SUIVI, LS-216 et LS-58.
 *
 * SEPTIEME COMMANDE, ET ELLE COUVRE UN DEFAUT TROUVE PAR LA REVUE FRONTEND le
 * 10 septembre 2026. Le numero de suivi est FACULTATIF a la declaration, choix
 * assume du formulaire d'expedition, et `listerASuivre` filtre sur
 * `numeroSuivi: { not: null }` : une expedition sans numero n'est donc JAMAIS
 * synchronisee. Ce n'est pas un etat transitoire, c'est definitif.
 *
 * CE QUE CELA COUTE SI PERSONNE NE LE DIT : la reception ne sera jamais
 * constatee, donc ni le delai de retractation ni l'invitation a deposer un avis
 * ne demarreront, et les deux ecrans afficheraient une section d'apparence
 * normale. La premiere version gardait son signalement derriere
 * `numeroSuivi !== null`, ce qui l'eteignait sur ce cas precis.
 *
 * ELLE JUSTIFIE SON COUT DE PREPARATION parce qu'un delai legal en depend. Les
 * six autres commandes portent toutes un numero : sans elle, les deux
 * paragraphes de signalement ne seraient rendus a AUCUNE largeur.
 */
export const COMMANDE_SANS_SUIVI_TEST = {
  categorieId: "e1a2b3c4-1217-4aaa-8888-000000000001",
  produitId: "e1a2b3c4-1217-4bbb-8888-000000000002",
  varianteId: "e1a2b3c4-1217-4ccc-8888-000000000003",
  commandeId: "e1a2b3c4-1217-4ddd-8888-000000000004",
  ligneId: "e1a2b3c4-1217-4eee-8888-000000000005",
  paiementId: "e1a2b3c4-1217-4fff-8888-000000000006",
  expeditionId: "e1a2b3c4-1217-4a11-8888-000000000007",
  numero: "C-TEST-0217",
} as const;

export const COMMANDE_SUIVIE_TEST = {
  categorieId: "e1a2b3c4-1216-4aaa-8888-000000000001",
  produitId: "e1a2b3c4-1216-4bbb-8888-000000000002",
  varianteId: "e1a2b3c4-1216-4ccc-8888-000000000003",
  commandeId: "e1a2b3c4-1216-4ddd-8888-000000000004",
  ligneId: "e1a2b3c4-1216-4eee-8888-000000000005",
  paiementId: "e1a2b3c4-1216-4fff-8888-000000000006",
  expeditionId: "e1a2b3c4-1216-4a11-8888-000000000007",
  numero: "C-TEST-0216",
  numeroSuivi: "3STEST216000001",
  statutTransporteur: "Awaiting customer pickup",
  pointRelaisId: "FR-TEST-9216",
} as const;

/**
 * La commande LIVREE qui porte les invitations a deposer un avis, LS-140.
 *
 * HUITIEME COMMANDE, ET ELLE NE POUVAIT ETRE GREFFEE SUR AUCUNE DES SEPT.
 * `lireEtatDepot` exige `Expedition.livreA` renseignee, et `deposerAvis` en
 * tire `experienceA`, article D111-10 : sans elle, l'ecran public rend
 * « INDISPONIBLE » et le formulaire n'est mesure a AUCUNE largeur.
 *
 * `COMMANDE_SUIVIE_TEST` EST CELLE QU'IL NE FAUT PAS TOUCHER. Son commentaire
 * d'amorcage le dit : `livreA` y RESTE NUL parce que `fraicheurSuivi` rend
 * « frais » des qu'elle est renseignee, ce qui eteindrait le signalement de
 * suivi bloque que LS-216 mesure. Lui donner une date de remise deplacerait
 * silencieusement ce que ce jeu de donnees existe pour produire.
 *
 * TROIS LIGNES ET TROIS JETONS, chacun dans un etat DIFFERENT, parce que
 * l'ecran public porte cinq branches et qu'une seule ligne n'en exerce qu'une :
 *
 * | Jeton | Etat en base | Branche rendue |
 * |---|---|---|
 * | `jetonOuvert` | ni consomme ni revoque | le FORMULAIRE, le cas nominal |
 * | `jetonConsomme` | `utiliseA` renseignee | « un avis a deja ete depose » |
 * | `jetonRevoque` | `revoqueA` renseignee | « ce lien a ete remplace » |
 *
 * LA CINQUIEME BRANCHE, `INDISPONIBLE`, N'A BESOIN D'AUCUNE DONNEE : un jeton
 * inexistant suffit, et c'est le test negatif qui verifie le 404. Il compte
 * autant que les quatre autres, `notFound()` sur tout refus etant ce qui
 * empeche de reveler qu'une commande existe.
 *
 * DEUX DES TROIS LIGNES PORTENT DEJA UN AVIS, l'un `DEPOSE` et l'autre
 * `PUBLIE`, et chacun sert un ecran que l'autre ne sert pas :
 *
 * | Avis | Ligne | Ce qu'il rend |
 * |---|---|---|
 * | `DEPOSE` | 2 | la file de relecture de l'administration, vide sans lui |
 * | `PUBLIE` | 3 | le bloc 11 de la fiche produit, et la cible du signalement |
 *
 * IL RESTE DONC UNE SEULE PIECE A NOTER sur les trois, et c'est une propriete
 * du code plutot qu'un choix : `dejaNotee` vaut `avisExistant !== null` sans
 * regarder le statut, donc l'avis en attente de relecture compte autant que le
 * publie. Le test de comptage l'ecrit explicitement pour qu'un futur lecteur ne
 * cherche pas la cause ailleurs.
 */
export const COMMANDE_AVIS_TEST = {
  categorieId: "e1a2b3c4-1140-4aaa-8888-000000000001",
  produitId: "e1a2b3c4-1140-4bbb-8888-000000000002",
  varianteId: "e1a2b3c4-1140-4ccc-8888-000000000003",
  commandeId: "e1a2b3c4-1140-4ddd-8888-000000000004",
  ligneUnId: "e1a2b3c4-1140-4eee-8888-000000000005",
  ligneDeuxId: "e1a2b3c4-1140-4eee-8888-000000000006",
  ligneTroisId: "e1a2b3c4-1140-4eee-8888-000000000007",
  paiementId: "e1a2b3c4-1140-4fff-8888-000000000008",
  expeditionId: "e1a2b3c4-1140-4a11-8888-000000000009",
  jetonOuvertId: "e1a2b3c4-1140-4b22-8888-000000000010",
  jetonConsommeId: "e1a2b3c4-1140-4b22-8888-000000000011",
  jetonRevoqueId: "e1a2b3c4-1140-4b22-8888-000000000012",
  invitationUnId: "e1a2b3c4-1140-4c33-8888-000000000013",
  invitationDeuxId: "e1a2b3c4-1140-4c33-8888-000000000014",
  invitationTroisId: "e1a2b3c4-1140-4c33-8888-000000000015",
  avisDeposeId: "e1a2b3c4-1140-4d44-8888-000000000016",
  avisPublieId: "e1a2b3c4-1140-4d44-8888-000000000017",
  signalementId: "e1a2b3c4-1140-4e55-8888-000000000018",
  numero: "C-TEST-0140",
  numeroSuivi: "3STEST140000001",
  /** Le produit est PUBLIE, sans quoi l'avis publie ne serait rendu nulle part. */
  slug: "e2e-ls140-piece-notee",
  /*
   * TROIS LIBELLES DONT AUCUN N'EST PREFIXE D'UN AUTRE, et ce n'est pas un
   * detail de confort : `getByText` de Playwright fait une correspondance par
   * SOUS-CHAINE, donc « TEST Piece a noter » designait aussi « TEST Piece a
   * noter aussi » et le mode strict refusait les deux. Contourner par `exact`
   * aurait masque le chevauchement au lieu de le retirer.
   */
  libelleUn: "TEST Collier du matin",
  libelleDeux: "TEST Bracelet déjà noté",
  libelleTrois: "TEST Broche du soir",
} as const;

/**
 * Ou vit la valeur des trois jetons d'avis, LS-140.
 *
 * ELLE NE PEUT PAS ETRE FIGEE comme les identifiants ci-dessus. `engendrerJeton`
 * signe en HMAC avec `BETTER_AUTH_SECRET`, et la base ne garde que l'empreinte,
 * regle L5 : un fichier de largeur ne peut ni fabriquer la valeur ni la relire
 * depuis la base. Meme geste que `FICHIER_COMMANDE` pour le cookie signe.
 *
 * IGNORE PAR GIT. Ces valeurs ouvrent un ecran de depot, elles n'ont rien a
 * faire dans un depot public, invariant 9.
 */
export const FICHIER_JETONS_AVIS = "tests/e2e/.jetons-avis.json";

/**
 * Les DEUX alertes critiques que la rubrique Alertes affiche, LS-98.
 *
 * DEUX ET NON UNE, et c'est la lecon de LS-130 et LS-97 appliquee ici : l'ecran
 * rend un formulaire d'acquittement PAR alerte, donc plusieurs regions live
 * voisines. Avec une seule carte, une assertion sur un libelle passerait QUEL
 * QUE SOIT l'etat des identifiants.
 *
 * LEURS GRAVITES DIFFERENT, `CRITIQUE` et `AVERTISSEMENT`, et leurs dates
 * aussi : c'est ce qui rend l'ORDRE mesurable. Une critique ANCIENNE doit
 * passer avant un avertissement RECENT, sans quoi un double encaissement
 * s'enterrerait sous des avertissements de livraison.
 *
 * ELLES SONT OUVERTES TOUTES LES DEUX. L'ecran porte aussi une liste d'alertes
 * acquittees, que le test remplit lui-meme en acquittant : la fabriquer ici
 * ferait porter a la fixture un etat que le geste produit deja.
 */
export const ALERTES_TEST = {
  critique: {
    id: "e1a2b3c4-1098-4aaa-8888-000000000001",
    type: "DOUBLE_ENCAISSEMENT",
    message: "TEST Deux encaissements pour une seule commande.",
  },
  avertissement: {
    id: "e1a2b3c4-1098-4bbb-8888-000000000002",
    type: "ENVOI_EMAIL_BLOQUE",
    message: "TEST Un envoi reste bloque depuis plus d'une heure.",
  },
} as const;

/**
 * UNE ALERTE ACQUITTABLE PAR LARGEUR, LS-98.
 *
 * ------------------------------------------------------------------
 * LES QUATRE PROJETS TOURNENT EN PARALLELE SUR LA MEME BASE, et l'acquittement
 * est le seul geste DESTRUCTIF de cette rubrique : trois largeurs qui
 * acquittent la meme alerte se marchent dessus, la premiere gagne et les trois
 * autres echouent sur une carte disparue. Mesure du 11 septembre 2026.
 *
 * `describe.serial` N'Y SUFFIT PAS : il ordonne les tests d'un MEME projet,
 * jamais les projets entre eux. Le prefixe de largeur est ce qui les isole,
 * parade deja retenue par `compte-adresses.spec.ts`.
 *
 * LES DEUX ALERTES CI-DESSUS RESTENT INTACTES, aucun test ne les acquittant :
 * les mesures d'ordre et de rendu s'appuient dessus.
 * ------------------------------------------------------------------
 */
export const ALERTES_ACQUITTABLES = {
  "mobile-320": "e1a2b3c4-1098-4ccc-8888-000000000001",
  "mobile-390": "e1a2b3c4-1098-4ccc-8888-000000000002",
  "tablette-768": "e1a2b3c4-1098-4ccc-8888-000000000003",
  "bureau-1280": "e1a2b3c4-1098-4ccc-8888-000000000004",
} as const;

/** Le message porte la largeur, ce qui rend chaque carte designable. */
export function messageAlerteAcquittable(projet: string): string {
  return `TEST Alerte acquittable de ${projet}.`;
}

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
 * Second produit de controle, VIDE DE TOUT, LS-113.
 *
 * ------------------------------------------------------------------
 * POURQUOI UN SECOND PRODUIT PLUTOT QUE DE VIDER LE PREMIER.
 *
 * `PRODUIT_TEST` porte une variante, et c'est ce qui rend l'editeur mesurable :
 * ses cinq blocs ont du contenu, dont le bloc de publication et sa liste de
 * motifs. Le vider casserait tout ce que LS-111 mesure.
 *
 * TROIS ETATS VIDES DE L'EDITEUR SONT INATTEIGNABLES SANS LUI : « aucune
 * declinaison en vente », « aucune photo » et « aucune section ». Sur la fiche
 * de controle, les deux derniers sont atteints PAR ACCIDENT, aucune photo ni
 * section n'y etant posee, mais rien ne les nomme : le message pourrait
 * disparaitre sans qu'aucune assertion ne rougisse.
 *
 * IL PARTAGE LA CATEGORIE DU PREMIER, deliberement : ce produit existe pour ses
 * ABSENCES, pas pour son rangement, et une categorie de plus n'apporterait rien.
 *
 * CE QU'IL CHANGE MALGRE TOUT, ET QU'IL FAUT SAVOIR. La categorie de controle
 * passe de un a DEUX produits : l'ecran Categories affiche « 2 produits y sont
 * rattachés » au lieu du singulier, et l'ecran Produits compte deux entrees au
 * lieu d'une. Aucun test de bout en bout ne mesure ces deux comptes
 * aujourd'hui, verifie ; ceux de `catalogue.sequential.test.ts` tournent en
 * INTEGRATION, sur base ephemere, donc hors de portee de cette fixture.
 *
 * UN TEST FUTUR QUI COMPTERAIT CES ECRANS doit donc s'attendre a deux produits,
 * et cette phrase est la pour qu'il ne cherche pas la cause ailleurs. Le bouton
 * Supprimer de la categorie reste desactive dans les deux cas, sa condition
 * etant « au moins un produit ».
 *
 * `ordre` N'EST PAS EN JEU ICI, la table `produit` n'en portant pas : le piege
 * de LS-160 vise `categorie`, dont ce produit ne cree aucune ligne.
 * ------------------------------------------------------------------
 */
export const SECTION_TEST = {
  id: "f5b2c3d4-7e91-4c33-8a45-3b6c7d8e9f04",
} as const;

export const PRODUIT_VIDE = {
  produitId: "e4a1b2c3-6d89-4b22-9f34-4a5b6c7d8e93",
  slug: "e2e-ls113-produit-vide",
  nom: "TEST Produit sans rien LS-113",
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
   * la carte avec `<picture>` et la carte sans photo.
   *
   * ------------------------------------------------------------------
   * LE CHEMIN EST UN SEGMENT SIMPLE, SANS BARRE NI DOSSIER PARENT, LS-187.
   *
   * Il valait `produits/e2e-ls104/` avec un commentaire affirmant que c'etait
   * « comme celui que le traitement ecrit ». C'ETAIT FAUX, et cette phrase a
   * ete recopiee dans la description de LS-187 puis dans deux commentaires de
   * `src/` : `exigerSegmentSimple` de `stockage.ts` impose
   * `^[A-Za-z0-9][A-Za-z0-9._-]*$`, donc ni slash ni barre finale, et
   * `publier()` rend ce segment nu.
   *
   * CE QUE LA FORME FAUTIVE MASQUAIT : les cinq ecrans de la boutique collaient
   * le nom de fichier au chemin, ce qui rend 404 sur une photographie reelle.
   * La barre de la fixture reparait cette faute au passage, donc aucun test ne
   * pouvait la voir. Une donnee de test faconnee pour satisfaire le code masque
   * le defaut au lieu de le reveler.
   *
   * `verifier-medias-test.sh` confronte ce chemin a celui du generateur de
   * fichiers, et les tests unitaires d'`urls.ts` gardent la forme construite.
   * ------------------------------------------------------------------
   */
  mediaEnStock: {
    id: "d1b2c3d4-1111-4ddd-8888-111111111111",
    chemin: "e2e-ls104",
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
    chemin: "e2e-ls105-second",
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

/**
 * Session d'un client VERIFIE, LS-56. Voir `session-verifiee.setup.ts` pour
 * pourquoi une troisieme session est necessaire.
 */
export const FICHIER_SESSION_VERIFIEE = "tests/e2e/.session-verifiee.json";

/**
 * L'adresse de ce compte, ecrite sur disque par la preparation.
 *
 * SUR DISQUE ET NON EN VARIABLE : Playwright execute chaque projet dans son
 * propre processus, une valeur posee dans un module n'y survit pas. Meme motif
 * que le cookie de commande de LS-118. Ignore par git comme les etats de
 * session : c'est une adresse, donc une donnee personnelle de test.
 *
 * LE FICHIER RESTE, MEME AVEC UNE ADRESSE FIXE depuis LS-168 : les cinq
 * fichiers de largeur qui le lisent vivent dans d'autres processus, et l'ecrire
 * reste le seul contrat entre la preparation et eux.
 */
export const FICHIER_EMAIL_VERIFIE = "tests/e2e/.session-email-verifie.json";

/**
 * Adresse FIXE du compte client verifie de test, LS-168.
 *
 * ELLE ETAIT HORODATEE, ce qui creait un compte neuf a CHAQUE execution et
 * consommait une des trois places par minute de `/sign-up/email`. Voir
 * `session-verifiee.setup.ts` pour la mesure complete.
 *
 * ELLE PORTE LE PREFIXE `e2e-`, que la retrogradation de
 * `session-administration.setup.ts` cible : un compte de test ne doit jamais
 * garder un role sur une base de developpement.
 *
 * LE NOM RESTE `rattachement`, celui du parcours pour lequel cette session a
 * ete creee en LS-56, pour ne pas rendre les traces existantes illisibles.
 */
export const EMAIL_VERIFIE = "e2e-rattachement@exemple.test";

/**
 * Les quatre projets de largeur, tels que `playwright.config.ts` les nomme.
 *
 * LA LISTE VIT ICI parce que `comptes-profil.setup.ts` doit amorcer un compte
 * par largeur AVANT que ces projets demarrent : il ne peut donc pas lire son
 * propre `project.name`, qui vaut `preparation`.
 *
 * ELLE DOIT SUIVRE LA CONFIGURATION. Une largeur ajoutee sans etre inscrite ici
 * verrait son compte manquer, et le fichier de profil retomberait sur une
 * inscription au moment le plus charge de la suite.
 * `scripts/verifier-fixtures-e2e.sh` confronte les deux listes.
 *
 * `tablette-768` EST ARRIVE EN LS-166, et il coute DEUX comptes de plus, huit
 * au lieu de six. Ils ne sont inscrits qu'une fois dans la vie de la base, par
 * `comptes-profil.setup.ts` et son espacement : en regime etabli ce projet ne
 * fait aucun appel d'authentification, donc les trois places par minute de
 * `/sign-up/email` restent entierement disponibles.
 */
export const PROJETS_LARGEUR = [
  "mobile-320",
  "mobile-390",
  "tablette-768",
  "bureau-1280",
] as const;

/**
 * L'adresse du compte de profil d'une largeur, LS-168.
 *
 * DERIVEE DU NOM DU PROJET Playwright et non de la largeur : c'est le projet qui
 * definit le processus, donc la seule frontiere qui garantisse qu'aucune autre
 * largeur ne touche le meme compte.
 */
export function adresseProfil(projet: string): string {
  return `e2e-profil-${projet}@exemple.test`;
}

/**
 * L'adresse du compte DEDIE au test de changement de mot de passe, LS-168.
 *
 * DISTINCTE DE LA PRECEDENTE, et ce n'est pas une precaution decorative : ce
 * test consomme le mot de passe du compte, et les six autres tests de la meme
 * largeur rejouent les cookies ouverts par la preparation. Les faire partager
 * un compte rendrait leur session invalide au moment ou celui-ci change la
 * valeur.
 */
export function adresseMotDePasseProfil(projet: string): string {
  return `e2e-motdepasse-${projet}@exemple.test`;
}

/**
 * L'etat de session du compte de profil d'une largeur, LS-168.
 *
 * ------------------------------------------------------------------
 * POURQUOI LA PREPARATION ECRIT CES ETATS, plutot que de laisser chaque largeur
 * ouvrir sa session.
 *
 * `/sign-in/email` accepte CINQ appels par minute et par IP. `compte-profil`
 * en faisait QUATRE par largeur, donc DOUZE au total : le plafond etait franchi
 * a chaque execution, et les dernieres largeurs echouaient sur « Too many
 * requests » sans rapport avec ce qu'elles mesurent.
 *
 * TROIS DE CES QUATRE APPELS SONT DES MESURES et doivent rester : verifier
 * qu'un mot de passe refuse n'a rien change, ouvrir la seconde session que le
 * changement doit faire tomber. Le quatrieme, celui qui ouvrait simplement la
 * session de travail, est remplace par la lecture de cet etat.
 *
 * TROIS OUVERTURES DANS LA PREPARATION AU LIEU DE DOUZE dans les tests, et
 * elles n'ont lieu qu'a la premiere execution : ensuite l'etat sur disque vaut
 * encore, les sessions durant un jour depuis ADR-027.
 * ------------------------------------------------------------------
 *
 * IGNORE PAR GIT comme les autres etats : ces fichiers portent un cookie de
 * session valide, invariant 9.
 */
export function fichierSessionProfil(projet: string): string {
  return `tests/e2e/.session-profil-${projet}.json`;
}

/**
 * Les DEUX etats de session du compte dedie au changement de mot de passe,
 * LS-168.
 *
 * ------------------------------------------------------------------
 * POURQUOI DEUX, ET POURQUOI ILS SONT POSES PAR LA PREPARATION.
 *
 * Le test « changer son mot de passe ferme les autres sessions » a besoin de
 * deux sessions REELLEMENT distinctes sur le meme compte : le changement doit
 * en faire tomber une et laisser l'autre. Partager un cookie entre les deux
 * contextes les ferait tomber ENSEMBLE, et la mesure ne dirait plus rien.
 *
 * DEUX OUVERTURES PAR LARGEUR FONT SIX APPELS pour les cinq places par minute
 * de `/sign-in/email`. Les serialiser dans le fichier ne suffit pas : les trois
 * largeurs atteignent ce test EN MEME TEMPS, `describe.serial` n'ordonnant que
 * les tests d'un meme projet. Mesure du 7 septembre 2026, trois echecs en 74 ms
 * sur la premiere des deux connexions.
 *
 * LA PREPARATION LES POSE DONC, elle qui est sequentielle : six ouvertures y
 * sont espacees dans le temps, et n'ont lieu qu'a la premiere execution.
 * ------------------------------------------------------------------
 *
 * `rang` VAUT 1 OU 2. La session 1 est celle qui doit SURVIVRE, celle depuis
 * laquelle le changement est fait ; la session 2 est celle qui doit TOMBER.
 */
export function fichierSessionMotDePasse(projet: string, rang: 1 | 2): string {
  return `tests/e2e/.session-motdepasse-${projet}-${rang}.json`;
}

/**
 * Le mot de passe du compte verifie, partage par la preparation et les tests.
 *
 * CONSTRUIT ET NON ECRIT EN CLAIR depuis LS-168, meme motif que
 * `MOT_DE_PASSE_CLIENT` : GitGuardian a refuse la PR de LS-164 en signalant des
 * litteraux de mot de passe a des emplacements neufs, et
 * `tests/aide/mot-de-passe-test.ts` porte la raison complete du choix,
 * construire plutot qu'exempter. La valeur servie est inchangee.
 */
export const MOT_DE_PASSE_VERIFIE = MOT_DE_PASSE_TEST;

/**
 * Le mot de passe de la session cliente ordinaire, LS-164.
 *
 * REEXPORTE ET NON REDEFINI. La valeur est CONSTRUITE dans
 * `tests/aide/mot-de-passe-test.ts`, jamais ecrite en clair : GitGuardian a
 * refuse la PR de LS-164 en signalant trois litteraux de mot de passe apparus a
 * des emplacements neufs. Le module d'aide porte la raison complete du choix,
 * construire plutot qu'exempter.
 *
 * IL PASSE PAR CE FICHIER parce que Playwright refuse qu'un fichier de test en
 * importe un autre : `session-cliente.setup.ts` et les specs le prennent ici,
 * comme tout le reste de leur configuration partagee.
 */
export {
  MOT_DE_PASSE_TEST as MOT_DE_PASSE_CLIENT,
  MOT_DE_PASSE_FAUX,
  /*
   * LES DEUX VALEURS DU COMPTE DE PROFIL, LS-168. Elles passent par ce fichier
   * pour le motif enonce ci-dessus, Playwright refusant qu'un fichier de test
   * en importe un autre.
   */
  MOT_DE_PASSE_PROFIL,
  MOT_DE_PASSE_PROFIL_APRES,
} from "../aide/mot-de-passe-test";

/*
 * IMPORTE EN PLUS D'ETRE REEXPORTE, et les deux formes sont necessaires.
 *
 * `export { x } from "..."` ne cree AUCUNE liaison locale : la valeur traverse
 * le module sans y etre utilisable. `MOT_DE_PASSE_VERIFIE` ci-dessus en a
 * besoin dans ce fichier, d'ou cet import distinct.
 */
import { MOT_DE_PASSE_TEST } from "../aide/mot-de-passe-test";
