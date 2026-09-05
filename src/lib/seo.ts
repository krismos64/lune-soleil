/**
 * Socle du referencement technique, LS-137.
 *
 * FONCTIONS PURES, aucune requete et aucune regle metier : ce module met en
 * forme ce qu'on lui donne. La disponibilite lui arrive deja derivee par
 * `services/catalogue`, il ne la calcule pas.
 *
 * POURQUOI `lib/` ET NON `services/`. Le JSON-LD est une mise en forme, au meme
 * titre qu'un formatage de montant : il ne connait ni le stock, ni le statut
 * d'un produit. Les pages l'appellent directement, sans passer par la couche
 * metier, ce que le README de garde autorise explicitement.
 *
 * LE PIEGE QUE CE MODULE FERME. Le JSON-LD `Product` porte une disponibilite, et
 * schema.org propose `inventoryLevel` pour publier une quantite. La renseigner
 * republierait ce que l'interface masque deliberement : `frontend-design.md`
 * n'affiche que trois etats publics, et « 7 en stock » exposerait le niveau
 * d'activite de la boutique. Ce module ne recoit donc JAMAIS de quantite, seul
 * l'etat public entre : le defaut est rendu impossible par la signature, pas
 * seulement interdit par une regle.
 */
import type { EtatDisponibilite } from "@/services/catalogue";

/**
 * Adresse employee PENDANT LA CONSTRUCTION seulement, jamais servie.
 *
 * Elle existe parce que `new URL()` du layout racine s'evalue au moment ou
 * Next.js collecte les donnees de page, etape qui ne sert aucune requete. Elle
 * est volontairement reconnaissable : si elle apparaissait un jour dans un
 * canonical servi, l'origine du defaut serait lisible d'un coup d'oeil.
 */
const URL_DE_CONSTRUCTION = "https://construction.invalide";

/**
 * L'adresse publique du site, sans barre oblique finale.
 *
 * ELLE LEVE PLUTOT QUE DE RETOMBER SUR UNE VALEUR PAR DEFAUT. Un canonical
 * construit sur `http://localhost:3000` et servi en production pointerait chaque
 * page vers une adresse inatteignable, et les moteurs SUIVENT le canonical :
 * le site entier sortirait de l'index sans qu'aucun ecran ne change d'aspect.
 * Un defaut silencieux est ici pire qu'un demarrage refuse.
 *
 * Motif deja rencontre sur ce depot avec `BETTER_AUTH_SECRET`, dont la valeur
 * par defaut laissait le build reussir en signant avec un secret connu.
 *
 * ------------------------------------------------------------------
 * SAUF PENDANT `next build`, ET CETTE EXCEPTION A ETE MESUREE.
 *
 * Sans elle, la construction ECHOUE : « Failed to collect page data for
 * /_not-found ». `layout.tsx` evalue `new URL(urlDuSite())` a l'analyse des
 * pages, etape qui ne sert aucune requete et ne court donc aucun risque.
 *
 * La faire echouer obligerait l'integration continue a porter une adresse
 * factice dont la seule fonction serait de contenter un controle, et c'est
 * exactement ce qui apprend a ne plus lire l'alerte. C'est le motif
 * « construire n'est pas servir » de `.claude/rules/securite.md`, deja applique
 * a `BETTER_AUTH_SECRET` dans `lib/auth.ts`.
 *
 * `NEXT_PHASE` vaut `phase-production-build` pendant cette etape et rien du tout
 * quand le serveur tourne : c'est le seul signal qui distingue les deux. Le
 * serveur qui demarre sans la variable refuse toujours de servir.
 * ------------------------------------------------------------------
 */
export function urlDuSite(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL;

  if (base === undefined || base.trim() === "") {
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return URL_DE_CONSTRUCTION;
    }

    throw new Error(
      "NEXT_PUBLIC_SITE_URL est requise pour composer les URL canoniques. " +
        "La renseigner dans .env, voir .env.example.",
    );
  }

  return base.replace(/\/+$/, "");
}

/**
 * Compose une URL absolue a partir d'un chemin interne.
 *
 * LA BARRE OBLIQUE INITIALE EST IMPOSEE. Sans elle, `absolutise("catalogue")`
 * rendrait « https://sitecatalogue », une concatenation qui ne leve pas et
 * produit une adresse plausible. Motif « chaine construite a l'execution », deja
 * en fiche sur ce depot : la faute ne se voit qu'a la lecture du rendu.
 */
export function absolutise(chemin: string): string {
  if (!chemin.startsWith("/")) {
    throw new Error(
      `Chemin interne attendu, commencant par « / », recu : ${chemin}`,
    );
  }

  return chemin === "/" ? urlDuSite() : `${urlDuSite()}${chemin}`;
}

/**
 * La correspondance entre les trois etats publics et le vocabulaire schema.org.
 *
 * `DERNIERE_PIECE` DEVIENT `InStock`, ET C'EST DELIBERE. schema.org porte
 * `LimitedAvailability`, qui semble le traduire mot a mot, mais il signifie
 * « disponibilite restreinte » au sens d'un canal ou d'une zone, pas d'une
 * derniere unite. Surtout, le distinguer d'`InStock` publierait dans le balisage
 * ce que l'interface ne dit qu'en badge : un agregateur qui lit le JSON-LD
 * saurait qu'il reste exactement une piece. Les deux etats vendables sont donc
 * indistinguables dans le balisage, ce qui est la traduction fidele de la regle
 * « la quantite exacte n'est pas publique ».
 */
const DISPONIBILITE_SCHEMA_ORG: Record<EtatDisponibilite, string> = {
  EN_STOCK: "https://schema.org/InStock",
  DERNIERE_PIECE: "https://schema.org/InStock",
  EPUISE: "https://schema.org/OutOfStock",
};

/** Traduit un etat public en URL schema.org, sans jamais exposer de quantite. */
export function disponibiliteSchemaOrg(etat: EtatDisponibilite): string {
  return DISPONIBILITE_SCHEMA_ORG[etat];
}

/** Le nom commercial, tel qu'il doit apparaitre dans le balisage. */
export const NOM_BOUTIQUE = "Lune & Soleil";

/**
 * Le JSON-LD `Organization`, pose une seule fois sur l'accueil.
 *
 * IL N'EST PAS REPETE SUR CHAQUE PAGE. Les moteurs rattachent l'organisation au
 * domaine, et la dupliquer partout n'ajoute rien tout en multipliant les
 * occasions de divergence.
 */
export function jsonLdOrganisation(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: NOM_BOUTIQUE,
    url: urlDuSite(),
    description:
      "Bijoux artisanaux faits main, crees a l'unite et en petite serie.",
  };
}

/**
 * Compose un bloc Open Graph complet pour une page.
 *
 * ------------------------------------------------------------------
 * POURQUOI CETTE FONCTION EXISTE, et elle a ete ecrite APRES un test rouge.
 *
 * `openGraph` DECLARE DANS UNE PAGE REMPLACE INTEGRALEMENT celui du layout
 * parent : Next.js ne fusionne pas ce champ, il l'ecrase. Verifie via Context7
 * sur `mergeMetadata`, qui appelle `resolveOpenGraph` sur la valeur de l'enfant
 * et affecte le resultat par-dessus la valeur clonee du parent.
 *
 * Le layout racine posait donc `siteName` et `locale`, et CHAQUE page qui
 * declarait son propre `openGraph` les effacait. Le defaut est invisible a
 * l'ecran et invisible aux types : seul le HTML servi le montre, et c'est
 * `tests/e2e/referencement.spec.ts` qui l'a trouve.
 *
 * Toute page qui veut un Open Graph passe donc par ici, jamais par un objet
 * ecrit a la main.
 * ------------------------------------------------------------------
 */
export function openGraphDePage(page: {
  titre: string;
  description: string;
  /** Chemin interne, barre oblique initiale comprise. */
  chemin: string;
  /** Chemin interne d'une image, quand la page en a une. */
  image?: string | undefined;
}): Record<string, unknown> {
  return {
    title: page.titre,
    description: page.description,
    url: page.chemin,
    siteName: NOM_BOUTIQUE,
    locale: "fr_FR",
    type: "website",
    ...(page.image !== undefined ? { images: [{ url: page.image }] } : {}),
  };
}

/** Un maillon du fil d'Ariane, dans l'ordre de lecture. */
export type MaillonFilAriane = {
  nom: string;
  /** Chemin interne, barre oblique initiale comprise. */
  chemin: string;
};

/**
 * Le JSON-LD `BreadcrumbList`.
 *
 * LES POSITIONS COMMENCENT A 1, la specification schema.org l'imposant. Un
 * `index` de tableau non decale donnerait une liste commencant a 0, silencieuse
 * a la lecture et rejetee par les validateurs.
 */
export function jsonLdFilAriane(
  maillons: readonly MaillonFilAriane[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: maillons.map((maillon, rang) => ({
      "@type": "ListItem",
      position: rang + 1,
      name: maillon.nom,
      item: absolutise(maillon.chemin),
    })),
  };
}

/**
 * Ce qu'une fiche produit transmet au balisage.
 *
 * AUCUNE QUANTITE DANS CE TYPE, et c'est la garde principale de la story. Il n'y
 * a pas de champ ou en glisser une : ajouter `inventoryLevel` demanderait de
 * modifier ce type, geste visible en revue, la ou lire `quantiteDisponible`
 * depuis un objet plus large serait passe inapercu.
 */
export type ProduitBalise = {
  nom: string;
  slug: string;
  descriptionCourte: string | null;
  categorieNom: string;
  /** Le prix le plus bas parmi les variantes proposees, en centimes entiers. */
  prixCentimes: number;
  /** L'etat public le plus favorable parmi les variantes proposees. */
  disponibilite: EtatDisponibilite;
  /** Chemin interne de la photographie principale, quand il y en a une. */
  photoChemin: string | null;
};

/**
 * Le JSON-LD `Product` d'une fiche.
 *
 * LE PRIX EST CONVERTI EN EURO POUR LE BALISAGE, et c'est le seul endroit du
 * projet ou un montant quitte les centimes. L'invariant 1 interdit le flottant
 * dans un CALCUL monetaire : il n'y a ici aucun calcul, seulement une mise en
 * forme terminale imposee par schema.org, qui attend « 42.50 ». La division est
 * faite par `toFixed` sur une valeur entiere, aucun arrondi ne peut deriver, et
 * le resultat n'est jamais relu par le projet.
 *
 * `priceCurrency` EST FIGE A EUR. Le projet est mono-devise, cahier des charges,
 * et parametrer ce champ inviterait a croire l'inverse.
 */
export function jsonLdProduit(produit: ProduitBalise): Record<string, unknown> {
  const url = absolutise(`/produit/${produit.slug}`);

  const balisage: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: produit.nom,
    url,
    category: produit.categorieNom,
    brand: { "@type": "Brand", name: NOM_BOUTIQUE },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "EUR",
      price: (produit.prixCentimes / 100).toFixed(2),
      availability: disponibiliteSchemaOrg(produit.disponibilite),
      itemCondition: "https://schema.org/NewCondition",
    },
  };

  /*
   * LES CHAMPS FACULTATIFS SONT OMIS ET NON MIS A `null`. Un `description: null`
   * dans le JSON-LD est une valeur presente et vide pour un validateur, la ou
   * l'absence de cle est simplement l'absence d'information.
   */
  if (produit.descriptionCourte !== null) {
    balisage["description"] = produit.descriptionCourte;
  }

  if (produit.photoChemin !== null) {
    balisage["image"] = absolutise(produit.photoChemin);
  }

  return balisage;
}

/**
 * L'etat public d'un produit vu depuis ses variantes, pour le balisage.
 *
 * LE PLUS FAVORABLE L'EMPORTE, parce que le balisage porte sur le PRODUIT quand
 * les etats sont par variante. Une fiche dont une declinaison reste vendable est
 * « disponible » : la declarer epuisee parce qu'une autre l'est ferait
 * disparaitre des resultats un bijou qui se vend.
 *
 * IL NE COMPTE PAS LES VARIANTES, il les reduit. Compter combien sont vendables
 * reintroduirait exactement la quantite que la story interdit de publier.
 */
export function disponibiliteDuProduit(
  etats: readonly EtatDisponibilite[],
): EtatDisponibilite {
  if (etats.some((etat) => etat === "EN_STOCK")) {
    return "EN_STOCK";
  }

  return etats.some((etat) => etat === "DERNIERE_PIECE")
    ? "DERNIERE_PIECE"
    : "EPUISE";
}
