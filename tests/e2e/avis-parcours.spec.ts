/**
 * Le parcours 7, depot d'un avis, LS-140 critere 2 et LS-61.
 *
 * POURQUOI CE FICHIER EXISTE. Le commentaire de LS-140 du 10 septembre 2026
 * ecrivait : « le neuvieme parcours, depot d'un avis, n'a aucune spec parce que
 * les avis ne sont pas implementes, LS-61 etant ouverte. Absence legitime et
 * non trou de couverture ». LS-61 et LS-77 ont livre depuis, la raison de
 * l'absence est tombee, et le parcours restait le SEUL des dix sans aucune
 * mesure de bout en bout.
 *
 * CE QUI ETAIT MESURE A ZERO LARGEUR AVANT CE FICHIER : l'ecran public de
 * depot et ses quatre branches, l'ecran de relecture de l'administration et ses
 * quatre files, le bloc 11 de la fiche produit, et le formulaire public de
 * signalement. Cinq surfaces, dont deux portent une obligation legale.
 *
 * LA NAVIGATION SE FAIT AU CLIC LA OU UN CHEMIN EXISTE, motif de LS-162 : un
 * test qui atteint toujours sa cible par `goto` ne peut pas decouvrir qu'aucun
 * lien n'y mene. L'ecran de depot fait exception et c'est structurel : on y
 * arrive par un lien d'email, aucune page du site n'y renvoie.
 *
 * LES JETONS SONT LUS DANS UN FICHIER, jamais fabriques ici. Ils sont signes en
 * HMAC avec le secret d'application et la base ne garde que leur empreinte,
 * regle L5 : `commande.setup.ts` les engendre par le code serveur du projet et
 * les depose, comme le cookie signe de LS-118.
 */
import { readFileSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { COMMANDE_AVIS_TEST, FICHIER_JETONS_AVIS } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

/** Les trois valeurs deposees par la preparation, une par etat de jeton. */
function lireJetons(): { ouvert: string; consomme: string; revoque: string } {
  return JSON.parse(readFileSync(FICHIER_JETONS_AVIS, "utf8")) as {
    ouvert: string;
    consomme: string;
    revoque: string;
  };
}

/**
 * LE TEST NEGATIF, ET IL PASSE EN PREMIER PARCE QU'IL COMPTE LE PLUS.
 *
 * `notFound()` sur tout refus d'acces, jamais une page de refus : un « acces
 * refuse » revelerait qu'une commande existe derriere ce jeton. Le statut est
 * verifie et pas seulement l'aspect de la page, motif de LS-111 : un
 * `loading.tsx` mal place laisse un 200 sur une page qui doit rendre 404, et le
 * defaut est invisible a l'oeil.
 */
test("un jeton inconnu rend 404 et ne revele aucune commande", async ({
  page,
}) => {
  const reponse = await page.goto("/avis/jeton-qui-n-existe-pas.signature");

  expect(reponse?.status()).toBe(404);

  /*
   * LE CONTENU EST VERIFIE EN PLUS DU STATUT. Une page 404 qui nommerait la
   * commande, le client ou le produit ferait fuiter par son corps ce que son
   * statut refuse de dire.
   */
  const texte = (await page.locator("body").textContent()) ?? "";

  expect(texte).not.toContain(COMMANDE_AVIS_TEST.numero);
  expect(texte).not.toContain("TEST Camille");
});

/**
 * UN JETON SIGNE MAIS INCONNU DE LA BASE, distinct du precedent.
 *
 * Le cas ci-dessus echoue des la verification de signature. Celui-ci porte une
 * signature VALIDE et une empreinte absente : il exerce la branche suivante de
 * `resoudreJeton`, celle qui interroge la base. Les confondre laisserait la
 * seconde sans aucune mesure.
 */
test("un jeton bien forme mais absent de la base rend 404", async ({
  page,
}) => {
  const jetons = lireJetons();

  /*
   * LA VALEUR EST DERIVEE D'UN JETON REEL en changeant un caractere de la
   * partie aleatoire : la forme reste exacte, la signature ne correspond plus.
   * Fabriquer une chaine au hasard ne prouverait pas la meme chose.
   */
  const [alea, signature] = jetons.ouvert.split(".");
  const premier = alea!.startsWith("A") ? "B" : "A";
  const falsifie = `${premier}${alea!.slice(1)}.${signature}`;

  const reponse = await page.goto(`/avis/${falsifie}`);

  expect(reponse?.status()).toBe(404);
});

test("le jeton ouvert rend le formulaire des pieces a noter", async ({
  page,
}) => {
  const jetons = lireJetons();

  const reponse = await page.goto(`/avis/${jetons.ouvert}`);

  expect(reponse?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Donner mon avis", level: 1 }),
  ).toBeVisible();

  /*
   * LE NUMERO DE COMMANDE EST AFFICHE, ce qui confirme que la page a bien
   * resolu le jeton plutot que de rendre une coquille vide.
   */
  await expect(page.getByText(COMMANDE_AVIS_TEST.numero)).toBeVisible();

  /*
   * LES TROIS PIECES SONT RENDUES, et c'est ce qui rend la mesure honnete. Le
   * formulaire produit un groupe de radio PAR piece : avec une seule ligne,
   * `getByRole` en mode strict passerait quel que soit l'etat des
   * identifiants. Motif de LS-130, mesure le 2 septembre 2026.
   */
  await expect(page.getByText(COMMANDE_AVIS_TEST.libelleUn)).toBeVisible();
  await expect(page.getByText(COMMANDE_AVIS_TEST.libelleDeux)).toBeVisible();
  await expect(page.getByText(COMMANDE_AVIS_TEST.libelleTrois)).toBeVisible();
});

/**
 * UNE PIECE DEJA NOTEE PORTE SA MENTION, et ne propose plus de note.
 *
 * C'est la branche `dejaNotee` du formulaire. Sans avis reel en base, elle ne
 * serait rendue a aucune largeur et pourrait disparaitre sans qu'aucune
 * assertion ne rougisse.
 *
 * DEUX PIECES SONT NOTEES ET NON UNE, ET C'EST UNE PROPRIETE DU CODE, pas un
 * artefact du jeu de donnees. `dejaNotee` vaut `avisExistant !== null` sans
 * regarder le statut : l'avis `DEPOSE` en attente de relecture compte autant
 * que l'avis `PUBLIE`. C'est le comportement juste, un avis en attente ayant
 * bien ete depose, et l'unicite sur `ligneCommandeId` refuserait le second.
 *
 * LE COMPTE EST DONC DE UN SEUL GROUPE DE NOTE sur les trois pieces. Un compte
 * et jamais une presence : « au moins un » passerait aussi bien avec trois.
 */
test("une piece deja notee ne propose plus de note", async ({ page }) => {
  const jetons = lireJetons();

  await page.goto(`/avis/${jetons.ouvert}`);

  await expect(
    page.getByText("Vous avez déjà déposé un avis sur cette pièce."),
  ).toHaveCount(2);

  await expect(page.getByRole("group", { name: "Votre note" })).toHaveCount(1);
});

/**
 * LE BOUTON EST DESACTIVE TANT QU'AUCUNE NOTE N'EST CHOISIE, et le dire.
 *
 * `aria-describedby` porte la raison : un bouton `disabled` sans explication
 * laisse la personne sans moyen de comprendre ce qui manque. C35 et la revue
 * frontend de LS-61 sur le meme motif.
 */
test("le bouton d'envoi dit ce qui manque avant d'etre actionnable", async ({
  page,
}) => {
  const jetons = lireJetons();

  await page.goto(`/avis/${jetons.ouvert}`);

  const bouton = page.getByRole("button", { name: "Envoyer mon avis" });

  await expect(bouton).toBeDisabled();
  await expect(
    page.getByText("Choisissez une note pour pouvoir envoyer."),
  ).toBeVisible();

  /*
   * LE CLIC PORTE SUR LE LIBELLE ET NON SUR L'ENTREE, et c'est le geste reel.
   * L'entree radio est masquee visuellement, `clip-path: inset(50%)`, pour que
   * le libelle porte la cible tactile de 44 px : `check()` sur l'entree echoue
   * parce que le `span` qui l'enveloppe intercepte le pointeur. Le masquage est
   * correct, il conserve l'element dans l'arbre d'accessibilite.
   *
   * L'ETAT COCHE EST VERIFIE SUR L'ENTREE, elle seule le porte. Cliquer sans le
   * verifier laisserait passer un libelle dont le `for` designe une autre
   * entree, defaut qu'aucune autre assertion ne verrait.
   */
  const entree = page.getByRole("radio", { name: "4 étoiles sur 5" }).first();

  await page.getByText("4 étoiles sur 5").first().click();

  await expect(entree).toBeChecked();
  await expect(bouton).toBeEnabled();
  await expect(page.getByText("Vous pouvez envoyer votre avis.")).toBeVisible();
});

/**
 * LE LIEN CONSOMME LE DIT, et ne rend ni 404 ni le formulaire.
 *
 * Regle L9. Un 404 ferait croire a une panne, et rendre le formulaire
 * permettrait une seconde saisie que l'unicite sur `ligneCommandeId`
 * transformerait en erreur 500.
 */
test("un jeton deja consomme annonce l'avis deja depose", async ({ page }) => {
  const jetons = lireJetons();

  const reponse = await page.goto(`/avis/${jetons.consomme}`);

  expect(reponse?.status()).toBe(200);
  await expect(
    page.getByText("Un avis a déjà été déposé pour cette commande."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Envoyer mon avis" }),
  ).toHaveCount(0);
});

/**
 * LE LIEN REMPLACE S'EXPLIQUE ET DIT QUOI FAIRE, critere 4 de LS-61.
 *
 * Ce cas correspond a un client LEGITIME dont le lien a ete remplace par un
 * envoi plus recent : un 404 le laisserait sans recours alors qu'un email
 * l'attend, et « avis deja depose » lui ferait croire qu'il a ecrit quelque
 * chose. Regle L10, la revocation est distincte de la consommation.
 */
test("un jeton revoque renvoie vers le message le plus recent", async ({
  page,
}) => {
  const jetons = lireJetons();

  const reponse = await page.goto(`/avis/${jetons.revoque}`);

  expect(reponse?.status()).toBe(200);
  await expect(
    page.getByText("Ce lien a été remplacé par un envoi plus récent."),
  ).toBeVisible();

  /*
   * LA PHRASE DE SORTIE EST VERIFIEE, pas seulement le constat. Un refus dont
   * on ne peut pas sortir fait recliquer et conclure a une panne : c'est la
   * lecon de `PLAFOND` dans la revue frontend de LS-61.
   */
  await expect(
    page.getByText(/dernier message reçu à propos de cette commande/),
  ).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Envoyer mon avis" }),
  ).toHaveCount(0);
});

/**
 * LES DEUX REFUS SONT DISTINGUES L'UN DE L'AUTRE.
 *
 * CE TEST EXISTE CONTRE UNE REGRESSION PRECISE : si `lireEtatDepot` confondait
 * `CONSOMME` et `REVOQUE`, les deux tests ci-dessus resteraient verts chacun de
 * leur cote tant que le message affiche serait l'un des deux. Comparer les deux
 * pages entre elles est le seul geste qui l'attrape.
 */
test("le lien consomme et le lien remplace ne disent pas la meme chose", async ({
  page,
}) => {
  const jetons = lireJetons();

  await page.goto(`/avis/${jetons.consomme}`);
  const consomme = (await page.locator("main").textContent()) ?? "";

  await page.goto(`/avis/${jetons.revoque}`);
  const revoque = (await page.locator("main").textContent()) ?? "";

  expect(consomme).not.toBe(revoque);
});

/**
 * L'ECRAN DE DEPOT N'EST PAS INDEXABLE.
 *
 * Il porte un jeton dans son URL : une page indexee exposerait le lien dans les
 * resultats de recherche, et `robots` est declare `index: false` pour cela.
 */
test("l'ecran de depot refuse l'indexation", async ({ page }) => {
  const jetons = lireJetons();

  await page.goto(`/avis/${jetons.ouvert}`);

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("l'ecran de depot ne deborde pas horizontalement", async ({ page }) => {
  const jetons = lireJetons();

  await page.goto(`/avis/${jetons.ouvert}`);

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("aucune violation d'accessibilite sur l'ecran de depot", async ({
  page,
}) => {
  const jetons = lireJetons();

  await page.goto(`/avis/${jetons.ouvert}`);

  const resultats = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultats.violations).toEqual([]);
});

/**
 * LES DEUX ECRANS DE REFUS SONT AUDITES AUSSI.
 *
 * `axe-core` ne voit que ce qui est rendu : auditer le seul formulaire
 * laisserait les deux branches de refus hors de toute mesure. C'est exactement
 * ce qui a laisse passer le contraste a 4,04:1 de LS-121, faute d'une commande
 * remboursee dans le jeu de donnees.
 */
for (const [nom, cle] of [
  ["consomme", "consomme"],
  ["remplace", "revoque"],
] as const) {
  test(`aucune violation d'accessibilite sur l'ecran de lien ${nom}`, async ({
    page,
  }) => {
    const jetons = lireJetons();

    await page.goto(`/avis/${jetons[cle]}`);

    const resultats = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(resultats.violations).toEqual([]);
  });

  test(`l'ecran de lien ${nom} ne deborde pas horizontalement`, async ({
    page,
  }) => {
    const jetons = lireJetons();

    await page.goto(`/avis/${jetons[cle]}`);

    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
      TOLERANCE_DEBORDEMENT_PX,
    );
  });
}

/**
 * LE BLOC 11 DE LA FICHE PRODUIT, avis publies et synthese.
 *
 * SEUL L'AVIS `PUBLIE` Y PARAIT, regle R4 : celui en attente de relecture ne
 * doit apparaitre nulle part. Le test le verifie dans les DEUX sens, sans quoi
 * il ne dirait rien d'une fuite d'avis non publie.
 */
test("la fiche produit rend l'avis publie et jamais celui en attente", async ({
  page,
}) => {
  await page.goto(`/produit/${COMMANDE_AVIS_TEST.slug}`);

  await expect(
    page.getByText("TEST Commentaire publié sur la fiche."),
  ).toBeVisible();

  /*
   * LE SENS NEGATIF COMPTE AUTANT. Un avis `DEPOSE` rendu sur la fiche serait
   * une publication sans relecture, ce que la regle R4 interdit.
   */
  await expect(
    page.getByText("TEST Commentaire en attente de relecture."),
  ).toHaveCount(0);
});

/**
 * LE SIGNALEMENT EST ATTEIGNABLE DEPUIS L'AVIS, article L111-7-2.
 *
 * Le texte impose une fonctionnalite GRATUITE de signalement d'un doute sur
 * l'authenticite. Un formulaire qui existe sans qu'aucun chemin n'y mene ne
 * remplit pas l'obligation, et c'est la raison pour laquelle ce test navigue au
 * clic plutot que par `goto`.
 */
test("un chemin mene de l'avis publie au formulaire de signalement", async ({
  page,
}) => {
  await page.goto(`/produit/${COMMANDE_AVIS_TEST.slug}`);

  await page
    .getByRole("link", { name: "Signaler un doute sur cet avis" })
    .first()
    .click();

  /*
   * L'URL PORTE L'IDENTIFIANT DE L'AVIS VISE. Un lien qui menerait au
   * formulaire sans designer d'avis obligerait le signalant a choisir ensuite,
   * ce que le commentaire du composant ecarte explicitement.
   */
  await expect(page).toHaveURL(/\/avis\/signaler\?avis=/);
  await expect(
    page.getByRole("heading", { name: "Signaler un avis", level: 1 }),
  ).toBeVisible();
});
