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

export async function themeDeLaPage(
  apercu: string | string[] | undefined,
): Promise<ThemeSaisonnier> {
  const actif = await lireThemeSaisonnier();
  if (apercu === undefined) {
    return actif;
  }

  const identite = await lireIdentite(await headers());
  return themeAAfficher({
    actif,
    apercu: Array.isArray(apercu) ? apercu[0] : apercu,
    estAdministratrice: identite?.role === "ADMINISTRATRICE",
  });
}

/** La valeur de `data-theme`, absente sans thème : rien ne change alors. */
export function attributTheme(theme: ThemeSaisonnier): string | undefined {
  return theme === "AUCUN" ? undefined : theme.toLowerCase();
}
