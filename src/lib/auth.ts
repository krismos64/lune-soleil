/**
 * Instance Better Auth, point d'entree unique de l'authentification. LS-70.
 *
 * ADR-021 decide l'administration : passkey principale, mot de passe de secours
 * a seize caracteres. ADR-023 decide les clients : email et mot de passe, une
 * seule instance pour les deux populations, role `CLIENT` par defaut.
 *
 * Verifie via Context7 sur Better Auth 1.6.
 *
 * TROIS CHOIX QUI SE PERDENT FACILEMENT, chacun documente a sa ligne :
 *   - `role` en `additionalFields` avec `input: false`, regle E11
 *   - le plugin `admin()` de Better Auth n'est PAS utilise, ADR-023
 *   - `minPasswordLength` est global, il vaut seize pour tous, ADR-023
 */
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { envoyeurJournalise, type EnvoyeurEmail } from "@/integrations/email";
import {
  LONGUEUR_MAXIMALE_MOT_DE_PASSE,
  LONGUEUR_MINIMALE_MOT_DE_PASSE,
} from "@/lib/mot-de-passe";
import { prisma } from "@/lib/prisma";

/**
 * L'URL publique du site, et un repli qui NE VAUT QU'EN DEVELOPPEMENT.
 *
 * POURQUOI PAS UN SIMPLE `?? "http://localhost:3000"`, qui semblait pourtant
 * inoffensif : il retirait `Secure` du cookie de session en production.
 *
 * Better Auth decide de cet attribut par la chaine suivante, dans
 * `cookies/index.mjs` : `baseURL ? baseURL.startsWith("https://")
 * : isProduction`. Il a donc un repli qui pose `Secure` tout seul quand aucune
 * URL n'est connue. Fournir une valeur par defaut rend `baseURL` TOUJOURS
 * definie, la branche `isProduction` devient inatteignable, et la decision se
 * prend sur `startsWith("https://")` d'une URL en `http://localhost`, donc
 * faux. Le repli defensif detruisait la protection qu'il croyait fournir.
 *
 * Mesure en `NODE_ENV=production`, sur une instance reelle :
 *   BETTER_AUTH_URL oubliee     -> Secure=NON  prefixe __Secure-=NON
 *   BETTER_AUTH_URL en https    -> Secure=OUI  prefixe __Secure-=OUI
 *
 * Le cookie de l'exploitante serait parti en clair sur toute requete HTTP vers
 * le domaine, sept jours de validite, interceptable sur un reseau partage.
 *
 * CE MODE D'ECHEC EST SILENCIEUX, a la difference de celui d'une URL FAUSSE qui
 * casse bruyamment toute connexion en « Invalid origin ». Pire, les passkeys
 * cesseraient de fonctionner, `rpID` valant `localhost`, ce qui ferait
 * soupconner WebAuthn pendant que le mot de passe de secours continue
 * d'emettre des cookies non proteges.
 *
 * LA CORRECTION NE PASSE PAS PAR UNE EXCEPTION, premiere tentative revenue de
 * l'integration continue. `next build` evalue ce module avec
 * `NODE_ENV=production` pour collecter les donnees de page : lever ici faisait
 * echouer la CONSTRUCTION, qui n'emet aucun cookie et n'a aucun besoin de
 * l'URL publique. Construire n'est pas servir, et un garde-fou qui confond les
 * deux bloque une etape sans risque tout en laissant le vrai risque intact.
 *
 * La protection est donc posee la ou elle agit : `useSecureCookies` explicite
 * plus bas. Elle ne depend plus de la FORME de l'URL, donc plus du fait que la
 * variable ait ete renseignee. Une URL absente en production degrade encore le
 * `rpID` de la passkey et les origines de confiance, ce qui casse bruyamment
 * et se voit ; elle ne peut plus degrader le cookie en silence.
 */
const urlBaseConfiguree = process.env.BETTER_AUTH_URL;
const enProduction = process.env.NODE_ENV === "production";

const urlBase = urlBaseConfiguree ?? "http://localhost:3000";

/**
 * Le secret de signature des sessions.
 *
 * ECHEC AU DEMARRAGE PLUTOT QU'UN DEFAUT SILENCIEUX, et ce n'est pas une
 * precaution de style. Better Auth ne leve PAS quand la variable manque : il
 * retombe sur un secret par defaut, connu publiquement, et se contente d'un
 * avertissement dans la sortie de construction. Une mise en production ou la
 * variable a ete oubliee signerait donc ses cookies de session avec une cle que
 * n'importe qui peut lire dans le depot de la bibliotheque. Forger une session
 * d'administration deviendrait trivial, sans qu'aucun symptome n'apparaisse.
 *
 * Un avertissement que rien ne lit n'est pas un garde-fou.
 *
 * L'exception est levee A L'EVALUATION DU MODULE : le service ne demarre pas du
 * tout, plutot que d'echouer a la premiere connexion, loin de sa cause.
 *
 * SAUF PENDANT LA CONSTRUCTION. `next build` evalue ce module pour collecter
 * les donnees de page, sans jamais signer le moindre cookie : exiger le secret
 * la ferait echouer une etape qui ne court aucun risque, et obligerait
 * l'integration continue a porter une valeur factice dont la seule fonction
 * serait de contenter un controle. Un secret de complaisance en CI est
 * exactement ce qui apprend a ne plus lire l'alerte.
 *
 * Next.js renseigne `NEXT_PHASE` a `phase-production-build` pendant cette
 * etape, et a rien du tout quand le serveur tourne : c'est le seul signal qui
 * distingue construire de servir.
 *
 * La VALEUR n'est jamais journalisee ni comparee a autre chose que le vide,
 * invariant 9. Seule son absence est constatee.
 */
const enConstruction = process.env.NEXT_PHASE === "phase-production-build";

const secretSignature = process.env.BETTER_AUTH_SECRET;

if (!secretSignature && !enConstruction) {
  throw new Error(
    "BETTER_AUTH_SECRET absente. Sans elle, Better Auth signe les sessions avec un secret par defaut public.\n" +
      "La renseigner dans .env, voir .env.example : openssl rand -base64 32",
  );
}

/**
 * `rpID` est le domaine auquel la passkey est liee, au sens WebAuthn. Une
 * credential enregistree sur un domaine ne fonctionne sur aucun autre : c'est
 * ce qui rend la passkey resistante au hameconnage, et c'est aussi ce qui fait
 * qu'une valeur erronee casse la connexion sans message clair.
 *
 * Deduit de BETTER_AUTH_URL plutot que fixe : localhost en developpement, le
 * domaine reel en production, sans variable supplementaire a tenir en phase.
 */
function domaineRelyingPartyDe(url: string): string {
  return new URL(url).hostname;
}

/**
 * `urlSite` est un PARAMETRE et non la constante lue plus haut.
 *
 * La constante est figee a l'evaluation du module : une reassignation de
 * `process.env.BETTER_AUTH_URL` apres l'import n'a aucun effet. Le test qui
 * verifie l'attribut `Secure` du cookie a besoin d'une instance en `https`
 * alors que les autres tournent en `http`, ce que seul un parametre permet.
 *
 * Le defaut reste la valeur de l'environnement : le code applicatif appelle
 * `creerAuth()` sans argument et ne connait donc qu'une seule URL, celle du
 * site.
 */
export function creerAuth(
  envoyeurEmail: EnvoyeurEmail = envoyeurJournalise,
  urlSite: string = urlBase,
  // Meme motif que `urlSite` : `enProduction` est fige a l'evaluation du
  // module, et le test qui couvre le cas reel du defaut, production servie en
  // `http`, a besoin de le poser sans reevaluer tout le module.
  productionSimulee: boolean = enProduction,
) {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    baseURL: urlSite,
    secret: secretSignature,

    advanced: {
      /**
       * `Secure` SUR LE COOKIE DE SESSION, decide par l'ENVIRONNEMENT et non
       * par la forme de l'URL.
       *
       * Sans cette ligne, Better Auth le deduit de
       * `baseURL.startsWith("https://")`, et une URL absente ou mal renseignee
       * en production emettait un cookie en clair, sept jours de validite.
       * Defaut mesure en LS-70 : `Secure=NON` avec `NODE_ENV=production` et
       * `BETTER_AUTH_URL` oubliee.
       *
       * L'explicite l'emporte ici sur la deduction : le seul cas ou un cookie
       * de session doit voyager sans `Secure` est le developpement en clair
       * sur `localhost`, que `NODE_ENV` distingue exactement.
       */
      useSecureCookies: productionSimulee || urlSite.startsWith("https://"),
    },

    user: {
      // Le modele Prisma s'appelle `Utilisateur`, pas `User`. Better Auth
      // interroge l'ORM par ce nom : sans cette ligne, il cherche un modele
      // inexistant et echoue a la premiere ecriture.
      modelName: "Utilisateur",
      fields: {
        // Correspondance des seuls champs dont le nom differe. `email`,
        // `image` et `createdAt` portent deja le nom attendu.
        name: "nom",
        emailVerified: "emailVerifie",
        createdAt: "creeA",
        updatedAt: "misAJourA",
      },
      additionalFields: {
        /**
         * REGLE E11, et l'unique protection portee par cette configuration.
         *
         * `input: false` empeche de poser `role` depuis le corps d'une requete
         * d'inscription ou de mise a jour : Better Auth ecarte le champ avant
         * de le transmettre a l'ORM.
         *
         * CE QU'IL NE COUVRE PAS. Seules les routes de Better Auth passent par
         * la. Toute autre ecriture sur `Utilisateur`, une Server Action de
         * profil qui transmettrait a Prisma un objet issu d'un formulaire, y
         * echappe entierement. C'est pourquoi E11 est de niveau 3, un controle
         * applicatif, et pourquoi `services/utilisateur.ts` refait le filtrage
         * de son cote au lieu de s'appuyer sur cette ligne.
         */
        role: {
          type: ["CLIENT", "ADMINISTRATRICE"],
          required: true,
          defaultValue: "CLIENT",
          input: false,
        },
      },
    },

    session: { modelName: "Session" },
    account: { modelName: "Compte" },
    verification: { modelName: "Verification" },

    emailAndPassword: {
      // Actif meme si la passkey est le chemin principal de l'administration :
      // c'est la methode de secours d'ADR-021, cas de l'appareil tiers, et le
      // chemin nominal des clients, ADR-023.
      enabled: true,
      minPasswordLength: LONGUEUR_MINIMALE_MOT_DE_PASSE,
      maxPasswordLength: LONGUEUR_MAXIMALE_MOT_DE_PASSE,

      /**
       * DESACTIVE VOLONTAIREMENT, et c'est une dette, pas un choix definitif.
       *
       * ADR-023 exige la verification d'adresse avant tout rattachement de
       * commande. L'activer aujourd'hui rendrait l'inscription impossible :
       * aucun email ne part tant qu'ADR-008 n'a pas tranche le fournisseur, le
       * client resterait bloque sur un compte non verifie.
       *
       * Ce que cela n'ouvre PAS : le rattachement d'une commande a un compte,
       * parcours 6, qui exigera la verification quoi qu'il arrive. La dette
       * porte sur la configuration, pas sur la regle.
       */
      requireEmailVerification: false,

      sendResetPassword: async ({ user, url }) => {
        await envoyeurEmail.envoyer({
          destinataire: user.email,
          modele: "reinitialisation-mot-de-passe",
          // `url` porte un jeton signe a usage unique. Il n'est pas journalise
          // ailleurs que dans l'email lui-meme.
          variables: { url },
        });
      },
    },

    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await envoyeurEmail.envoyer({
          destinataire: user.email,
          modele: "verification-adresse",
          variables: { url },
        });
      },
    },

    /**
     * Le plugin `admin()` de Better Auth est absent, ADR-023, et son absence
     * est un choix a ne pas defaire par commodite.
     *
     * Il stocke les roles en chaine separee par des virgules pour permettre
     * plusieurs roles par compte. Une valeur `CLIENT,ADMINISTRATRICE` ne serait
     * pas egale a `ADMINISTRATRICE` : l'index partiel
     * `utilisateur_administratrice_unique` ne la verrait pas, et un second
     * compte d'administration entrerait sans erreur.
     */
    plugins: [
      passkey({
        rpID: domaineRelyingPartyDe(urlSite),
        rpName: "Lune & Soleil",
        // `origin` EXPLICITE, a ne pas retirer. Sans lui, le plugin retombe
        // sur l'en-tete `Origin` de la requete, donc sur une valeur fournie
        // par le client, comme `expectedOrigin` de la verification WebAuthn.
        origin: urlSite,
      }),
    ],
  });
}

export const auth = creerAuth();

export type Auth = ReturnType<typeof creerAuth>;
