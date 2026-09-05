/**
 * Le manifeste d'application web, LS-147.
 *
 * IL EXISTE POUR LES ICÔNES, PAS POUR FAIRE UNE APPLICATION INSTALLABLE. Sans
 * lui, Android n'a aucune icône à poser sur l'écran d'accueil quand un visiteur
 * ajoute le site en raccourci : il fabrique alors une vignette de la page, ce
 * qui donne un rectangle blanc illisible.
 *
 * `display: "browser"` DIT EXPLICITEMENT QUE CE N'EST PAS UNE APPLICATION.
 * Les autres valeurs, `standalone` en tête, font ouvrir le site sans barre
 * d'adresse ni bouton de retour. Pour une boutique, cela retire au visiteur les
 * repères qui lui disent où il paie, ce qui est le contraire du but au moment de
 * saisir une carte.
 *
 * AUCUN `start_url` PARTICULIER, la racine convient : le site n'a pas d'écran
 * d'accueil applicatif distinct de sa page d'accueil.
 *
 * Ce fichier est un `manifest.ts` et non un `.json` parce que le nom de la
 * boutique et son accroche vivent déjà dans `src/lib/seo.ts` : les recopier dans
 * un JSON en ferait une deuxième source de vérité, libre de diverger sans que
 * rien ne le signale.
 */
import type { MetadataRoute } from "next";

import { NOM_BOUTIQUE } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${NOM_BOUTIQUE}, bijoux artisanaux faits main`,
    short_name: NOM_BOUTIQUE,
    description:
      "Des bijoux faits main, créés à l'unité et en petite série. Livraison en France métropolitaine, Corse comprise.",
    start_url: "/",
    display: "browser",
    lang: "fr-FR",
    /*
     * Les deux couleurs reprennent `--ls-background` et `--ls-primary`. Elles
     * sont écrites en dur pour la même raison que dans `opengraph-image.tsx` :
     * un manifeste est lu par le système, hors de toute feuille de style, donc
     * aucune variable CSS n'y est résoluble.
     */
    background_color: "#fbf7f0",
    theme_color: "#5f4519",
    icons: [
      {
        src: "/habillage/icone-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/habillage/icone-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
