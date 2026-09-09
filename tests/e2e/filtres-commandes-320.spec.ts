/**
 * Decouvrabilite des filtres de commandes a 320 px. LS-144.
 *
 * CE FICHIER MESURE AVANT DE CONCLURE, et c'est le critere 1 de la story : le
 * rendu reel a 320 px est constate, mesure a l'appui, plutot que deduit du
 * nombre de libelles. Le critere 6 autorise explicitement la fermeture sur ce
 * constat si le defaut n'en est pas un.
 *
 * CE QUI N'EST PAS EN CAUSE, et que la story interdit de « corriger » :
 * `overflow-x: auto` porte sur `.listeFiltres`, le CONTENEUR, et non sur la
 * page. C'est la regle mobile du projet, aucun debordement horizontal du corps.
 * Le defilement fonctionne ; c'est sa DECOUVRABILITE qui etait en question.
 *
 * CE QUE LA MESURE ETABLIT, et qui tranche la question posee : a 320 px, le
 * troisieme filtre est coupe par le bord. Un libelle tronque en plein mot est
 * l'indice de defilement que la story cherchait, et il est produit par le
 * contenu lui-meme plutot que par un degrade ajoute. Le cas qui aurait justifie
 * une modification est celui ou la bande se terminerait NETTEMENT sur un filtre
 * entier, ne donnant alors aucun signe qu'il en reste.
 *
 * LES ASSERTIONS PORTENT DONC SUR CE QUI DOIT TENIR, pas sur une apparence :
 * la bande defile reellement, un filtre est coupe par le bord, le corps ne
 * deborde pas, les zones tactiles font 44 px, et le clavier atteint les sept.
 */
import { expect, test } from "@playwright/test";

import { FICHIER_SESSION_ADMINISTRATION } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

/**
 * Les sept filtres, ecrits ici plutot qu'importes de la page.
 *
 * Une assertion qui lit la meme constante que le code verifie sa coherence avec
 * lui-meme et reste verte si les deux changent ensemble. Meme motif que
 * `navigation-administration.spec.ts`.
 */
const LIBELLES = [
  "Toutes",
  "En attente de paiement",
  "Confirmées",
  "En préparation",
  "Expédiées",
  "Livrées",
  "Annulées",
];

/** La cible tactile minimale du projet, `frontend-design.md`. */
const CIBLE_TACTILE_PX = 44;

test.describe("Filtres de commandes a 320 px", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("le constat : la bande defile et un filtre est coupe par le bord", async ({
    page,
  }) => {
    await page.goto("/administration/commandes");

    const liste = page.locator("nav[aria-label='Filtrer par statut'] ul");
    await expect(liste).toBeVisible();

    /*
     * LA BANDE DEFILE REELLEMENT. `scrollWidth` est aveugle a un debordement de
     * PAGE, fiche « scrollWidth est aveugle », mais il est la mesure juste ici :
     * la question posee est bien celle du contenu d'un conteneur qui defile.
     */
    const { largeurContenu, largeurVisible } = await liste.evaluate((el) => ({
      largeurContenu: el.scrollWidth,
      largeurVisible: el.clientWidth,
    }));

    expect(
      largeurContenu,
      "les sept filtres doivent depasser la largeur visible a 320 px, " +
        "sans quoi la question de la decouvrabilite ne se pose pas",
    ).toBeGreaterThan(largeurVisible);

    /*
     * UN FILTRE EST COUPE PAR LE BORD, et c'est le coeur du constat. Un libelle
     * tronque en plein mot signale qu'il reste du contenu : c'est l'indice que
     * la story cherchait, deja produit par le rendu.
     *
     * La mesure compare le bord droit de la liste au bord droit de chaque
     * filtre : un filtre qui commence avant le bord et finit apres est coupe.
     */
    const boiteListe = await liste.boundingBox();
    expect(boiteListe).not.toBeNull();
    const bordDroit = boiteListe!.x + boiteListe!.width;

    const coupes: string[] = [];
    for (const libelle of LIBELLES) {
      const boite = await liste
        .getByRole("link", { name: libelle, exact: true })
        .boundingBox();
      if (boite === null) {
        continue;
      }
      if (boite.x < bordDroit && boite.x + boite.width > bordDroit) {
        coupes.push(libelle);
      }
    }

    expect(
      coupes.length,
      "au moins un filtre doit etre coupe par le bord : c'est ce qui signale " +
        "qu'il reste du contenu. Une bande qui se termine NETTEMENT sur un " +
        "filtre entier ne donne aucun signe, et c'est ce cas qui demanderait " +
        "un degrade de bord.",
    ).toBeGreaterThan(0);
  });

  test("aucun debordement horizontal du corps", async ({ page }) => {
    await page.goto("/administration/commandes");
    await expect(
      page.locator("nav[aria-label='Filtrer par statut']"),
    ).toBeVisible();

    /*
     * MESURE PAR `getBoundingClientRect` ET NON PAR `scrollWidth`, critere 3 :
     * `scrollWidth` est arrondi a l'entier et laisse passer un depassement
     * fractionnaire, et il est aveugle a un element positionne hors du flux.
     */
    const depassement = await debordementHorizontal(page);
    expect(depassement).toBeLessThanOrEqual(TOLERANCE_DEBORDEMENT_PX);
  });

  test("les zones tactiles tiennent 44 px, largeur comprise", async ({
    page,
  }) => {
    await page.goto("/administration/commandes");
    const liste = page.locator("nav[aria-label='Filtrer par statut'] ul");
    await expect(liste).toBeVisible();

    for (const libelle of LIBELLES) {
      const boite = await liste
        .getByRole("link", { name: libelle, exact: true })
        .boundingBox();
      expect(boite, `le filtre « ${libelle} » doit etre rendu`).not.toBeNull();
      expect(boite!.height, `hauteur de « ${libelle} »`).toBeGreaterThanOrEqual(
        CIBLE_TACTILE_PX,
      );
      expect(boite!.width, `largeur de « ${libelle} »`).toBeGreaterThanOrEqual(
        CIBLE_TACTILE_PX,
      );
    }
  });

  test("le clavier atteint les sept filtres, hors ecran compris", async ({
    page,
  }) => {
    await page.goto("/administration/commandes");
    const liste = page.locator("nav[aria-label='Filtrer par statut'] ul");
    await expect(liste).toBeVisible();

    /*
     * CE TEST EST CELUI QUI COMPTE LE PLUS DES QUATRE. Un filtre hors ecran est
     * une gene ; un filtre inatteignable au clavier est une barriere. Le focus
     * fait defiler la bande, ce qui est aussi une facon de decouvrir qu'elle
     * defile.
     */
    for (const libelle of LIBELLES) {
      const filtre = liste.getByRole("link", { name: libelle, exact: true });
      await filtre.focus();
      await expect(filtre).toBeFocused();
    }

    /*
     * LE FILTRE ACTIF RESTE ANNONCE, critere 5. `aria-current="page"` porte
     * l'information : `frontend-design.md` interdit qu'elle passe par la seule
     * couleur.
     */
    await expect(
      liste.getByRole("link", { name: "Toutes", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  });
});
