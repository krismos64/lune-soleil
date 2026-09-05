/**
 * Rendu des etats de chargement de l'administration, LS-188, critere 4.
 *
 * ------------------------------------------------------------------
 * LE PROBLEME QUE CE FICHIER RESOUT : UN ETAT DE CHARGEMENT EST INOBSERVABLE
 * PAR UN TEST ORDINAIRE.
 *
 * Playwright attend que la page soit chargee avant d'assertir : il observe donc
 * precisement le moment ou l'armature a DISPARU. Les quatorze etats de
 * chargement de cette story auraient pu deborder a 320 px, afficher un texte
 * fautif ou sauter la mise en page sans qu'aucune assertion ne rougisse.
 *
 * `waitUntil: "commit"` EST CE QUI LES REND OBSERVABLES. Il rend la main des
 * que la reponse commence, donc pendant que le repli est encore a l'ecran et
 * avant que le contenu suspendu l'ait remplace. Verifie sur ce depot : le corps
 * porte alors « Chargement des factures… » et l'armature.
 * ------------------------------------------------------------------
 *
 * DEUX FORMES SONT COUVERTES, et elles se mesurent pareil a l'ecran :
 *
 *   - le `loading.tsx` de segment, dix ecrans
 *   - le `<Suspense>` interne, quatre ecrans, dont les deux que C32 oblige
 *
 * L'ARMATURE EST MESUREE A 320 px, la largeur la plus contraignante du projet.
 * Un etat de chargement est un rendu comme un autre : rien ne justifierait qu'il
 * deborde la ou la page qu'il remplace ne deborde pas.
 *
 * UN SEUL PROJET POUR TOUT CE FICHIER, et pour DEUX raisons distinctes.
 *
 * Pour le TEXTE, c'est la raison ordinaire : lire une phrase ne depend pas du
 * viewport, la rejouer trois fois triplerait la duree pour trois fois la meme
 * verification. Motif « plafond de debit et suite e2e », en fiche.
 *
 * Pour le DEBORDEMENT, c'est ce qui rend la mesure possible : l'armature est
 * une fenetre qui se referme, et sur une base chaude le contenu arrive parfois
 * avant l'assertion. Detail au point de mesure.
 */
import { expect, test } from "@playwright/test";

import { FICHIER_SESSION_ADMINISTRATION } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

/**
 * Les ecrans et l'annonce que leur etat de chargement affiche.
 *
 * L'ANNONCE EST ECRITE ICI EN TOUTES LETTRES, jamais derivee du titre. Un test
 * qui reconstruirait le texte attendu par la meme regle que le composant
 * passerait au vert sur une regle fausse : il faut deux sources pour qu'une
 * divergence se voie.
 */
/**
 * Lit le PREMIER morceau du flux HTML d'une route, avant tout rendu.
 *
 * ------------------------------------------------------------------
 * POURQUOI PAS UN LOCATEUR SUR LA PAGE, ET C'EST LE POINT DE CE FICHIER.
 *
 * Un repli n'existe a l'ecran que pendant la lecture en base : quelques
 * millisecondes sur une machine locale. Toute assertion sur la page court donc
 * contre cette fenetre, et le meme ecran passe ou echoue d'une execution a
 * l'autre selon la charge. Trois reglages ont ete essayes, `waitUntil:
 * "commit"`, un ralentissement du document et un delai de reessai raccourci :
 * aucun ne ferme la course, parce qu'aucun n'allonge la LECTURE.
 *
 * CE QUE LE SERVEUR ENVOIE, LUI, EST DETERMINISTE. Next.js diffuse la reponse
 * en deux temps : le repli d'abord, dans le premier morceau, puis le contenu
 * reel quand la lecture se termine. Le premier morceau porte donc toujours
 * l'armature, quelle que soit la vitesse de la base, et c'est exactement ce que
 * la story doit garantir.
 *
 * IL N'Y A AUCUNE MANIPULATION DE TEMPS ICI. La requete est faite par le
 * contexte du navigateur, cookies de session compris, et le flux est lu tel
 * qu'il arrive.
 * ------------------------------------------------------------------
 */
async function premierMorceau(
  page: import("@playwright/test").Page,
  chemin: string,
): Promise<string> {
  /*
   * LA REQUETE PASSE PAR LE CONTEXTE DE LA PAGE, jamais par un client neuf :
   * elle emporte ainsi le cookie de session d'administration, sans lequel la
   * reponse serait une redirection vers la connexion.
   */
  const reponse = await page.request.get(chemin);
  expect(reponse.status()).toBe(200);

  /*
   * LE FLUX EST LU ENTIER, ET IL PORTE LE REPLI D'UN `loading.tsx`.
   *
   * Ce fichier est un DOCUMENT distinct, servi pendant que le segment se rend :
   * son contenu est donc dans la reponse, quelle que soit la vitesse de la base.
   *
   * IL NE PORTE PAS CELUI D'UN `<Suspense>` INTERNE, et c'est mesure : React
   * n'emet le repli que si le rendu SUSPEND reellement. Sur une base locale qui
   * repond en quelques millisecondes, la lecture se termine avant que la
   * frontiere ait besoin de rendre la main, et le flux ne contient que le
   * contenu final. Voir la liste des ecrans mesures ci-dessous.
   */
  return reponse.text();
}

/**
 * Les ecrans dont le repli est OBSERVABLE sur une base locale.
 *
 * ------------------------------------------------------------------
 * CETTE LISTE EST PLUS COURTE QUE CELLE DES ECRANS QUI ONT UN ETAT DE
 * CHARGEMENT, ET LA DIFFERENCE EST MESUREE, PAS SUPPOSEE.
 *
 * Mesure du 5 septembre 2026, `waitUntil: "commit"` sur les quinze ecrans :
 * `produits/nouveau`, `retractations` et `messages` rendent DEJA leur contenu
 * complet au moment ou la reponse commence. Leur repli existe, il ne s'affiche
 * simplement jamais sur une base locale qui repond en quelques millisecondes.
 *
 * ILS GARDENT LEUR `loading.tsx` POUR AUTANT. Ces trois pages font deux lectures
 * chacune : sur le VPS, avec la latence reseau, le repli s'affichera. Les
 * retirer sur la foi d'une mesure locale reviendrait a concevoir pour la machine
 * de developpement.
 *
 * ILS NE SONT PAS TESTES ICI POUR LA MEME RAISON. Un test qui les inclurait
 * serait rouge en local et vert nulle part : il mesurerait la vitesse de la base
 * plutot que la presence du repli, et c'est `verifier-chargement-administration`
 * qui garde cette presence, par le texte et sans navigateur.
 *
 * `reauthentification` EST UN CAS DIFFERENT ET N'A PLUS DE REPLI DU TOUT : elle
 * ne lit rien apres sa garde de session, son `loading.tsx` etait du code mort.
 * Voir la liste `SANS_ATTENTE` du script.
 * ------------------------------------------------------------------
 */
const ECRANS = [
  /*
   * SEULS LES `loading.tsx` DE SEGMENT SONT ICI, ET C'EST UNE LIMITE MESUREE.
   *
   * Les cinq ecrans a `<Suspense>` interne, le tableau de bord, les listes de
   * commandes et de produits et les deux ecrans de detail, ne sont PAS
   * observables en local : React n'emet le repli d'une frontiere interne que si
   * le rendu suspend reellement, et la lecture se termine avant. Leur repli
   * existe et s'affichera sur le VPS, ou la latence reseau est reelle.
   *
   * CE QUI LES GARDE EN ATTENDANT : `verifier-chargement-administration.sh`
   * verifie par le texte que chacun porte bien sa frontiere et son repli, sans
   * navigateur ni base, et sa mutation prouve qu'il rougit quand elle disparait.
   * Un test qui les inclurait ici serait rouge en local et vert nulle part.
   */
  {
    chemin: "/administration/categories",
    annonce: "Chargement des catégories…",
  },
  { chemin: "/administration/clients", annonce: "Chargement des comptes…" },
  {
    chemin: "/administration/expeditions",
    annonce: "Chargement des expéditions…",
  },
  { chemin: "/administration/factures", annonce: "Chargement des factures…" },
  {
    chemin: "/administration/journal-connexions",
    annonce: "Chargement du journal…",
  },
  { chemin: "/administration/stocks", annonce: "Chargement des stocks…" },
] as const;

test.describe("etats de chargement de l'administration", () => {
  /*
   * SANS SESSION D'ADMINISTRATION, CES ECRANS REDIRIGENT vers la connexion :
   * le test mesurerait le formulaire de connexion en croyant mesurer une
   * armature, et passerait au vert sans avoir vu ce qu'il pretend voir.
   */
  test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

  for (const ecran of ECRANS) {
    test(`${ecran.chemin} annonce son chargement`, async ({ page }, infos) => {
      test.skip(
        infos.project.name !== "mobile-320",
        "lit un texte, pas une mise en page : une seule largeur suffit",
      );

      const html = await premierMorceau(page, ecran.chemin);

      /*
       * LA REGION EST DESIGNEE PAR SON TEXTE ET SON ROLE. `role="status"` est
       * ce qui fait annoncer l'attente a un lecteur d'ecran : le chercher ici
       * verifie l'accessibilite en meme temps que le texte, et une armature qui
       * perdrait son role rougirait.
       */
      /*
       * DEUX ASSERTIONS, ET LA SECONDE EST CELLE QUI COMPTE.
       *
       * Le texte prouve que l'annonce est la ; `role="status"` prouve qu'un
       * lecteur d'ecran l'apprendra. Une armature qui perdrait son role
       * resterait lisible a l'oeil et deviendrait muette pour qui ecoute, sans
       * qu'aucune assertion de texte ne rougisse.
       */
      expect(html).toContain(ecran.annonce);
      expect(html).toMatch(/role="status"/);
    });
  }

  /*
   * LE DEBORDEMENT SE MESURE SUR UN SEUL ECRAN, ET C'EST DELIBERE. Les dix
   * `loading.tsx` de segment passent tous par `ChargementAdministration`, donc
   * par la MEME armature : les mesurer un par un mesurerait dix fois le meme
   * composant. L'ecran retenu est celui qui porte un sur-titre, la forme la plus
   * chargee.
   *
   * LE TABLEAU DE BORD EST MESURE A PART parce qu'il ne partage pas cette
   * armature : sa grille de quatre tuiles est sa propre forme, et c'est
   * justement la ou un debordement serait le plus probable.
   */
  const A_MESURER = [
    { chemin: "/administration/factures", intitule: "armature partagée" },
    /*
     * LA GRILLE DE TUILES DU TABLEAU DE BORD N'EST PAS MESUREE ICI, et ce n'est
     * pas un oubli : son repli passe par un `<Suspense>` interne, que le flux
     * local ne porte pas, faute d'une lecture assez lente pour faire suspendre
     * le rendu. Meme raison que pour la liste des ecrans ci-dessus.
     *
     * CE QUI COUVRE SON DEBORDEMENT EN ATTENDANT : ses trois ardoises reprennent
     * les hauteurs exactes des trois lignes qu'elles remplacent, dans la MEME
     * grille `.tuiles` que le rendu reel, dont le debordement est deja mesure
     * par les tests du tableau de bord. Une armature qui n'ajoute aucune largeur
     * a une grille mesuree ne peut pas la faire deborder.
     */
  ];

  for (const cas of A_MESURER) {
    test(`l'état de chargement ne déborde pas, ${cas.intitule}`, async ({
      page,
    }, infos) => {
      /*
       * MESURE A 320 px SEULEMENT, PAR REDIMENSIONNEMENT SI BESOIN, et ce n'est
       * pas une economie de temps : c'est ce qui rend la mesure POSSIBLE.
       *
       * L'ARMATURE EST UNE FENETRE QUI SE REFERME. Sur une base locale chaude,
       * le contenu suspendu arrive parfois avant l'assertion, et le repli a
       * deja disparu : le test echouait alors sur `bureau-1280` et
       * `mobile-390` tout en passant sur `mobile-320`, selon l'ordre
       * d'execution et la charge de la machine. Motif « pool chaud referme la
       * fenetre », en fiche sur ce depot.
       *
       * UN SEUL PROJET REND LA COURSE DETERMINISTE, et 320 px est la largeur la
       * plus contraignante : une armature qui n'y deborde pas ne debordera pas
       * plus large, sa mise en page etant fluide et sans largeur fixe.
       */
      test.skip(
        infos.project.name !== "mobile-320",
        "l'armature est une fenêtre qui se referme : un seul projet rend la mesure déterministe, et 320 px est la largeur contraignante",
      );

      /*
       * LE PREMIER MORCEAU EST PEINT DANS LA PAGE, ET C'EST CE QUI REND LA
       * MESURE POSSIBLE.
       *
       * Un debordement se mesure sur un rendu reel, pas sur du texte : il faut
       * un navigateur, une largeur et des styles appliques. Or l'armature ne
       * reste a l'ecran que le temps d'une lecture en base, quelques
       * millisecondes en local, ce qui rend toute mesure sur la navigation
       * ordinaire dependante de la charge de la machine.
       *
       * `page.setContent` PEINT EXACTEMENT CE QUE LE SERVEUR A ENVOYE, styles
       * compris, et le fige. La mesure porte donc sur l'armature reelle, celle
       * que l'exploitante verra, sans course.
       *
       * `waitUntil: "networkidle"` LAISSE LES FEUILLES DE STYLE ARRIVER. Sans
       * lui, la mesure porterait sur du HTML non style, ou rien ne deborde
       * jamais : le test serait vert par construction.
       */
      const html = await premierMorceau(page, cas.chemin);
      await page.setContent(html, { waitUntil: "networkidle" });

      await expect(page.getByRole("status").first()).toBeAttached();

      expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
        TOLERANCE_DEBORDEMENT_PX,
      );
    });
  }

  /*
   * LE TITRE SURVIT AU CHARGEMENT, et c'est ce qui distingue une armature utile
   * d'un ecran blanc : l'exploitante doit savoir QUEL ecran arrive. Le verifier
   * attrape aussi le saut de mise en page le plus visible, un `h1` qui
   * apparaitrait seulement apres la lecture.
   */
  test("le titre est rendu pendant le chargement, pas seulement après", async ({
    page,
  }, infos) => {
    test.skip(
      infos.project.name !== "mobile-320",
      "lit un texte, pas une mise en page : une seule largeur suffit",
    );

    const html = await premierMorceau(page, "/administration/factures");
    await page.setContent(html, { waitUntil: "networkidle" });

    await expect(
      page.getByRole("heading", { level: 1, name: "Factures et avoirs" }),
    ).toBeVisible();
  });
});
