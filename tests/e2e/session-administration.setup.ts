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
  FICHIER_SESSION_ADMINISTRATION,
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
    `INSERT INTO categorie (id, nom, slug, ordre, cree_a)
     VALUES ($1, 'TEST Catégorie LS-111', $2,
             (SELECT coalesce(max(ordre), 0) + 1 FROM categorie), now())
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
  for (const categorie of [
    CATALOGUE_TEST.categorieA,
    CATALOGUE_TEST.categorieB,
    // Volontairement laissee sans produit : elle porte l'etat vide.
    CATALOGUE_TEST.categorieVide,
  ]) {
    await client.query(
      `INSERT INTO categorie (id, nom, slug, ordre, cree_a)
       VALUES ($1, $2, $3,
               (SELECT coalesce(max(ordre), 0) + 1 FROM categorie), now())
       ON CONFLICT (id) DO NOTHING`,
      [categorie.id, categorie.nom, categorie.slug],
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
}
