#!/bin/bash
# Vérifie que toute paire couleur de texte et fond employée dans `src/` atteint
# le seuil de contraste WCAG 2.2 AA, LS-84, ADR-022 et les règles de contraste
# de `frontend-design.md`.
#
# CE CONTRÔLE EST GÉNÉRIQUE, ET C'EST UN ARBITRAGE DE CHRISTOPHE du 19 août
# 2026. La story ne demandait au départ qu'un contrôle sur le jeton terracotta.
# Un contrôle nominatif resterait vert le jour où une session introduirait une
# couleur insuffisante portant un autre nom, et ce jour est déjà arrivé deux
# fois sur ce dépôt avec `--ls-text-muted`, jeton parfaitement légitime.
#
# CE QUI SE MESURE ICI EST UNE PAIRE, JAMAIS UNE COULEUR. Un rapport annoncé à
# côté d'un jeton ne vaut que pour UN fond, et rien dans le jeton ne dit lequel :
#
#   --ls-text-muted  #7A6A5D  sur crème #FBF7F0  ->  4,86:1  conforme
#   --ls-text-muted  #7A6A5D  sur sable #F2EADF  ->  4,35:1  NON CONFORME
#
# Le même jeton, deux verdicts. `tokens.css` annonce « 4,86:1, AA » et dit vrai,
# pour le fond crème seulement. Interdire le jeton serait faux, l'autoriser sans
# regarder son fond l'est aussi.
#
# POURQUOI IL NE FAIT PAS DOUBLE EMPLOI AVEC axe-core, qui mesure déjà le
# contraste sur le rendu réel dans la suite de bout en bout. `axe-core` ne voit
# que ce qui est RENDU, et une branche que les données de test ne produisent
# jamais lui est invisible. Deux défauts réels sont passés par ce trou :
#
#   LS-121  4,04:1  jamais rendu faute d'une commande remboursée en données
#   LS-130  4,35:1  l'état vide d'une file qui portait toujours une commande
#
# L'état vide est pourtant celui qu'on voit le plus souvent sur une file de
# préparation. Ce contrôle lit le CSS et non le rendu : il voit les états que
# personne n'amorce, ce qui est précisément son intérêt et sa limite.
#
# CE QU'IL NE VOIT PAS, ET QUI EST ASSUMÉ. Une couleur de texte déclarée SANS
# fond dans le même sélecteur hérite du fond d'un ancêtre, et cet ancêtre vit
# dans le JSX, pas dans le CSS. Mesuré au 2 septembre 2026 : 81 paires sont
# colocalisées donc mesurables ici, 166 déclarations de couleur ne le sont pas.
#
# Reconstruire l'arbre demanderait de parser le TSX et de suivre les
# composants. Un contrôle qui devine une imbrication accuse tôt ou tard du code
# correct, et un contrôle qui accuse à tort finit désactivé : c'est ainsi qu'on
# perd les deux. Les trois cas de texte CLAIR sans fond déclaré du dépôt sont
# tous corrects, tous enfants d'un bloc qui peint un fond sombre.
#
# CE TROU EST COUVERT PAR L'AUTRE BOUT. `axe-core` mesure le contraste sur le
# rendu réel, avec le fond effectivement hérité, sur quatorze écrans de la suite
# de bout en bout. Les deux contrôles sont complémentaires et aucun ne remplace
# l'autre :
#
#   axe-core    voit l'héritage    ne voit que les branches rendues
#   ce script   voit toute branche ne voit pas l'héritage
#
# Retirer l'un des deux rouvre la moitié du trou, et la moitié rouverte est
# silencieuse dans les deux sens.
#
# CE QUE CE CONTRÔLE VÉRIFIE, DANS LES DEUX SENS :
#
#   1. toute paire couleur et fond colocalisée dans `src/` atteint son seuil
#   2. les règles de contraste et le seuil de 18,66 px sont toujours écrits dans
#      `frontend-design.md`, sans quoi le contrôle protégerait une règle que plus
#      rien n'énonce
#
# LE SENS 2 EXISTE PARCE QU'UN CONTRÔLE À SENS UNIQUE MENT PAR OMISSION, même
# motif que `verifier-rendu-texte-simple.sh` dont ce script reprend la forme.
#
# POURQUOI NODE ET NON PYTHON. La formule WCAG demande une exponentiation sur
# des canaux linéarisés, hors de portée de bash. Node est déjà employé par trois
# scripts de ce dossier et le projet en dépend par `engines` : Python n'est
# utilisé nulle part, et l'introduire ajouterait à la CI une dépendance que rien
# ne déclare.
#
# Usage : ./scripts/verifier-contraste.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$RACINE/src"
JETONS="$RACINE/src/styles/tokens.css"
REGLE="$RACINE/.claude/rules/frontend-design.md"
ko=0

[ -d "$SOURCE" ] || { echo "ECHEC dossier source introuvable : $SOURCE"; exit 1; }
[ -r "$JETONS" ] || { echo "ECHEC jetons de design illisibles : $JETONS"; exit 1; }
[ -r "$REGLE" ] || { echo "ECHEC règle de conception illisible : $REGLE"; exit 1; }

# ---------------------------------------------------------------------------
# Sens 1 : mesurer chaque paire.
#
# LES COMMENTAIRES PARTENT AVANT TOUTE ANALYSE, et ce n'est pas un détail de
# confort. Cinq fichiers de `src/` citent une valeur hexadécimale DANS un
# commentaire pour expliquer une mesure passée, `--ls-warning vaut #A9741A, soit
# 4,04:1` en tête. Les compter comme des déclarations rendrait le contrôle rouge
# sur du code exemplaire, et la réaction serait de retirer l'explication. Motif
# « contrôle satisfait par un commentaire », déjà en fiche sur ce dépôt.
# ---------------------------------------------------------------------------
node - "$SOURCE" "$JETONS" <<'NODE'
const fs = require("fs");
const path = require("path");
const [, , source, cheminJetons] = process.argv;

/*
 * Formule WCAG 2.2, canaux linéarisés puis luminance relative pondérée.
 * Les trois coefficients et le seuil de 0,03928 sont ceux de la norme, ils ne
 * s'arrondissent pas.
 */
const canal = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const luminance = (hex) => {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
};

const rapport = (a, b) => {
  const [la, lb] = [luminance(a), luminance(b)];
  const [haut, bas] = la > lb ? [la, lb] : [lb, la];
  return (haut + 0.05) / (bas + 0.05);
};

const sansCommentaires = (txt) => txt.replace(/\/\*[\s\S]*?\*\//g, "");

/* Table des jetons, lue dans tokens.css qui est la seule source de couleurs. */
const jetons = new Map();
for (const m of sansCommentaires(fs.readFileSync(cheminJetons, "utf8"))
  .matchAll(/(--ls-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
  jetons.set(m[1], m[2]);
}

if (jetons.size === 0) {
  console.log("ECHEC aucun jeton de couleur lu dans tokens.css :");
  console.log("      l'ancrage du contrôle est cassé, il ne mesure plus rien.");
  process.exit(1);
}

/* Parcours récursif des modules CSS. */
const modules = [];
(function descendre(dossier) {
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) {
      if (entree.name !== "generated") descendre(complet);
    } else if (entree.name.endsWith(".module.css") || entree.name === "globals.css") {
      modules.push(complet);
    }
  }
})(source);

/*
 * SEUIL. 4,5:1 par défaut, 3:1 pour du texte large au sens de WCAG, c'est-à-dire
 * 18,66 px en gras ou 24 px en graisse normale. Le seuil abaissé ne s'applique
 * que si le sélecteur déclare LUI-MÊME une taille qui l'autorise : un texte
 * large par héritage n'est pas mesurable ici, et le contrôle retient alors le
 * seuil strict. Se tromper dans ce sens refuse une paire conforme, ce qui se
 * corrige en déclarant la taille ; se tromper dans l'autre laisse passer un
 * défaut réel. La règle du projet est explicite : à la frontière, garder une
 * ligne de trop vaut mieux qu'en supprimer une qui pouvait servir.
 */
const REM_PX = 16;
const PX_GRAS = 18.66;
const PX_NORMAL = 24;

const tailleEnPx = (corps) => {
  const m = corps.match(/font-size:\s*([0-9.]+)(px|rem)/);
  if (!m) return null;
  return m[2] === "rem" ? parseFloat(m[1]) * REM_PX : parseFloat(m[1]);
};

const estGras = (corps) => {
  const m = corps.match(/font-weight:\s*(\d{3}|bold)/);
  if (!m) return false;
  return m[1] === "bold" || parseInt(m[1], 10) >= 700;
};

const seuilDe = (corps) => {
  const px = tailleEnPx(corps);
  if (px === null) return 4.5;
  if (estGras(corps) && px >= PX_GRAS) return 3.0;
  if (px >= PX_NORMAL) return 3.0;
  return 4.5;
};

let paires = 0;
let fichiersExamines = 0;
const echecs = [];

for (const fichier of modules.sort()) {
  fichiersExamines += 1;
  const txt = sansCommentaires(fs.readFileSync(fichier, "utf8"));

  for (const bloc of txt.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selecteur = bloc[1].trim().split("\n").pop().trim();
    const corps = bloc[2];

    /*
     * Le `(?<!-)` écarte `border-color`, `outline-color` et `background-color`,
     * qui ne portent aucun texte. Sans lui, une bordure décorative serait
     * mesurée comme du texte et le contrôle accuserait du code correct.
     */
    const c = corps.match(/(?<!-)\bcolor:\s*var\((--ls-[a-z0-9-]+)\)/);
    const f = corps.match(/\bbackground(?:-color)?:\s*var\((--ls-[a-z0-9-]+)\)/);
    if (!c || !f) continue;

    const texte = jetons.get(c[1]);
    const fond = jetons.get(f[1]);
    if (!texte || !fond) continue;

    paires += 1;
    const seuil = seuilDe(corps);
    const mesure = rapport(texte, fond);

    if (mesure < seuil) {
      echecs.push({
        fichier: path.relative(path.dirname(source), fichier),
        selecteur,
        avant: c[1],
        arriere: f[1],
        mesure,
        seuil,
      });
    }
  }
}

for (const e of echecs) {
  console.log(
    `ECHEC ${e.fichier} : ${e.selecteur} mesure ${e.mesure.toFixed(2)}:1, ` +
      `seuil ${e.seuil.toFixed(1)}:1`,
  );
  console.log(`      ${e.avant} sur ${e.arriere}`);
  console.log("      un rapport annoncé à côté d'un jeton ne vaut que pour UN");
  console.log("      fond : recalculer sur le fond réellement peint ici.");
}

console.log(`Fichiers de style examinés : ${fichiersExamines}`);
console.log(`Paires couleur et fond mesurées : ${paires}`);

/*
 * L'ANCRAGE SE PROUVE, DEUX FOIS. Zéro fichier examiné signifie que le contrôle
 * ne regarde plus rien. Zéro paire mesurée est plus perfide : les fichiers sont
 * bien lus, mais l'extraction ne reconnaît plus leur forme, par exemple si le
 * projet passait aux styles en ligne ou à une bibliothèque de composants. Dans
 * les deux cas le script rendrait « OK » sans rien avoir vérifié.
 */
if (fichiersExamines === 0) {
  console.log("ECHEC aucun fichier de style examiné : l'ancrage est cassé");
  console.log("      (src/ déplacé, ou l'extension des modules a changé)");
  process.exit(1);
}

if (paires === 0) {
  console.log("ECHEC aucune paire mesurée alors que des fichiers ont été lus :");
  console.log("      l'extraction ne reconnaît plus la forme des déclarations,");
  console.log("      et un contrôle muet qui rend « OK » est pire que son absence.");
  process.exit(1);
}

process.exit(echecs.length);
NODE

mesure=$?
ko=$((ko + mesure))

# ---------------------------------------------------------------------------
# Sens 2 : les règles de contraste sont toujours énoncées.
#
# LES MOTIFS ÉVITENT LE RETOUR À LA LIGNE. Les documents sont enveloppés à 80
# colonnes : une expression de plusieurs mots peut être coupée en deux et
# échapper à un `grep` ligne à ligne. Chaque motif tient donc sur un seul mot ou
# un seul nombre, et les conditions sont vérifiées séparément.
# ---------------------------------------------------------------------------
if ! grep -q '18,66' "$REGLE"; then
  echo "ECHEC frontend-design.md ne porte plus le seuil chiffré du texte large"
  echo "      « texte large » commence à 18,66 px en gras : sans ce chiffre, la"
  echo "      mention « ou gras » suffit à faire franchir la règle de bonne foi,"
  echo "      ce que le prototype a fait 35 fois."
  ko=$((ko + 1))
fi

if ! grep -q '4,5:1' "$REGLE"; then
  echo "ECHEC frontend-design.md n'énonce plus le seuil AA de 4,5:1"
  ko=$((ko + 1))
fi

if ! grep -q 'accent-terracotta' "$REGLE"; then
  echo "ECHEC frontend-design.md ne porte plus la règle du jeton terracotta"
  ko=$((ko + 1))
fi

if ! grep -q 'accent-gold' "$REGLE"; then
  echo "ECHEC frontend-design.md ne porte plus la règle du jeton doré"
  echo "      --ls-accent-gold plafonne à 2,31:1 et ne porte jamais de texte."
  ko=$((ko + 1))
fi

echo
if [ "$ko" -eq 0 ]; then
  echo "OK toute paire couleur et fond atteint son seuil de contraste, LS-84"
else
  echo "$ko problème(s) détecté(s)"
fi

exit "$ko"
