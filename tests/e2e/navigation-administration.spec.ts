/**
 * Navigation de l'administration, de bout en bout. LS-162.
 *
 * CE FICHIER NAVIGUE PAR CLIC, ET C'EST TOUT SON INTERET. La suite existante
 * appelle `page.goto()` avec l'URL en dur sur chaque ecran : elle ne passe
 * jamais par une navigation reelle, et c'est precisement pour cela que
 * l'absence totale de menu n'a fait rougir aucune assertion pendant huit
 * stories. Un test qui atteint toujours sa cible directement ne peut pas
 * decouvrir qu'aucun chemin n'y mene.
 *
 * Motif « un defaut absent n'est pas un defaut empeche » : rien ne l'interdit,
 * rien ne le teste, et chaque story ajoute un ecran de plus sans le relier.
 *
 * `verifier-navigation-administration.sh` GARDE LA MEME EXIGENCE PAR LE TEXTE,
 * en confrontant les rubriques aux routes du depot dans les deux sens. Les deux
 * se completent : le script attrape l'ecran neuf des son ecriture, ce fichier
 * prouve que les liens fonctionnent vraiment.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { FICHIER_SESSION_ADMINISTRATION } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

/**
 * Les rubriques attendues, avec le titre de l'ecran qu'elles atteignent.
 *
 * LA LISTE EST ECRITE ICI PLUTOT QU'IMPORTEE DU COMPOSANT, deliberement. Une
 * assertion qui lit la meme constante que le code verifie sa coherence avec
 * lui-meme et reste verte si les deux changent ensemble. Le titre attendu vient
 * de l'ECRAN, pas de la barre : c'est ce qui prouve que le lien mene bien la ou
 * son libelle l'annonce.
 */
const RUBRIQUES = [
  { libelle: "Tableau de bord", titre: "Tableau de bord" },
  { libelle: "Commandes", titre: "Commandes" },
  { libelle: "Expéditions", titre: "Expéditions" },
  { libelle: "Rétractations", titre: "Rétractations" },
  { libelle: "Messages", titre: "Messages" },
  /* LS-183 : « Nouveau produit » a quitte la barre pour devenir un bouton de
   * l'ecran Catalogue, qui prend sa place ici. */
  { libelle: "Catalogue", titre: "Produits" },
  { libelle: "Catégories", titre: "Catégories du catalogue" },
  { libelle: "Stocks et marchés", titre: "Stocks et marchés" },
  { libelle: "Connexions", titre: "Journal des connexions" },
] as const;

/**
 * Ouvre le panneau de navigation quand il est replie, LS-181.
 *
 * SOUS 768 px LA BARRE EST DERRIERE UN BOUTON, et c'est voulu : onze rubriques
 * empilees mangeraient l'ecran entier avant le contenu, ce qui reproduirait
 * sous une autre forme le defaut que LS-162 a ferme. Au-dela, elle est une
 * colonne permanente et le bouton n'existe pas.
 *
 * CETTE FONCTION EXISTE PARCE QUE LA SUITE TOURNE AUX TROIS LARGEURS, 320, 390
 * et 1280. Le meme test doit passer dans les trois projets sans supposer
 * laquelle : `isVisible` decide au lieu de comparer une largeur, ce qui reste
 * juste si le point de bascule change.
 *
 * ELLE NE CACHE PAS UN ECHEC. Si le bouton est absent ET la barre invisible, le
 * clic suivant echouera en nommant la rubrique introuvable, ce qui est le bon
 * message : la barre est inatteignable.
 */
async function ouvrirLaBarreSiRepliee(page: import("@playwright/test").Page) {
  const bascule = page.getByRole("button", { name: "Menu", exact: true });

  if (await bascule.isVisible()) {
    await bascule.click();
  }
}

/**
 * LE TEST QUE LA STORY EXISTE POUR RENDRE POSSIBLE : atteindre chaque ecran
 * SANS JAMAIS SAISIR D'URL, critere 1.
 *
 * Un seul `goto`, sur l'accueil. Tout le reste passe par des clics, ce qui est
 * exactement le parcours de l'exploitante.
 */
test("chaque écran est atteignable au clic depuis l'accueil", async ({
  page,
}) => {
  await page.goto("/administration");

  for (const rubrique of RUBRIQUES) {
    /*
     * LE PANNEAU SE REFERME APRES CHAQUE CLIC sous 768 px, et c'est voulu :
     * laisser un menu ouvert par-dessus l'ecran qu'on vient d'atteindre
     * obligerait a le fermer a la main a chaque navigation. Il faut donc le
     * rouvrir a chaque tour, exactement comme l'exploitante le fait.
     */
    await ouvrirLaBarreSiRepliee(page);

    await page
      .getByRole("navigation", { name: "Sections de l'administration" })
      /*
       * LE LIEN SE CIBLE PAR LE DEBUT DE SON NOM, jamais par egalite stricte.
       * Une rubrique a pastille porte son compteur DANS son nom accessible,
       * « Commandes 3 (3 en attente) » : c'est voulu, un lecteur d'ecran doit
       * entendre ce qui attend. Une egalite stricte ne trouverait alors que
       * les rubriques sans pastille, et le test verdirait sur la moitie de la
       * barre en silence.
       */
      .getByRole("link", { name: new RegExp(`^${rubrique.libelle}`) })
      .click();

    await expect(
      page.getByRole("heading", { name: rubrique.titre, level: 1 }),
    ).toBeVisible();
  }
});

/**
 * L'ECRAN COURANT EST ANNONCE, critere 3.
 *
 * `aria-current="page"` PORTE L'INFORMATION et la couleur ne fait que
 * l'appuyer, `frontend-design.md` interdisant qu'une information passe par la
 * seule couleur. L'assertion vise donc l'attribut, jamais une classe ni une
 * couleur calculee : un test sur l'apparence resterait vert sur une barre
 * devenue muette pour un lecteur d'ecran.
 */
test("la rubrique de l'écran ouvert est annoncée comme courante", async ({
  page,
}) => {
  await page.goto("/administration/stocks");
  await ouvrirLaBarreSiRepliee(page);

  const barre = page.getByRole("navigation", {
    name: "Sections de l'administration",
  });

  await expect(
    barre.getByRole("link", { name: /^Stocks et marchés/ }),
  ).toHaveAttribute("aria-current", "page");

  /*
   * ET UNE SEULE A LA FOIS. Sans cette seconde assertion, une barre qui
   * marquerait TOUTES les rubriques courantes passerait le test : le reperage
   * serait detruit et un lecteur d'ecran annoncerait sept pages courantes.
   */
  await expect(barre.locator('[aria-current="page"]')).toHaveCount(1);
});

/**
 * LE MARQUAGE SURVIT A UN ECRAN DE DETAIL.
 *
 * `/administration/commandes/<id>` est le detail d'une commande : la rubrique
 * « Commandes » doit y rester courante, sans quoi l'exploitante perd son
 * reperage des qu'elle ouvre une commande, c'est-a-dire dans son geste le plus
 * frequent. C'est ce que la comparaison par prefixe existe pour tenir.
 */
test("le détail d'une commande garde sa rubrique marquée", async ({ page }) => {
  await page.goto("/administration/commandes");

  const barre = page.getByRole("navigation", {
    name: "Sections de l'administration",
  });

  /*
   * LE LIEN EST CIBLE PAR SON URL ET NON PAR SON LIBELLE, qui est le NUMERO de
   * la commande, `2026-000001`. Ancrer sur ce format lierait le test a la
   * numerotation d'ADR-031 : un changement de format ferait echouer un test de
   * navigation, ce qui accuserait le mauvais code.
   */
  await page
    .getByRole("main")
    .locator('a[href^="/administration/commandes/"]')
    .first()
    .click();

  await ouvrirLaBarreSiRepliee(page);

  await expect(barre.getByRole("link", { name: /^Commandes/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(barre.locator('[aria-current="page"]')).toHaveCount(1);
});

/**
 * LA BARRE N'APPARAIT PAS SANS SESSION D'ADMINISTRATION.
 *
 * Elle annoncerait sept ecrans protetes a qui n'y a pas acces : les pages les
 * refuseraient bien, mais l'affichage aurait deja divulgue la structure de
 * l'administration. Motif « fabriquer la preuve sans le role ».
 *
 * `storageState` VIDE, ET NON LA SESSION D'ADMINISTRATION du reste du fichier.
 */
test.describe("sans session", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("la barre n'apparaît pas sur l'écran de connexion", async ({ page }) => {
    await page.goto("/administration/connexion");

    await expect(
      page.getByRole("navigation", { name: "Sections de l'administration" }),
    ).toHaveCount(0);
  });
});

test("la barre ne déborde pas horizontalement", async ({ page }) => {
  await page.goto("/administration/commandes");

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

/**
 * LA NAVIGATION AU CLAVIER, critere 3.
 *
 * Les sept rubriques doivent etre atteignables dans l'ordre, sans piege ni
 * saut. Le test tabule depuis le debut du document et releve l'ordre reel des
 * liens de la barre, plutot que de supposer qu'un `<ul>` de liens se comporte
 * bien : un `tabindex` positif pose ailleurs dans la page suffirait a le
 * casser.
 */
test("les rubriques se parcourent au clavier dans l'ordre", async ({
  page,
}) => {
  await page.goto("/administration/commandes");
  await ouvrirLaBarreSiRepliee(page);

  const libelles = RUBRIQUES.map((rubrique) => rubrique.libelle);
  const rencontres: string[] = [];

  /*
   * LA BORNE EXISTE POUR QUE L'ECHEC SOIT LISIBLE. Sans elle, une barre
   * inatteignable au clavier ferait tourner la boucle jusqu'au delai de
   * Playwright, et le message parlerait d'expiration plutot que de navigation.
   */
  for (let tabulation = 0; tabulation < 40; tabulation += 1) {
    await page.keyboard.press("Tab");

    const actif = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLAnchorElement)) return null;
      return element.closest("nav")?.getAttribute("aria-label") ===
        "Sections de l'administration"
        ? element.textContent?.trim()
        : null;
    });

    /*
     * LE LIBELLE EST ISOLE DU COMPTEUR. `textContent` concatene la pastille et
     * le texte reserve aux lecteurs d'ecran : « Commandes3 (3 en attente) ».
     * L'ordre de tabulation se verifie sur les LIBELLES, le contenu des
     * pastilles etant teste ailleurs et variable selon le jeu de donnees.
     */
    const libelle = libelles.find((attendu) => actif?.startsWith(attendu));

    if (libelle && !rencontres.includes(libelle)) {
      rencontres.push(libelle);
    }

    if (rencontres.length === libelles.length) break;
  }

  expect(rencontres).toEqual(libelles);
});

test("la barre ne porte aucune violation d'accessibilité", async ({ page }) => {
  await page.goto("/administration/commandes");
  await ouvrirLaBarreSiRepliee(page);

  const resultat = await new AxeBuilder({ page })
    .include('nav[aria-label="Sections de l\'administration"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});

/* ==========================================================================
 * LS-181, la barre laterale, les pastilles et le tableau de bord.
 * ========================================================================== */

/**
 * LA BARRE SE REPLIE SOUS 768 px ET RESTE PERMANENTE AU-DELA, critere 1.
 *
 * LE TEST NE COMPARE PAS UNE LARGEUR ECRITE EN DUR : il lit celle du viewport
 * et en deduit ce qu'il doit voir. Ecrire « a 320 px le bouton existe »
 * obligerait a trois tests presque identiques, et le projet mobile-390 les
 * jouerait tous les trois en n'en verifiant qu'un.
 *
 * LES DEUX SENS SONT VERIFIES. N'exiger que la presence du bouton en petit
 * ecran laisserait passer une barre qui resterait repliee a 1280 px, c'est-a-
 * dire un menu permanent devenu un menu cache sans que rien ne le dise.
 */
test("la barre est repliée sous 768 px et permanente au-delà", async ({
  page,
}) => {
  await page.goto("/administration");

  const largeur = page.viewportSize()?.width ?? 0;
  const bascule = page.getByRole("button", { name: "Menu", exact: true });
  const barre = page.getByRole("navigation", {
    name: "Sections de l'administration",
  });

  if (largeur < 768) {
    await expect(bascule).toBeVisible();
    await expect(barre).toBeHidden();

    /*
     * ET ELLE S'OUVRE VRAIMENT. Sans cette assertion, un bouton inerte
     * passerait : la barre serait alors inatteignable en petit ecran, ce qui
     * est le defaut d'origine de LS-162 revenu par une autre porte.
     */
    await bascule.click();
    await expect(barre).toBeVisible();
  } else {
    await expect(bascule).toBeHidden();
    await expect(barre).toBeVisible();
  }
});

/**
 * LES PASTILLES VIENNENT DES DONNEES, critere 2.
 *
 * LE TEST COMPARE LA PASTILLE AU CONTENU REEL DE L'ECRAN qu'elle annonce,
 * jamais a un nombre attendu. Un nombre ecrit ici serait une seconde source de
 * verite : il faudrait le corriger a chaque evolution du jeu de donnees, et
 * une valeur codee en dur dans le COMPOSANT le satisferait tout autant.
 *
 * C'est ce qui distingue « la pastille affiche 3 » de « la pastille dit la
 * verite ». Seul le second tient le critere.
 */
test("la pastille des messages compte les messages réellement non lus", async ({
  page,
}) => {
  await page.goto("/administration/messages");
  await ouvrirLaBarreSiRepliee(page);

  const barre = page.getByRole("navigation", {
    name: "Sections de l'administration",
  });

  const lien = barre.getByRole("link", { name: /^Messages/ });

  /*
   * ------------------------------------------------------------------
   * LES DEUX COMPTES SE LISENT ENSEMBLE, ET C'EST TOUTE LA CORRECTION, LS-201.
   *
   * LE DEFAUT ETAIT UNE COURSE, pas une pastille fausse. Ce test comparait deux
   * valeurs venues de DEUX rendus serveur distincts : la pastille est calculee
   * par le LAYOUT, `lireComptages`, et les badges « Nouveau » par la PAGE. Entre
   * les deux lectures, un autre projet de largeur pouvait avoir change la liste.
   *
   * TROIS FICHIERS ECRIVENT DANS CETTE MEME LISTE pendant la suite :
   * `administration-connectee:737` depose un message par le formulaire public
   * puis le classe, aux trois largeurs, et `contact.spec.ts` en depose d'autres.
   * Le test lisait donc un etat qui bougeait sous lui.
   *
   * Mesure du 7 septembre 2026 : echec en 192 ms et 219 ms, trop rapide pour un
   * delai atteint, et sur une suite qui a tourne en 1,7 min au lieu de 4, donc
   * sous une charge machine bien plus forte.
   *
   * `Promise.all` LIT LES DEUX DANS LE MEME RENDU. Les deux valeurs viennent
   * alors du meme instant, et une ecriture concurrente les deplace TOUTES LES
   * DEUX au lieu d'en decaler une seule.
   *
   * CE N'EST PAS UN CONTOURNEMENT, et la nuance compte : le test verifie
   * toujours que la pastille dit la verite sur ce qui est affiche, ce qui est
   * exactement son critere. Ce qui change est qu'il ne compare plus deux
   * photographies prises a des instants differents.
   * ------------------------------------------------------------------
   */
  const [texteLien, nonLus] = await Promise.all([
    lien.textContent(),
    page.getByRole("main").getByText("Nouveau", { exact: true }).count(),
  ]);

  const pastille = (texteLien ?? "").match(/(\d+)/)?.[1];

  /*
   * LA PASTILLE DOIT VALOIR LE NOMBRE DE NON LUS ; s'il n'y en a aucun, elle ne
   * doit pas exister du tout, « 0 » n'etant pas une information.
   */
  if (nonLus === 0) {
    expect(pastille).toBeUndefined();
  } else {
    expect(
      Number(pastille),
      `Pastille « ${pastille} » pour ${nonLus} messages non lus affiches.`,
    ).toBe(nonLus);
  }
});

/**
 * LE TABLEAU DE BORD NE DEBORDE PAS, critere 1.
 *
 * C'est l'ecran le plus dense de l'administration, quatre tuiles et un panneau
 * de liste : s'il tient a 320 px, les autres tiennent.
 */
test("le tableau de bord ne déborde pas horizontalement", async ({ page }) => {
  await page.goto("/administration");

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

/**
 * LE TABLEAU DE BORD NE PORTE AUCUNE VIOLATION D'ACCESSIBILITE.
 *
 * `axe-core` MESURE LE CONTRASTE SUR LE RENDU REEL, avec le fond effectivement
 * herite, ce que `verifier-contraste.sh` ne peut pas voir. Les deux sont
 * necessaires et aucun ne remplace l'autre : le script lit toute branche du
 * CSS, celui-ci ne voit que ce qui est rendu.
 */
test("le tableau de bord ne porte aucune violation d'accessibilité", async ({
  page,
}) => {
  await page.goto("/administration");

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});

/**
 * LES RUBRIQUES NON LIVREES NE SONT PAS DES LIENS, arbitrage du 4 septembre.
 *
 * ELLES ANNONCENT LA STRUCTURE COMPLETE DE L'OUTIL sans rien promettre qui
 * n'existe : un lien vers un ecran non livre rendrait un 404 a l'exploitante.
 * Le test verifie qu'elles sont VISIBLES et qu'aucune n'est cliquable, les
 * deux moities important autant.
 *
 * LA LISTE N'EST PLUS RECOPIEE ICI, LS-199. Ce test portait
 * `["Statistiques", "Clients", "Paramètres"]` en dur et exigeait zero lien sur
 * chacune. LS-185 a livre l'ecran Clients, qui est donc devenu un lien : le
 * test a commence a exiger l'INVERSE de ce que le produit doit faire, et il est
 * reste rouge deux nuits sans que personne ne le voie.
 *
 * IL LIT DESORMAIS LES ENTREES REELLEMENT RENDUES sous « Bientot disponible ».
 * Une rubrique qui quitte `RUBRIQUES_A_VENIR` sort de la liste lue, et le test
 * suit sans etre touche. Trois entrees l'ont quittee en trois jours, Catalogue,
 * Factures et avoirs, puis Clients : recopier cette liste, c'est signer un
 * rendez-vous avec le meme echec.
 *
 * LA LISTE VIDE EST REFUSEE, sans quoi le jour ou toutes les rubriques seront
 * livrees, ce test passerait au vert sans rien verifier.
 */
test("les rubriques à venir sont annoncées sans être cliquables", async ({
  page,
}) => {
  await page.goto("/administration");
  await ouvrirLaBarreSiRepliee(page);

  const barre = page.getByRole("navigation", {
    name: "Sections de l'administration",
  });

  const titre = barre.getByText("Bientôt disponible");
  await expect(titre).toBeVisible();

  const entrees = barre.getByRole("list", { name: "Bientôt disponible" });
  const libelles = await entrees.getByRole("listitem").allInnerTexts();

  expect(libelles.length).toBeGreaterThan(0);

  for (const libelle of libelles.map((texte) => texte.trim())) {
    await expect(barre.getByText(libelle, { exact: true })).toBeVisible();
    await expect(
      barre.getByRole("link", { name: libelle, exact: true }),
    ).toHaveCount(0);
  }
});

/**
 * LE FOCUS SURVIT A UNE NAVIGATION AU CLAVIER, sous 768 px.
 *
 * LE DEFAUT QUE CE TEST FERME, trouve par la revue d'interface. Activer une
 * rubrique referme le panneau, ce qui lui applique `display: none` : l'element
 * qui portait le focus se retrouve dans un sous-arbre masque, le focus retombe
 * sur `body`, et la tabulation suivante repart du HAUT du document. Au clavier,
 * chaque navigation renvoyait donc au debut de la page.
 *
 * LE TEST CLAVIER VOISIN NE LE VOYAIT PAS : il ouvre le panneau puis tabule
 * sans jamais ACTIVER de lien, et c'est l'activation qui declenche le defaut.
 * Motif « focus sur un element detache ».
 *
 * IL NE S'EXECUTE QUE SOUS 768 px, la barre etant permanente au-dela : rien ne
 * se referme, donc rien ne peut detacher le focus. Sauter plutot que verdir a
 * vide, un test qui passe sans rien exercer est un faux temoin.
 */
test("le focus ne se perd pas en naviguant au clavier", async ({ page }) => {
  test.skip(
    (page.viewportSize()?.width ?? 0) >= 768,
    "la barre est permanente au-dela de 768 px, rien ne se referme",
  );

  await page.goto("/administration");
  await ouvrirLaBarreSiRepliee(page);

  await page
    .getByRole("navigation", { name: "Sections de l'administration" })
    .getByRole("link", { name: /^Commandes/ })
    .focus();

  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("heading", { name: "Commandes", level: 1 }),
  ).toBeVisible();

  /*
   * CE QUE CE TEST GARDE EST QUE LE FOCUS NE RETOMBE PAS SUR `body`, d'ou la
   * tabulation repartirait du HAUT du document a chaque navigation. C'est le
   * defaut d'origine, et c'est lui qu'il faut tenir.
   *
   * OU IL ATTERRIT A CHANGE AVEC LS-194, et pour le mieux. `fermer()` ramene
   * bien le focus sur le bouton de bascule, mais Next.js le deplace ensuite
   * vers le `<main>` de la page arrivante, devenu focalisable par le
   * `tabIndex={-1}` que le lien d'evitement exige. Les deux se succedent, et
   * c'est le second qui l'emporte.
   *
   * LE RESULTAT EST CELUI QU'ON VOUDRAIT ECRIRE A LA MAIN : arriver sur un
   * ecran place le focus au debut de son contenu, c'est-a-dire exactement ou le
   * lien d'evitement le menerait. Le bouton de bascule etait le meilleur repli
   * TANT QUE rien de mieux n'existait.
   *
   * L'ASSERTION RESTE DONC SUR L'INTENTION et non sur l'element : ni `body`, ni
   * un element detache du panneau referme. Les deux positions acceptees sont
   * nommees, une assertion « pas body » seule verdirait sur n'importe quoi.
   */
  const focalise = await page.evaluate(() => {
    const actif = document.activeElement;
    if (!actif || actif === document.body) return "body";
    return actif.tagName + ":" + (actif.textContent?.trim().slice(0, 20) ?? "");
  });

  expect(focalise).not.toBe("body");
  expect(["MAIN", "BUTTON"]).toContain(focalise.split(":")[0]);

  /*
   * ET LE PANNEAU EST BIEN REFERME. Sans cette assertion, le test verdirait sur
   * un focus pose n'importe ou dans un panneau reste ouvert par-dessus l'ecran
   * atteint, ce que `fermer()` existe pour eviter.
   */
  await expect(
    page.getByRole("navigation", { name: "Sections de l'administration" }),
  ).toBeHidden();
});

/**
 * `Escape` REFERME LE PANNEAU, sous 768 px.
 *
 * Le couple `aria-expanded` et `aria-controls` annonce un motif de divulgation,
 * et qui connait ce motif attend cette touche. Poser les attributs sans le
 * comportement promet un geste qui ne repond pas.
 */
test("Escape referme le panneau de navigation", async ({ page }) => {
  test.skip(
    (page.viewportSize()?.width ?? 0) >= 768,
    "la barre est permanente au-dela de 768 px, rien ne se referme",
  );

  await page.goto("/administration");

  const bascule = page.getByRole("button", { name: "Menu", exact: true });
  const barre = page.getByRole("navigation", {
    name: "Sections de l'administration",
  });

  await bascule.click();
  await expect(barre).toBeVisible();

  /*
   * LE FOCUS EST DEPLACE DANS LE PANNEAU AVANT LA FRAPPE, et c'est ce qui rend
   * `bascule.current?.focus()` reellement exerce ici. Sans cette ligne, le
   * focus reste sur le bouton depuis le `click()` : `Escape` le trouverait deja
   * la, et le test verdirait meme si `fermer()` ne le ramenait plus. Mesure du
   * 6 septembre 2026, retirer cette ligne du composant laissait ce test vert.
   *
   * CE TEST EST LE SEUL A GARDER CE RETOUR DEPUIS LS-194. Son jumeau, « le
   * focus ne se perd pas en naviguant au clavier », s'y est trouve insensible :
   * une navigation y suit la fermeture, et Next.js pose alors le focus sur le
   * `<main>` focalisable de l'ecran arrivant, quoi qu'ait fait `fermer()`.
   * Ici rien ne navigue, donc rien ne recouvre le geste.
   */
  await barre.getByRole("link", { name: /^Commandes/ }).focus();

  await page.keyboard.press("Escape");

  await expect(barre).toBeHidden();
  await expect(bascule).toBeFocused();
});

/**
 * LE TABLEAU D'EXPEDITION PORTE TROIS COLONNES, LS-181, critere 8.
 *
 * L'ECRAN NE MONTRAIT QU'UN SEUL ETAT avant cette story, les commandes
 * `EN_PREPARATION` : l'exploitante ne voyait ni ce qui arrive, ni ce qui est
 * parti. L'elargissement aux trois statuts est un arbitrage de Christophe du
 * 4 septembre 2026, et non une simple mise en forme.
 *
 * LE TEST COMPARE CHAQUE COMPTEUR AU NOMBRE REEL DE CARTES de sa colonne,
 * jamais a un nombre attendu. Un nombre ecrit ici serait une seconde source de
 * verite qu'une valeur en dur dans le composant satisferait tout autant.
 */
test("le tableau d'expédition porte trois colonnes comptées juste", async ({
  page,
}) => {
  await page.goto("/administration/expeditions");

  const releve = await page.evaluate(() =>
    [...document.querySelectorAll("main section")].map((section) => ({
      titre: section.querySelector("h2")?.textContent?.trim() ?? "",
      compteur: Number(
        section.querySelector("h2")?.nextElementSibling?.textContent?.trim(),
      ),
      cartes: section.querySelectorAll("li").length,
      formulaires: section.querySelectorAll("form").length,
    })),
  );

  expect(releve.map((colonne) => colonne.titre)).toEqual([
    "À préparer",
    "Prête à expédier",
    "En transit",
  ]);

  for (const colonne of releve) {
    expect(colonne.compteur).toBe(colonne.cartes);
  }

  /*
   * LE GESTE N'EXISTE QUE SUR LA COLONNE DU MILIEU. Une commande payee n'est
   * pas encore preparee, une commande partie ne repart pas : afficher le
   * formulaire ailleurs proposerait une action que le service refuse.
   *
   * CE TEST NE PROUVE PAS LA SECURITE, et ne doit pas etre lu ainsi.
   * `declarerExpedition` relit le statut EN BASE dans sa transaction : c'est
   * la garde, et `action-sensible-gardee` la couvre. Ici on verifie que l'ecran
   * ne PROPOSE pas un geste voue au refus.
   */
  const [aPreparer, prete, enTransit] = releve;

  expect(aPreparer?.formulaires).toBe(0);
  expect(enTransit?.formulaires).toBe(0);
  expect(prete?.formulaires).toBe(prete?.cartes);
});

/**
 * LE TABLEAU D'EXPEDITION NE DEBORDE PAS, ET C'EST L'ECRAN LE PLUS EXPOSE.
 *
 * Trois colonnes portant chacune des adresses postales : a 320 px elles doivent
 * s'empiler, sans quoi une adresse tiendrait sur 100 px de large.
 */
test("le tableau d'expédition ne déborde pas horizontalement", async ({
  page,
}) => {
  await page.goto("/administration/expeditions");

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

/* ==========================================================================
 * LS-183, la liste du catalogue.
 * ========================================================================== */

/**
 * LE TEST QUE LA STORY EXISTE POUR RENDRE POSSIBLE : ouvrir la fiche d'un
 * produit SANS connaitre son identifiant, critere 2.
 *
 * AVANT CETTE STORY, `/administration/produits/[id]` n'etait atteignable qu'en
 * saisissant un UUID : aucun ecran ne listait les produits. Modifier un prix
 * supposait d'aller chercher l'identifiant en base.
 *
 * LE TEST NAVIGUE AU CLIC, jamais par `goto` vers la fiche. C'est la seule
 * facon de prouver qu'un chemin y mene : un test qui atteint toujours sa cible
 * directement ne peut pas decouvrir qu'aucun chemin n'existe. Motif de LS-162,
 * « un defaut absent n'est pas un defaut empeche ».
 */
test("un produit s'ouvre au clic depuis le catalogue, sans saisir d'identifiant", async ({
  page,
}) => {
  await page.goto("/administration");
  await ouvrirLaBarreSiRepliee(page);

  await page
    .getByRole("navigation", { name: "Sections de l'administration" })
    .getByRole("link", { name: /^Catalogue/ })
    .click();

  await expect(
    page.getByRole("heading", { name: "Produits", level: 1 }),
  ).toBeVisible();

  /*
   * LE LIEN EST CIBLE PAR SON URL ET NON PAR SON LIBELLE, qui est le NOM du
   * produit : ancrer sur un nom lierait le test au jeu de donnees.
   *
   * `:not([href$="/nouveau"])` EST INDISPENSABLE, et le test l'a montre. Le
   * bouton « Nouveau produit » pointe vers `/administration/produits/nouveau`,
   * donc le prefixe le capture AUSSI, et il vient AVANT les cartes dans le DOM :
   * `.first()` cliquait donc sur la creation et non sur une fiche. Le test
   * echouait en cherchant « Informations générales » sur l'ecran de creation.
   */
  await page
    .getByRole("main")
    .locator('a[href^="/administration/produits/"]:not([href$="/nouveau"])')
    .first()
    .click();

  /*
   * L'EDITEUR EST ATTEINT. Son premier titre est « Informations générales », ce
   * que la table de `administration-connectee.spec.ts` verifie aussi : les deux
   * doivent rester d'accord.
   */
  await expect(
    page.getByRole("heading", { name: "Informations générales" }),
  ).toBeVisible();
});

/**
 * LES BROUILLONS SONT VISIBLES, ET LES ARCHIVES DERRIERE UN FILTRE.
 *
 * Arbitrage de Christophe du 4 septembre 2026. Le test compare le nombre de
 * cartes entre deux filtres plutot que d'attendre un nombre ecrit ici : un
 * nombre attendu serait une seconde source de verite, qu'une valeur en dur dans
 * le composant satisferait tout autant.
 */
test("le filtre par état change ce que le catalogue montre", async ({
  page,
}) => {
  await page.goto("/administration/produits");

  /* Meme exclusion que ci-dessus : le bouton de creation porte le meme prefixe. */
  const cartes = page
    .getByRole("main")
    .locator('a[href^="/administration/produits/"]:not([href$="/nouveau"])');

  const filtres = page.getByRole("navigation", { name: "Filtrer par état" });

  /**
   * Compte les cartes APRES que le filtre demande soit devenu courant.
   *
   * L'ATTENTE EST INDISPENSABLE, ET LE TEST L'A MONTRE : sans elle, `count()`
   * s'evalue pendant la navigation et additionne les cartes de l'ancienne vue
   * et de la nouvelle. Le total valait exactement le DOUBLE, 16 pour 8, ce qui
   * ressemblait a un doublon de rendu alors que le HTML n'en portait aucun.
   *
   * Motif « fenetre de course dans un test », deja rencontre sur ce depot :
   * une assertion qui ne dit pas QUAND elle mesure finit par mesurer un etat
   * intermediaire.
   */
  async function compterApresFiltre(libelle: string): Promise<number> {
    await filtres.getByRole("link", { name: libelle, exact: true }).click();
    await expect(
      filtres.getByRole("link", { name: libelle, exact: true }),
    ).toHaveAttribute("aria-current", "page");

    /*
     * LA BARRE PRECEDE LA LISTE, LS-199. `aria-current` seul dit que la
     * navigation a eu lieu, pas que les cartes du nouveau filtre sont rendues :
     * c'est le defaut qui rendait 0 sur la vue par defaut. Les deux filtres
     * exerces ici portent des produits, donc attendre une carte est legitime ;
     * un filtre legitimement vide, « Archivés », n'est pas compte par ce test.
     */
    await expect(cartes.first()).toBeVisible();

    return cartes.count();
  }

  /*
   * LA VUE PAR DEFAUT S'ATTEND, ET SUR LA LISTE, LS-199.
   *
   * `vivants` etait compte juste apres `goto`, sans attendre quoi que ce soit,
   * pendant que les deux autres comptes passaient par `compterApresFiltre` et
   * son attente d'`aria-current`. La mesure tombait pendant le rendu et rendait
   * 0 : la somme des filtres valait 9 pour un tout annonce a 0.
   *
   * ATTENDRE `aria-current` NE SUFFIT PAS, mesure a l'appui : la barre de
   * filtres est rendue AVANT la liste, donc son marqueur est deja pose quand
   * aucune carte n'existe. Le test restait rouge avec cette attente-la.
   *
   * L'ATTENTE PORTE DONC SUR CE QU'ON MESURE, au moins une carte. C'est aussi
   * ce qui empeche le test de passer sur un catalogue vide, ou 0 + 0 vaudrait 0
   * et l'egalite serait vraie sans rien prouver.
   *
   * LE TEST PORTAIT DEJA LE COMMENTAIRE QUI DECRIT CE PIEGE, quelques lignes
   * plus haut, tout en le commettant sur sa premiere mesure. L'etat de
   * chargement ajoute par LS-188 sur ces ecrans a rendu la fenetre atteignable.
   */
  await expect(cartes.first()).toBeVisible();

  const vivants = await cartes.count();
  const brouillons = await compterApresFiltre("Brouillons");
  const publies = await compterApresFiltre("Publiés");

  /*
   * LES DEUX SOUS-ENSEMBLES REDONNENT LE TOUT. C'est ce qui prouve que le
   * filtre partitionne au lieu de masquer arbitrairement, et qu'aucun produit
   * vivant n'echappe aux deux vues.
   */
  expect(brouillons + publies).toBe(vivants);

  /*
   * LE FILTRE COURANT EST ANNONCE, et un seul a la fois : sans la seconde
   * assertion, un ecran qui marquerait tous les filtres courants passerait.
   */
  await expect(filtres.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(
    filtres.getByRole("link", { name: "Publiés", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

/**
 * UN FILTRE INCONNU REND L'ECRAN ORDINAIRE, jamais une erreur.
 *
 * Le parametre vient d'une URL, donc d'une entree non fiable : un lien perime
 * ou une saisie a la main doit retomber sur le defaut. Un 500 sur une URL
 * bricolee serait un defaut de robustesse, et le test le mesure sur le STATUT
 * autant que sur le rendu.
 */
test("un filtre inconnu retombe sur la vue par défaut", async ({ page }) => {
  const reponse = await page.goto(
    "/administration/produits?statut=NIMPORTEQUOI",
  );

  expect(reponse?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Produits", level: 1 }),
  ).toBeVisible();

  const filtres = page.getByRole("navigation", { name: "Filtrer par état" });
  await expect(
    filtres.getByRole("link", { name: "Tous", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

/**
 * « NOUVEAU PRODUIT » EST ATTEIGNABLE DEPUIS LE CATALOGUE.
 *
 * Il a quitte la barre en LS-183 pour devenir un bouton de cet ecran, et son
 * EXCLUSION dans `verifier-navigation-administration.sh` repose sur ce chemin :
 * si le bouton disparaissait, la route deviendrait inatteignable sans que le
 * controle textuel ne le voie, son exclusion etant justement de ne pas exiger
 * de rubrique.
 */
test("le bouton Nouveau produit mène à la création depuis le catalogue", async ({
  page,
}) => {
  await page.goto("/administration/produits");

  await page
    .getByRole("main")
    .getByRole("link", { name: "Nouveau produit", exact: true })
    .click();

  await expect(
    page.getByRole("heading", { name: "Nouveau produit", level: 1 }),
  ).toBeVisible();
});

/**
 * LE CATALOGUE NE DEBORDE PAS, ET C'EST L'ECRAN LE PLUS CHARGE EN LIGNE.
 *
 * Vignette, categorie, nom, prix, declinaisons et badge sur une meme carte :
 * a 320 px tout doit tenir ou se replier, jamais deborder.
 */
test("le catalogue ne déborde pas horizontalement", async ({ page }) => {
  await page.goto("/administration/produits");

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

/**
 * LE LIEN D'EVITEMENT DEPLACE REELLEMENT LE FOCUS, LS-194, critere 2.
 *
 * CE TEST NE MESURE PAS LE DEFILEMENT, ET C'EST TOUT SON INTERET. Une cible
 * sans `tabIndex={-1}` fait defiler la page jusqu'a l'ancre en laissant le
 * focus ou il etait : la tabulation suivante repart alors du menu, c'est-a-dire
 * de ce que le lien existe pour eviter. Un lien d'evitement casse a
 * l'apparence exacte d'un lien qui marche, et le defaut a deja ete livre une
 * fois sur ce depot, cote boutique.
 *
 * IL S'EXECUTE SUR UN ECRAN DE LISTE plutot que sur le tableau de bord : c'est
 * la que la barre coute le plus cher a traverser, onze rubriques avant la
 * premiere ligne du tableau.
 */
test("le lien d'évitement déplace le focus vers le contenu", async ({
  page,
}) => {
  await page.goto("/administration/commandes");

  await page.keyboard.press("Tab");

  const lien = page.getByRole("link", { name: "Aller au contenu" });
  await expect(lien).toBeFocused();

  /*
   * LE LIEN EST VISIBLE UNE FOIS FOCALISE, critere 1. Deporte hors de l'ecran
   * au repos, il doit revenir dans le cadre : un lien focalise mais invisible
   * ne dit pas ou le focus se trouve, ce qui est le defaut que WCAG 2.4.7
   * nomme. `toBeVisible` de Playwright ne suffirait pas seul, un element
   * deporte restant « visible » a ses yeux, d'ou la mesure de sa position.
   *
   * SON CONTOUR DE FOCUS DOIT TENIR AUSSI, et c'est ce que mesure la marge.
   * `globals.css` trace `outline: 3px` avec `outline-offset: 2px`, soit 5 px
   * au-dela de la boite : un lien colle a `0` verrait ses cotes gauche et
   * superieur coupes par le bord du cadre. Une assertion `x >= 0` laissait
   * passer ce cas, releve par la revue d'interface, alors meme que le
   * commentaire annoncait garder WCAG 2.4.7.
   */
  await expect(lien).toBeVisible();
  const boite = await lien.boundingBox();
  expect(boite).not.toBeNull();

  const MARGE_CONTOUR_PX = 5;
  expect(boite!.x).toBeGreaterThanOrEqual(MARGE_CONTOUR_PX);
  expect(boite!.y).toBeGreaterThanOrEqual(MARGE_CONTOUR_PX);

  /*
   * LA ZONE TACTILE EST MESUREE ICI AUSSI, LS-196. LS-194 a pose
   * `min-height: var(--ls-touch-target)` sur ce lien sans qu'aucun test ne le
   * verifie : la propriete pouvait etre retiree ou annulee par un parent sans
   * que rien ne rougisse. Le lien jumeau de la boutique porte la meme mesure,
   * les deux liens etant gardes de la meme facon depuis cette story.
   */
  const CIBLE_TACTILE_PX = 44;
  expect(boite!.height).toBeGreaterThanOrEqual(CIBLE_TACTILE_PX);

  await page.keyboard.press("Enter");

  const focalise = page.locator(":focus");
  await expect(focalise).toHaveAttribute("id", "contenu");
  await expect(focalise).toHaveJSProperty("tagName", "MAIN");
});

/**
 * LE LIEN EST LE PREMIER ELEMENT FOCALISABLE, LS-194, critere 1.
 *
 * SANS CETTE ASSERTION, LE TEST CI-DESSUS RESTERAIT VERT sur un lien place
 * apres la barre : la premiere tabulation trouverait alors une rubrique, et
 * `toBeFocused` echouerait bien, mais rien ne dirait POURQUOI. Cette assertion
 * nomme la cause, et elle garde la propriete qui fait tout l'interet du lien :
 * un raccourci qu'il faut traverser onze rubriques pour atteindre n'en est pas
 * un.
 *
 * ELLE MESURE L'ORDRE DU DOM, ou vit reellement l'ordre de tabulation. Le
 * deport CSS ne le change pas, et c'est voulu.
 */
test("le lien d'évitement précède la navigation dans l'ordre de tabulation", async ({
  page,
}) => {
  await page.goto("/administration/commandes");

  const navigationSuitLeLien = await page.evaluate(() => {
    const lien = document.querySelector('a[href="#contenu"]');
    const navigation = document.querySelector("nav");

    if (!lien || !navigation) {
      return null;
    }

    /*
     * `compareDocumentPosition` rend un MASQUE DE BITS, et
     * `DOCUMENT_POSITION_FOLLOWING` vaut 4 : l'argument suit le noeud sur
     * lequel on appelle. Le test se fait dans le navigateur, seul endroit ou
     * `Node` existe ; le comparer cote Node.js leverait, la constante n'y etant
     * pas definie. Motif deja rencontre avec les mesures de rendu.
     */
    return (
      (lien.compareDocumentPosition(navigation) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
      0
    );
  });

  expect(navigationSuitLeLien).toBe(true);
});

/**
 * LA 404 SOUS `/administration` NE DOUBLE NI LE LIEN NI L'ANCRE, LS-194.
 *
 * LE RISQUE EST REEL ET LA MESURE L'ECARTE. `not-found.tsx` vit a la RACINE et
 * compose lui-meme `<EnTeteBoutique />`, qui porte son propre lien
 * d'evitement, plus son `<main id="contenu">`. Si le layout d'administration
 * restait monte au-dessus d'une URL introuvable de ce segment, la page rendrait
 * DEUX liens « Aller au contenu » pour une seule ancre, et le lien du layout
 * pointerait vers un `<main>` appartenant a l'en-tete de la boutique.
 *
 * MESURE DU 6 SEPTEMBRE 2026 : Next.js remonte au `not-found.tsx` racine SANS
 * monter le layout du segment, y compris sur une URL passant par un segment
 * dynamique. Un seul lien, une seule ancre, aucune barre d'administration.
 *
 * CE TEST EXISTE PARCE QUE RIEN NE GARDAIT CETTE PROPRIETE, et qu'elle depend
 * d'un comportement de Next.js et non d'une ligne du depot : une version future
 * pourrait monter le layout, et le defaut serait alors invisible a la relecture.
 * Les trois formes d'URL sont couvertes, la derniere passant par un segment
 * dynamique ou le layout est le plus susceptible d'etre monte.
 */
test("une URL introuvable de l'administration ne double pas le lien d'évitement", async ({
  page,
}) => {
  for (const url of [
    "/administration/url-inexistante",
    "/administration/produits/99999999",
    "/administration/commandes/inexistante",
  ]) {
    await page.goto(url);

    await expect(
      page.getByRole("link", { name: "Aller au contenu" }),
    ).toHaveCount(1);
    await expect(page.locator("#contenu")).toHaveCount(1);
  }
});
