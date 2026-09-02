#!/bin/bash
# Preuve par mutation de `verifier-contraste.sh`, LS-84.
#
# Motif. Un contrôle qui n'a jamais échoué sur le défaut qu'il prétend attraper
# n'est pas un contrôle. Celui-ci mesure des paires et n'en trouve aucune
# fautive : son vert est indistinguable de celui d'un script qui ne mesure rien,
# tant qu'aucune paire insuffisante ne l'a fait rougir.
#
# LES CAS 1 ET 2 N'EMPLOIENT PAS LE TERRACOTTA, et c'est l'arbitrage de
# Christophe du 19 août 2026. Une mutation sur `--ls-accent-terracotta`
# prouverait le seul cas nominatif que cette décision écarte : elle laisserait
# croire à un contrôle générique sans jamais l'exercer. Les deux cas emploient
# donc `--ls-text-muted` et `--ls-accent-gold-deep`, deux jetons parfaitement
# légitimes dont c'est le FOND qui les rend insuffisants.
#
# LES DEUX FAMILLES DU 13 AOÛT SONT COUVERTES, texte gras et graisse normale.
# Le commentaire du ticket les distingue parce que le défaut du prototype se
# présentait sous les deux formes, et qu'un contrôle exercé sur la seule forme
# grasse laisserait la seconde passer.
#
# Usage : ./scripts/verifier-contraste-mutation.sh
# Aucun prérequis, ni Docker ni base.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-contraste.sh"
REGLE=".claude/rules/frontend-design.md"
JETONS="src/styles/tokens.css"
TEMOIN="src/styles/temoin-mutation.module.css"

detectes=0
total=0

# LA RESTAURATION NE PASSE PAS PAR GIT, motif déjà mesuré sur ce dépôt :
# `git checkout` est atomique et échoue en entier sur un chemin non suivi, ce
# qui laisse les fichiers suivis non restaurés eux non plus. La sauvegarde par
# copie ne dépend d'aucun état d'indexation.
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
# Cas 1 : graisse normale, le gris sur le sable.
#
# C'EST LE DÉFAUT RÉEL DE LS-130, rejoué à l'identique. `--ls-text-muted` donne
# 4,86:1 sur crème et tient sa promesse ; le même jeton sur le sable donne
# 4,35:1. La couleur est légitime, la paire ne l'est pas.
#
# La forme est celle par laquelle le défaut est entré : recopier la couleur d'un
# écran voisin sain, dont le `.vide` n'a AUCUN fond, en ajoutant un fond.
# ---------------------------------------------------------------------------
cat > "$TEMOIN" <<'TEMOIN_FIN'
.vide {
  padding: var(--ls-space-4);
  background: var(--ls-surface-sand);
  color: var(--ls-text-muted);
}
TEMOIN_FIN
attendre_echec "gris sur sable, 4,35:1, graisse normale"

# ---------------------------------------------------------------------------
# Cas 2 : texte gras sous le seuil de 18,66 px.
#
# SECONDE FAMILLE DU 13 AOÛT. `--ls-accent-gold-deep` donne 4,23:1 sur sable,
# mesuré en LS-105 sur le bloc légal. Le sélecteur est ici GRAS, ce qui est
# exactement la configuration où la règle se franchit de bonne foi : « conforme
# en texte large ou gras » lu sans le seuil de 18,66 px.
#
# La taille déclarée, 12 px, est sous le seuil : le contrôle doit retenir 4,5:1
# et non 3:1. Un contrôle qui accorderait l'exemption au seul `font-weight: 700`
# resterait vert ici, et c'est précisément l'erreur que le prototype a commise
# 35 fois.
# ---------------------------------------------------------------------------
cat > "$TEMOIN" <<'TEMOIN_FIN'
.accroche {
  font-size: 12px;
  font-weight: 700;
  background: var(--ls-surface-sand);
  color: var(--ls-accent-gold-deep);
}
TEMOIN_FIN
attendre_echec "doré foncé sur sable en 12 px gras, 4,23:1"

# ---------------------------------------------------------------------------
# Cas 3 : le jeton doré décoratif porte du texte.
#
# `--ls-accent-gold` plafonne à 2,31:1 sur crème et la règle 1 l'interdit pour
# TOUT texte, y compris large. Ce cas vérifie qu'une taille généreuse n'ouvre
# aucune porte : à 32 px gras le seuil tombe à 3:1, et 2,31 reste dessous.
#
# SANS CE CAS, l'exemption de texte large ne serait jamais exercée dans le sens
# où elle refuse. Le cas 2 prouve qu'elle ne s'applique pas sous le seuil ; ce
# cas prouve qu'au-dessus du seuil elle ne suffit pas à tout autoriser.
# ---------------------------------------------------------------------------
cat > "$TEMOIN" <<'TEMOIN_FIN'
.titreDore {
  font-size: 32px;
  font-weight: 700;
  background: var(--ls-background);
  color: var(--ls-accent-gold);
}
TEMOIN_FIN
attendre_echec "doré décoratif en texte large, 2,31:1 sous le seuil de 3:1"

# ---------------------------------------------------------------------------
# Cas 4 : une couleur de jeton assombrie devient insuffisante.
#
# CE CAS EXERCE LA MESURE ELLE-MÊME, et non l'extraction des paires. Les trois
# premiers ajoutent un sélecteur fautif ; celui-ci ne touche à aucun sélecteur
# et rend fautives les paires existantes en éclaircissant le jeton de texte
# courant. Si le script se contentait de reconnaître des noms de jetons sans
# calculer, il resterait vert ici.
# ---------------------------------------------------------------------------
muter "$JETONS" 's/--ls-text: #3b2f2a;/--ls-text: #a09088;/'
attendre_echec "jeton de texte courant éclairci, les paires existantes tombent"

# ---------------------------------------------------------------------------
# Cas 5 : le seuil chiffré disparaît du document de conception.
#
# SANS CE CAS, LE SENS 2 SERAIT DÉCORATIF. « Texte large ou gras » sans le
# chiffre de 18,66 px est exactement la formulation qui a produit le défaut :
# elle se lit de bonne foi comme autorisant tout texte gras. Le contrôle
# appliquerait une règle que plus aucun document n'énonce.
# ---------------------------------------------------------------------------
muter "$REGLE" 's/18,66/dix-huit/g'
attendre_echec "seuil chiffré du texte large retiré de frontend-design.md"

# ---------------------------------------------------------------------------
# Cas 6 : le seuil AA disparaît du document.
# ---------------------------------------------------------------------------
muter "$REGLE" 's/4,5:1/le seuil AA/g'
attendre_echec "seuil AA de 4,5:1 retiré de frontend-design.md"

echo
echo "-----------------------------------------"
if [ "$detectes" -eq "$total" ]; then
  echo "  $total mutations, $total détectées"
else
  echo "  $total mutations, $((total - detectes)) NON détectées"
fi
echo "-----------------------------------------"

[ "$detectes" -eq "$total" ]
