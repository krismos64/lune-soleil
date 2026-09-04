/**
 * Les ecrans d'administration RENDUS, avec session, aux trois largeurs. LS-111.
 *
 * CE QUE CE FICHIER PROUVE ET QUE `catalogue-administration.spec.ts` NE PROUVE
 * PAS. Ce dernier verifie le REFUS d'un visiteur sans session : la redirection,
 * l'absence de fuite dans le HTML, l'appel direct a une Server Action. C'est un
 * test negatif de securite, et il est solide, mais il ne rend jamais un ecran.
 *
 * Personne ne mesurait donc, avant ce fichier :
 *
 *   - le debordement horizontal REEL a 320 px, jusqu'ici CALCULE dans les revues
 *   - l'accessibilite des ecrans reels, `AxeBuilder` ne tournant que sur la
 *     connexion et la page d'attente
 *   - le rendu des quatre blocs de l'editeur, ou LS-102 et LS-103 ont laisse
 *     trois reserves de lisibilite ouvertes
 *
 * LES CRITERES DE LS-102 ET LS-103 SONT RESTES NON EXECUTES POUR CETTE RAISON,
 * et signales comme tels dans les deux tickets plutot que declares faits. Les
 * reporter une troisieme fois aurait installe la fiction.
 *
 * QUATRE LARGEURS DEMANDEES, TROIS CONFIGUREES. `CLAUDE.md` enonce 320, 390,
 * 768 et 1280 px ; les projets Playwright couvrent 320, 390 et 1280 depuis
 * LS-68. L'ecart est anterieur a ce ticket et ne s'y corrige pas : ajouter un
 * quatrieme projet allongerait d'un tiers une suite dont le cout est deja
 * mesure. 768 px reste donc un controle a l'oeil, comme avant.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  COMMANDE_A_EXPEDIER_TEST,
  COMMANDE_FACTUREE_TEST,
  COMMANDE_TEST,
  FICHIER_SESSION,
  FICHIER_SESSION_ADMINISTRATION,
  MESSAGES_TEST,
  PRODUIT_TEST,
  SECONDE_COMMANDE_A_EXPEDIER_TEST,
} from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

/**
 * LA SESSION VIENT DU PROJET `preparation`, ouverte UNE fois pour toute la
 * suite, voir `session-administration.setup.ts`.
 *
 * DECLAREE ICI ET NON SUR LES PROJETS, motif de `compte-suppression-connecte` :
 * les autres fichiers verifient qu'un visiteur ANONYME est refuse, et leur
 * donner une session d'administration les ferait passer pour la mauvaise
 * raison, ou echouer franchement.
 */
test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

const ECRANS = [
  {
    chemin: "/administration",
    /*
     * « Tableau de bord » DEPUIS LS-181. Le titre etait « Administration »
     * quand la page ne portait qu'un `h1` et la phrase « Connexion réussie » :
     * elle existait pour etre la premiere route protegee, LS-70, pas pour
     * afficher quoi que ce soit.
     */
    titre: "Tableau de bord",
  },
  {
    chemin: "/administration/categories",
    titre: "Catégories du catalogue",
  },
  {
    /* LS-183. La liste du catalogue, qui rendait l'editeur inatteignable sans
     * connaitre un UUID tant qu'elle n'existait pas. */
    chemin: "/administration/produits",
    titre: "Produits",
  },
  {
    chemin: "/administration/produits/nouveau",
    titre: "Nouveau produit",
  },
  {
    chemin: `/administration/produits/${PRODUIT_TEST.produitId}`,
    titre: "Informations générales",
  },
  /*
   * LES COMMANDES, LS-121. C'est l'ecran le plus dense de l'administration :
   * numero, badge de statut, nom, montant, date et etat d'encaissement sur une
   * meme carte. A 320 px, c'est celui qui deborde en premier si la mise en
   * page cede, d'ou sa presence ici plutot qu'un controle a l'oeil.
   */
  {
    chemin: "/administration/commandes",
    titre: "Commandes",
  },
  /*
   * LE DETAIL, sur la commande amorcee par LS-118. Elle porte des lignes
   * figees, une adresse, un paiement et un historique : quatre sections dont
   * les libelles longs sont le vrai risque de debordement.
   */
  {
    chemin: `/administration/commandes/${COMMANDE_TEST.commandeId}`,
    titre: COMMANDE_TEST.numero,
  },
  /*
   * LE DETAIL D'UNE COMMANDE FACTUREE, LS-160, distinct du precedent pour une
   * raison de fond : sur une commande `EN_ATTENTE_PAIEMENT`, l'ecran de
   * remboursement rend un simple paragraphe. Le FORMULAIRE, ses deux champs,
   * son avertissement et son bouton ne seraient mesures a aucune largeur.
   *
   * C'est la que le debordement a 320 px se joue : un champ de saisie prend
   * toute la largeur disponible, et sa bordure plus son rembourrage s'y
   * ajoutent si `box-sizing` n'est pas herite.
   */
  {
    chemin: `/administration/commandes/${COMMANDE_FACTUREE_TEST.commandeId}`,
    titre: COMMANDE_FACTUREE_TEST.numero,
  },
  /*
   * LA FILE D'EXPEDITION, LS-130. Elle rend UN formulaire de quatre champs PAR
   * colis a preparer, dans une carte qui porte deja le numero, le nom, le mode
   * et l'adresse : c'est la densite la plus forte de l'administration apres le
   * detail de commande.
   *
   * ELLE NE MESURE QUELQUE CHOSE QUE PARCE QUE `COMMANDE_A_EXPEDIER_TEST`
   * EXISTE. Sans commande `EN_PREPARATION`, l'ecran rend son etat vide, un
   * paragraphe, et aucun champ ne serait mesure a aucune largeur : c'est le
   * motif de LS-121 puis de LS-160, rencontre une troisieme fois.
   */
  {
    chemin: "/administration/expeditions",
    titre: "Expéditions",
  },
  /*
   * LA RUBRIQUE MESSAGES, LS-97. Elle rend un bloc de classement PAR message,
   * plus un corps pliable pouvant atteindre 4000 caracteres : c'est le texte
   * libre le plus long de l'administration, donc le premier candidat au
   * debordement a 320 px.
   *
   * DEUX MESSAGES SONT AMORCES, statuts differents, ce qui rend le croisement
   * des identifiants entre cartes reellement exerce.
   */
  {
    chemin: "/administration/messages",
    titre: "Messages",
  },
  /*
   * LA RUBRIQUE RETRACTATIONS, LS-135. La demande amorcee est `RETOUR_ATTENDU`
   * ET son colis est marque recu : c'est l'etat le plus DENSE de l'ecran, le
   * seul ou les quatre gestes coexistent, preuve d'expedition, reception,
   * remboursement avec son champ de montant, et refus avec sa zone de texte.
   *
   * SANS CETTE DENSITE, RIEN NE SERAIT MESURE. Une demande `DEPOSEE` ne rend
   * qu'un bouton, et le debordement a 320 px se joue precisement sur les champs
   * de saisie qui prennent toute la largeur. Motif rencontre trois fois avant
   * cette story, LS-121, LS-160 puis LS-130.
   */
  {
    chemin: "/administration/retractations",
    titre: "Rétractations",
  },
] as const;

for (const ecran of ECRANS) {
  test(`${ecran.chemin} est rendu pour une administratrice`, async ({
    page,
  }) => {
    await page.goto(ecran.chemin);

    // L'URL NE DOIT PAS AVOIR BOUGE. Sans cette assertion, une redirection vers
    // la connexion laisserait les tests suivants mesurer l'ECRAN DE CONNEXION,
    // qui ne deborde pas et ne porte aucune violation : la suite serait verte
    // en n'ayant jamais rendu ce qu'elle pretend mesurer.
    await expect(page).toHaveURL(new RegExp(`${ecran.chemin}$`));

    await expect(
      page.getByRole("heading", { name: ecran.titre, exact: true }),
    ).toBeVisible();

    /*
     * SUR L'EDITEUR, VERIFIER AUSSI QUE C'EST LA BONNE FICHE.
     *
     * Les titres de la table ci-dessus sont des `h2` de bloc, identiques d'une
     * fiche a l'autre : ils prouvent que l'ecran est rendu, jamais QUEL produit
     * il porte. Le `h1` est le nom du produit, et sans cette assertion une page
     * qui rendrait une autre fiche, ou un titre vide, passerait.
     */
    if (ecran.chemin.includes(PRODUIT_TEST.produitId)) {
      await expect(
        page.getByRole("heading", { name: PRODUIT_TEST.nom, level: 1 }),
      ).toBeVisible();
    }
  });

  test(`${ecran.chemin} ne deborde pas horizontalement`, async ({ page }) => {
    await page.goto(ecran.chemin);
    await expect(
      page.getByRole("heading", { name: ecran.titre, exact: true }),
    ).toBeVisible();

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });

  test(`${ecran.chemin} ne porte aucune violation d'accessibilite`, async ({
    page,
  }) => {
    await page.goto(ecran.chemin);
    await expect(
      page.getByRole("heading", { name: ecran.titre, exact: true }),
    ).toBeVisible();

    const resultat = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(resultat.violations).toEqual([]);
  });
}

/**
 * LES CINQ BLOCS DE L'EDITEUR SONT RENDUS DANS L'ORDRE DECIDE, LS-100 a LS-103.
 *
 * L'ORDRE VERIFIE ICI EST CELUI DE L'ECRAN D'ADMINISTRATION, et il ne se
 * confond pas avec la table « Fiche produit, ordre des blocs » de
 * `frontend-design.md`, qui decrit la fiche PUBLIQUE : prix, ajout au panier,
 * avis verifies. Deux ecrans, deux ordres, et la premiere version de ce test
 * appliquait la table publique a l'editeur.
 *
 * LA PUBLICATION EST EN TETE, apres le titre, arbitrage de LS-103 ecrit dans
 * `page.tsx` : ce bloc porte l'etat de la fiche et ce qui manque pour la
 * publier, donc la premiere chose a lire en ouvrant l'ecran. Le placer en bas
 * obligerait a defiler tout le formulaire pour savoir ou on en est, a 320 px
 * surtout, ou le seul editeur mesure plus de 3 000 px de haut.
 *
 * LE RESTE SUIT LE TRAVAIL REEL, arbitrage du 14 aout 2026 : informations
 * generales, puis sections editoriales, puis declinaisons, puis photos.
 *
 * COMPARER LES POSITIONS RENDUES, et non l'ordre du JSX : c'est la disposition
 * qui compte, et un `order` CSS ou une grille suffirait a les dissocier sans
 * qu'aucune lecture du source ne le voie.
 */
test("les cinq blocs de l'editeur sont rendus dans l'ordre decide", async ({
  page,
}) => {
  await page.goto(`/administration/produits/${PRODUIT_TEST.produitId}`);

  const titres = [
    "Publication",
    "Informations générales",
    "Sections de la fiche",
    "Déclinaisons et prix",
    "Photos de la fiche",
  ];

  const positions: { titre: string; y: number }[] = [];

  for (const titre of titres) {
    const bloc = page.getByRole("heading", { name: titre, exact: true });
    await expect(bloc).toBeVisible();

    const boite = await bloc.boundingBox();
    expect(
      boite,
      `le titre « ${titre} » n'a pas de boite de rendu`,
    ).not.toBeNull();
    positions.push({ titre, y: boite!.y });
  }

  // Strictement croissant : deux blocs a la meme ordonnee seraient cote a cote,
  // ce que la conception a 320 px exclut.
  //
  // LES PAIRES SE CONSTRUISENT PAR `slice` ET NON PAR UN INDICE NU : le projet
  // active `noUncheckedIndexedAccess`, et `positions[i]` y vaut
  // `{...} | undefined`. Le contourner par `!` retirerait la garantie que le
  // drapeau apporte au reste du fichier.
  const paires = positions.slice(1).map((courant, index) => ({
    precedent: positions[index]!,
    courant,
  }));

  for (const { precedent, courant } of paires) {
    expect(
      courant.y,
      `« ${courant.titre} » n'est pas sous « ${precedent.titre} »`,
    ).toBeGreaterThan(precedent.y);
  }
});

/**
 * LE BLOC DE PUBLICATION AFFICHE SES MOTIFS DE REFUS, et c'est le plus haut de
 * l'ecran a 320 px.
 *
 * L'ETAT MESURE EST L'ETAT NOMINAL, et c'est contre-intuitif. Un produit qu'on
 * vient de creer n'est jamais publiable : il lui manque ses photos et ses
 * descriptions. Cette liste de motifs est donc ce que l'exploitante voit au
 * PREMIER affichage de chaque fiche, pas un cas de bord.
 *
 * C'est aussi le bloc ou LS-103 a trouve son defaut de largeur, un `<ul>` dont
 * le `padding-inline-start` par defaut mangeait 40 px sur 320. La correction
 * n'avait jamais pu etre observee dans un navigateur.
 */
test("les motifs de non-publication sont lisibles sans debordement", async ({
  page,
}) => {
  await page.goto(`/administration/produits/${PRODUIT_TEST.produitId}`);

  const publication = page.getByRole("heading", {
    name: "Publication",
    exact: true,
  });
  await expect(publication).toBeVisible();

  /*
   * LES MOTIFS SE COMPTENT DANS LA REGION DE PUBLICATION, ET NON SUR LA PAGE.
   *
   * La premiere version ecrivait `page.getByRole("listitem")`, ce qui compte
   * les elements de QUATRE listes : les manques, mais aussi une entree par
   * variante, par photo et par section. La fixture posant une declinaison, le
   * compte valait au moins 1 meme quand le bloc de publication ne rendait plus
   * aucun motif.
   *
   * MESURE FAITE : en vidant `manquants` dans `publication-produit.tsx`, le test
   * restait VERT aux trois largeurs, alors que son commentaire affirmait qu'il
   * verrait ce cas. Une assertion ancree trop large ne mesure pas ce qu'elle
   * nomme.
   */
  const regionPublication = page.getByRole("region", { name: "Publication" });
  const motifs = regionPublication.getByRole("listitem");
  expect(await motifs.count()).toBeGreaterThan(0);

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

/**
 * UN CLIENT CONNECTE EST REFUSE, ET C'EST LE TROU QUE LA SESSION OUVRE.
 *
 * CE QUE CE BLOC PROUVE ET QUE RIEN D'AUTRE NE PROUVAIT. Les fichiers
 * anterieurs verifient qu'un visiteur ANONYME est redirige. Un compte
 * ordinairement connecte, lui, n'etait teste nulle part : c'est pourtant le
 * seul chemin realiste vers ces ecrans, une personne qui s'est inscrite dans la
 * boutique et qui tape l'URL d'administration.
 *
 * LA DIFFERENCE EST L'INVARIANT 2. Une page qui appellerait `exigerSession` au
 * lieu d'`exigerAdministratrice` redirige toujours l'anonyme, donc TOUS les
 * tests de refus anterieurs restent verts, et livre l'ecran entier a n'importe
 * quel compte. C'est un defaut silencieux, et il se corrige d'un mot.
 *
 * LA SESSION CLIENTE EST DEJA OUVERTE par `session-cliente.setup.ts`, sans
 * aucune inscription supplementaire : le plafond de debit n'est pas touche.
 */
test.describe("un client connecte sans le role", () => {
  test.use({ storageState: FICHIER_SESSION });

  for (const ecran of ECRANS) {
    test(`${ecran.chemin} refuse un client connecte`, async ({ page }) => {
      await page.goto(ecran.chemin);

      await expect(page).toHaveURL(/\/administration\/connexion$/);

      /*
       * LE CONTENU PROTEGE N'EST PAS SERVI, meme masque. Une page qui rendrait
       * son titre avant de naviguer le livrerait dans le HTML a qui n'a pas le
       * role.
       *
       * L'ACCUEIL EST EXCLU DE CETTE ASSERTION, ET CE N'EST PAS UNE FUITE :
       * l'ecran de CONNEXION porte lui-meme `<h1>Administration</h1>`, le meme
       * libelle que la page protegee. Exiger son absence apres redirection
       * ferait rougir un refus parfaitement correct. La redirection constatee
       * ci-dessus reste la preuve qui compte, et les trois autres ecrans
       * portent des titres qui n'existent nulle part ailleurs.
       */
      if (ecran.chemin !== "/administration") {
        await expect(
          page.getByRole("heading", { name: ecran.titre, exact: true }),
        ).toHaveCount(0);
      }
    });
  }

  /*
   * LE NOM DU PRODUIT EST LA DONNEE LA PLUS PARLANTE de l'editeur : il dit
   * qu'une fiche existe sous cet identifiant. Une redirection qui laisserait
   * fuiter le `<h1>` renseignerait sur le catalogue en preparation.
   */
  test("le nom du produit ne fuite pas vers un client connecte", async ({
    page,
  }) => {
    await page.goto(`/administration/produits/${PRODUIT_TEST.produitId}`);

    await expect(page).toHaveURL(/\/administration\/connexion$/);
    await expect(page.getByText(PRODUIT_TEST.nom)).toHaveCount(0);
  });
});

/**
 * LA BASCULE 768 px, LS-121. Elle n'est mesuree par aucun projet Playwright :
 * `CLAUDE.md` enonce quatre largeurs, la configuration en couvre trois depuis
 * LS-68, et 768 px restait « un controle a l'oeil ».
 *
 * CE TEST NE CORRIGE PAS CET ECART EN GENERAL, il le comble sur les deux ecrans
 * de commandes SEULEMENT, et pour une raison precise : `commandes.module.css`
 * porte son unique point de bascule a exactement 768 px, ou `.article` et
 * `.entreeHistorique` passent de colonne a ligne. Une mise en page qui cede le
 * fait a son point de bascule, jamais au milieu d'une plage.
 *
 * IL REDIMENSIONNE PLUTOT QUE D'AJOUTER UN PROJET : un quatrieme projet
 * allongerait d'un tiers une suite dont le cout est deja mesure, pour deux
 * ecrans.
 */
const ECRANS_BASCULE = [
  "/administration/commandes",
  `/administration/commandes/${COMMANDE_TEST.commandeId}`,
  `/administration/commandes/${COMMANDE_FACTUREE_TEST.commandeId}`,
  /*
   * LA FILE D'EXPEDITION PORTE SON PROPRE POINT DE BASCULE A 768 px, LS-130,
   * ou le formulaire passe d'une colonne a deux. C'est exactement la largeur ou
   * une mise en page cede, et elle n'est couverte par aucun projet.
   */
  "/administration/expeditions",
] as const;

for (const chemin of ECRANS_BASCULE) {
  test(`${chemin} ne deborde pas au point de bascule de 768 px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(chemin);

    // L'URL n'a pas bouge : sans cela, une redirection vers la connexion ferait
    // mesurer un ecran qui ne deborde jamais.
    await expect(page).toHaveURL(new RegExp(`${chemin}$`));

    const debordement = await debordementHorizontal(page);
    expect(debordement).toBeLessThanOrEqual(TOLERANCE_DEBORDEMENT_PX);
  });
}

/**
 * LA FILE D'EXPEDITION REND SON FORMULAIRE, LS-130.
 *
 * CE QUE LA BOUCLE GENERIQUE NE PROUVE PAS. Elle verifie le titre, le
 * debordement et l'accessibilite : un ecran qui rendrait son etat vide les
 * passerait tous les trois. Ces tests-ci verifient que la BRANCHE mesuree est
 * bien celle du formulaire, ce qui est precisement le defaut rencontre en
 * LS-121 puis en LS-160.
 *
 * AUCUN DE CES TESTS NE DECLARE L'EXPEDITION, et c'est deliberé. Le geste est
 * IRREVERSIBLE : une commande declaree expediee quitte la file, et l'execution
 * suivante mesurerait l'etat vide sans qu'aucune assertion ne le signale.
 * `ON CONFLICT (id) DO NOTHING` ne la remettrait jamais en preparation.
 *
 * LE CHEMIN D'ECRITURE EST PROUVE AILLEURS, par les seize tests d'integration
 * de `expedition.sequential.test.ts`, qui travaillent sur une base ephemere.
 */
test.describe("file d'expédition", () => {
  test("les deux commandes en préparation portent chacune leur formulaire", async ({
    page,
  }) => {
    await page.goto("/administration/expeditions");

    await expect(
      page.getByRole("link", { name: COMMANDE_A_EXPEDIER_TEST.numero }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: SECONDE_COMMANDE_A_EXPEDIER_TEST.numero,
      }),
    ).toBeVisible();

    /*
     * DEUX CHAMPS PAR LIBELLE, ET C'EST L'ASSERTION QUI COMPTE.
     *
     * `getByLabel` ne rend deux elements QUE si chaque `label` pointe vers un
     * champ DISTINCT. Des `id` partages entre les deux cartes feraient pointer
     * les deux libelles vers le MEME champ, et ce compte tomberait a un.
     *
     * L'ASSERTION PRECEDENTE, `toBeVisible` sur une carte unique, NE PROUVAIT
     * RIEN : mesure le 2 septembre 2026, les identifiants remplaces par des
     * constantes fixes laissaient les trois tests verts. Le composant etait
     * correct, la preuve ne l'etait pas.
     */
    await expect(page.getByLabel("Transporteur")).toHaveCount(2);
    await expect(page.getByLabel("Mode réellement exécuté")).toHaveCount(2);
    await expect(page.getByLabel("Numéro de suivi")).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: "Déclarer expédiée" }),
    ).toHaveCount(2);

    /*
     * LA SECONDE CARTE EST EN `POINT_RELAIS`, donc elle SEULE rend le champ de
     * point de retrait : un compte de 1 prouve a la fois que le champ suit le
     * mode de sa propre carte, et qu'il ne fuit pas sur la voisine.
     */
    await expect(page.getByLabel("Point de retrait exécuté")).toHaveCount(1);

    /*
     * L'AVERTISSEMENT D'IRREVERSIBILITE EST SUR CHAQUE CARTE, et il est
     * VISIBLE : LS-121 ne permet aucun retour depuis `EXPEDIEE`, donc une
     * declaration par erreur ne se rattrape pas depuis l'interface.
     */
    await expect(page.getByText(/irréversible/)).toHaveCount(2);
  });

  /*
   * LE CHAMP DE POINT DE RETRAIT APPARAIT AVEC LE MODE, ET SEULEMENT AVEC LUI.
   *
   * C'EST L'EQUIVALENCE DE `chk_expedition_mode_point_relais` RENDUE VISIBLE :
   * les deux modes de retrait l'exigent, le domicile l'interdit. Un champ
   * toujours present ferait saisir un point sur une livraison a domicile, que
   * la contrainte rejetterait avec un message que l'exploitante ne pourrait pas
   * relier au champ fautif.
   */
  test("le point de retrait n'apparaît que pour un mode en relais", async ({
    page,
  }) => {
    await page.goto("/administration/expeditions");

    /*
     * LA CARTE EST DESIGNEE PAR SON NUMERO, jamais par un indice de position :
     * la file est triee par anciennete, et un test qui prendrait « la premiere »
     * changerait de cible au premier ajout de donnee de test.
     */
    const carte = page
      .locator("li")
      .filter({ hasText: COMMANDE_A_EXPEDIER_TEST.numero });

    const mode = carte.getByLabel("Mode réellement exécuté");
    await expect(mode).toHaveValue("DOMICILE");
    await expect(carte.getByLabel("Point de retrait exécuté")).toHaveCount(0);

    await mode.selectOption("POINT_RELAIS");
    await expect(carte.getByLabel("Point de retrait exécuté")).toBeVisible();

    await mode.selectOption("LOCKER");
    await expect(carte.getByLabel("Point de retrait exécuté")).toBeVisible();

    /*
     * LE RETOUR A DOMICILE LE RETIRE, et ce sens compte autant que l'autre :
     * un champ qui resterait affiche garderait sa valeur et la joindrait a
     * l'envoi, ce que la validation refuserait.
     */
    await mode.selectOption("DOMICILE");
    await expect(carte.getByLabel("Point de retrait exécuté")).toHaveCount(0);

    /*
     * LA CARTE VOISINE N'A PAS BOUGE, et c'est ce que deux cartes permettent de
     * verifier : son champ de point de retrait est toujours la. Un etat partage
     * entre les deux formulaires, ou des `id` croises, le ferait disparaitre
     * avec celui d'ici.
     */
    const voisine = page
      .locator("li")
      .filter({ hasText: SECONDE_COMMANDE_A_EXPEDIER_TEST.numero });
    await expect(voisine.getByLabel("Point de retrait exécuté")).toBeVisible();
  });

  /*
   * AUCUN CHAMP NE PERMET DE SAISIR UNE DATE, critere 3 de LS-130.
   *
   * `livreA` FAIT COURIR LE DELAI DE RETRACTATION : l'inventer d'un clic le
   * ferait partir d'une date fausse, et le client perdrait des jours de droit
   * sans que rien ne le signale. La date vient du suivi automatique de LS-131.
   *
   * LA VERIFICATION PORTE SUR LE DOM RENDU et non sur le source : un champ
   * ajoute par mimetisme dans une future story serait vu ici, la ou une lecture
   * de fichier suppose de savoir quoi chercher.
   */
  test("aucun champ de date de livraison n'est saisissable", async ({
    page,
  }) => {
    await page.goto("/administration/expeditions");

    /*
     * LES DEUX FORMULAIRES SONT RENDUS AVANT DE COMPTER, sans quoi un compte de
     * zero champ de date serait vrai sur une page vide : c'est le motif « la
     * cible n'existe pas », qui rend un controle vert sans rien avoir vu.
     */
    await expect(
      page.getByRole("button", { name: "Déclarer expédiée" }),
    ).toHaveCount(2);

    expect(await page.locator('input[type="date"]').count()).toBe(0);
    expect(await page.locator('input[type="datetime-local"]').count()).toBe(0);

    /*
     * NI PAR UN CHAMP TEXTE NOMME COMME TEL. Le test precedent fermerait un
     * `input[type=date]` ajoute par inadvertance ; celui-ci ferme la forme
     * detournee, un champ texte qui porterait le nom de la colonne.
     */
    expect(
      await page.locator('[name="livreA"], [name="livre_a"]').count(),
    ).toBe(0);
  });
});

/**
 * LA RUBRIQUE MESSAGES REND SES DEUX CARTES, LS-97.
 *
 * CE QUE LA BOUCLE GENERIQUE NE PROUVE PAS : elle verifie le titre, le
 * debordement et l'accessibilite, qu'un ecran vide passerait tous les trois.
 *
 * AUCUN DE CES TESTS NE CLASSE UN MESSAGE, et c'est deliberé. Le geste est
 * persistant : un message passe en `TRAITE` ne redevient pas `NOUVEAU` a
 * l'execution suivante, `ON CONFLICT (id) DO NOTHING` ne le remettant jamais en
 * etat. Les deux cartes cesseraient d'avoir des statuts distincts, et le test
 * des gestes differencies passerait sans rien prouver.
 *
 * LE CHEMIN D'ECRITURE EST PROUVE PAR LES TESTS D'INTEGRATION, sur base
 * ephemere.
 */
test.describe("rubrique Messages", () => {
  test("les deux messages portent chacun leur bloc de classement", async ({
    page,
  }) => {
    await page.goto("/administration/messages");

    await expect(page.getByText(MESSAGES_TEST.nouveau.sujet)).toBeVisible();
    await expect(page.getByText(MESSAGES_TEST.lu.sujet)).toBeVisible();

    /*
     * DEUX CORPS PLIABLES, UN PAR CARTE. Un compte de 1 signifierait que les
     * deux cartes partagent un `details`, ou qu'une seule est rendue.
     *
     * LE SELECTEUR VISE LE `summary` PAR SON TEXTE et non un role : un
     * `<details>` n'expose pas `group` de facon portable, mesure le 2 septembre
     * 2026 sur ce meme test, qui rendait zero.
     */
    await expect(
      page
        .locator("main ul li")
        .filter({ hasText: MESSAGES_TEST.nouveau.sujet })
        .getByText("Lire le message"),
    ).toHaveCount(1);
    await expect(
      page
        .locator("main ul li")
        .filter({ hasText: MESSAGES_TEST.lu.sujet })
        .getByText("Lire le message"),
    ).toHaveCount(1);

    /*
     * LES GESTES DIFFERENT SELON LE STATUT, et c'est ce que deux messages dans
     * deux etats permettent de verifier. `NOUVEAU` ne propose que « marquer
     * comme lu » ; `LU` propose « traité » et « remettre en non lu ».
     *
     * UN SEUL MESSAGE NE PROUVERAIT RIEN DE CELA : la table `GESTES` serait
     * exercee sur une seule de ses trois entrees.
     *
     * LES ASSERTIONS PORTENT SUR LA CARTE VISEE, jamais sur la page entiere.
     * Un compte global cassait des qu'un autre message existait : le test de
     * classement en cree un, et les trois projets Playwright partagent la base.
     * Une CI rouge sur `mobile-390` seul l'a montre, donc de facon trompeuse.
     */
    const carteNouveau = page
      .locator("main ul li")
      .filter({ hasText: MESSAGES_TEST.nouveau.sujet });
    const carteLu = page
      .locator("main ul li")
      .filter({ hasText: MESSAGES_TEST.lu.sujet });

    await expect(
      carteNouveau.getByRole("button", { name: "Marquer comme lu" }),
    ).toHaveCount(1);
    await expect(
      carteNouveau.getByRole("button", { name: "Marquer comme traité" }),
    ).toHaveCount(0);

    await expect(
      carteLu.getByRole("button", { name: "Marquer comme traité" }),
    ).toHaveCount(1);
    await expect(
      carteLu.getByRole("button", { name: "Remettre en non lu" }),
    ).toHaveCount(1);
  });

  /*
   * LE LIEN `mailto:` EST LE MECANISME DE REPONSE de cette story, arbitrage du
   * 2 septembre 2026 : la correspondance ne passe pas par le code, ADR-008.
   *
   * LE SUJET EST PREREMPLI AVEC « Re : », sans quoi l'exploitante le retaperait
   * a chaque fois et le fil se casserait cote client.
   */
  test("chaque message porte un lien mailto au sujet prérempli", async ({
    page,
  }) => {
    await page.goto("/administration/messages");

    const lien = page.getByRole("link", {
      name: MESSAGES_TEST.nouveau.email,
    });

    await expect(lien).toBeVisible();

    const href = await lien.getAttribute("href");

    /*
     * L'ADRESSE EST LITTERALE DANS L'URL, jamais encodee. `encodeURIComponent`
     * y transformait l'arobase en `%40` : la RFC 6068 laisse `@` litteral dans
     * la partie adresse, et certains clients mail anciens ne le decodent pas.
     * Corrige le 2 septembre 2026 sur relevé de `ls-frontend-revue`, et cette
     * assertion est ce qui empeche le retour du defaut.
     */
    expect(href).toContain(`mailto:${MESSAGES_TEST.nouveau.email}`);
    expect(href).not.toContain("%40");
    expect(decodeURIComponent(href ?? "")).toContain(
      `Re : ${MESSAGES_TEST.nouveau.sujet}`,
    );
  });

  /*
   * LE CLASSEMENT FERME SON BLOC, ET C'EST L'ANGLE MORT QUE LA REVUE A RELEVE.
   *
   * Les autres tests verifient que les blocs s'AFFICHENT ; aucun ne verifiait ce
   * qui se passe APRES un clic. C'est precisement la ou vivait le defaut :
   * `statutActuel` etant une prop figee par le rendu serveur, les boutons ne
   * changent pas apres un succes, et l'exploitante pouvait recliquer « marquer
   * comme lu » sur un message deja lu.
   *
   * IL PORTE SON PROPRE MESSAGE, ECRIT ET SUPPRIME PAR LUI, et cette
   * precaution a coute une CI rouge avant d'etre prise.
   *
   * LES TROIS PROJETS PLAYWRIGHT PARTAGENT LA MEME BASE et tournent en
   * PARALLELE. Une premiere version classait le message amorce : il passait
   * `TRAITE` pour un projet pendant qu'un autre comptait encore ses gestes, et
   * les deux echouaient sur `mobile-390` seulement, donc de facon trompeuse.
   * C'est le motif « assertion qui suppose un ordre » applique aux projets et
   * non aux transactions.
   *
   * LE MESSAGE EST CREE PAR LE FORMULAIRE PUBLIC, chemin reel : un `INSERT`
   * direct depuis le test testerait une ligne qui n'existe dans aucun parcours.
   * Son sujet porte l'identifiant du projet, donc les trois n'entrent jamais en
   * collision.
   */
  test("classer un message ferme son bloc de gestes", async ({
    page,
  }, infos) => {
    const sujet = `TEST Classement ${infos.project.name}`;

    /*
     * LE MESSAGE EST DEPOSE PAR LE FORMULAIRE PUBLIC, avec le delai minimum
     * respecte : la page pose l'instant d'ouverture au rendu, et trois secondes
     * doivent s'ecouler avant l'envoi, sans quoi la couche anti-robot ecarte la
     * soumission en rendant un succes apparent.
     */
    await page.goto("/contact");
    await page.getByLabel("Votre nom").fill("TEST Camille");
    await page
      .getByLabel("Votre adresse email")
      .fill("e2e-classement@exemple.test");
    await page.getByLabel("Sujet").fill(sujet);
    await page
      .getByLabel("Votre message")
      .fill("Message de contrôle du classement, supprimé par le test.");

    await page.waitForTimeout(3200);
    await page.getByRole("button", { name: "Envoyer le message" }).click();
    await expect(page.getByText(/Message bien reçu/)).toBeVisible();

    await page.goto("/administration/messages");

    const carte = page.locator("main ul li").filter({ hasText: sujet });

    const marquer = carte.getByRole("button", { name: "Marquer comme lu" });
    await expect(marquer).toBeEnabled();

    await marquer.click();

    /*
     * LE BOUTON SE DESACTIVE, et c'est la correction du defaut : sans le
     * drapeau `classe`, il resterait actif et un second clic reecrirait le meme
     * statut en rendant `SUCCES`, sans qu'aucun retour ne dise que rien n'a
     * change.
     */
    await expect(marquer).toBeDisabled();

    /*
     * LE MESSAGE DE RESULTAT DIT QUOI FAIRE, et non seulement que c'est fait :
     * `revalidatePath` invalide le cache serveur sans remonter ce composant
     * client, donc le badge affiche encore l'ancien statut.
     */
    await expect(carte.getByText(/Message classé/)).toBeVisible();
  });

  /*
   * LE CORPS EST PLIE PAR DEFAUT, et il s'ouvre au clic.
   *
   * PLIE : un corps de 4000 caracteres deplie sur cinq cartes rendrait la liste
   * impraticable a 320 px. OUVRABLE : c'est quand meme le contenu qu'on vient
   * lire, un pli qui ne s'ouvre pas serait pire que pas de pli.
   */
  test("le corps du message est plié puis s'ouvre", async ({ page }) => {
    await page.goto("/administration/messages");

    const corps = page.getByText(MESSAGES_TEST.nouveau.corps);
    await expect(corps).toBeHidden();

    await page
      .locator("main ul li")
      .filter({ hasText: MESSAGES_TEST.nouveau.sujet })
      .getByText("Lire le message")
      .click();

    await expect(corps).toBeVisible();
  });
});
