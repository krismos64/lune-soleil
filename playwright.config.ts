/**
 * Configuration Playwright, LS-68.
 *
 * PORTEE ACTUELLE. Le site porte la page d'attente, l'administration du
 * catalogue et, depuis LS-104, le CATALOGUE PUBLIC. La fiche produit appartient
 * a LS-105 et le tunnel d'achat a la phase 3 : ces tests ne couvrent donc aucun
 * parcours d'achat, qui n'existe pas encore.
 *
 * `webServer` construit puis demarre l'application avant la suite et l'arrete
 * apres. Un `next dev` serait plus rapide a demarrer mais testerait un rendu
 * different de celui de la production, avec ses avertissements de developpement
 * et sans les optimisations de build.
 *
 * QUATRE TAILLES ET NON UNE. Le projet est concu a partir de 320 px, largeur
 * imposee par CLAUDE.md. Un test de bout en bout qui ne s'executerait qu'en
 * 1280 px laisserait passer exactement le defaut que cette contrainte vise.
 *
 * LES QUATRE SONT CELLES DE L'INVARIANT 10, depuis LS-166 : 320, 390, 768,
 * 1280. La troisieme a manque jusque-la, et c'est precisement la largeur ou les
 * dispositions basculent, voir le projet `tablette-768` plus bas.
 */
import { readFileSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";
import { parse } from "dotenv";

/*
 * LA BASE DE BOUT EN BOUT EST LUE DANS `.env`, LS-189.
 *
 * PAS `process.env.DATABASE_URL_E2E` : ce fichier de configuration est evalue
 * sans que `.env` soit charge, la variable y est donc `undefined`. Un repli
 * `?? ""` transmettait alors une chaine VIDE au sous-processus, qui ECRASE la
 * valeur heritee au lieu de laisser le repli jouer : le build echouait sur
 * « DATABASE_URL absente. La renseigner dans .env ». Mesure du 8 septembre
 * 2026. Motif « valeur par defaut qui ment », deja en fiche sur ce depot.
 *
 * L'ABSENCE DU FICHIER EST UN CAS NOMINAL, celui de l'integration continue : le
 * workflow pose ses variables dans l'environnement, sans `.env`. `undefined`
 * est alors rendu, et la cle est OMISE du bloc `env`, ce qui laisse le
 * sous-processus heriter de la `DATABASE_URL` du workflow.
 */
function baseDeBoutEnBout(): string | undefined {
  try {
    return parse(readFileSync(".env")).DATABASE_URL_E2E || undefined;
  } catch {
    return undefined;
  }
}

const BASE_E2E = baseDeBoutEnBout();

/*
 * LA VARIABLE EST POSEE ICI, POUR LE PROCESSUS PLAYWRIGHT LUI-MEME, LS-189.
 *
 * ------------------------------------------------------------------
 * LE BLOC `env` DE `webServer` NE SUFFIT PAS, et c'est le piege de ce
 * dispositif : il ne gouverne que le SOUS-PROCESSUS du serveur Next.js. Les
 * cinq fichiers `.setup.ts` tournent, eux, dans le processus Playwright, et
 * ouvrent leur PROPRE connexion `pg` sur `process.env.DATABASE_URL`.
 *
 * SANS CETTE LIGNE, LA MOITIE DE LA SUITE ECRIT AILLEURS QUE L'AUTRE. Mesure du
 * 8 septembre 2026 : le serveur servait bien la base de test, pendant que la
 * preparation continuait d'ecrire sur celle de developpement et y echouait sur
 * « duplicate key value violates unique constraint ». La base de test est
 * restee VIDE, ce qui a designe la cause : `SELECT ... FROM utilisateur` y
 * rendait zero ligne apres l'echec.
 * ------------------------------------------------------------------
 *
 * `dotenv` NE REMPLACE PAS UNE VARIABLE DEJA POSEE, verifie par mesure : les
 * `import "dotenv/config"` en tete des preparations n'ecrasent donc pas cette
 * valeur, ils la laissent en place.
 */
if (BASE_E2E) {
  process.env.DATABASE_URL = BASE_E2E;
}

const PORT = 3100;
const URL_BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",

  // Aucun test ignore, aucun test en attente : LS-68 l'exige, et `forbidOnly`
  // empeche en plus qu'un `test.only` oublie masque toute la suite en
  // integration continue.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  /*
   * LE DELAI D'ASSERTION, LS-201, et pourquoi il ne suffisait pas.
   *
   * Playwright reessaie chaque assertion pendant CINQ secondes par defaut,
   * verifie via Context7. Ce delai est independant de celui du test, trente
   * secondes, et c'est la confusion des deux qui a rendu ces echecs illisibles.
   *
   * ------------------------------------------------------------------
   * CE QUE LA MESURE A MONTRE, le 7 septembre 2026 sur la suite complete.
   *
   * Cinq tests d'administration echouaient sous charge et passaient tous en
   * isolation. Leurs durees nomment le plafond atteint :
   *
   *   5,5 s / 5,3 s / 8,9 s   delai d'ASSERTION, cinq secondes
   *   30,0 s                  delai de TEST, sur un `waitForURL`
   *
   * TOUS VISENT UN ETAT QUI SUIT UN ALLER-RETOUR SERVEUR : une Server Action
   * avec `revalidatePath`, ou une navigation dont le `loading.tsx` remplace le
   * `<main>` le temps du rendu. Cinq secondes suffisent sur une machine au
   * repos ; elles ne suffisent plus quand cinq travailleurs Playwright, un
   * serveur Next.js et PostgreSQL se partagent le processeur.
   *
   * LA MEME SUITE A TOURNE EN 1,7 MIN AU LIEU DE 4 ce jour-la, donc sous une
   * charge machine bien plus forte : c'est ce qui a rendu le defaut visible.
   * ------------------------------------------------------------------
   *
   * CE N'EST PAS UNE ATTENTE AJOUTEE, et la distinction compte. Un
   * `waitForTimeout` fait perdre son delai a CHAQUE execution, qu'il soit
   * necessaire ou non. Un delai d'assertion est un PLAFOND : l'assertion rend
   * la main des que la condition est vraie, donc en quelques millisecondes dans
   * le cas nominal. Elever le plafond ne ralentit pas une suite qui passe, il
   * evite seulement de declarer un echec sur une lenteur.
   *
   * DIX SECONDES, ET NON TRENTE : au-dela, l'echec d'un test reellement casse
   * deviendrait long a obtenir, et le delai de test de trente secondes serait
   * atteint le premier, ce qui rendrait un message moins precis.
   *
   * QUINZE ONT ETE ESSAYEES PUIS ECARTEES : les echecs sont simplement revenus
   * a 15,7 s, 18,7 s et 15,3 s. Un plafond qui deplace le seuil sans rien
   * fermer ne corrige pas, il masque, et c'est ce constat qui a fait chercher
   * la saturation. Voir le bloc `workers` ci-dessous.
   */
  expect: {
    timeout: 10_000,
  },

  /*
   * LE PARALLELISME EST BORNE, LS-201, LA SATURATION ETANT UNE CAUSE MESUREE.
   *
   * ------------------------------------------------------------------
   * PLAYWRIGHT PREND LA MOITIE DES COEURS LOGIQUES par defaut, verifie via
   * Context7, soit CINQ travailleurs sur cette machine. Ce calcul ne connait ni
   * le serveur Next.js ni PostgreSQL, qui tournent pourtant a cote et servent
   * chacune de leurs requetes.
   *
   * MESURE DU 7 SEPTEMBRE 2026 : charge moyenne de 7,59 sur dix coeurs pendant
   * la suite. Les rendus serveur s'allongeaient au point de depasser le delai
   * des assertions, et les tests qui perdaient la course N'ETAIENT JAMAIS LES
   * MEMES d'une execution a l'autre.
   *
   * ELEVER LE DELAI NE CORRIGEAIT PAS, IL DEPLACAIT LE SEUIL. Passe de cinq a
   * quinze secondes, les echecs sont revenus a 15,7 s, 18,7 s et 15,3 s : la
   * meme cause, mesuree plus haut. C'est ce qui a fait chercher la saturation
   * plutot qu'un enieme plafond.
   *
   * TROIS TRAVAILLEURS laissent de la marge au serveur et a la base. La suite
   * s'allonge de quelques dizaines de secondes, ce qui est sans commune mesure
   * avec le cout d'un controle nocturne qui rougit sans raison : LS-199 a
   * repare l'alerte, un bruit permanent la rendrait a nouveau inutile.
   *
   * CE REGLAGE N'A PAS SUFFI SUR LA MACHINE DE DEVELOPPEMENT, et il faut le
   * dire : avec trois travailleurs, des echecs subsistent, toujours au plafond
   * quel qu'il soit. La charge y est de 4,48 AU REPOS, Playwright arrete, les
   * outils de developpement consommant deja la moitie des coeurs. Une mesure
   * faite dans ces conditions calibre sur du bruit.
   *
   * LA REFERENCE EST DONC LA CHAINE D'INTEGRATION, sur executeur dedie. Ces
   * memes tests passent tous en isolation, et le defaut PRODUIT qu'ils ont
   * permis de trouver, la revalidation du layout, est corrige a la source.
   *
   * DEUX EN INTEGRATION CONTINUE, ou l'executeur GitHub est plus modeste que
   * cette machine et n'a aucune raison de mieux encaisser cinq travailleurs.
   * ------------------------------------------------------------------
   *
   * LE DELAI D'ASSERTION EST REDESCENDU A DIX SECONDES pour la meme raison :
   * une fois la saturation levee, un plafond eleve ne protege plus de rien et
   * rend seulement l'echec d'un test reellement casse long a obtenir. Dix
   * secondes couvrent un aller-retour serveur normal avec une marge nette.
   */
  workers: process.env.CI ? 2 : 3,

  use: {
    baseURL: URL_BASE,
    trace: "on-first-retry",
  },

  projects: [
    /*
     * PREPARATION : une seule inscription par session, pour toute la suite.
     * LS-81, LS-89, LS-111.
     *
     * Les tests de l'ecran de suppression exigent une session cliente, et aucun
     * ecran de connexion client n'existe encore, LS-54. Les faire s'inscrire
     * eux-memes consommait le plafond de `/sign-up/email`, trois par minute et
     * par IP, multiplie par les trois largeurs : un test VOISIN,
     * `connexion-administration`, recevait alors 429 la ou il attend 401.
     *
     * DEUX SESSIONS DISTINCTES ET NON UNE. LS-111 ajoute une session
     * d'ADMINISTRATION, qui ne peut pas se confondre avec la precedente : les
     * fichiers qui verifient qu'un visiteur ordinaire est refuse sur un ecran
     * protege ont besoin d'une session SANS le role. Promouvoir la session
     * cliente les ferait passer pour la mauvaise raison.
     *
     * TROIS SESSIONS DEPUIS LS-56. `session-verifiee.setup.ts` ouvre un compte
     * VERIFIE, qui ne peut pas se confondre avec la session cliente : celle-ci
     * est volontairement NON verifiee, et c'est ce qui permet a
     * `compte-authentification` de mesurer le rappel de verification. Les deux
     * etats sont mutuellement exclusifs a l'ecran.
     *
     * ------------------------------------------------------------------
     * LA MARGE DU PLAFOND N'EST PLUS NULLE, LS-168, et cet avertissement
     * remplace celui qui l'annoncait.
     *
     * `/sign-up/email` accepte TROIS appels par minute et par IP. La suite en
     * consommait SEPT a chaque execution : une par preparation de session, plus
     * six dans `compte-profil.spec.ts`, qui inscrivait deux fois par largeur.
     * La parade etait un reessai espace de 21 secondes, qui REPARTIT la
     * consommation sans la supprimer et echouait quand meme sous charge.
     *
     * TOUTES LES ADRESSES DE TEST SONT DESORMAIS FIXES, et les comptes
     * reutilises d'une execution a l'autre par les memes TROIS PALIERS partout :
     * reutiliser l'etat, sinon se connecter, sinon s'inscrire. Motif pose par
     * LS-111, etendu par LS-113, generalise par LS-168.
     *
     * EN REGIME ETABLI, UNE EXECUTION FAIT ZERO INSCRIPTION. Les trois places
     * par minute restent donc entierement disponibles.
     *
     * LE SEUL CAS QUI INSCRIT EST LA BASE NEUVE, celle de la CI a chaque
     * execution, et il demandait un traitement propre : neuf comptes a creer,
     * dont six pour `compte-profil`, quand trois places sont disponibles par
     * minute. Mesure du 7 septembre 2026 sans ce traitement, sur base ou les
     * comptes manquaient : « Too many requests », trois echecs, et l'execution
     * suivante pire que la premiere.
     *
     * `comptes-profil.setup.ts` amorce donc ces six comptes ICI, dans le projet
     * `preparation`, qui est SEQUENTIEL et UNIQUE : c'est le seul endroit du
     * dispositif ou des inscriptions peuvent etre espacees sans que l'attente
     * soit multipliee par les trois largeurs. Il n'attend QUE lorsqu'il inscrit,
     * donc jamais en regime etabli.
     *
     * UNE QUATRIEME SESSION EST REDEVENUE POSSIBLE, a la condition qu'elle
     * suive ce motif : une adresse fixe et les trois paliers. Une adresse
     * horodatee ramenerait le defaut entier.
     * `scripts/verifier-fixtures-e2e.sh` garde cette propriete.
     * ------------------------------------------------------------------
     *
     * NE PAS NEUTRALISER LE PLAFOND EN TEST : il retirerait de la mesure une
     * protection reelle, et la suite ne dirait plus rien du comportement servi
     * en production. C'est la CONSOMMATION qui a baisse, jamais la garde.
     *
     * `testMatch` isole ces fichiers des trois projets de largeur, sans quoi ils
     * s'executeraient quatre fois et le probleme resterait entier.
     */
    {
      name: "preparation",
      testMatch:
        /(session-(cliente|verifiee|administration)|commande|comptes-profil)\.setup\.ts$/,
      /*
       * UN SEUL TRAVAILLEUR POUR TOUTE LA PREPARATION, LS-168, et c'est la
       * condition qui rend l'amorçage possible.
       *
       * PLAYWRIGHT REPARTIT LES FICHIERS D'UN MEME PROJET sur plusieurs
       * travailleurs par defaut : les cinq preparations demarraient donc
       * ENSEMBLE, et leurs inscriptions tombaient dans la meme seconde. Mesure
       * du 7 septembre 2026, AVANT que LS-201 borne le parallelisme global :
       * « Running 3 tests using 3 workers », et
       * `comptes-profil.setup.ts` echouait en 429 des son premier appel, avant
       * meme d'avoir pu espacer quoi que ce soit.
       *
       * J'AVAIS SUPPOSE CE PROJET SEQUENTIEL, il ne l'etait pas. L'espacement
       * ecrit dans `comptes-profil.setup.ts` ne vaut que si rien d'autre
       * n'inscrit en meme temps que lui.
       *
       * LE COUT EST NUL EN REGIME ETABLI : ces preparations ne font alors aucun
       * appel d'authentification et rendent la main en quelques centaines de
       * millisecondes. Les trois projets de LARGEUR, eux, gardent tout le
       * parallelisme, ce reglage ne portant que sur ce projet.
       */
      fullyParallel: false,
      workers: 1,
    },
    {
      name: "mobile-320",
      testIgnore:
        /(session-(cliente|verifiee|administration)|commande|comptes-profil)\.setup\.ts$/,
      dependencies: ["preparation"],
      use: {
        ...devices["Desktop Chrome"],
        // 320 px, la largeur de reference du projet. Aucun appareil predefini
        // de Playwright ne descend aussi bas, d'ou la taille explicite.
        viewport: { width: 320, height: 640 },
      },
    },
    {
      name: "mobile-390",
      testIgnore:
        /(session-(cliente|verifiee|administration)|commande|comptes-profil)\.setup\.ts$/,
      dependencies: ["preparation"],
      use: {
        ...devices["Desktop Chrome"],
        // 390 px avec le moteur de Chrome, et NON le profil « iPhone 14 » de
        // Playwright, qui embarque WebKit. Ces trois projets verifient des
        // LARGEURS, pas des moteurs de rendu : ajouter WebKit et Firefox
        // alourdirait l'integration continue de LS-69 d'un telechargement de
        // navigateur par execution sans rien prouver de plus sur le
        // dimensionnement. Une couverture multi-moteurs se decidera quand une
        // interface reelle existera, phase 2.
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      /*
       * 768 px, LA LARGEUR DE BASCULE, LS-166.
       *
       * ------------------------------------------------------------------
       * ELLE MANQUAIT DEPUIS LE DEBUT DU PROJET. `CLAUDE.md` enonce quatre
       * largeurs a l'invariant 10, « 320 px, puis 390, 768, 1280 », et
       * `frontend-design.md` les reprend : trois seulement etaient mesurees.
       *
       * C'EST LA OU LES DISPOSITIONS CHANGENT DE FORME, et le depot en porte
       * la preuve : `layout.module.css`, `navigation-administration.module.css`
       * et `navigation-espace-client.module.css` basculent tous sur
       * `min-width: 768px`. Une pile devient deux colonnes, la barre laterale
       * passe de repliee a permanente. Aucun test ne voyait ce basculement.
       *
       * NI 390 NI 1280 NE LE COUVRENT. Un contenu qui tient empile a 390 et en
       * trois colonnes a 1280 peut se briser en deux colonnes trop etroites
       * ici, sans qu'aucune des deux autres largeurs ne le montre.
       * ------------------------------------------------------------------
       *
       * 768 EST INCLUS DANS LA DISPOSITION LARGE, `min-width: 768px` etant
       * inclusif. `navigation-administration.spec.ts` compare `largeur < 768`
       * et attend donc ici la barre PERMANENTE : les deux coincident, ce qui a
       * ete verifie avant d'ajouter ce projet plutot que constate apres.
       *
       * PAS DE `isMobile`, contrairement a `mobile-390` : a cette largeur on
       * vise la tablette et le petit portable, ou le survol existe. L'activer
       * changerait le mode de saisie sans rapport avec la largeur mesuree.
       */
      name: "tablette-768",
      testIgnore:
        /(session-(cliente|verifiee|administration)|commande|comptes-profil)\.setup\.ts$/,
      dependencies: ["preparation"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "bureau-1280",
      testIgnore:
        /(session-(cliente|verifiee|administration)|commande|comptes-profil)\.setup\.ts$/,
      dependencies: ["preparation"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],

  webServer: {
    /*
     * LES MEDIAS DE TEST SONT ENGENDRES AVANT LE BUILD, LS-187, et cet ordre
     * n'est pas negociable : `next build` COPIE `public/` dans
     * `.next/standalone/public/`, et `next start` sert cette copie. Un fichier
     * cree apres le build est invisible, mesure le 6 septembre 2026.
     *
     * `public/medias/` etant ignore par git, sans cette etape les sept URL du
     * catalogue rendent 404 sur tout executeur neuf, la CI comprise.
     */
    /*
     * LA BASE DE TEST EST PREPAREE AVANT LE BUILD, LS-189, et l'ordre importe :
     * `next build` execute du code applicatif qui ouvre des connexions, il ne
     * doit pas trouver la base absente.
     */
    command: `./scripts/preparer-base-e2e.sh && node scripts/engendrer-medias-test.mjs && npm run build && npx next start --port ${PORT}`,
    url: URL_BASE,
    reuseExistingServer: !process.env.CI,
    // Une construction Next.js complete depasse largement le delai par defaut.
    timeout: 180_000,
    env: {
      /*
       * LA SUITE TOURNE SUR SA PROPRE BASE, LS-189, ET C'EST LA LIGNE QUI
       * FERME LE DEFAUT.
       *
       * ------------------------------------------------------------------
       * LE DEFAUT. La preparation promeut `e2e-administration@exemple.test` en
       * ADMINISTRATRICE, et l'index partiel `utilisateur_administratrice_unique`
       * n'admet QU'UNE ligne portant ce role, regle E1. Sur la base de
       * developpement, le compte REEL de l'exploitante occupe cette place :
       *
       *   error: duplicate key value violates unique constraint
       *          "utilisateur_administratrice_unique"
       *
       * La preparation echouait avant tout test et Playwright marquait la suite
       * entiere « did not run ». Mesure du 5 septembre 2026 en livrant LS-180,
       * reproduite le 8 septembre : echec en 189 ms.
       *
       * POURQUOI PAS UNE CLAUSE SQL PLUS LARGE. La retrogradation de
       * `session-administration.setup.ts` ne vise que le prefixe `e2e-`, et
       * cette etroitesse PROTEGE le compte reel : un `UPDATE` sans clause lui
       * retirerait son role en silence. Elargir fermerait un defaut en ouvrant
       * celui que le garde-fou existant empeche.
       *
       * L'ISOLEMENT EST DONC STRUCTUREL : aucune requete de la suite n'atteint
       * la base qui porte le compte reel, quelle que soit la clause qu'un futur
       * ticket ecrira. Critere 2 de LS-189, tenu par construction.
       * ------------------------------------------------------------------
       *
       * ELLE VAUT POUR LE SERVEUR **ET** POUR LES PREPARATIONS. Les cinq
       * fichiers `.setup.ts` ouvrent leur propre connexion `pg` sur
       * `process.env.DATABASE_URL` : `dotenv` ne remplace pas une variable deja
       * posee, VERIFIE PAR MESURE et non suppose, donc la valeur exportee ici
       * les gouverne aussi. Les deux moities de la suite lisent la meme base,
       * ce que `verifier-base-e2e.sh` garde.
       *
       * LA CLE EST OMISE quand `.env` ne porte pas la variable, cas de
       * l'integration continue : le sous-processus herite alors de la
       * `DATABASE_URL` du workflow, dont le PostgreSQL est vierge a chaque
       * execution et ne porte donc aucun compte reel a proteger.
       *
       * OMETTRE ET NON POSER UNE CHAINE VIDE. Un repli `?? ""` transmettait une
       * valeur vide qui ECRASAIT celle du workflow, et le build echouait sur
       * « DATABASE_URL absente ». Mesure du 8 septembre 2026.
       */
      ...(BASE_E2E ? { DATABASE_URL: BASE_E2E } : {}),
      /*
       * BETTER_AUTH_URL DOIT DESIGNER LE SERVEUR REELLEMENT SERVI, LS-70.
       *
       * Better Auth derive ses origines de confiance de `baseURL` et rejette
       * toute requete venue d'ailleurs, protection CSRF. Sans cette ligne, la
       * valeur de `.env` designe le port 3000 quand Playwright sert sur 3100 :
       * chaque tentative de connexion est refusee en « Invalid origin » AVANT
       * la verification des identifiants.
       *
       * Le test de connexion en echec passait alors au vert POUR LA MAUVAISE
       * RAISON, un refus d'origine et non un refus d'identifiants. Un test qui
       * verdit sans exercer le chemin qu'il pretend couvrir ne prouve rien.
       *
       * Le secret n'est pas repris ici : il vient de `.env`, dont ce processus
       * herite, et sa presence est exigee au demarrage par `src/lib/auth.ts`.
       */
      BETTER_AUTH_URL: URL_BASE,
      /*
       * NEXT_PUBLIC_SITE_URL DOIT DESIGNER LE MEME SERVEUR, LS-137, et pour un
       * motif jumeau de celui du dessus.
       *
       * Elle porte `metadataBase`, donc la resolution de TOUTES les URL
       * canoniques. Heritee de `.env`, elle designerait le port 3000 quand
       * Playwright sert sur 3100 : les canoniques seraient construits sur une
       * adresse que la suite n'interroge jamais.
       *
       * LA SUITE PASSERAIT QUAND MEME EN GRANDE PARTIE, ce qui est le piege :
       * un test qui verifie la seule PRESENCE d'un canonical ne verrait rien.
       * `tests/e2e/referencement.spec.ts` compare la valeur exacte, il rougirait
       * donc, et le premier reflexe serait d'assouplir le test plutot que de
       * corriger la configuration.
       *
       * ELLE EST AUSSI REQUISE POUR DEMARRER : `lib/seo.ts` leve sur son
       * absence, plutot que de replier sur localhost et de sortir le site de
       * l'index en production.
       */
      NEXT_PUBLIC_SITE_URL: URL_BASE,
      /*
       * LE PRESTATAIRE DE PAIEMENT EST ABSENT PENDANT TOUTE LA SUITE, LS-118,
       * et la cle est VIDEE explicitement plutot qu'heritee de `.env` : le jour
       * ou une cle de test y sera posee, LS-18, la suite partirait sinon
       * appeler l'API reelle, non deterministe et hors de son perimetre. Meme
       * situation assumee que le transporteur : le compte n'existe pas, la
       * creation de session echoue proprement, et c'est exactement le cas
       * d'erreur du parcours 1 que la page de confirmation doit couvrir.
       */
      STRIPE_SECRET_KEY: "",
      /*
       * LA ROUTE QUI ECHOUE A DESSEIN EST OUVERTE, LS-191, et UNIQUEMENT ici.
       *
       * `administration/echec-rendu` rend 404 sans cette variable : c'est un
       * defaut ferme, la page n'existe nulle part ailleurs que dans cette suite.
       * Elle est le seul moyen de faire passer une erreur reelle par la vraie
       * frontiere d'erreur, sous le vrai layout, avec la barre de navigation
       * reellement rendue.
       *
       * Le critere 6 de la story refuse une frontiere qu'aucun test ne
       * traverse : « une frontiere qu'aucun test ne traverse est une intention,
       * pas une garantie ».
       *
       * `scripts/verifier-route-echec.sh` garde l'ordre des deux instructions de
       * cette page, et `erreur-administration.spec.ts` verifie qu'elle rend bien
       * 404 quand la variable n'est pas posee.
       */
      AUTORISER_ECHEC_RENDU: "1",
    },
  },
});
