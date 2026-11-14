/**
 * Les thèmes saisonniers écrits dans le code, ADR-046, LS-267.
 *
 * SANS AUCUNE DÉPENDANCE SERVEUR : l'écran des paramètres, composant client,
 * lit ces noms. Les placer dans le service tirait Prisma dans le paquet du
 * navigateur, et la construction échouait.
 */
import { z } from "zod";

/** Les thèmes écrits dans le code. Même liste que `chk_parametre_theme_connu`. */
export const THEMES_SAISONNIERS = [
  "AUCUN",
  "NOEL_1",
  "NOEL_2",
  "BLACK_WEEK",
  // Les douze thèmes d'ambiance de LS-323, dans l'ordre de l'année.
  "NOUVEL_AN",
  "SOLDES_HIVER",
  "SAINT_VALENTIN",
  "JOURNEE_FEMMES",
  "PRINTEMPS",
  "PAQUES",
  "ETE",
  "SOLDES_ETE",
  "AUTOMNE",
  "OCTOBRE_ROSE",
  "NOVEMBRE_BLEU",
  "HIVER",
] as const;

export type ThemeSaisonnier = (typeof THEMES_SAISONNIERS)[number];

export const schemaThemeSaisonnier = z.enum(THEMES_SAISONNIERS);

/**
 * Le nom de chaque thème, tel que les écrans le disent. `Record` exhaustif :
 * un thème ajouté sans son nom casse la compilation, au lieu d'afficher
 * « Noël » pour un autre thème, revue de LS-267.
 *
 * SANS ARTICLE, LS-277 : le libellé entre dans « Aperçu de … » et « … est actif
 * sur l'accueil ». L'article de « le thème de Noël » donnait « Aperçu de le
 * thème de Noël ».
 */
export const LIBELLES_THEMES: Record<ThemeSaisonnier, string> = {
  AUCUN: "aucun thème",
  NOEL_1: "Noël 1 (sobre)",
  NOEL_2: "Noël 2 (franc)",
  BLACK_WEEK: "Black Week",
  NOUVEL_AN: "Nouvel An",
  SOLDES_HIVER: "Soldes d'hiver",
  SAINT_VALENTIN: "Saint-Valentin",
  JOURNEE_FEMMES: "Journée des droits des femmes",
  PRINTEMPS: "Printemps",
  PAQUES: "Pâques",
  ETE: "Été",
  SOLDES_ETE: "Soldes d'été",
  AUTOMNE: "Automne",
  OCTOBRE_ROSE: "Octobre rose",
  NOVEMBRE_BLEU: "Novembre bleu",
  HIVER: "Hiver",
};

/**
 * Les deux thèmes de Noël partagent leurs décors, LS-277 : seuls les jetons et
 * quelques couleurs de `NOEL_2` les distinguent, par `data-theme`.
 */
export function estThemeDeNoel(theme: ThemeSaisonnier): boolean {
  return theme === "NOEL_1" || theme === "NOEL_2";
}

/** Le thème Black Week, LS-318 : nuit, soleil levant et poussière d'or. */
export function estThemeBlackWeek(theme: ThemeSaisonnier): boolean {
  return theme === "BLACK_WEEK";
}

/**
 * LES DOUZE THÈMES D'AMBIANCE, LS-323, amendement d'ADR-046 du 14 novembre
 * 2026. Un seul socle les porte tous : deux jetons d'accent par thème dans
 * `tokens.css`, et les décors de `decor-saison.tsx`, réglés par cette table.
 * Ajouter un thème d'ambiance, c'est ajouter une valeur, une ligne ici et un
 * bloc de jetons : aucune page ne change.
 *
 * ILS RESTENT DANS LE RÉGIME ORDINAIRE D'ADR-046 SECTION 2, comme `NOEL_1` :
 * accents, décors et phrases. Texte courant, boutons, focus et prix gardent
 * leurs couleurs.
 *
 * AUCUNE PHRASE NE CITE DE TAUX, DE PRIX, DE DATE NI DE DÉLAI. `annonce` dit
 * seulement que le thème porte un bandeau d'opération : il nomme l'événement,
 * et reprend le taux, la portée et la période de la promotion ACTIVE, ADR-051,
 * jamais une valeur écrite ici.
 */
export type MotifSaison =
  | "coeur"
  | "etoile"
  | "feu"
  | "fleur"
  | "mimosa"
  | "oeuf"
  | "soleil"
  | "feuille"
  | "ruban"
  | "moustache"
  | "flocon"
  | "etiquette";

/** Le mouvement continu de la nuée de motifs, sous le bouton de pause. */
export type MouvementSaison = "tombe" | "monte" | "scintille";

export type Ambiance = {
  /** Le nom de l'événement tel que le visiteur le lit, ruban ou bandeau. */
  evenement: string;
  /** L'accroche de l'accueil, à la place de l'accroche ordinaire. */
  accroche: string;
  /** L'accroche du bandeau du catalogue. */
  accrocheCatalogue: string;
  /** Le grand motif du médaillon, puis ceux de la nuée. */
  motifs: readonly [MotifSaison, ...MotifSaison[]];
  mouvement: MouvementSaison;
  /** Bandeau d'opération qui reprend la promotion active, ADR-051. */
  annonce: boolean;
};

export const AMBIANCES = {
  NOUVEL_AN: {
    evenement: "Bonne année",
    accroche:
      "Une nouvelle année commence : des bijoux faits main, une pièce à la fois, pour l'accompagner.",
    accrocheCatalogue:
      "Chaque bijou est fait main et créé à l'unité, pour ouvrir l'année en lumière.",
    motifs: ["feu", "etoile", "feu"],
    mouvement: "scintille",
    annonce: false,
  },
  SOLDES_HIVER: {
    evenement: "Soldes d'hiver",
    accroche:
      "Des bijoux faits main, une pièce à la fois, à choisir au cœur de l'hiver.",
    accrocheCatalogue: "Chaque bijou est fait main et créé à l'unité.",
    motifs: ["etiquette", "flocon", "etiquette"],
    mouvement: "tombe",
    annonce: true,
  },
  SAINT_VALENTIN: {
    evenement: "Saint-Valentin",
    accroche:
      "Un bijou fait main, choisi pour quelqu'un : une pièce qui ne ressemble à aucune autre.",
    accrocheCatalogue:
      "Chaque bijou est fait main et créé à l'unité. Chacun peut dire quelque chose à quelqu'un.",
    motifs: ["coeur", "coeur", "etoile"],
    mouvement: "monte",
    annonce: true,
  },
  JOURNEE_FEMMES: {
    evenement: "Journée internationale des droits des femmes",
    accroche:
      "Des pièces faites main, à l'unité ou en petite série, pour célébrer celles qui comptent.",
    accrocheCatalogue:
      "Chaque bijou est fait main et créé à l'unité, pour célébrer celles qui comptent.",
    motifs: ["mimosa", "mimosa", "etoile"],
    mouvement: "tombe",
    annonce: true,
  },
  PRINTEMPS: {
    evenement: "Le printemps est là",
    accroche:
      "Des pièces délicates faites main, légères comme les premiers beaux jours.",
    accrocheCatalogue:
      "Chaque bijou est fait main et créé à l'unité, léger comme les premiers beaux jours.",
    motifs: ["fleur", "fleur", "feuille"],
    mouvement: "tombe",
    annonce: false,
  },
  PAQUES: {
    evenement: "Joyeuses Pâques",
    accroche:
      "Des bijoux faits main, une pièce à la fois : de petites trouvailles à découvrir une à une.",
    accrocheCatalogue:
      "Chaque bijou est fait main et créé à l'unité : une trouvaille à chaque carte.",
    motifs: ["oeuf", "oeuf", "fleur"],
    mouvement: "scintille",
    annonce: false,
  },
  ETE: {
    evenement: "L'été est là",
    accroche:
      "Des bijoux faits main, à porter au grand soleil comme à la tombée du jour.",
    accrocheCatalogue:
      "Chaque bijou est fait main et créé à l'unité, pour le grand soleil comme pour le soir.",
    motifs: ["soleil", "etoile", "soleil"],
    mouvement: "scintille",
    annonce: false,
  },
  SOLDES_ETE: {
    evenement: "Soldes d'été",
    accroche:
      "Des bijoux faits main, une pièce à la fois, à choisir sous le soleil d'été.",
    accrocheCatalogue: "Chaque bijou est fait main et créé à l'unité.",
    motifs: ["etiquette", "soleil", "etiquette"],
    mouvement: "tombe",
    annonce: true,
  },
  AUTOMNE: {
    evenement: "L'automne est là",
    accroche:
      "Des pièces faites main aux tons chauds, pour accompagner la lumière dorée de l'automne.",
    accrocheCatalogue:
      "Chaque bijou est fait main et créé à l'unité, dans la lumière dorée de l'automne.",
    motifs: ["feuille", "feuille", "feuille"],
    mouvement: "tombe",
    annonce: false,
  },
  OCTOBRE_ROSE: {
    evenement: "Octobre rose",
    accroche:
      "La boutique se pare de rose, en soutien à la sensibilisation au dépistage du cancer du sein.",
    accrocheCatalogue:
      "Chaque bijou est fait main et créé à l'unité. La boutique se pare de rose pour Octobre rose.",
    motifs: ["ruban", "coeur", "ruban"],
    mouvement: "monte",
    annonce: true,
  },
  NOVEMBRE_BLEU: {
    evenement: "Novembre bleu",
    accroche:
      "La boutique passe au bleu, en soutien à la sensibilisation aux cancers masculins.",
    accrocheCatalogue:
      "Chaque bijou est fait main et créé à l'unité. La boutique passe au bleu pour Novembre bleu.",
    motifs: ["ruban", "moustache", "ruban"],
    mouvement: "monte",
    annonce: true,
  },
  HIVER: {
    evenement: "L'hiver est là",
    accroche:
      "Des pièces faites main, un éclat à glisser sous une écharpe quand les jours sont courts.",
    accrocheCatalogue:
      "Chaque bijou est fait main et créé à l'unité, un éclat pour les jours courts.",
    motifs: ["flocon", "flocon", "etoile"],
    mouvement: "tombe",
    annonce: false,
  },
} as const satisfies Partial<Record<ThemeSaisonnier, Ambiance>>;

export type ThemeAmbiance = keyof typeof AMBIANCES;

/** L'ambiance d'un thème de LS-323, `null` pour les autres thèmes. */
export function ambianceDe(theme: ThemeSaisonnier): Ambiance | null {
  return theme in AMBIANCES ? AMBIANCES[theme as ThemeAmbiance] : null;
}

/**
 * Les thèmes dont des décors bougent EN CONTINU, ADR-045 amendé par LS-277,
 * LS-318 puis LS-323 : ils exigent le bouton de pause, WCAG 2.2.2.
 */
export function aMouvementContinu(theme: ThemeSaisonnier): boolean {
  return (
    estThemeDeNoel(theme) ||
    estThemeBlackWeek(theme) ||
    ambianceDe(theme) !== null
  );
}
