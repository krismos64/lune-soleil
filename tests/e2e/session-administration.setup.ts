/**
 * Ouvre UNE session d'ADMINISTRATION pour toute la suite, et pose le produit
 * que l'editeur de fiche doit rendre. LS-111.
 *
 * POURQUOI CE FICHIER EXISTE. LS-102 et LS-103 ont livre des ecrans dont le
 * critere « rendu controle a 320, 390, 768 et 1280 px » n'a jamais pu etre
 * execute : la suite ne couvrait que le REFUS sans session. Le debordement a
 * 320 px etait donc calcule et non mesure, et l'accessibilite des ecrans reels
 * n'etait vue par personne. Reporte deux fois, ce critere a recu son ticket.
 *
 * LA RECETTE, ET CE QU'ELLE NE PEUT PAS FAIRE. Le cookie de session est signe
 * HMAC avec BETTER_AUTH_SECRET : il ne se fabrique pas a la main, et le secret
 * ne se lit pas sur ce projet. Inserer une ligne `session` en SQL ne suffit pas
 * davantage, Better Auth verifiant la signature du cookie avant de la lire. Le
 * seul chemin est donc de passer par le VRAI point d'entree, `/sign-up/email`,
 * puis de promouvoir le compte en base.
 *
 * LA PROMOTION EST FORCEMENT EN SQL, ce n'est pas un contournement. `role`
 * porte `input: false` dans la configuration de Better Auth : aucune requete
 * HTTP ne peut le poser, ce qui est exactement l'invariant 2. Un test capable
 * de se promouvoir par l'API signalerait un defaut de production.
 *
 * PROMOUVOIR APRES L'INSCRIPTION SUFFIT, et le cookie deja pose reste valide :
 * `lireIdentite` passe par `auth.api.getSession`, qui RELIT l'utilisateur en
 * base a chaque appel. Le role n'est pas fige dans le jeton.
 *
 * LE COMPTE EST STABLE ENTRE LES EXECUTIONS, ET C'EST LE POINT DE CONCEPTION
 * DE CE FICHIER. Une premiere version inscrivait un compte neuf a chaque
 * execution, comme le fait `session-cliente.setup.ts`, et elle a echoue en
 * 429 : `/sign-up/email` est plafonne a TROIS appels par minute et par IP, le
 * compteur vit en BASE depuis ADR-027 et survit donc au redemarrage du serveur.
 * Deux inscriptions par execution, plus deux executions rapprochees, depassent
 * le plafond, et les deux preparations tombent ensemble.
 *
 * LE PLAFOND N'EST PAS DESACTIVE POUR AUTANT. Le neutraliser en test retirerait
 * de la mesure une protection reelle, et la suite ne dirait plus rien du
 * comportement servi en production. C'est la consommation qui baisse, pas la
 * garde.
 *
 * L'INSCRIPTION N'A DONC LIEU QU'UNE FOIS, a la premiere execution sur une base
 * donnee. Les suivantes se CONNECTENT, `/sign-in/email` etant plafonne a cinq
 * par minute et compte separement. Une execution en regime etabli ne consomme
 * plus qu'un seul appel d'inscription, celui de la session cliente, et laisse
 * deux places sur les trois.
 *
 * L'ADRESSE EST DONC FIXE, contrairement a celle de la session cliente qui
 * porte un horodatage. C'est ce qui permet de la retrouver : un compte par
 * execution ne se reutilise pas.
 *
 * LA SESSION ELLE-MEME EST REUTILISEE TANT QU'ELLE VAUT, et c'est le second
 * palier. Se reconnecter a chaque execution consomme une place sur les cinq de
 * `/sign-in/email`, et cinq relances rapprochees pendant une mise au point
 * bloquent la suite entiere sur un 429 : mesure faite plusieurs fois en ecrivant
 * ce fichier. Les sessions durent un jour depuis ADR-027, donc l'etat enregistre
 * par l'execution precedente est presque toujours encore valide.
 *
 * TROIS PALIERS, DU MOINS COUTEUX AU PLUS COUTEUX : reutiliser l'etat sur
 * disque, sinon se connecter, sinon s'inscrire. En regime etabli, une execution
 * ne fait AUCUN appel d'authentification.
 */
import "dotenv/config";

import { expect, test as preparation } from "@playwright/test";
import { Client } from "pg";

import {
  CATALOGUE_TEST,
  FICHE_TEST,
  FICHIER_SESSION_ADMINISTRATION,
  MESSAGES_TEST,
  PRODUIT_TEST,
} from "./chemin-session";

const MOT_DE_PASSE = "phrase-de-passe-de-test1";

/**
 * Adresse FIXE du compte d'administration de test.
 *
 * Elle porte le prefixe `e2e-` que la retrogradation ci-dessous cible : un
 * compte de test ne doit jamais pouvoir faire perdre son role au compte reel de
 * l'exploitante sur une base de developpement.
 */
const EMAIL_ADMINISTRATION = "e2e-administration@exemple.test";

/**
 * Ouvre une connexion sur la base que le serveur de test sert reellement.
 *
 * `DATABASE_URL` et non une base ephemere : le serveur Next.js lance par
 * `webServer` lit cette meme variable. Ecrire ailleurs poserait le compte dans
 * une base que l'application ne consulte jamais, et la promotion resterait sans
 * effet visible.
 */
async function ouvrirConnexion(): Promise<Client> {
  const url = process.env.DATABASE_URL;

  // ECHOUER PLUTOT QUE DE SAUTER LA PREPARATION. Un fichier qui se desactiverait
  // tout seul quand la base manque afficherait « aucun echec » pendant que rien
  // n'est verifie, defaut que la CI de ce projet refuse explicitement ailleurs.
  expect(
    url,
    "DATABASE_URL absente : la session d'administration ne peut pas etre preparee.",
  ).toBeTruthy();

  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

preparation(
  "ouvrir une session d'administration partagee",
  async ({ page }) => {
    const client = await ouvrirConnexion();

    try {
      /*
       * PALIER 1 : L'ETAT DE L'EXECUTION PRECEDENTE VAUT-IL ENCORE ?
       *
       * La promotion et le produit sont poses AVANT de tester la session : sur
       * une base reinitialisee entre deux executions, l'etat sur disque peut
       * rester valide alors que le role a disparu, et la suite serait redirigee
       * vers la connexion sans que rien ne designe la cause.
       */
      await preparerBase(client);

      if (await sessionEncoreValide(page)) {
        return;
      }

      /*
       * PALIERS 2 ET 3 : SE CONNECTER, SINON S'INSCRIRE.
       *
       * L'ORDRE EST DELIBERE : la connexion d'abord, l'inscription seulement si
       * elle echoue. L'inverse consommerait une place du plafond d'inscription
       * a chaque execution rien que pour apprendre que le compte existe, ce qui
       * est exactement le defaut qu'on corrige.
       */
      let reponse = await page.request.post("/api/auth/sign-in/email", {
        data: { email: EMAIL_ADMINISTRATION, password: MOT_DE_PASSE },
      });

      if (!reponse.ok()) {
        reponse = await page.request.post("/api/auth/sign-up/email", {
          data: {
            email: EMAIL_ADMINISTRATION,
            password: MOT_DE_PASSE,
            name: "Administration de test",
          },
        });

        /*
         * LE COMPTE VIENT D'ETRE CREE, IL FAUT LE PROMOUVOIR MAINTENANT. L'appel
         * ci-dessus n'a touche aucune ligne, l'utilisateur n'existant pas
         * encore : sans ce second passage, la toute premiere execution sur une
         * base neuve serait redirigee vers la connexion.
         */
        if (reponse.ok()) {
          await preparerBase(client);
        }
      }

      // ECHOUER ICI PLUTOT QUE DANS CHAQUE TEST. Les tests dependants sont alors
      // marques non executes avec la vraie cause en tete de rapport, au lieu
      // d'echouer plus loin sur « le titre est introuvable ».
      expect(reponse.ok(), await reponse.text()).toBe(true);
    } finally {
      await client.end();
    }

    await page.context().storageState({ path: FICHIER_SESSION_ADMINISTRATION });
  },
);

/**
 * L'etat de session enregistre par une execution precedente ouvre-t-il encore
 * un ecran protege ?
 *
 * TESTE SUR UNE ROUTE PROTEGEE ET NON SUR `/api/auth/get-session`. Cette
 * derniere rend 200 avec un corps vide pour une session absente ou expiree : un
 * controle « la reponse est ok » y passerait sur une session morte, et la suite
 * echouerait trente tests plus loin. La page d'administration, elle, redirige
 * vers la connexion, et l'URL finale tranche sans ambiguite.
 *
 * ELLE VERIFIE AUSSI LE ROLE, et pas seulement l'existence d'une session :
 * `/administration` exige `ADMINISTRATRICE`, donc un compte retrograde entre
 * deux executions est detecte ici plutot qu'a l'usage.
 *
 * RENDRE `false` PLUTOT QUE LEVER quand le fichier manque : la premiere
 * execution sur un poste neuf n'a evidemment aucun etat, ce n'est pas une
 * erreur, c'est le cas nominal du palier suivant.
 */
async function sessionEncoreValide(
  page: import("@playwright/test").Page,
): Promise<boolean> {
  const { existsSync } = await import("node:fs");

  if (!existsSync(FICHIER_SESSION_ADMINISTRATION)) {
    return false;
  }

  const contexte = await page.context().browser()?.newContext({
    storageState: FICHIER_SESSION_ADMINISTRATION,
  });

  if (!contexte) {
    return false;
  }

  try {
    const onglet = await contexte.newPage();
    await onglet.goto("/administration");

    if (/\/administration\/connexion$/.test(onglet.url())) {
      return false;
    }

    /*
     * L'ETAT EST REPRIS TEL QUEL, sans le reenregistrer. Better Auth prolonge la
     * session cote base, pas le cookie : reecrire le fichier ne repousserait
     * aucune echeance et ferait perdre l'original en cas d'ecriture partielle.
     */
    return true;
  } finally {
    await contexte.close();
  }
}

/**
 * Promeut le compte d'administration et pose le produit de controle.
 *
 * IDEMPOTENTE, elle est appelee jusqu'a deux fois par execution : une avant de
 * tester l'etat existant, une apres une inscription qui vient de creer le
 * compte.
 */
async function preparerBase(client: Client): Promise<void> {
  /*
   * RETROGRADER D'ABORD, PROMOUVOIR ENSUITE, ET DANS CET ORDRE.
   *
   * `utilisateur_administratrice_unique` est un index partiel : il n'admet
   * qu'UNE ligne dont le role vaut ADMINISTRATRICE. La base de developpement en
   * porte souvent une, laissee par un controle visuel anterieur, et la base de
   * CI n'en porte aucune. Promouvoir sans retrograder leve donc sur un poste de
   * developpement et passe en integration continue : le pire des deux, un echec
   * qui ne se reproduit pas la ou on le cherche.
   *
   * La retrogradation ne vise QUE les comptes de test, prefixe `e2e-`, et jamais
   * le compte d'administration lui-meme. Un `UPDATE` sans clause retirerait son
   * role au compte reel de l'exploitante sur une base de developpement, en
   * silence.
   */
  await client.query(
    `UPDATE utilisateur SET role = 'CLIENT'
     WHERE role = 'ADMINISTRATRICE'
       AND email LIKE 'e2e-%'
       AND email <> $1`,
    [EMAIL_ADMINISTRATION],
  );

  await client.query(
    `UPDATE utilisateur SET role = 'ADMINISTRATRICE', email_verifie = true
     WHERE email = $1`,
    [EMAIL_ADMINISTRATION],
  );

  await poserProduitDeControle(client);
  await poserCataloguePublie(client);
  await poserFicheProduit(client);
  await poserMessagesContact(client);
}

/**
 * Pose la categorie, le produit et la variante que l'editeur doit rendre.
 *
 * IDEMPOTENT PAR `ON CONFLICT`, les identifiants etant figes : la preparation se
 * rejoue a chaque execution, y compris apres une interruption qui n'aurait rien
 * nettoye. Sans cela la deuxieme execution locale echouerait sur la cle
 * primaire, et le message accuserait la fixture au lieu du comportement teste.
 *
 * UN PRODUIT EN BROUILLON AVEC UNE SEULE VARIANTE, deliberement incomplet. Cet
 * etat est celui qui rend les cinq blocs de l'editeur avec du contenu a mesurer,
 * dont le bloc de publication et sa liste de motifs de refus, la plus haute de
 * l'ecran a 320 px. Un produit deja publie afficherait un bloc de publication
 * reduit a son bouton d'archivage.
 */
async function poserProduitDeControle(client: Client): Promise<void> {
  await client.query(
    /*
     * `ordre` FIXE ET RESERVE, 9111. Les preparations tournent EN PARALLELE,
     * deux workers en CI : deriver `max(ordre) + 1` fait lire le meme maximum a
     * deux fichiers sur une base vierge, et C24 leve au COMMIT, la contrainte
     * etant DEFERRABLE. `ON CONFLICT (id)` ne rattrape pas, le conflit portant
     * sur `ordre`. Mesure le 1er septembre 2026, LS-160.
     */
    `INSERT INTO categorie (id, nom, slug, ordre, cree_a)
     VALUES ($1, 'TEST Catégorie LS-111', $2, 9111, now())
     ON CONFLICT (id) DO NOTHING`,
    [PRODUIT_TEST.categorieId, `${PRODUIT_TEST.slug}-categorie`],
  );

  await client.query(
    `INSERT INTO produit (id, categorie_id, nom, slug, statut, cree_a, modifie_a)
     VALUES ($1, $2, $3, $4, 'BROUILLON', now(), now())
     ON CONFLICT (id) DO NOTHING`,
    [
      PRODUIT_TEST.produitId,
      PRODUIT_TEST.categorieId,
      PRODUIT_TEST.nom,
      PRODUIT_TEST.slug,
    ],
  );

  await client.query(
    `INSERT INTO variante (
       id, produit_id, reference, libelle, prix_centimes,
       quantite_physique, quantite_reservee, vente_web_activee, cree_a
     )
     VALUES ($1, $2, $3, 'TEST Déclinaison', 4900, 1, 0, true, now())
     ON CONFLICT (id) DO NOTHING`,
    [PRODUIT_TEST.varianteId, PRODUIT_TEST.produitId, "TEST-LS111"],
  );
}

/**
 * Pose les trois produits PUBLIES que le catalogue public doit afficher, LS-104.
 *
 * DISTINCTS DU PRODUIT DE CONTROLE, qui reste en `BROUILLON` : celui-la sert de
 * test negatif, il ne doit jamais apparaitre au catalogue.
 *
 * TROIS ETATS DE DISPONIBILITE, deux categories. Les dates de publication sont
 * FIGEES et espacees, sans quoi le tri par nouveautes serait indistinguable
 * d'un tri par ordre d'insertion : trois `now()` a la milliseconde pres rendent
 * l'ordre dependant de la vitesse d'execution.
 */
async function poserCataloguePublie(client: Client): Promise<void> {
  for (const [rang, categorie] of [
    CATALOGUE_TEST.categorieA,
    CATALOGUE_TEST.categorieB,
    // Volontairement laissee sans produit : elle porte l'etat vide.
    CATALOGUE_TEST.categorieVide,
  ].entries()) {
    await client.query(
      /*
       * `ordre` FIXE ET RESERVE, 9104 plus le rang dans la liste. Il preserve
       * l'ordre relatif des trois categories, ce dont le test d'affichage
       * depend, sans deriver d'un maximum partage avec les autres amorces.
       */
      `INSERT INTO categorie (id, nom, slug, ordre, cree_a)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (id) DO NOTHING`,
      [categorie.id, categorie.nom, categorie.slug, 9104 + rang],
    );
  }

  const pieces = [
    {
      ...CATALOGUE_TEST.enStock,
      categorieId: CATALOGUE_TEST.categorieA.id,
      quantite: 4,
      publieA: "2026-08-01T10:00:00Z",
    },
    {
      ...CATALOGUE_TEST.dernierePiece,
      categorieId: CATALOGUE_TEST.categorieA.id,
      quantite: 1,
      // La plus recente : elle doit sortir en tete du tri par nouveautes.
      publieA: "2026-08-10T10:00:00Z",
    },
    {
      ...CATALOGUE_TEST.epuise,
      categorieId: CATALOGUE_TEST.categorieB.id,
      quantite: 0,
      publieA: "2026-07-01T10:00:00Z",
    },
  ];

  for (const piece of pieces) {
    await client.query(
      `INSERT INTO produit (id, categorie_id, nom, slug, statut, publie_a, cree_a, modifie_a)
       VALUES ($1, $2, $3, $4, 'ACTIF', $5, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [piece.id, piece.categorieId, piece.nom, piece.slug, piece.publieA],
    );

    await client.query(
      `INSERT INTO variante (
         id, produit_id, reference, libelle, prix_centimes,
         quantite_physique, quantite_reservee, vente_web_activee, cree_a
       )
       VALUES ($1, $2, $3, 'Déclinaison', $4, $5, 0, true, now())
       ON CONFLICT (id) DO NOTHING`,
      [
        piece.varianteId,
        piece.id,
        `TEST-${piece.slug.slice(-8).toUpperCase()}`,
        piece.prixCentimes,
        piece.quantite,
      ],
    );
  }

  /*
   * UNE PHOTO SUR UNE SEULE PIECE, ET C'EST DELIBERE. Le catalogue doit exercer
   * SES DEUX BRANCHES : la carte avec `<picture>` et ses trois sources, et la
   * carte sans photo qui reste affichable.
   *
   * SANS CETTE LIGNE LE `<picture>` N'EST EXECUTE PAR AUCUN TEST, defaut releve
   * en revue : les trois pieces empruntaient toutes la branche « image absente »,
   * et un `srcSet` mal forme n'aurait fait rougir personne. C'est le motif exact
   * du defaut « 640.jpg pour 640.jpeg » deja rencontre sur ce projet, ou une
   * chaine construite a l'execution n'etait confrontee a rien.
   *
   * LE STATUT EST `TRAITE` : un media en echec ou en attente ne represente pas
   * le cas nominal, et C8 interdit de publier un produit dont une photo a
   * echoue.
   *
   * LE CHEMIN SE TERMINE PAR UNE BARRE, comme celui que le traitement ecrit :
   * la carte y concatene `320.avif`, `640.jpeg` et le reste. Un chemin sans
   * barre finale produirait des URL collees, ce que ce test attrape.
   */
  await client.query(
    `INSERT INTO media (id, produit_id, chemin, texte_alternatif, ordre, statut_traitement, cree_a)
     VALUES ($1, $2, $3, $4, 1, 'TRAITE', now())
     ON CONFLICT (id) DO NOTHING`,
    [
      CATALOGUE_TEST.mediaEnStock.id,
      CATALOGUE_TEST.enStock.id,
      CATALOGUE_TEST.mediaEnStock.chemin,
      CATALOGUE_TEST.mediaEnStock.texteAlternatif,
    ],
  );
}

/**
 * Enrichit la piece en stock pour la FICHE produit, LS-105.
 *
 * IDEMPOTENT, comme les autres preparations : `UPDATE` cible par identifiant, et
 * `ON CONFLICT (id) DO NOTHING` sur les insertions a identifiant fige.
 *
 * LES SECTIONS NE PEUVENT PAS EMPLOYER `ON CONFLICT (produit_id, ordre)`. Cette
 * contrainte est DEFERRABLE, C20, et PostgreSQL refuse une contrainte
 * differable comme arbitre : « ON CONFLICT does not support deferrable unique
 * constraints ». Le piege est documente dans `002_contraintes_unicite.sql`, et
 * il se rencontre a l'execution seulement. L'idempotence passe donc par une
 * suppression prealable des sections de ce produit.
 */
async function poserFicheProduit(client: Client): Promise<void> {
  await client.query(
    `UPDATE produit SET description_courte = $2 WHERE id = $1`,
    [CATALOGUE_TEST.enStock.id, FICHE_TEST.descriptionCourte],
  );

  // La variante deja posee recoit un libelle et des dimensions parlants.
  await client.query(
    `UPDATE variante SET libelle = $2, dimensions = $3 WHERE id = $1`,
    [
      CATALOGUE_TEST.enStock.varianteId,
      FICHE_TEST.varianteEnStock.libelle,
      FICHE_TEST.varianteEnStock.dimensions,
    ],
  );

  /*
   * LA SECONDE DECLINAISON EST EPUISEE ET PLUS CHERE, deliberement : c'est ce
   * qui permet de prouver que le choix change le prix ET la disponibilite. Deux
   * variantes identiques ne prouveraient rien.
   */
  await client.query(
    `INSERT INTO variante (
       id, produit_id, reference, libelle, dimensions, prix_centimes,
       quantite_physique, quantite_reservee, vente_web_activee, cree_a
     )
     VALUES ($1, $2, $3, $4, $5, $6, 0, 0, true, now())
     ON CONFLICT (id) DO NOTHING`,
    [
      FICHE_TEST.varianteEpuisee.id,
      CATALOGUE_TEST.enStock.id,
      FICHE_TEST.varianteEpuisee.reference,
      FICHE_TEST.varianteEpuisee.libelle,
      FICHE_TEST.varianteEpuisee.dimensions,
      FICHE_TEST.varianteEpuisee.prixCentimes,
    ],
  );

  /*
   * UNE SECONDE PHOTOGRAPHIE, `ordre = 2`. La galerie n'affiche ses vignettes
   * qu'a partir de deux : avec une seule, le test des noms accessibles de LS-85
   * se passait en `skip` sur les trois largeurs et ne prouvait rien.
   *
   * `ordre = 2` ET NON 1 : l'index partiel `media_principal_unique` reserve le
   * rang 1 a un seul media par produit, deja pris par `mediaEnStock`.
   */
  await client.query(
    `INSERT INTO media (id, produit_id, chemin, texte_alternatif, ordre, statut_traitement, cree_a)
     VALUES ($1, $2, $3, $4, 2, 'TRAITE', now())
     ON CONFLICT (id) DO NOTHING`,
    [
      FICHE_TEST.mediaSecond.id,
      CATALOGUE_TEST.enStock.id,
      FICHE_TEST.mediaSecond.chemin,
      FICHE_TEST.mediaSecond.texteAlternatif,
    ],
  );

  await client.query(`DELETE FROM section_produit WHERE produit_id = $1`, [
    CATALOGUE_TEST.enStock.id,
  ]);

  const sections = [
    { ...FICHE_TEST.sections.visiblePremiere, ordre: 1, visible: true },
    { ...FICHE_TEST.sections.visibleSeconde, ordre: 2, visible: true },
    { ...FICHE_TEST.sections.masquee, ordre: 3, visible: false },
    { ...FICHE_TEST.sections.vide, ordre: 4, visible: true },
  ];

  for (const section of sections) {
    await client.query(
      `INSERT INTO section_produit (
         id, produit_id, cle, titre, contenu, ordre, visible, cree_a, modifie_a
       )
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now(), now())`,
      [
        CATALOGUE_TEST.enStock.id,
        `ls105-${section.ordre}`,
        section.titre,
        section.contenu,
        section.ordre,
        section.visible,
      ],
    );
  }
}

/**
 * Les DEUX messages de contact de la rubrique Messages, LS-97.
 *
 * DEUX ET NON UN, lecon directe de LS-130. La page rend un bloc de classement
 * PAR message : avec un seul, une assertion sur un libelle passerait quel que
 * soit l'etat des identifiants, et le croisement entre cartes ne serait jamais
 * exerce.
 *
 * LEURS STATUTS DIFFERENT, `NOUVEAU` et `LU`, donc les deux cartes proposent des
 * gestes differents : c'est ce qui met les deux blocs dans des etats distincts
 * plutot que de rendre deux fois le meme.
 *
 * `lu_a` EST OBLIGATOIRE SUR LE SECOND, C30 etant une EQUIVALENCE : un message
 * `LU` sans date de lecture n'atteint jamais la base, et l'amorce entiere
 * echouerait sur une contrainte plutot que sur un test.
 */
async function poserMessagesContact(client: Client): Promise<void> {
  await client.query(
    `INSERT INTO message (id, nom, email, sujet, corps, statut, cree_a)
     VALUES ($1, $2, $3, $4, $5, 'NOUVEAU', now())
     ON CONFLICT (id) DO NOTHING`,
    [
      MESSAGES_TEST.nouveau.id,
      MESSAGES_TEST.nouveau.nom,
      MESSAGES_TEST.nouveau.email,
      MESSAGES_TEST.nouveau.sujet,
      MESSAGES_TEST.nouveau.corps,
    ],
  );

  await client.query(
    `INSERT INTO message (id, nom, email, sujet, corps, statut, lu_a, cree_a)
     VALUES ($1, $2, $3, $4, $5, 'LU', now(), now() - interval '1 day')
     ON CONFLICT (id) DO NOTHING`,
    [
      MESSAGES_TEST.lu.id,
      MESSAGES_TEST.lu.nom,
      MESSAGES_TEST.lu.email,
      MESSAGES_TEST.lu.sujet,
      MESSAGES_TEST.lu.corps,
    ],
  );

  /*
   * L'AMORCE VERIFIE SON PROPRE RESULTAT, regle etablie par LS-160.
   *
   * ELLE VERIFIE LES DEUX STATUTS et pas seulement le compte : une execution
   * precedente qui aurait classe le premier message en `LU` laisserait deux
   * cartes identiques, et le test des gestes distincts passerait sans rien
   * prouver. `ON CONFLICT (id) DO NOTHING` ne le remettrait jamais en
   * `NOUVEAU`.
   */
  const { rows } = await client.query<{ statut: string; nombre: string }>(
    `SELECT statut, count(*)::text AS nombre FROM message
     WHERE id = ANY($1::text[]) GROUP BY statut ORDER BY statut`,
    [[MESSAGES_TEST.nouveau.id, MESSAGES_TEST.lu.id]],
  );

  const parStatut = new Map(rows.map((ligne) => [ligne.statut, ligne.nombre]));

  if (parStatut.get("NOUVEAU") !== "1" || parStatut.get("LU") !== "1") {
    throw new Error(
      "Amorce des messages de contact incomplete : " +
        JSON.stringify(Object.fromEntries(parStatut)) +
        ". Attendu un message NOUVEAU et un message LU, sans quoi les deux " +
        "cartes proposeraient les memes gestes et le test ne prouverait rien.",
    );
  }
}
