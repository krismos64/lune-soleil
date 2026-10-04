/**
 * Thèmes saisonniers de la boutique, ADR-046, LS-267.
 *
 * UN THÈME EST UN JEU FERMÉ ÉCRIT DANS LE CODE : jetons d'accent sous
 * `[data-theme="…"]` dans `tokens.css`, décors et phrases d'accroche. Ce
 * service ne fait que dire lequel est actif, et le changer. L'exploitante ne
 * saisit aucun texte : un champ libre laisserait passer une promotion ou un
 * délai inventés, qu'aucun contrôle ne relirait.
 *
 * L'AUTORISATION N'EST PAS FAITE ICI, invariant 2 : l'action d'administration
 * appelle `exigerRole` avant `choisirThemeSaisonnier`.
 */
import { z } from "zod";

import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { valider } from "@/lib/validation";
import * as depot from "@/repositories/parametres";
import { ParametresAbsentsError } from "@/services/parametres";

/** Les thèmes écrits dans le code. Même liste que `chk_parametre_theme_connu`. */
export const THEMES_SAISONNIERS = ["AUCUN", "NOEL"] as const;

export type ThemeSaisonnier = (typeof THEMES_SAISONNIERS)[number];

export const schemaThemeSaisonnier = z.enum(THEMES_SAISONNIERS);

/**
 * Le thème actif, `AUCUN` par défaut.
 *
 * UN THÈME NE FAIT JAMAIS TOMBER UNE PAGE, même motif que `lireSeuilFranchise` :
 * sans ligne de paramètres, valeur inconnue ou base injoignable, la page
 * s'affiche avec l'habillage ordinaire. Une base injoignable fera de toute
 * façon échouer la lecture du catalogue qui suit, sous sa propre frontière ;
 * l'avertissement est journalisé, sans aucune donnée.
 */
export async function lireThemeSaisonnier(): Promise<ThemeSaisonnier> {
  try {
    const brut = await depot.lireThemeSaisonnier(prisma);
    const lu = schemaThemeSaisonnier.safeParse(brut);
    return lu.success ? lu.data : "AUCUN";
  } catch (erreur) {
    journaliser("warn", "Thème saisonnier illisible, habillage ordinaire", {
      erreur: erreur instanceof Error ? erreur.name : typeof erreur,
    });
    return "AUCUN";
  }
}

/** Change le thème actif. Lève `ParametresAbsentsError` sans ligne. */
export async function choisirThemeSaisonnier(
  entree: unknown,
): Promise<ThemeSaisonnier> {
  const theme = valider(schemaThemeSaisonnier, entree);
  if ((await depot.ecrireThemeSaisonnier(prisma, theme)) === 0) {
    throw new ParametresAbsentsError();
  }
  return theme;
}

/**
 * Le thème à rendre pour cette requête.
 *
 * L'APERÇU N'EST HONORÉ QUE POUR UNE SESSION ADMINISTRATRICE, ADR-046 point
 * 6, invariant 2 : un paramètre d'URL ne change jamais le thème d'un visiteur,
 * sans quoi un lien partagé ferait voir Noël en juillet. Un aperçu inconnu est
 * ignoré, jamais une erreur.
 */
export function themeAAfficher({
  actif,
  apercu,
  estAdministratrice,
}: {
  actif: ThemeSaisonnier;
  apercu: unknown;
  estAdministratrice: boolean;
}): ThemeSaisonnier {
  if (!estAdministratrice || apercu === undefined) {
    return actif;
  }
  const voulu = schemaThemeSaisonnier.safeParse(apercu);
  return voulu.success ? voulu.data : actif;
}
