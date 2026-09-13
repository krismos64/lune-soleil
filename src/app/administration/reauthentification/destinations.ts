/**
 * Ou la reauthentification d'administration ramene, LS-227.
 *
 * ------------------------------------------------------------------
 * POURQUOI UN MODULE A PART ET NON LA PAGE.
 *
 * Cette table porte une garde de securite, la fermeture de la redirection
 * ouverte, et une garde qui n'est pas testee n'est pas une garde. Une page de
 * Next.js est un composant serveur asynchrone : l'eprouver demanderait un rendu
 * complet, une session et des en-tetes, pour mesurer une fonction PURE.
 *
 * Meme motif que `parametres/refus.ts`, extrait pour la meme raison.
 * ------------------------------------------------------------------
 *
 * CE QUE L'INDIRECTION PAR CLE FERME. Accepter `?retour=<chemin>` ferait de
 * l'ecran une redirection ouverte : un lien vers
 * `/administration/reauthentification?retour=https://exemple-malveillant.fr`
 * partirait de notre domaine, donc avec sa confiance, et ramenerait ailleurs
 * apres une saisie de mot de passe ou une passkey.
 *
 * FILTRER SUR « COMMENCE PAR / » NE SUFFIRAIT PAS, et c'est le piege que cette
 * forme evite : `//exemple.fr` est une URL absolue de schema relatif, que le
 * navigateur suit vers l'exterieur. Une CLE ne peut designer qu'une valeur de
 * cette table, ecrite dans le code.
 *
 * LES ECRANS DE DETAIL SONT ABSENTS, limite assumee. Une commande ou une
 * retractation vit sous un segment dynamique : y ramener exigerait un
 * identifiant venu de l'URL, donc une valeur de l'appelant, ce que cette table
 * existe pour refuser. Les deux ramenent a leur LISTE, d'ou la ligne est
 * atteignable en un clic.
 */
export const DESTINATIONS = {
  parametres: "/administration/parametres",
  commandes: "/administration/commandes",
  retractations: "/administration/retractations",
  tableau: "/administration",
} as const;

export type CleDestination = keyof typeof DESTINATIONS;

/**
 * Le repli, employe des que la cle n'est pas reconnue.
 *
 * LE TABLEAU DE BORD ET NON LA DERNIERE PAGE VUE : il est atteignable par
 * l'exploitante en toute circonstance, et il ne suppose aucun droit
 * particulier au-dela du role deja verifie.
 */
export const DESTINATION_PAR_DEFAUT: CleDestination = "tableau";

/**
 * Ce que chaque destination annonce, pour que l'ecran dise POURQUOI il demande.
 *
 * « Confirmez votre identite » sans motif se lit comme une panne ou un piege.
 * Nommer le geste qui attend derriere rend la demande comprehensible, et evite
 * qu'une action legitime soit abandonnee en chemin : c'est exactement ce qui
 * s'est produit le 13 septembre 2026 sur l'ecran des parametres.
 */
export const MOTIFS: Record<CleDestination, string> = {
  parametres: "avant de modifier les paramètres de la boutique",
  commandes: "avant de rembourser une commande",
  retractations: "avant de traiter une demande de rétractation",
  tableau: "avant de poursuivre cette action",
};

/**
 * Traduit le parametre d'URL en cle sure.
 *
 * TOUTE VALEUR NON RECONNUE RETOMBE SUR LE DEFAUT, jamais sur une erreur : un
 * lien mal forme ne doit pas empecher l'exploitante de prouver son identite,
 * elle se retrouve simplement au tableau de bord.
 */
export function lireDestination(
  brut: string | string[] | undefined,
): CleDestination {
  /*
   * UN PARAMETRE REPETE ARRIVE EN TABLEAU, `?retour=a&retour=b`. Le premier
   * element est retenu plutot que de laisser un tableau tomber dans le `in`,
   * ou il serait faux sans que le defaut se voie.
   */
  const valeur = Array.isArray(brut) ? brut[0] : brut;

  if (typeof valeur === "string" && valeur in DESTINATIONS) {
    return valeur as CleDestination;
  }

  return DESTINATION_PAR_DEFAUT;
}
