/**
 * Le thème saisonnier à rendre sur l'accueil et le catalogue, ADR-046.
 *
 * ADAPTATEUR D'ENTRÉE : il lit l'URL et la session, le service décide. La
 * session n'est lue QUE si un aperçu est demandé : une visite ordinaire ne
 * coûte qu'une lecture du thème, jamais une lecture de session.
 *
 * `?apercu-theme=` n'est honoré que pour une session administratrice,
 * `themeAAfficher`, invariant 2.
 */
import { headers } from "next/headers";

import { lireIdentite } from "@/services/autorisation";
import {
  lireThemeSaisonnier,
  themeAAfficher,
  type ThemeSaisonnier,
} from "@/services/theme-saisonnier";

/** Nom du paramètre d'aperçu, partagé avec l'écran des paramètres. */
export const PARAMETRE_APERCU_THEME = "apercu-theme";

/**
 * `enApercu` dit à l'administratrice qu'elle regarde un aperçu et non le
 * thème appliqué, revue de LS-267 : sans lui, rien ne distinguait les deux.
 *
 * AVEC UN APERÇU, LA LECTURE DE SESSION PEUT LEVER, au-dessus de toute
 * frontière Suspense : la page répond alors un vrai 500, statut honnête, C32.
 * Sans aperçu, rien ici ne lève.
 */
export async function themeDeLaPage(
  apercu: string | string[] | undefined,
): Promise<{ theme: ThemeSaisonnier; enApercu: boolean }> {
  const actif = await lireThemeSaisonnier();
  if (apercu === undefined) {
    return { theme: actif, enApercu: false };
  }

  const identite = await lireIdentite(await headers());
  const estAdministratrice = identite?.role === "ADMINISTRATRICE";
  const theme = themeAAfficher({
    actif,
    apercu: Array.isArray(apercu) ? apercu[0] : apercu,
    estAdministratrice,
  });
  return { theme, enApercu: estAdministratrice && theme !== actif };
}

/** La valeur de `data-theme`, absente sans thème : rien ne change alors. */
export function attributTheme(theme: ThemeSaisonnier): string | undefined {
  return theme === "AUCUN" ? undefined : theme.toLowerCase();
}
