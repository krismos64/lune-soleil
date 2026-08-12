/**
 * Lecture des proxies de confiance depuis l'environnement. LS-91.
 *
 * CE MODULE N'A AUCUN IMPORT DU PROJET, et c'est sa raison d'exister comme
 * fichier separe. La fonction vivait d'abord dans `auth.ts` : l'importer depuis
 * un test unitaire tirait `hook-journal-connexion.ts`, donc
 * `journal-connexion.ts`, donc `prisma.ts`, qui leve a l'evaluation du module
 * quand `DATABASE_URL` est absente. Le test echouait sur la base de donnees en
 * voulant mesurer une adresse IP.
 *
 * Meme motif que `lib/mot-de-passe.ts`, qui existe pour que le formulaire de
 * connexion n'importe pas `lib/auth.ts` et n'entraine pas Prisma et le secret
 * dans le paquet du navigateur. Une valeur de configuration pure se lit sans
 * monter l'application.
 *
 * ---------------------------------------------------------------------------
 * CE QUE `getIp` FAIT REELLEMENT, mesure dans le code installe
 * (`@better-auth/core/dist/utils/ip.mjs`) et non suppose :
 *
 *   chaine a UN SEUL saut, sans proxy declare      -> adresse retenue
 *   chaine a PLUSIEURS sauts, sans proxy declare   -> null
 *   avec proxies declares, parcours de DROITE a GAUCHE, premier saut non
 *     fiable retenu ; si TOUS les sauts sont de confiance -> null
 *
 * LA CORRECTION DE LS-91 N'EST DONC PAS ICI, ELLE EST DANS NGINX. Le ticket
 * supposait qu'il fallait declarer le proxy pour que l'adresse cesse d'etre
 * nulle. C'est vrai seulement si la chaine porte plusieurs sauts. En posant
 * `proxy_set_header X-Forwarded-For $remote_addr`, Nginx ECRASE l'en-tete
 * recu : la chaine ne porte qu'un seul saut, l'adresse publique reelle du
 * client, et Better Auth la resout SANS aucun proxy de confiance.
 *
 * `getIp` NE VOIT JAMAIS L'ADRESSE DU SOCKET. Il ne lit que des en-tetes, donc
 * l'adresse Docker par laquelle Nginx joint le conteneur n'entre nulle part
 * dans la decision : declarer le sous-reseau Docker n'aurait servi a rien, et
 * c'est ce que la premiere lecture du ticket laissait croire.
 *
 * LA VALEUR JUSTE EN PRODUCTION EST DONC LA LISTE VIDE, et une liste vide se
 * DEMONTRE plutot qu'elle ne se subit : voir `docker/nginx/lune-soleil.conf`
 * qui porte l'ecrasement, et `tests/unitaire/adresse-ip.test.ts` qui mesure les
 * cinq comportements ci-dessus.
 *
 * LA VARIABLE EXISTE QUAND MEME, critere 2, pour le jour ou un intermediaire
 * s'ajoute devant Nginx, un CDN par exemple. Elle vit dans la configuration de
 * deploiement et jamais en dur dans le code.
 *
 * UNE ENTREE MAL FORMEE EST IGNOREE EN SILENCE par Better Auth, qui se contente
 * d'un `logger.warn` (`create-context.mjs`). Une faute de frappe dans un CIDR ne
 * casse donc rien de visible : elle retire l'entree de la liste, ce qui peut
 * faire basculer sur la branche « un seul saut » sans qu'aucun test ne rougisse.
 * Raison de plus pour que la valeur juste soit la liste vide.
 */

/**
 * Rend la liste des proxies de confiance, ou `undefined` s'il n'y en a aucun.
 *
 * `undefined` ET NON UN TABLEAU VIDE. Better Auth teste
 * `trustedProxies.length > 0` : les deux se comportent pareil aujourd'hui, mais
 * `undefined` dit « non configure » la ou `[]` dirait « configure a rien », et
 * c'est `undefined` que la bibliotheque attend par defaut. La distinction
 * compte aussi pour `exactOptionalPropertyTypes`, actif sur ce projet.
 *
 * LE PARAMETRE EXISTE POUR LES TESTS, meme motif que `urlSite` dans `auth.ts` :
 * la valeur de l'environnement est figee a l'evaluation du module, et un test
 * qui la reassignerait apres l'import n'aurait aucun effet.
 */
export function lireProxiesDeConfiance(
  valeur: string | undefined = process.env.BETTER_AUTH_TRUSTED_PROXIES,
): string[] | undefined {
  const entrees = (valeur ?? "")
    .split(",")
    .map((entree) => entree.trim())
    .filter(Boolean);

  return entrees.length > 0 ? entrees : undefined;
}
