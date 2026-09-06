#!/bin/bash
# Preuve par mutation de `verifier-bordure-controle.sh`, LS-108.
#
# Motif. Un contrôle qui n'a jamais échoué sur le défaut qu'il prétend attraper
# n'est pas un contrôle. Celui-ci parcourt 94 sélecteurs et n'en trouve aucun
# fautif : son vert est indistinguable de celui d'un script dont la
# reconnaissance ne mordrait plus, tant qu'un contrôle mal bordé ne l'a pas fait
# rougir.
#
# CHAQUE CAS VISE UNE SEULE PIÈCE DU CONTRÔLE, jamais le tout. Une mutation qui
# fait rougir le script pour trois raisons à la fois ne prouve aucune des trois :
# motif « mutation trop brutale », déjà en fiche sur ce dépôt. Les six cas
# couvrent les six mécanismes distincts que le script porte :
#
#   1. la mesure du jeton elle-même, sur le fond le plus exigeant
#   2. la reconnaissance d'un contrôle par son ÉLÉMENT, `input` et compagnie
#   3. la reconnaissance d'un contrôle par sa MARQUE d'interactivité
#   4. le refus d'une exemption posée sans raison écrite
#   5. l'exigence que la règle C36 reste énoncée
#   6. l'exigence que le jeton reste nommé dans la règle
#   7. le refus d'un AUTRE jeton insuffisant, pas seulement du jeton décoratif
#   8. le refus d'une couleur littérale insuffisante, hors de toute palette
#   9. la reconnaissance d'un bloc d'ÉTAT par la base dont il dérive
#
# LE CAS 4 EST CELUI QU'ON OUBLIE. Le mécanisme d'exemption est la seule porte
# de sortie du contrôle : s'il s'ouvrait sur un marqueur nu, n'importe quel
# sélecteur fautif se tairait d'un commentaire de trois mots, et le script
# resterait vert sur le dépôt entier. Une porte de sortie non éprouvée est une
# porte grande ouverte.
#
# Usage : ./scripts/verifier-bordure-controle-mutation.sh
# Aucun prérequis, ni Docker ni base.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-bordure-controle.sh"
REGLE=".claude/rules/frontend-design.md"
JETONS="src/styles/tokens.css"
TEMOIN="src/styles/temoin-mutation-bordure.module.css"

detectes=0
total=0

# LA RESTAURATION NE PASSE PAS PAR GIT, motif déjà mesuré sur ce dépôt :
# `git checkout` est atomique et échoue en entier sur un chemin non suivi, ce
# qui laisserait les fichiers suivis non restaurés eux non plus.
#
# TOUT FICHIER MUTÉ FIGURE ICI, `$TEMOIN` compris via `rm`. Une mutation restée
# sur le disque réintroduirait en silence le défaut que la story vient de
# fermer, et un fichier de style neuf n'est récupérable nulle part.
SAUVEGARDE="$(mktemp -d)"

sauvegarder() {
  local fichier index=0
  for fichier in "$REGLE" "$JETONS"; do
    [ -r "$fichier" ] || { echo "ECHEC fichier illisible : $fichier"; exit 1; }
    cp "$fichier" "$SAUVEGARDE/$index"
    index=$((index + 1))
  done
}

restaurer() {
  local fichier index=0
  for fichier in "$REGLE" "$JETONS"; do
    if [ -r "$SAUVEGARDE/$index" ]; then
      cp "$SAUVEGARDE/$index" "$fichier"
    fi
    index=$((index + 1))
  done
  rm -f "$TEMOIN"
}

nettoyer() {
  restaurer
  rm -rf "$SAUVEGARDE"
}

sauvegarder
trap nettoyer EXIT

# `$CONTROLE` est appelé SANS pipe vers grep : le pipe renverrait le code de
# grep et non celui du contrôle, ce qui avait fait passer sept mutations pour
# « non détectées » à tort sur ce projet.
attendre_echec() {
  local libelle="$1"
  total=$((total + 1))

  if "$CONTROLE" >/dev/null 2>&1; then
    echo "NON DETECTE  $libelle"
  else
    echo "detecte      $libelle"
    detectes=$((detectes + 1))
  fi

  restaurer
}

# Vérifie qu'une substitution a bien mordu. Une cible déplacée par un
# reformatage laisserait le fichier intact, et le cas testerait alors le dépôt
# sain en accusant le contrôle.
muter() {
  local fichier="$1" expression="$2"
  local avant
  avant=$(cksum <"$fichier")

  perl -0pi -e "$expression" "$fichier"

  if [ "$(cksum <"$fichier")" = "$avant" ]; then
    echo "ECHEC la mutation n'a modifié aucun caractère de $fichier"
    echo "      l'expression ne correspond plus au code : corriger le script."
    exit 1
  fi
}

echo "État de référence, avant toute mutation"
if ! "$CONTROLE" >/dev/null 2>&1; then
  echo "  ECHEC le contrôle n'est pas vert AVANT mutation."
  echo "        Aucune mutation ne peut rien prouver dans cet état."
  exit 1
fi
echo "  OK    le contrôle est vert, les mutations peuvent commencer"
echo

# ---------------------------------------------------------------------------
# Cas 1 : le jeton de bordure est éclairci jusque sous le seuil.
#
# CE CAS EXERCE LA MESURE, et non la reconnaissance des sélecteurs. La valeur
# choisie, `#a89170`, n'est pas prise au hasard : elle donne 3,02:1 sur BLANC,
# donc elle passerait un contrôle qui ne regarderait que la surface la plus
# claire, et 2,53:1 sur SABLE où elle échoue. C'est le piège de C31 rejoué sur
# une bordure, et c'est le candidat qui a été écarté à l'arbitrage du jeton.
#
# Un script qui mesurerait un seul fond resterait vert ici.
# ---------------------------------------------------------------------------
muter "$JETONS" 's/--ls-border-controle: #95836a;/--ls-border-controle: #a89170;/'
attendre_echec "jeton éclairci, conforme sur blanc mais 2,53:1 sur sable"

# ---------------------------------------------------------------------------
# Cas 2 : un champ de saisie bordé par le jeton décoratif.
#
# C'EST LE DÉFAUT RÉEL DE LS-108, rejoué à l'identique sur la forme exacte qu'il
# avait sur vingt-cinq fichiers d'écran : un `input` dans un bloc `.champ`, bordé
# par le jeton
# décrit « décoratif » dans `tokens.css`.
#
# Il exerce la reconnaissance par ÉLÉMENT : le sélecteur ne porte aucune marque
# d'interactivité, ni `cursor: pointer`, ni `min-height`, ni `font: inherit`.
# Seul le mot `input` dit que c'est un contrôle.
# ---------------------------------------------------------------------------
cat > "$TEMOIN" <<'TEMOIN_FIN'
.champ input {
  padding: var(--ls-space-3);
  border: 1px solid var(--ls-border);
  background: var(--ls-surface);
}
TEMOIN_FIN
attendre_echec "champ de saisie bordé du jeton décoratif, 1,57:1"

# ---------------------------------------------------------------------------
# Cas 3 : un bouton reconnu par sa seule marque d'interactivité.
#
# LE SÉLECTEUR NE NOMME AUCUN ÉLÉMENT DE FORMULAIRE, `.actionSecondaire` étant
# un nom que rien ne relie à `button`. C'est le cas que la liste écrite à la
# main aurait raté, et le dépôt en porte quatre de cette forme : `.saisie`,
# `.zoneTexte`, `.rechercheChamp`, `.selecteur`.
#
# SANS CE CAS, la reconnaissance par marque ne serait jamais exercée, et le
# script pourrait se réduire à chercher `input|select|textarea|button` sans que
# rien ne rougisse.
# ---------------------------------------------------------------------------
cat > "$TEMOIN" <<'TEMOIN_FIN'
.actionSecondaire {
  min-height: var(--ls-touch-target);
  border: 1px solid var(--ls-border);
  cursor: pointer;
}
TEMOIN_FIN
attendre_echec "bouton reconnu par sa marque tactile, hors de tout nom connu"

# ---------------------------------------------------------------------------
# Cas 4 : une exemption posée sans raison écrite.
#
# LA PORTE DE SORTIE EST ÉPROUVÉE ICI, et c'est le cas le plus important du lot.
# Le marqueur est présent, la forme est correcte, et la raison tient en deux
# mots. Si le script se contentait de chercher `@bordure-decorative`, n'importe
# quel défaut se tairait d'un commentaire de trois mots.
#
# Motif « contrôle satisfait par un commentaire », déjà payé sur ce dépôt.
# ---------------------------------------------------------------------------
cat > "$TEMOIN" <<'TEMOIN_FIN'
/* @bordure-decorative decoratif */
.champ input {
  border: 1px solid var(--ls-border);
  cursor: pointer;
}
TEMOIN_FIN
attendre_echec "exemption posée sans raison écrite, marqueur nu"

# ---------------------------------------------------------------------------
# Cas 5 : le critère WCAG disparaît du document de conception.
#
# SANS CE CAS, LE SENS DOCUMENTAIRE SERAIT DÉCORATIF. C'est l'absence de règle
# écrite qui a produit le défaut d'origine : `frontend-design.md` énonçait deux
# seuils, tous deux sur du TEXTE, et une session qui les respectait à la lettre
# bordait quand même ses champs avec le jeton décoratif.
#
# Un contrôle qui applique une prescription qu'aucun document ne porte se fait
# désactiver à la première session qui ne comprend pas pourquoi il rougit.
# ---------------------------------------------------------------------------
muter "$REGLE" 's/1\.4\.11/1.4.douze/g'
attendre_echec "critère 1.4.11 retiré de frontend-design.md"

# ---------------------------------------------------------------------------
# Cas 6 : la règle ne nomme plus le jeton.
#
# DISTINCT DU CAS 5, et la nuance compte : un document peut citer le critère
# WCAG en laissant tomber le nom du jeton qui l'applique. La session suivante
# lirait « 3:1 sur les bordures » sans savoir avec quoi le faire, et
# fabriquerait une couleur locale par écran, ce que la story ferme précisément.
# ---------------------------------------------------------------------------
muter "$REGLE" 's/--ls-border-controle/--ls-bordure-jadis/g'
attendre_echec "jeton retiré du nom de la règle C36"

# ---------------------------------------------------------------------------
# Cas 7 : un contrôle bordé d'un AUTRE jeton, insuffisant sur son fond.
#
# CE CAS EXISTE PARCE QUE LE CONTRÔLE A DÉJÀ ÉTÉ AVEUGLE ICI. Sa première
# écriture cherchait `var(--ls-border)` et rien d'autre : la revue de LS-108 a
# trouvé trois champs de saisie bordés de `--ls-text-muted`, contournement local
# posé de bonne foi en attendant le jeton dédié, et le script les voyait passer.
#
# `--ls-text-muted` sur sable donne 4,35:1, donc il PASSE le seuil de 3:1 : ce
# cas emploie `--ls-accent-gold`, qui plafonne à 2,31:1 et le manque. La mutation
# vise la mesure, jamais le nom du jeton, un bouton primaire bordé de
# `--ls-primary` étant parfaitement légitime à 8,93:1.
# ---------------------------------------------------------------------------
cat > "$TEMOIN" <<'TEMOIN_FIN'
.champ input {
  border: 1px solid var(--ls-accent-gold);
  background: var(--ls-surface);
}
TEMOIN_FIN
attendre_echec "contrôle bordé d'un autre jeton insuffisant, 2,31:1"

# ---------------------------------------------------------------------------
# Cas 8 : une couleur littérale insuffisante, hors de toute palette.
#
# LA VALEUR EST CELLE DU JETON DÉCORATIF, écrite en dur. Un contrôle qui ne
# reconnaîtrait que la forme `var(--ls-...)` laisserait ce défaut entrer sous une
# forme que le dépôt interdit par convention mais qu'aucun script ne mesurait :
# `tokens.css` est la seule source de couleurs, et c'est précisément l'invariant
# que ce cas éprouve du côté du refus.
# ---------------------------------------------------------------------------
cat > "$TEMOIN" <<'TEMOIN_FIN'
.saisie {
  border: 1px solid #d9cdba;
  background: var(--ls-surface);
  font: inherit;
}
TEMOIN_FIN
attendre_echec "couleur littérale insuffisante sur un contrôle, 1,57:1"

# ---------------------------------------------------------------------------
# Cas 9 : une bordure décorative reposée dans un bloc d'état isolé.
#
# LE BLOC `:hover` NE PORTE AUCUNE MARQUE, ni nom d'élément, ni `cursor`, ni
# `min-height` : ces propriétés vivent dans le bloc de base, qui est correct. La
# reconnaissance doit donc remonter du `:hover` à sa base, et ce cas prouve
# qu'elle le fait.
#
# C'EST LA FORME QUE PRENDRA LA RECHUTE, mesurée pendant la revue de LS-108 où
# elle passait au vert. On ajoute un état à un composant existant, jamais un bloc
# complet : le geste naturel était précisément celui que le contrôle ne voyait
# pas. Sans ce cas, l'héritage de verdict pourrait être retiré sans rien faire
# rougir, et l'angle mort se rouvrirait en silence.
# ---------------------------------------------------------------------------
cat > "$TEMOIN" <<'TEMOIN_FIN'
.actionSecondaire {
  min-height: var(--ls-touch-target);
  cursor: pointer;
  border: 1px solid var(--ls-border-controle);
  background: var(--ls-surface);
}

.actionSecondaire:hover {
  border-color: var(--ls-border);
  background: var(--ls-surface);
}
TEMOIN_FIN
attendre_echec "bordure décorative reposée dans un bloc :hover isolé"

echo
echo "Mutations détectées : $detectes / $total"

# La restauration passe par le `trap`, y compris sur sortie en échec.
if [ "$detectes" -ne "$total" ]; then
  echo "ECHEC une mutation au moins n'a pas été détectée :"
  echo "      le contrôle ne garde pas ce qu'il prétend garder."
  exit 1
fi

echo "OK chaque mutation a été détectée par le contrôle, LS-108"
