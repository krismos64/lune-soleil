/**
 * Longueurs de mot de passe, ADR-021 et ADR-023. LS-70.
 *
 * POURQUOI CES CONSTANTES VIVENT SEULES, hors de `lib/auth.ts`. Le formulaire
 * de connexion est un composant client et affiche la longueur minimale. Les
 * importer depuis `lib/auth.ts` ferait entrer dans le paquet du navigateur tout
 * ce que ce module tire : le client Prisma, l'adaptateur PostgreSQL et la
 * lecture de `BETTER_AUTH_SECRET`. Un secret n'a rien a faire dans un paquet
 * client, invariant 9.
 *
 * Ce fichier n'importe donc RIEN, et ne doit jamais le faire.
 */

/**
 * Seize caracteres, pour TOUS les comptes, administration et clients.
 *
 * OPTION GLOBALE de Better Auth, pas un reglage par utilisateur : la meme
 * valeur s'applique aux deux populations. ADR-023 examine nommement
 * l'alternative « douze en global, seize verifies applicativement pour
 * l'administration » et l'ecarte, un invariant ne se garantissant pas par du
 * code qu'on peut oublier.
 *
 * Abaisser cette valeur degrade F-ACC-01, un Must sur le jalon Go-Live dont
 * l'absence est un critere de refus d'ouverture. Un tel renversement exige un
 * nouvel ADR, pas une exception dans un appel.
 */
export const LONGUEUR_MINIMALE_MOT_DE_PASSE = 16;

/**
 * Borne haute, reprise du defaut de Better Auth.
 *
 * Elle est ecrite ici pour etre lisible plutot que decouverte a l'echec d'une
 * phrase de passe longue, cas realiste quand le minimum est de seize.
 */
export const LONGUEUR_MAXIMALE_MOT_DE_PASSE = 128;
