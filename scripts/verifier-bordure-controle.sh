#!/bin/bash
# Vérifie que la limite visible d'un contrôle de saisie atteint le seuil WCAG
# 2.2 AA de 3:1, critère 1.4.11 « contraste des éléments non textuels », règle
# C36 de `frontend-design.md`, LS-108.
#
# POURQUOI UN SCRIPT DE PLUS ALORS QUE `verifier-contraste.sh` EXISTE. Celui-là
# écarte délibérément les propriétés en `-color` par un `(?<!-)` devant `color`,
# et il a raison de le faire : sans lui, une bordure décorative serait mesurée
# comme du texte et le contrôle accuserait du code correct. La conséquence est
# qu'AUCUNE bordure n'est mesurée nulle part, ce qui a laissé passer le défaut
# de LS-108 pendant vingt-trois jours sur vingt-cinq fichiers d'écran, comptés
# dans le diff de la story et non repris du relevé initial, qui en disait huit.
#
# Les deux scripts mesurent donc deux choses disjointes, avec deux seuils que la
# norme distingue :
#
#   verifier-contraste.sh    texte sur fond          4,5:1, ou 3:1 si large
#   ce script                bordure d'un contrôle   3:1, sans exception de taille
#
# CE QUE CE CONTRÔLE VÉRIFIE, DANS LES DEUX SENS :
#
#   1. `--ls-border-controle` atteint 3:1 sur CHACUN des fonds de `tokens.css`
#      sur lesquels un contrôle peut être posé
#   2. la bordure de tout sélecteur portant un contrôle atteint 3:1 sur le fond
#      que ce même bloc peint
#
# LE SENS 2 EST CELUI QUI ATTRAPE LA RÉCIDIVE. Poser un jeton conforme ne suffit
# pas : le défaut d'origine ne venait pas d'une couleur mal choisie mais d'un
# jeton décoratif employé là où il ne pouvait pas l'être, et rien n'empêche
# l'écran suivant de le refaire par recopie d'un voisin. Un contrôle qui ne
# vérifierait que la valeur du jeton resterait vert le jour de la rechute.
#
# IL MESURE UNE PAIRE, IL NE POLICE PAS UN NOM, et c'est la nuance qui a manqué
# à ses deux premières écritures. Chercher `var(--ls-border)` sur un contrôle
# laisse passer TOUT le reste : la revue de cette story a trouvé trois champs de
# saisie bordés de `--ls-text-muted`, contournement local posé de bonne foi en
# attendant ce jeton. Ils étaient conformes, 4,86:1, et invisibles au contrôle.
# Une couleur littérale, `#d9cdba` écrite en dur, passait de la même façon.
#
# EXIGER LE JETON DÉDIÉ À LA PLACE serait l'erreur inverse, et elle a été
# mesurée : treize boutons du dépôt bordent avec `--ls-primary`, à 8,93:1, parce
# qu'un bouton primaire porte la couleur de son propre aplat. Les pousser vers
# un jeton à 3,66:1 DÉGRADERAIT leur contraste au nom de la conformité.
#
# La règle est donc celle de C31, appliquée à une bordure : ce qui se mesure est
# une paire. Le jeton `--ls-border-controle` existe pour le cas majoritaire, une
# limite discrète sur fond clair ; toute autre couleur est admise dès lors
# qu'elle atteint 3:1 sur le fond réellement peint.
#
# COMMENT UN CONTRÔLE EST RECONNU, ET POURQUOI PAS PAR SON NOM. La liste des
# noms de classe d'un projet n'est pas close : `.saisie`, `.zoneTexte`,
# `.rechercheChamp` et `.selecteur` désignent tous un champ sans partager un
# radical. Un contrôle nominatif resterait vert sur le nom qu'aucune liste
# n'anticipe, motif déjà payé sur ce dépôt avec `verifier-contraste.sh`.
#
# La reconnaissance se fait donc sur DEUX FAITS lus dans le CSS lui-même :
#
#   a. le sélecteur nomme un élément de formulaire, `input`, `select`,
#      `textarea` ou `button`
#   b. ou son bloc porte une marque d'interactivité que seul un contrôle
#      arbore : `cursor: pointer`, `min-height: var(--ls-touch-target)`,
#      ou `font: inherit` / `font-family: inherit`
#
# Le fait (b) donne des faux positifs possibles, et c'est assumé dans ce sens :
# un élément décoratif accusé à tort se corrige en une ligne d'exemption écrite,
# quand un contrôle manqué reste illisible pour de vrai. La règle du projet est
# explicite, à la frontière garder une ligne de trop vaut mieux qu'en supprimer
# une qui pouvait servir.
#
# LES CONTRÔLES DÉSACTIVÉS SONT EXEMPTÉS PAR LA NORME ELLE-MÊME, WCAG 1.4.11
# écartant explicitement les composants inactifs. Six blocs `:disabled` du dépôt
# gardent donc une bordure hors du jeton dédié, relevés le 6 septembre 2026 : un
# bouton désactivé bien contrasté se lirait comme actionnable, ce qui est le
# défaut inverse. Deux d'entre eux portent en plus leur raison écrite.
#
# L'EXEMPTION S'ÉCRIT DANS LE CSS, PAS DANS CE SCRIPT. Un contrôle que rien
# d'autre n'identifie a besoin de sa bordure ; un bouton qui porte son propre
# fond, ou un lien dont le texte suffit, n'entre pas dans 1.4.11 puisque son
# trait ne l'identifie pas. Ces cas existent, ce script en a trouvé quatre que
# la revue manuelle avait ratés, et les nier produirait des bordures plus
# sombres sans aucun gain d'accessibilité.
#
# La forme retenue est un marqueur `@bordure-decorative` posé DANS un
# commentaire au-dessus du bloc, suivi de sa raison. Deux propriétés le rendent
# préférable à une liste tenue dans ce script :
#
#   - l'exemption vit à côté du code qu'elle exempte, donc elle se lit au moment
#     où quelqu'un modifie ce bloc, et elle disparaît avec lui
#   - une liste centrale se périme en silence quand un sélecteur est renommé,
#     et le contrôle redevient vert sans que personne ne l'ait décidé
#
# LE MARQUEUR EXIGE UNE RAISON NON VIDE, sans quoi il deviendrait un interrupteur
# qu'on pose pour faire taire le script. Motif « contrôle satisfait par un
# commentaire », déjà en fiche sur ce dépôt.
#
# Usage : ./scripts/verifier-bordure-controle.sh
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

node - "$SOURCE" "$JETONS" <<'NODE'
const fs = require("fs");
const path = require("path");
const [, , source, cheminJetons] = process.argv;

/* Formule WCAG 2.2, identique à `verifier-contraste.sh`. */
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

const SEUIL = 3.0;
const JETON_CONTROLE = "--ls-border-controle";
const JETON_DECOR = "--ls-border";

const jetons = new Map();
for (const m of sansCommentaires(fs.readFileSync(cheminJetons, "utf8"))
  .matchAll(/(--ls-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
  jetons.set(m[1], m[2]);
}

const echecs = [];

/* -------------------------------------------------------------------------
 * Sens 1 : le jeton de bordure de contrôle tient 3:1 sur tous les fonds.
 *
 * LES FONDS SONT LUS DANS `tokens.css`, JAMAIS ÉCRITS ICI. Une liste tenue à la
 * main dans ce script se périmerait le jour où la palette gagne une surface, et
 * le contrôle resterait vert sur le fond neuf. C31 dit que ce qui se mesure est
 * une paire : encore faut-il que les deux termes viennent de la même source.
 * ------------------------------------------------------------------------- */
const bordure = jetons.get(JETON_CONTROLE);

if (!bordure) {
  console.log(`ECHEC ${JETON_CONTROLE} absent de tokens.css`);
  console.log("      c'est le jeton que ce contrôle protège : sans lui, il ne");
  console.log("      mesure plus rien et son vert ne veut rien dire.");
  process.exit(1);
}

/*
 * Un contrôle peut être posé sur une surface, un fond de page ou un fond de
 * panneau. Le préfixe retenu couvre ces trois familles, et le suffixe `-actif`
 * de l'administration qui est un fond de rubrique courante.
 */
const fonds = [...jetons.entries()].filter(
  ([nom]) =>
    /^--ls-(background|surface|surface-sand|admin-barre|admin-actif)$/.test(nom),
);

if (fonds.length < 3) {
  console.log("ECHEC moins de trois fonds reconnus dans tokens.css :");
  console.log("      l'ancrage est cassé, les noms de surfaces ont changé.");
  process.exit(1);
}

console.log(`Jeton mesuré : ${JETON_CONTROLE} ${bordure}`);
for (const [nom, valeur] of fonds) {
  const mesure = rapport(bordure, valeur);
  const verdict = mesure >= SEUIL ? "OK    " : "ECHEC ";
  console.log(`  ${verdict}sur ${nom} ${valeur} : ${mesure.toFixed(2)}:1`);
  if (mesure < SEUIL) {
    echecs.push(
      `${JETON_CONTROLE} mesure ${mesure.toFixed(2)}:1 sur ${nom}, ` +
        `seuil ${SEUIL.toFixed(1)}:1`,
    );
  }
}

/* -------------------------------------------------------------------------
 * Sens 2 : aucun contrôle n'est bordé par le jeton décoratif.
 * ------------------------------------------------------------------------- */
const modules = [];
(function descendre(dossier) {
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) {
      if (entree.name !== "generated") descendre(complet);
    } else if (
      entree.name.endsWith(".module.css") ||
      entree.name === "globals.css"
    ) {
      modules.push(complet);
    }
  }
})(source);

const nommeUnElementDeFormulaire = (selecteur) =>
  /(^|[\s>+~(])(input|select|textarea|button)([\s>+~:.\[,)]|$)/i.test(selecteur);

const porteUneMarqueDInteractivite = (corps) =>
  /cursor:\s*pointer/.test(corps) ||
  /min-height:\s*var\(--ls-touch-target\)/.test(corps) ||
  /font(-family)?:\s*inherit/.test(corps);

/*
 * UN BLOC D'ÉTAT HÉRITE DU VERDICT DE SA BASE, et sans cela le contrôle a un
 * angle mort exact : `.actionSecondaire:hover { border-color: var(--ls-border) }`
 * ne porte ni nom d'élément, ni `cursor`, ni `min-height`, ces propriétés vivant
 * dans le bloc de base. Il passait vert, mesuré pendant la revue de LS-108.
 *
 * C'EST LA FORME QUE PRENDRA LA RECHUTE. On ajoute un état à un composant
 * existant, jamais un bloc complet : le geste naturel est précisément celui que
 * le contrôle ne voyait pas. Aucune occurrence réelle aujourd'hui, et le cas est
 * fermé maintenant plutôt qu'après.
 *
 * La base est le sélecteur privé de ses pseudo-classes et pseudo-éléments.
 */
const base = (selecteur) => selecteur.split(/::?[a-z-]/)[0].trim();

/*
 * Un état désactivé est hors du champ de 1.4.11. Le motif couvre `:disabled` et
 * l'attribut `[disabled]`, les deux formes présentes dans un module CSS.
 */
const estDesactive = (selecteur) => /:disabled|\[disabled\]/.test(selecteur);

let fichiersExamines = 0;
let controlesExamines = 0;
let exemptions = 0;

/*
 * PREMIÈRE PASSE : recenser les bases qui sont des contrôles. Le bloc d'état
 * pouvant précéder sa base dans le fichier, un seul parcours ne suffirait pas.
 */
const basesDeControle = new Set();
for (const fichier of modules) {
  const txt = sansCommentaires(fs.readFileSync(fichier, "utf8"));
  for (const bloc of txt.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selecteur = bloc[1].trim().split("\n").pop().trim();
    if (
      nommeUnElementDeFormulaire(selecteur) ||
      porteUneMarqueDInteractivite(bloc[2])
    ) {
      basesDeControle.add(`${fichier}::${base(selecteur)}`);
    }
  }
}

/*
 * LES SÉLECTEURS EXEMPTÉS SE LISENT AVANT LA SUPPRESSION DES COMMENTAIRES, le
 * marqueur vivant précisément dans un commentaire. Un commentaire qui porte
 * `@bordure-decorative` exempte le PREMIER bloc qui le suit, et lui seul :
 * exempter tout ce qui suit ferait d'un marqueur posé en tête de fichier une
 * dispense générale.
 */
const exemptes = new Map();
for (const fichier of modules) {
  const brut = fs.readFileSync(fichier, "utf8");
  /*
   * LE COMMENTAIRE RETENU EST CELUI QUI TOUCHE LE BLOC, et le `(?:(?!\*\/)[\s\S])`
   * l'impose : un `[\s\S]*?` naïf capturerait le commentaire PRÉCÉDENT, dont le
   * `*\/` de fermeture ferait office d'ouverture, et le marqueur posé juste
   * au-dessus du sélecteur serait alors invisible. Deux exemptions sur quatre
   * ont échoué ainsi à la première écriture de ce script.
   */
  for (const m of brut.matchAll(
    /\/\*((?:(?!\*\/)[\s\S])*)\*\/\s*([^{}*\/]+?)\s*\{/g,
  )) {
    if (!/@bordure-decorative/.test(m[1])) continue;
    const selecteur = m[2].trim().split("\n").pop().trim();
    /*
     * La raison est ce qui suit le marqueur sur sa ligne et les suivantes,
     * débarrassé des astérisques de bordure du commentaire.
     */
    const apres = m[1].split("@bordure-decorative")[1] || "";
    const raison = apres.replace(/^[\s*:]+/, "").replace(/[\s*]+$/, "");
    exemptes.set(`${fichier}::${selecteur}`, raison);
  }
}

for (const fichier of modules.sort()) {
  fichiersExamines += 1;
  const txt = sansCommentaires(fs.readFileSync(fichier, "utf8"));

  for (const bloc of txt.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selecteur = bloc[1].trim().split("\n").pop().trim();
    const corps = bloc[2];

    const estControle =
      nommeUnElementDeFormulaire(selecteur) ||
      porteUneMarqueDInteractivite(corps) ||
      basesDeControle.has(`${fichier}::${base(selecteur)}`);
    if (!estControle) continue;
    if (estDesactive(selecteur)) continue;

    controlesExamines += 1;

    /*
     * `border`, `border-color`, `border-top` et leurs variantes. Le motif ne
     * cible que la bordure : un `background` sur un contrôle serait un fond,
     * mesuré par l'autre script avec son texte.
     *
     * `border: 0` ET `border: none` NE SONT PAS DES BORDURES, et les écarter
     * ici évite d'accuser un bouton qui n'en porte aucune.
     */
    const b = corps.match(
      /\bborder(?:-(?:top|right|bottom|left|block|inline)(?:-(?:color|width|style))?|-color)?:\s*([^;]*)/,
    );
    if (!b) continue;

    const declaration = b[1].trim();
    if (/^(0|none)\b/.test(declaration)) continue;
    if (!/#[0-9a-fA-F]{3,8}|var\(--/.test(declaration)) continue;

    /*
     * `transparent` et `currentColor` ne sont pas des couleurs de palette : la
     * première est une bordure invisible assumée, la seconde suit la couleur du
     * texte, que `verifier-contraste.sh` mesure de son côté.
     */
    if (/\b(transparent|currentColor)\b/.test(declaration)) continue;

    const emploi = declaration.match(/var\((--ls-[a-z0-9-]+)\)/);
    const nomme = emploi ? emploi[1] : declaration.match(/#[0-9a-fA-F]{3,8}/)?.[0];
    const couleur = emploi ? jetons.get(emploi[1]) : nomme;
    if (!couleur) continue;

    /*
     * LE FOND EST CELUI QUE CE BLOC PEINT, jamais un fond supposé. Sans
     * `background` déclaré ici, le fond vient d'un ancêtre qui vit dans le JSX :
     * le repli sur `--ls-surface` retiendrait alors le fond le plus clair du
     * projet, donc le verdict le PLUS SÉVÈRE des trois surfaces. Se tromper dans
     * ce sens refuse une paire conforme, ce qui se corrige en déclarant le fond ;
     * se tromper dans l'autre laisse passer un défaut réel.
     */
    const f = corps.match(/\bbackground(?:-color)?:\s*[^;]*var\((--ls-[a-z0-9-]+)\)/);
    const nomFond = f ? f[1] : "--ls-surface";
    const fond = jetons.get(nomFond);
    if (!fond) continue;

    /*
     * UN APLAT S'IDENTIFIE PAR LUI-MÊME, et sa bordure de même couleur ne dit
     * rien de plus, WCAG 1.4.11 ne s'appliquant qu'à ce qui identifie le
     * contrôle. Un bouton plein en `--ls-primary` borde avec `--ls-primary` :
     * mesurer le trait contre son propre aplat rend 1,00:1 et accuserait cinq
     * boutons parfaitement lisibles, dont le fond donne 8,93:1 avec la page.
     *
     * CE N'EST PAS UNE DISPENSE POUR LES BOUTONS, c'est le constat qu'il n'y a
     * là aucune bordure au sens visuel : le trait et l'aplat sont une seule et
     * même surface. Un bouton dont le trait DIFFÈRE de son fond reste mesuré,
     * ce trait étant alors une vraie limite.
     */
    if (f && couleur.toLowerCase() === fond.toLowerCase()) continue;

    const mesure = rapport(couleur, fond);
    if (mesure >= SEUIL) continue;

    const cle = `${fichier}::${selecteur}`;
    if (exemptes.has(cle)) {
      const raison = exemptes.get(cle);
      /*
       * UN MARQUEUR SANS RAISON N'EXEMPTE RIEN. Le seuil de vingt caractères
       * écarte le `@bordure-decorative` posé seul ou suivi d'un mot, qui ne
       * dit pas POURQUOI le trait n'identifie pas le contrôle.
       */
      if (raison.length >= 20) {
        exemptions += 1;
        continue;
      }
      echecs.push(
        `${path.relative(path.dirname(source), fichier)} : ${selecteur} porte ` +
          "@bordure-decorative sans raison écrite (20 caractères au moins)",
      );
      continue;
    }

    echecs.push(
      `${path.relative(path.dirname(source), fichier)} : ${selecteur} borde ` +
        `un contrôle avec ${nomme} sur ${nomFond}, ` +
        `${mesure.toFixed(2)}:1 pour un seuil de ${SEUIL.toFixed(1)}:1`,
    );
  }
}

console.log(`Fichiers de style examinés : ${fichiersExamines}`);
console.log(`Sélecteurs de contrôle examinés : ${controlesExamines}`);
console.log(`Exemptions écrites et motivées : ${exemptions}`);

for (const e of echecs) {
  console.log(`ECHEC ${e}`);
}

if (echecs.length > 0) {
  console.log(`      ${JETON_DECOR} vaut ${jetons.get(JETON_DECOR)} et donne`);
  console.log("      1,57:1 sur blanc : il ne peut pas border un contrôle que");
  console.log("      rien d'autre n'identifie. Employer");
  console.log(`      ${JETON_CONTROLE}, une couleur mesurée à 3:1 sur le`);
  console.log("      fond réellement peint, ou écrire l'exemption motivée.");
}

/*
 * L'ANCRAGE SE PROUVE, DEUX FOIS, même motif que `verifier-contraste.sh`. Zéro
 * fichier signifie que le script ne regarde plus rien ; zéro contrôle est plus
 * perfide, les fichiers étant lus sans que leur forme soit reconnue.
 */
if (fichiersExamines === 0) {
  console.log("ECHEC aucun fichier de style examiné : l'ancrage est cassé");
  process.exit(1);
}

if (controlesExamines === 0) {
  console.log("ECHEC aucun sélecteur de contrôle reconnu alors que des");
  console.log("      fichiers ont été lus : la reconnaissance ne voit plus la");
  console.log("      forme des contrôles, et un contrôle muet est pire que rien.");
  process.exit(1);
}

process.exit(echecs.length);
NODE

mesure=$?
ko=$((ko + mesure))

# ---------------------------------------------------------------------------
# Sens 3 : la règle est toujours écrite.
#
# Un contrôle qui applique une prescription qu'aucun document ne porte laisse la
# session suivante l'ignorer de bonne foi, motif « règle incomplète franchie de
# bonne foi » déjà en fiche sur ce dépôt : c'est exactement ainsi que le défaut
# de LS-108 est entré, `frontend-design.md` n'écrivant aucun seuil de bordure.
#
# LES MOTIFS TIENNENT SUR UN SEUL MOT, les documents étant enveloppés à 80
# colonnes : une expression de plusieurs mots peut être coupée par un retour à
# la ligne et échapper à un grep ligne à ligne.
# ---------------------------------------------------------------------------
if ! grep -q '1.4.11' "$REGLE"; then
  echo "ECHEC frontend-design.md ne cite plus le critère WCAG 1.4.11"
  echo "      c'est lui qui fonde le seuil de 3:1 sur une bordure de contrôle"
  ko=$((ko + 1))
fi

if ! grep -q '3:1' "$REGLE"; then
  echo "ECHEC frontend-design.md n'énonce plus le seuil de 3:1"
  ko=$((ko + 1))
fi

if ! grep -q 'C36' "$REGLE"; then
  echo "ECHEC frontend-design.md ne porte plus la règle C36"
  echo "      une règle numérotée se cite par son identifiant : sans lui, les"
  echo "      contrôles textuels ne la retrouvent plus."
  ko=$((ko + 1))
fi

if ! grep -q 'border-controle' "$REGLE"; then
  echo "ECHEC frontend-design.md ne nomme plus --ls-border-controle"
  echo "      un jeton que la règle ne nomme pas ne sera pas employé"
  ko=$((ko + 1))
fi

echo
if [ "$ko" -eq 0 ]; then
  echo "OK toute bordure de contrôle atteint le seuil de 3:1, LS-108"
else
  echo "$ko problème(s) détecté(s)"
fi

exit "$ko"
