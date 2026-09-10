import { lireProxiesDeConfiance } from "@/lib/proxies-de-confiance";

/**
 * Adresse IP de l'appelant, pour PLAFONNER un volume et jamais pour autoriser.
 *
 * SORTIE DE `contact/actions.ts` PAR LS-77, ou elle vivait depuis LS-97. Un
 * second formulaire public en a besoin, le signalement d'avis, et deux copies
 * de cette regle divergeraient au premier ajustement : c'est exactement le
 * motif « elargir la source plutot qu'exempter » que ce depot applique aux
 * controles.
 *
 * ELLE N'AUTORISE RIEN, invariant 2. L'en-tete `x-forwarded-for` est FORGEABLE
 * par l'appelant : la valeur ne sert qu'a borner un volume, et au pire un
 * appelant qui la fait varier contourne son PROPRE plafond, ce que les autres
 * couches anti-robot encadrent.
 *
 * ELLE PEUT RENDRE `null`, ET L'APPELANT DOIT LE TRAITER. Compter sur une
 * valeur nulle donnerait un compteur UNIQUE partage par tous, donc un deni de
 * service offert au premier venu : le plafond ne s'applique alors pas, motif
 * documente par `limitation-action.ts`.
 */
export function adresseAppelante(enTetes: Headers): string | null {
  /*
   * `undefined` EST LA VALEUR NORMALE EN PRODUCTION, et non un oubli de
   * configuration : le module explique que l'ecrasement Nginx de LS-91 rend la
   * liste vide juste. Le repli sur un tableau vide dit « aucun proxy de
   * confiance », ce qui est exactement cela.
   */
  const proxies = lireProxiesDeConfiance() ?? [];
  const chaine = enTetes.get("x-forwarded-for");

  if (chaine === null) {
    return null;
  }

  const sauts = chaine
    .split(",")
    .map((saut) => saut.trim())
    .filter((saut) => saut !== "");

  /*
   * UN SEUL SAUT : c'est la forme que produit l'ecrasement Nginx de LS-91,
   * l'adresse publique reelle du client.
   */
  if (sauts.length === 1) {
    return sauts[0] ?? null;
  }

  /*
   * PLUSIEURS SAUTS : parcours de DROITE a GAUCHE, premier saut non declare de
   * confiance retenu, meme regle que `getIp`. Une chaine entierement composee
   * de proxies de confiance ne designe personne, donc `null`.
   *
   * L'EN-TETE EST FORGEABLE PAR L'APPELANT, et c'est pourquoi la valeur ne sert
   * qu'a PLAFONNER un volume, jamais a autoriser quoi que ce soit,
   * invariant 2. Au pire, un appelant qui fait varier son en-tete contourne son
   * propre plafond, ce que les deux autres couches encadrent deja.
   */
  for (let rang = sauts.length - 1; rang >= 0; rang -= 1) {
    const saut = sauts[rang];

    if (saut !== undefined && !proxies.includes(saut)) {
      return saut;
    }
  }

  return null;
}
