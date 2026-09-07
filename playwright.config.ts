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
 * TROIS TAILLES ET NON UNE. Le projet est concu a partir de 320 px, largeur
 * imposee par CLAUDE.md. Un test de bout en bout qui ne s'executerait qu'en
 * 1280 px laisserait passer exactement le defaut que cette contrainte vise.
 */
import { defineConfig, devices } from "@playwright/test";

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
    command: `node scripts/engendrer-medias-test.mjs && npm run build && npx next start --port ${PORT}`,
    url: URL_BASE,
    reuseExistingServer: !process.env.CI,
    // Une construction Next.js complete depasse largement le delai par defaut.
    timeout: 180_000,
    env: {
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
