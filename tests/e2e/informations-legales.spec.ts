/**
 * La page des informations legales, LS-28 et LS-123.
 *
 * CE QUE CE FICHIER PROUVE EN PREMIER : les quatre liens du pied de page
 * atteignent une page reelle. Ils existaient depuis LS-122 et pointaient vers
 * une route inexistante, donc rendaient 404 : c'est le critere d'acceptation de
 * LS-28, « les liens du pied de page pointent vers ces pages reelles, aucun href
 * vide ni diese ».
 *
 * LA NAVIGATION SE FAIT AU CLIC, jamais par `page.goto` sur l'URL en dur. Un
 * test qui atteint toujours sa cible directement ne peut pas decouvrir qu'aucun
 * chemin n'y mene, motif de LS-162 : l'absence totale de menu d'administration
 * n'avait fait rougir aucune assertion pendant huit stories.
 *
 * LES CONTENUS OBLIGATOIRES SONT VERIFIES SUR LEUR SUBSTANCE, pas sur leur
 * presence. Le delai de quatorze jours, la charge des frais de retour et la
 * garantie de deux ans sont les trois mentions dont l'absence coute le plus :
 * l'article L221-20 porte le delai de retractation a douze mois quand
 * l'information est incorrecte.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { CATALOGUE_TEST } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

/**
 * Les quatre liens du pied de page, avec la section qu'ils doivent atteindre.
 *
 * LA LISTE EST ECRITE ICI PLUTOT QU'IMPORTEE DU COMPOSANT, deliberement : une
 * assertion qui lit la meme constante que le code verifie sa coherence avec
 * lui-meme et reste verte si les deux changent ensemble.
 */
const LIENS_PIED = [
  { libelle: "Mentions légales", titre: "Mentions légales" },
  { libelle: "Conditions de vente", titre: "Conditions générales de vente" },
  {
    libelle: "Confidentialité",
    titre: "Confidentialité et données personnelles",
  },
  { libelle: "Rétractation", titre: "Droit de rétractation" },
] as const;

/**
 * Les liens du pied vers la page d'aide, LS-123.
 *
 * ILS SONT DANS UNE LISTE SEPAREE parce qu'ils mènent à une AUTRE page : les
 * confondre avec les quatre precedents ferait passer le test tant qu'une seule
 * des deux pages existe.
 */
const LIENS_AIDE = [
  { libelle: "Livraison et retours", titre: "Livraison" },
  { libelle: "Questions fréquentes", titre: "Questions fréquentes" },
] as const;

test("les quatre liens du pied de page atteignent une page réelle", async ({
  page,
}) => {
  for (const lien of LIENS_PIED) {
    await page.goto("/");

    /*
     * LE LIEN EST CHERCHE DANS LE PIED, jamais dans toute la page : « Contact »
     * et « Rétractation » peuvent apparaitre ailleurs, et un selecteur global
     * trouverait le mauvais element sans que rien ne le dise.
     */
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: lien.libelle })
      .click();

    await expect(page).toHaveURL(/\/informations-legales/);

    await expect(
      page.getByRole("heading", { name: lien.titre, level: 2 }),
    ).toBeVisible();
  }
});

test("les deux liens d'aide du pied de page atteignent leur section", async ({
  page,
}) => {
  for (const lien of LIENS_AIDE) {
    await page.goto("/");

    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: lien.libelle })
      .click();

    await expect(page).toHaveURL(/\/aide/);

    await expect(
      page.getByRole("heading", { name: lien.titre, level: 2 }),
    ).toBeVisible();
  }
});

/**
 * LA PAGE D'AIDE N'ANNONCE QUE LE DELAI D'EXPEDITION DONNE PAR L'EXPLOITANTE,
 * et ce test le VERIFIE plutot que de faire confiance a la relecture.
 *
 * Reponses du 8 octobre 2026, LS-26 : deux jours au plus entre le paiement
 * confirme et le depot du colis. Le chiffre est ECRIT ICI et non importe de
 * `DELAI_EXPEDITION_JOURS_MAX` : importer la constante ferait bouger le test
 * avec elle, et un delai change sans l'accord de l'exploitante passerait
 * inapercu, meme raisonnement que pour les tarifs plus bas.
 */
test("la page d'aide n'annonce que les délais donnés par l'exploitante", async ({
  page,
}) => {
  await page.goto("/aide");

  const texte = (await page.getByRole("main").textContent()) ?? "";

  /*
   * AUCUN AUTRE DÉLAI CHIFFRÉ, HORS LES PHRASES ADMISES, retirées mot pour mot
   * avant le test : la réponse aux messages sous 24 heures et le dépôt du colis
   * sous 2 jours, délais donnés par l'exploitante (présents aussi dans le
   * balisage `FAQPage`, d'où `replaceAll`), et le compteur légal de
   * rétractation, « 14 » et « jours » accolés par le rendu. Tout autre nombre
   * d'heures ou de jours fait rougir : un motif bâti sur des verbes laissait
   * passer « votre colis part sous 48 heures », revue de LS-26.
   */
  const sansDelaisAdmis = texte
    .replaceAll("répond sous 24 heures au maximum", "")
    .replaceAll("Sous 24 heures au maximum. Pour une commande en cours", "")
    .replaceAll("au plus tard 2 jours après la confirmation de votre", "")
    .replaceAll("14jours pour changer d'avis, dès la réception", "");
  expect(sansDelaisAdmis).not.toMatch(/\b\d+ ?(heures?|h|jours?)\b/i);
  expect(texte).toMatch(
    /dépose votre colis au plus tard 2 jours après la confirmation de votre\s+paiement/,
  );
  expect(texte).not.toMatch(/sera précisé/i);
});

test("la page d'aide affiche les trois modes et leurs tarifs", async ({
  page,
}) => {
  await page.goto("/aide#livraison");

  const section = page.locator("#livraison");
  const texte = (await section.textContent()) ?? "";

  /*
   * LES TROIS MODES D'ADR-025, et les deux tarifs distincts : un seul tarif
   * affiche signalerait que la page a ete ecrite en dur au lieu de lire la
   * configuration.
   */
  expect(texte).toMatch(/Point Relais/);
  expect(texte).toMatch(/Locker/);
  expect(texte).toMatch(/domicile/i);

  /*
   * LES DEUX TARIFS D'ADR-035, ECRITS ICI ET NON DERIVES DE L'ENVIRONNEMENT.
   *
   * CETTE ASSERTION A FIGE 4,99 EUR ET N'A JAMAIS ROUGI, alors qu'ADR-035 porte
   * le domicile a 7,49 EUR depuis le 6 septembre 2026. Elle ne pouvait pas
   * rougir : la suite de bout en bout ne tournait dans AUCUNE chaine, LS-209,
   * et son premier passage reel en integration continue l'a trouvee.
   *
   * LIRE `process.env` ICI A ETE ESSAYE, ET NE GARDE RIEN. Le test lirait alors
   * la MEME variable que la page, les deux bougeraient ensemble, et un tarif
   * fige dans `livraison.ts` passerait inapercu : mesure du 9 septembre 2026,
   * la mutation `const domicile = "499"` laisse les 18 tests VERTS. Motif
   * « garde-fou compare a lui-meme », deja en fiche sur ce depot.
   *
   * LA SOURCE EST DONC L'ADR, recopiee a dessein : c'est une DECISION
   * COMMERCIALE, pas une valeur derivable. Quand elle change, cette ligne
   * change avec `.env.example` et les deux workflows, et le test rouge est le
   * rappel que la propagation n'est pas finie.
   */
  expect(texte).toMatch(/4,10/);
  expect(texte).toMatch(/7,49/);
});

/*
 * LS-249 : LA GRATUITE N'EST JAMAIS ANNONCEE POUR LE DOMICILE. La page disait
 * « quel que soit le mode choisi » quand `calculerFraisPort` facture le
 * domicile au-dela du seuil, ADR-035 : information precontractuelle fausse,
 * en production du 13 au 23 septembre 2026.
 */
test("la page d'aide n'annonce la livraison offerte qu'en Point Relais et Locker", async ({
  page,
}) => {
  await page.goto("/aide#livraison");

  const texte = (await page.locator("#livraison").textContent()) ?? "";

  expect(texte).toMatch(/offerte en Point Relais et Locker/);
  expect(texte).not.toMatch(/quel que soit le mode/i);
  expect(texte).not.toMatch(/tous (les )?modes/i);
});

/*
 * LS-249 : LE MEME DEFAUT VIVAIT DANS LES CONDITIONS GENERALES, ou il engage
 * contractuellement la boutique. La page entiere est lue : la clause peut
 * changer de section sans que la garde se perde.
 */
test("les conditions générales n'annoncent la livraison offerte qu'en Point Relais et Locker", async ({
  page,
}) => {
  await page.goto("/informations-legales");

  const texte = (await page.getByRole("main").textContent()) ?? "";

  expect(texte).toMatch(/offerte en Point Relais et Locker/);
  expect(texte).not.toMatch(/quel que soit le mode/i);
});

test("la page d'aide ne déborde pas horizontalement", async ({ page }) => {
  await page.goto("/aide");

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("aucune violation d'accessibilité sur la page d'aide", async ({
  page,
}) => {
  await page.goto("/aide");

  const resultats = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultats.violations).toEqual([]);
});

/**
 * LE STATUT EST VERIFIE, PAS SEULEMENT L'ASPECT DE LA PAGE.
 *
 * Motif de LS-111 : un `loading.tsx` mal place laisse un 200 sur une page qui
 * devrait rendre 404, et le defaut est invisible a l'ecran. Ici l'inverse est
 * verifie, la page doit bien repondre 200.
 */
test("la page répond 200", async ({ page }) => {
  const reponse = await page.goto("/informations-legales");

  expect(reponse?.status()).toBe(200);
});

/**
 * LES TROIS MENTIONS DONT L'ABSENCE COUTE LE PLUS.
 *
 * L'article L221-20 porte le delai de retractation a DOUZE MOIS quand
 * l'information sur ce droit est incorrecte ou absente. Ces assertions portent
 * donc sur la substance des textes, jamais sur la seule presence d'un titre.
 */
test("les mentions obligatoires du droit de rétractation sont présentes", async ({
  page,
}) => {
  await page.goto("/informations-legales#retractation");

  const section = page.locator("#retractation");

  /*
   * LE DELAI EST CHERCHE SUR LE TEXTE COMPLET DE LA SECTION, jamais par
   * `getByText` sur un fragment : « quatorze jours » est dans un `<strong>`, ce
   * qui coupe le noeud de texte, et le selecteur ne trouvait donc pas la phrase
   * qui l'entoure. Un test qui echoue sur la MISE EN FORME d'une mention
   * obligatoire accuse le contenu a la place du selecteur.
   */
  const texteSection = (await section.textContent()) ?? "";

  /* Le delai, et son point de depart : la RECEPTION, jamais l'expedition. */
  expect(texteSection).toMatch(/quatorze jours/i);
  expect(texteSection).toMatch(/à compter de la réception/i);

  /*
   * LA CHARGE DES FRAIS DE RETOUR, article L221-23 : le client ne les supporte
   * QUE s'il en a ete informe, et la charge de la preuve pese sur le vendeur.
   */
  expect(texteSection).toMatch(/frais de retour sont à votre charge/i);

  /*
   * L'ÉTAT DU BIJOU RETOURNÉ, article L221-23 alinéa 3, LS-287 : seule une
   * dépréciation due à des manipulations au-delà de l'examen engage le client.
   * « Un état permettant sa remise en vente » posait une condition que la loi
   * ne pose pas, et se lisait comme une condition d'exercice du droit.
   */
  expect(texteSection).toMatch(
    /manipulations autres que celles\s+nécessaires pour établir sa nature/i,
  );
  expect(texteSection).not.toMatch(/remise en vente|état d.origine/i);

  /*
   * LE DÉLAI DE REMBOURSEMENT PART DE L'INFORMATION DE LA DÉCISION, L221-24
   * alinéa 1, LS-287. Le premier des deux faits ne fait que permettre de
   * différer, alinéa 2 : faire partir quatorze jours de ce fait promettait
   * jusqu'à quatorze jours de plus que la loi.
   */
  expect(texteSection).toMatch(
    /quatorze jours après que l.atelier a été informé de votre décision/i,
  );
  expect(texteSection).not.toMatch(/quatorze jours après le premier/i);

  /*
   * LA GARANTIE LEGALE DE CONFORMITE, article L217-3, DISTINGUEE de la
   * retractation : deux ans, et frais de retour a la charge du vendeur. Les
   * confondre est une source classique de litige, et facturer le retour sur un
   * defaut serait fautif.
   */
  expect(texteSection).toMatch(/deux ans/i);
  expect(texteSection).toMatch(/garantie légale de conformité/i);
});

/**
 * LE MÉDIATEUR, LS-19 : le CM2C, écrit dans le code depuis le 20 octobre 2026.
 *
 * CE TEST REMPLACE CELUI QUI VÉRIFIAIT « adhésion en cours », comme ce dernier
 * l'annonçait : il fallait vérifier les coordonnées une fois le médiateur
 * désigné. Les valeurs sont recopiées ici et non importées, même motif que
 * l'hébergeur : un test qui lit la constante resterait vert si elle portait une
 * valeur fausse.
 *
 * LES CINQ MOYENS SONT VÉRIFIÉS, et le lien de saisine par sa cible et non par
 * son texte : un `href` faux sous un texte juste enverrait le client ailleurs.
 */
test("le médiateur est publié avec ses cinq coordonnées de saisine", async ({
  page,
}) => {
  await page.goto("/informations-legales#cgv");

  const cgv = page.locator("#cgv");
  await expect(
    cgv.getByRole("heading", { name: "Médiation de la consommation" }),
  ).toBeVisible();
  await expect(cgv).toContainText(
    "Centre de la Médiation de la Consommation de Conciliateurs de Justice (CM2C)",
  );
  await expect(cgv).toContainText("49 rue de Ponthieu, 75008 Paris");
  await expect(cgv).toContainText("01 89 47 00 14");

  await expect(
    cgv.getByRole("link", { name: "litiges@cm2c.net" }),
  ).toHaveAttribute("href", "mailto:litiges@cm2c.net");
  await expect(
    cgv.getByRole("link", {
      name: "https://www.cm2c.net/declarer-un-litige.php",
    }),
  ).toHaveAttribute("href", "https://www.cm2c.net/declarer-un-litige.php");

  await expect(cgv).not.toContainText(/médiation.*en cours/i);
});

/**
 * LA FICHE PRODUIT RENVOIE VERS LA PAGE, ce qu'elle ne faisait pas.
 *
 * LS-105 avait deliberement omis ce lien, la page n'existant pas : le poser
 * d'avance aurait rendu 404 sur l'ecran ou le client decide d'acheter.
 */
test("la fiche produit renvoie vers le détail de la rétractation", async ({
  page,
}) => {
  /*
   * LA FICHE VIENT DE LA FIXTURE, jamais du « premier lien du catalogue » : ce
   * selecteur-la trouvait un lien de navigation et non une fiche, donc le test
   * echouait sur une page qui ne portait pas le bloc legal.
   */
  await page.goto(`/produit/${CATALOGUE_TEST.enStock.slug}`);

  const lien = page.getByRole("link", {
    name: "Détail du droit de rétractation",
  });

  await expect(lien).toBeVisible();
  await lien.click();

  await expect(page).toHaveURL(/informations-legales#retractation/);
});

test("la page ne déborde pas horizontalement", async ({ page }) => {
  await page.goto("/informations-legales");

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});

test("aucune violation d'accessibilité", async ({ page }) => {
  await page.goto("/informations-legales");

  const resultats = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultats.violations).toEqual([]);
});

/**
 * L'INFORMATION SUR LES COOKIES, LS-148 critère 3.
 *
 * ------------------------------------------------------------------
 * CE QUE CE TEST GARDE, ET CE N'EST PAS UNE FORMULATION.
 *
 * Aucune bannière n'est due, les quatre traceurs du site figurant nommément
 * dans la liste des exemptions de la CNIL, `.claude/rules/legal.md` section
 * « Cookies et traceurs, article 82 ». Mais l'absence d'obligation de
 * consentement ne dispense pas d'INFORMER, et cette information est le
 * livrable de la story.
 *
 * IL VÉRIFIE LA PRÉSENCE, PAS LE TEXTE EXACT. Une assertion sur une phrase
 * entière rougirait à la première relecture éditoriale sans qu'aucune
 * obligation n'ait bougé. Ce qui doit survivre est le FAIT que la page dit
 * quels cookies existent et pourquoi aucun consentement n'est demandé.
 * ------------------------------------------------------------------
 */
test("la page d'informations légales décrit les cookies employés", async ({
  page,
}) => {
  await page.goto("/informations-legales");

  const section = page.locator("#confidentialite");
  await expect(section).toBeVisible();

  const texte = (await section.textContent()) ?? "";

  /*
   * TROIS SENS, ET CHACUN PORTE UNE OBLIGATION DISTINCTE.
   *
   * Dire que des cookies existent, dire qu'aucun n'est publicitaire, et dire
   * pourquoi aucun consentement n'est demandé. Une page qui listerait les
   * cookies sans expliquer l'absence de bannière laisserait le visiteur devant
   * une question sans réponse.
   */
  expect(texte).toMatch(/[Cc]ookie/);
  expect(texte).toMatch(/publicitaire/);
  expect(texte).toMatch(/strictement nécessaires?/i);
});

/**
 * La section Accessibilite, LS-123.
 *
 * ------------------------------------------------------------------
 * CE QUE CE TEST VERROUILLE, ET CE QU'IL LAISSE LIBRE.
 *
 * AUCUN TEXTE N'IMPOSE CETTE SECTION A CETTE BOUTIQUE, verifie aux sources le
 * 11 septembre 2026 : l'article 47 de la loi 2005-102 vise 250 M EUR de chiffre
 * d'affaires, et la directive 2019/882 exempte les microentreprises de moins de
 * dix salaries et deux millions d'euros. Les deux seuils sont tres au-dessus.
 *
 * LE RISQUE N'EST DONC PAS L'ABSENCE, IL EST L'EXCES. Une page qui annoncerait
 * une « declaration d'accessibilite » ou un taux de conformite RGAA
 * revendiquerait une conformite jamais auditee, ce qui est une allegation
 * trompeuse sur une page legale. Les deux assertions negatives ci-dessous
 * comptent donc autant que les positives.
 *
 * LA FORMULATION RESTE LIBRE, motif de la section Cookies juste au-dessus : le
 * texte se relit et se reecrit, ce qui doit survivre est le FAIT que la page
 * dise son engagement, son moyen de signalement, et la limite de ce qui a ete
 * verifie.
 * ------------------------------------------------------------------
 */
test("la section accessibilité engage sans revendiquer de conformité auditée", async ({
  page,
}) => {
  await page.goto("/informations-legales");

  const section = page.locator("#accessibilite");
  await expect(section).toBeVisible();

  const texte = (await section.textContent()) ?? "";

  // Le site dit ce qu'il vise, et par quel moyen on le joint si ça résiste.
  expect(texte).toMatch(/clavier/i);
  expect(texte).toMatch(/lecteur d[’']écran/i);
  expect(texte).toMatch(/WCAG/);

  /*
   * LA LIMITE EST DITE. Sans cette phrase, l'énumération des vérifications
   * automatisées se lirait comme une garantie d'accessibilité complète.
   */
  expect(texte).toMatch(/aucun audit RGAA/i);

  /*
   * LES DEUX SENS NEGATIFS, et ils sont le coeur de ce test.
   *
   * « Declaration d'accessibilite » designe un document reglementaire au
   * contenu impose. Un pourcentage de conformite en est la mention la plus
   * exposee : aucun audit n'ayant eu lieu, tout chiffre serait invente.
   */
  expect(texte).not.toMatch(/déclaration d[’']accessibilité/i);
  expect(texte).not.toMatch(/\d+\s*%/);
});

/**
 * LE SOMMAIRE MENE A CHAQUE SECTION, ET AUCUNE SECTION N'EST ORPHELINE.
 *
 * LES DEUX SENS, et le second est celui qui manquait : une section ajoutee sans
 * son entree de sommaire reste atteignable par defilement et invisible pour qui
 * parcourt la page par son plan. C'est exactement ce qui serait arrive a la
 * section Accessibilite si son entree avait ete oubliee.
 */
test("le sommaire et les sections de la page légale se correspondent", async ({
  page,
}) => {
  await page.goto("/informations-legales");

  const ancresSommaire = await page
    .locator('nav[aria-label="Sections de cette page"] a')
    .evaluateAll((liens) =>
      liens.map((lien) => (lien as HTMLAnchorElement).hash.slice(1)),
    );

  /*
   * `main section[id]` ET NON `main > section[id]` : depuis LS-282 les sections
   * vivent dans la colonne de contenu, à côté du sommaire. L'en-tête d'aube est
   * une section sans `id`, il n'entre pas dans la comparaison.
   */
  const sections = await page
    .locator("main section[id]")
    .evaluateAll((elements) => elements.map((element) => element.id));

  expect(ancresSommaire.length).toBeGreaterThan(0);
  expect([...ancresSommaire].sort()).toEqual([...sections].sort());

  /*
   * CHAQUE CIBLE EXISTE VRAIMENT, verifie sur le rendu et non sur la liste : un
   * sommaire coherent avec lui-meme pointerait encore vers du vide si une
   * section perdait son `id`.
   */
  for (const ancre of ancresSommaire) {
    await expect(page.locator(`#${ancre}`)).toBeVisible();
  }
});

/**
 * LE CRÉDIT DE DÉVELOPPEMENT, LS-290 : un seul lien, ici et nulle part ailleurs.
 *
 * L'URL ET L'ANCRE SONT ÉCRITES ICI, pas importées de la page, même motif que
 * `LIENS_PIED` : une assertion qui lit la constante du code reste verte si les
 * deux changent ensemble.
 *
 * AUCUN `rel` ET AUCUN `target`, arbitrage du 19 octobre 2026 : le crédit est
 * un choix libre de l'exploitante, sans contrepartie. Un `sponsored` ou un
 * `nofollow` posés par réflexe retireraient au lien ce qu'il doit apporter, un
 * `target` ouvrirait une fenêtre sans l'annoncer.
 */
const SITE_DEVELOPPEUR = "https://christophe-dev-freelance.fr";
const ANCRE_DEVELOPPEUR = "Christophe Mostefaoui, développeur web freelance";

test("le crédit de développement est un seul lien, dans les mentions légales", async ({
  page,
}) => {
  await page.goto("/informations-legales");

  const liens = page.locator(`a[href^="${SITE_DEVELOPPEUR}"]`);
  await expect(liens).toHaveCount(1);

  const lien = page
    .locator("#mentions")
    .getByRole("link", { name: ANCRE_DEVELOPPEUR, exact: true });
  await expect(lien).toBeVisible();
  await expect(lien).toHaveAttribute("href", SITE_DEVELOPPEUR);
  await expect(lien).not.toHaveAttribute("rel", /.*/);
  await expect(lien).not.toHaveAttribute("target", /.*/);

  await expect(
    page
      .locator("#mentions")
      .getByRole("heading", { name: "Conception et développement", level: 3 }),
  ).toBeVisible();
});

test("le crédit de développement n'apparaît ni dans le pied, ni sur l'accueil, ni dans le balisage", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(`a[href^="${SITE_DEVELOPPEUR}"]`)).toHaveCount(0);
  await expect(page.getByRole("contentinfo")).not.toContainText("Mostefaoui");

  /*
   * LE BALISAGE DE LA BOUTIQUE NE NOMME PAS SON PRESTATAIRE : `Organization`
   * décrit l'entreprise de l'exploitante. Il n'est rendu QUE sur l'accueil,
   * d'où cette assertion ici : posée d'abord sur la page légale, elle restait
   * verte avec l'URL injectée dans `sameAs`, faute de balisage à lire.
   */
  const balisage = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  expect(balisage.join("\n")).toContain('"Organization"');
  expect(balisage.join("\n")).not.toContain("christophe-dev-freelance");
});

/**
 * L'HÉBERGEUR, LS-28 : OVH SAS, écrit dans le code depuis le 19 octobre 2026.
 *
 * LES VALEURS SONT RECOPIÉES ICI ET NON IMPORTÉES, même motif que `LIENS_PIED`.
 * Elles venaient de trois variables d'environnement, et la production a publié
 * « A renseigner avant ouverture » et « 00 00 00 00 00 » sans qu'aucun test ne
 * le voie : la base de test ne configure pas l'identité, et le bloc se cachait
 * avec elle. Il ne dépend plus d'aucune configuration, donc ce test le voit
 * toujours.
 */
test("l'hébergeur est nommé avec son adresse et son téléphone, sans valeur de remplissage", async ({
  page,
}) => {
  await page.goto("/informations-legales");

  const mentions = page.locator("#mentions");
  await expect(
    mentions.getByRole("heading", { name: "Hébergement du site", level: 3 }),
  ).toBeVisible();
  await expect(mentions).toContainText("OVH SAS");
  await expect(mentions).toContainText(
    "2 rue Kellermann, 59100 Roubaix, France",
  );
  await expect(mentions).toContainText("+33 9 72 10 10 07");

  const texte = (await page.locator("main").textContent()) ?? "";
  expect(texte).not.toMatch(/[AÀ] renseigner/i);
  expect(texte).not.toContain("00 00 00 00 00");
});
