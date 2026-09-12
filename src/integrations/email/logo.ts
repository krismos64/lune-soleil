/**
 * Lecture du logo joint aux emails, LS-222.
 *
 * POURQUOI UN MODULE POUR UNE LECTURE DE FICHIER. Trois raisons, et aucune
 * n'est le rangement :
 *
 * LE CACHE. `creerEnvoyeurSmtp` envoie autant de messages que la boutique en
 * produit, et relire 88 Ko de disque a chaque fois est une entree-sortie par
 * email. Le fichier est versionne, donc immuable entre deux deploiements : une
 * lecture par processus suffit.
 *
 * LE DEFAUT FERME NE DOIT PAS EXISTER ICI. Un logo absent ne doit JAMAIS faire
 * echouer un envoi : une confirmation de commande perdue pour un fichier
 * d'habillage serait une regression grave, et le message reste parfaitement
 * lisible sans image, son `alt` portant le nom de la boutique. La fonction rend
 * donc `null` plutot que de lever, meme motif que `destinataireNotification`
 * dans `services/message-contact.ts`.
 *
 * LE CHEMIN DEPEND DU MODE D'EXECUTION. En production l'application tourne
 * depuis `.next/standalone`, ou `public/` est recopie a cote : resoudre depuis
 * le repertoire courant du processus couvre les deux cas, developpement et
 * image Docker.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { journaliser } from "@/lib/journal";

/**
 * Le logo de la boutique, celui de l'icone d'application.
 *
 * `icone-512.png` ET NON `partage.png`. Le second est l'image Open Graph, un
 * paysage de 1200 par 630 concu pour une carte de reseau social : place dans un
 * en-tete d'email, il occuperait toute la hauteur du premier ecran avant le
 * moindre mot. Le premier est carre et se reduit proprement a 96 pixels.
 */
const CHEMIN_LOGO = join(process.cwd(), "public", "habillage", "icone-512.png");

/**
 * Le cache, et son etat « deja tente ».
 *
 * `undefined` SIGNIFIE « PAS ENCORE LU », `null` SIGNIFIE « LU ET ABSENT ». Les
 * confondre ferait retenter la lecture a chaque envoi apres un premier echec,
 * donc une entree-sortie ratee et une ligne de journal par email : exactement le
 * bruit qui fait cesser de lire les journaux.
 */
let cache: Buffer | null | undefined = undefined;

/**
 * Rend le logo a joindre, ou `null` s'il est illisible.
 *
 * ELLE NE LEVE JAMAIS. C'est la garantie qui compte : l'appelant est sur le
 * chemin d'un envoi qui porte parfois une confirmation de paiement.
 */
export function lireLogoEmail(): Buffer | null {
  if (cache !== undefined) {
    return cache;
  }

  try {
    cache = readFileSync(CHEMIN_LOGO);
  } catch (erreur) {
    /*
     * LE CHEMIN EST JOURNALISE, PAS LE CONTENU NI L'ERREUR BRUTE. Invariant 9 :
     * un message d'erreur systeme peut porter un chemin absolu qui renseigne sur
     * l'arborescence de la machine. Le nom de la classe suffit au diagnostic,
     * convention de `JOURNALISATION.md`.
     */
    journaliser("warn", "logo des emails illisible, envoi sans en-tete", {
      classe: erreur instanceof Error ? erreur.name : "inconnue",
    });

    cache = null;
  }

  return cache;
}

/**
 * Vide le cache, pour les tests seulement.
 *
 * SANS ELLE, DEUX TESTS NE PEUVENT PAS SE SUIVRE : le premier fige l'etat pour
 * le second, et un cas « logo absent » passerait au vert en lisant le cache
 * d'un cas « logo present » joue avant lui.
 */
export function reinitialiserCacheLogo(): void {
  cache = undefined;
}
