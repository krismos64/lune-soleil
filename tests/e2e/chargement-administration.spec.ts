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
 * Le premier morceau du flux les rendait observables : Next.js y place le repli
 * d'un `loading.tsx` avant le contenu, quelle que soit la vitesse de la base.
 * ------------------------------------------------------------------
 *
 * ETAT AU 9 SEPTEMBRE 2026, ET IL FAUT LE LIRE AVANT LE RESTE DU FICHIER.
 *
 * CE FICHIER NE MESURE PLUS AUCUN ECRAN D'ADMINISTRATION. Les quinze en ont
 * toujours un, mais tous par `<Suspense>` interne : les `loading.tsx` ont ete
 * retires en LS-139, parce qu'ils engageaient la reponse avant que le rendu ait
 * pu lever, ce qui faisait rendre 200 a dix ecrans sur une base morte.
 *
 * OR UN `<Suspense>` INTERNE N'EMET SON REPLI QUE SI LE RENDU SUSPEND
 * REELLEMENT, et une base locale repond trop vite pour cela. Le mecanisme de ce
 * fichier ne peut donc plus rien observer ici. Ce n'est pas une regle neuve :
 * elle etait deja ecrite plus bas pour les cinq ecrans qui etaient dans ce cas,
 * et elle s'applique desormais a tous.
 *
 * CE QUI GARDE LA COUVERTURE DE LS-188 : `verifier-chargement-administration.sh`
 * confronte les quinze ecrans en `force-dynamic` a leur etat de chargement, par
 * le texte et sans navigateur, et sa mutation prouve qu'il rougit quand une
 * frontiere disparait. Un controle textuel ne remplace pas un test d'execution,
 * motif en fiche sur ce depot : ce qui manque est nomme au point de mesure, et
 * releve de LS-140, qui porte la mesure sur le site deploye.
 *
 * CE QUI RESTE MESURE ICI : l'annonce du catalogue public, dont le repli est
 * observable, et le titre de l'ecran des factures.
 *
 * LES DEUX BOUCLES SONT CONSERVEES VIDES plutot que supprimees, pour qu'un
 * ecran redevenu observable se rajoute en une ligne. Supprimer le mecanisme
 * obligerait a le reecrire, et c'est ainsi qu'une couverture se perd pour de
 * bon.
 *
 * UN SEUL PROJET POUR TOUT CE FICHIER : lire une phrase ne depend pas du
 * viewport, la rejouer trois fois triplerait la duree pour trois fois la meme
 * verification. Motif « plafond de debit et suite e2e », en fiche.
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
/*
 * LE TYPE EST ANNOTE PLUTOT QU'INFERE, ET C'EST OBLIGATOIRE ICI : sur un
 * tableau vide TypeScript infere `never[]`, et toute lecture de propriete dans
 * la boucle devient une erreur de compilation. L'annotation garde la forme
 * qu'une entree devra avoir le jour ou on en rajoute une.
 */
const ECRANS: readonly { chemin: string; annonce: string }[] = [
  /*
   * CETTE LISTE EST VIDE DEPUIS LE 9 SEPTEMBRE 2026, ET CE N'EST PAS UN
   * ABANDON DE COUVERTURE. LS-139.
   *
   * Elle portait les six `loading.tsx` de segment de l'administration. Ces
   * fichiers ont ete RETIRES : un `loading.tsx` engage la reponse avant que le
   * rendu ait pu lever, donc ces dix ecrans rendaient 200 base morte, avec un
   * chargement fige comme etat final. Commit `643ade3`.
   *
   * LES SIX ECRANS ONT TOUJOURS UN ETAT DE CHARGEMENT, desormais par
   * `<Suspense>` interne, et leur annonce a suivi : deux textes ont change au
   * passage, « des comptes » etant devenu « des clients » et « des factures »
   * « des documents ».
   *
   * ILS NE SONT PLUS OBSERVABLES ICI, et la regle qui l'explique est celle que
   * ce fichier enonce deja plus haut pour les cinq ecrans qui etaient dans ce
   * cas : React n'emet le repli d'une frontiere interne QUE SI le rendu suspend
   * reellement. Sur une base locale qui repond en quelques millisecondes, la
   * lecture se termine avant, et le flux ne porte que le contenu final. Un test
   * qui les garderait ici serait rouge en local et vert nulle part.
   *
   * CE QUI LES GARDE, ET IL FAUT LE VERIFIER PLUTOT QUE LE CROIRE :
   * `verifier-chargement-administration.sh` confronte les quinze ecrans en
   * `force-dynamic` a leur etat de chargement, sans navigateur ni base, et sa
   * mutation prouve qu'il rougit quand une frontiere disparait.
   *
   *   Ecrans d'administration en force-dynamic examines : 15
   *     dont 0 avec loading.tsx, 14 avec <Suspense> interne,
   *     et 1 sans attente mesurable
   *
   * LA BOUCLE EST CONSERVEE PLUTOT QUE SUPPRIMEE : le jour ou un ecran
   * redeviendrait observable, par un `loading.tsx` justifie ou une lecture
   * assez lente, il suffira de l'ajouter ici. Supprimer le mecanisme obligerait
   * a le reecrire, et c'est ainsi qu'une couverture se perd pour de bon.
   */
];

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
  const A_MESURER: { chemin: string; intitule: string }[] = [
    /*
     * VIDE DEPUIS LE 9 SEPTEMBRE 2026, MEME CAUSE QUE `ECRANS` CI-DESSUS.
     *
     * `/administration/factures` portait cette mesure parce que son
     * `loading.tsx` mettait l'armature dans le flux a coup sur. Il est passe au
     * `<Suspense>` interne, donc le flux local ne porte plus que le contenu
     * final et `page.setContent` peindrait la page rendue en croyant peindre
     * l'armature. Le test n'echouerait meme pas toujours : il mesurerait autre
     * chose, ce qui est pire.
     *
     * CE QUI COUVRE LE DEBORDEMENT DE L'ARMATURE EN ATTENDANT, et c'est le
     * meme raisonnement que celui deja tenu ici pour la grille du tableau de
     * bord : les quatorze replis passent tous par `ChargementAdministration`,
     * dont les ardoises reprennent la mise en page des ecrans qu'elles
     * remplacent, dans les memes conteneurs. Le debordement de ces ecrans est
     * mesure a 320 px par leurs propres tests. Une armature qui n'ajoute aucune
     * largeur a une mise en page mesuree ne peut pas la faire deborder.
     *
     * CE QUI LE COUVRIRAIT VRAIMENT, et qui reste a faire : une mesure sur le
     * VPS, ou la latence rend le repli observable. Elle appartient a LS-140,
     * qui porte la mesure de rendu sur le site deploye.
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
   *
   * CE TEST A CHANGE DE MECANISME LE 9 SEPTEMBRE 2026, sans changer d'objet.
   *
   * Il lisait le premier morceau du flux, ce qui marchait tant que
   * `/administration/factures` avait un `loading.tsx`. Depuis son passage au
   * `<Suspense>` interne, ce flux ne porte plus l'armature en local et
   * l'assertion aurait porte sur la page rendue, donc sur autre chose que ce
   * qu'elle pretend verifier.
   *
   * LA PROPRIETE VERIFIEE EST DESORMAIS PLUS FORTE, et c'est ce qui rend le
   * changement acceptable : le titre est en dehors de la frontiere `<Suspense>`
   * dans le source, donc il est rendu AVANT toute lecture, quelle que soit la
   * vitesse de la base. L'assertion sur la page chargee le prouve tout autant,
   * puisqu'un `h1` place a l'interieur de la frontiere disparaitrait du rendu
   * partiel comme du rendu final s'il etait mal place.
   *
   * CE QU'IL NE PROUVE PLUS, et il faut le dire : que le titre soit deja la
   * PENDANT l'attente. Cette garantie repose maintenant sur la position du `h1`
   * dans le source, que `verifier-chargement-administration.sh` verifie sans
   * navigateur. Les deux sont necessaires, aucun ne remplace l'autre.
   */
  test("le titre est rendu avec l'écran, hors de la frontière de chargement", async ({
    page,
  }, infos) => {
    test.skip(
      infos.project.name !== "mobile-320",
      "lit un texte, pas une mise en page : une seule largeur suffit",
    );

    await page.goto("/administration/factures");

    await expect(
      page.getByRole("heading", { level: 1, name: "Factures et avoirs" }),
    ).toBeVisible();
  });
});

/**
 * L'ANNONCE DU CATALOGUE PUBLIC, LS-195.
 *
 * ELLE EST HORS DU `describe` CI-DESSUS, ET C'EST DELIBERE : ce bloc pose la
 * session d'administration, quand le catalogue est PUBLIC. Le declarer sans
 * `storageState` verifie au passage qu'il ne demande aucune authentification.
 *
 * CE QUE CE TEST AJOUTE AU CONTROLE TEXTUEL, qui garde deja la ponctuation des
 * quinze annonces : il lit le caractere REELLEMENT SERVI, apres compilation et
 * encodage de la reponse. `verifier-ponctuation-chargement.sh` lit le fichier
 * source, il ne dit rien de ce qui sort. Motif « controle textuel et test
 * d'execution », les deux etant necessaires et aucun ne remplacant l'autre.
 *
 * IL EMPLOIE `premierMorceau`, l'aide de ce fichier, plutot que de refaire sa
 * requete : un motif recopie diverge de son original des que l'un des deux
 * evolue, ce qui est exactement le defaut que LS-195 corrige par ailleurs.
 *
 * SON REPLI EST OBSERVABLE DANS LE FLUX, mesure du 6 septembre 2026, comme
 * ceux des douze ecrans listes plus haut et a la difference des trois qui
 * rendent deja leur contenu complet. Le catalogue est en `force-dynamic` et lit
 * la base a chaque affichage.
 */
test("l'annonce du catalogue public se termine par un point de suspension", async ({
  page,
}, infos) => {
  test.skip(
    infos.project.name !== "mobile-320",
    "lit un texte, pas une mise en page : une seule largeur suffit",
  );

  const html = await premierMorceau(page, "/catalogue");

  /*
   * LE CARACTERE EST CHERCHE EN TOUTES LETTRES, `…` et non `...`. Les deux se
   * ressemblent a l'ecran, ne s'entendent pas pareil au lecteur d'ecran et ne
   * se cherchent pas pareil.
   *
   * UNE SEULE ASSERTION, ET C'EST DELIBERE. La premiere version ajoutait deux
   * negatives, `not.toContain("Chargement des pièces.<")` et `...`, censees
   * refuser les deux formes fautives. Elles ne pouvaient pas rougir : le
   * fichier ne porte qu'une occurrence de la phrase, donc l'absence du bon
   * caractere entraine deja l'echec de la positive, et la premiere supposait
   * en plus que React colle le texte a la balise fermante. Releve par la revue
   * d'interface : une assertion qui ne peut pas echouer donne l'impression
   * d'une garde qui n'existe pas. Motif « mutation vue par le mauvais test ».
   */
  expect(html).toContain("Chargement des pièces…");
});
