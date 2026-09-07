#!/bin/bash
# Prouve que `verifier-bascule-mot-de-passe.sh` attrape les défauts qu'il
# annonce, LS-179. Un contrôle qui n'a jamais échoué sur son propre défaut n'est
# pas un contrôle.
#
# CE SCRIPT A TROUVÉ UN TROU DÈS SA PREMIÈRE EXÉCUTION, cas 3 : le contrôle
# cherchait « Afficher le mot de passe » dans tout le fichier et le trouvait
# dans un COMMENTAIRE du composant, celui qui explique `aria-controls`. Il
# restait vert sur un code ayant perdu le libellé. Troisième forme du motif
# « contrôle satisfait par un commentaire », et la plus difficile à parer : un
# libellé d'interface se cite entre guillemets français, sans marque syntaxique
# à exiger, contrairement à la parenthèse ouvrante d'un appel de fonction.
#
# Usage : ./scripts/verifier-bascule-mot-de-passe-mutation.sh
SCRIPT_CIBLE="./scripts/verifier-bascule-mot-de-passe.sh"

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

# LES FICHIERS MUTABLES SONT DÉCLARÉS, et la restauration part de `HEAD` et non
# de l'index : `git checkout -- <chemin>` rend la version de l'INDEX quand
# celui-ci porte le fichier, donc celle d'avant le TRAVAIL sur un arbre non
# commité. Motif « checkout restaure depuis l'index », qui a coûté quatre
# fichiers le 6 septembre 2026.
MUTABLES=(
  "src/components/champ-mot-de-passe.tsx"
  "src/app/(boutique)/compte/connexion/formulaire-connexion-client.tsx"
)

restaurer() {
  git checkout HEAD -- "${MUTABLES[@]}" 2>/dev/null
}

trap restaurer EXIT

# L'ARBRE DOIT ÊTRE PROPRE SUR CES FICHIERS. Restaurer depuis `HEAD` rend
# déterministe CE QUI revient, mais écraserait quand même un travail non
# commité : seul ce refus ferme le trou.
sales=$(git status --porcelain -- "${MUTABLES[@]}")

if [ -n "$sales" ]; then
  echo "ECHEC des fichiers mutables portent des modifications non commitées :"
  printf '%s\n' "$sales" | sed 's/^/        /'
  echo
  echo "      Ce script MUTE puis RESTAURE depuis HEAD : tourner ici écraserait"
  echo "      ce travail sans retour possible. Commiter d'abord, puis relancer."
  exit 1
fi

# L'ÉTAT DE RÉFÉRENCE DOIT ÊTRE VERT, garde de LS-196 : sa preuve annonçait
# « 8 sur 8 » sur un contrôle déjà rouge, chaque mutation trouvant un code non
# nul qui ne lui devait rien.
if ! "$SCRIPT_CIBLE" >/dev/null 2>&1; then
  echo "ECHEC l'état de référence est déjà ROUGE, avant toute mutation."
  echo "      Chaque cas trouverait alors un code non nul qui ne lui doit rien,"
  echo "      et ce script annoncerait des réussites qui n'en sont pas."
  exit 1
fi

reussites=0
echecs=0
cas=0

# LE MESSAGE ATTENDU EST VÉRIFIÉ, pas seulement le code de sortie. Un script qui
# rougirait pour une autre raison, un ancrage cassé par exemple, passerait un
# test qui ne regarde que le code de sortie. Motif « mutation vue par le mauvais
# test ».
jouer() {
  local intitule="$1" motif_attendu="$2"
  cas=$((cas + 1))

  local sortie
  sortie=$("$SCRIPT_CIBLE" 2>&1)
  local code=$?

  restaurer

  if [ "$code" -eq 0 ]; then
    echo "ECHEC cas $cas, $intitule"
    echo "      le contrôle est resté VERT sur cette mutation : c'est un trou."
    echecs=$((echecs + 1))
    return
  fi

  if ! printf '%s' "$sortie" | grep -qF "$motif_attendu"; then
    echo "ECHEC cas $cas, $intitule"
    echo "      le contrôle a rougi, mais PAS sur le défaut visé."
    echo "      attendu : $motif_attendu"
    echo "      obtenu  :"
    printf '%s\n' "$sortie" | sed 's/^/        /'
    echecs=$((echecs + 1))
    return
  fi

  echo "OK    cas $cas, $intitule"
  reussites=$((reussites + 1))
}

echo "Preuve par mutation de $SCRIPT_CIBLE"
echo

# ---------------------------------------------------------------------------
# Cas 1 : un `type="password"` nu revient sur un écran client.
#
# C'est l'état exact d'avant LS-179, celui que le ticket a relevé, et la forme
# que prendra un écran futur écrit sans connaître le composant.
# ---------------------------------------------------------------------------
perl -0pi -e 's|<ChampMotDePasse\n          id="mot-de-passe"|<input type="password"\n          id="mot-de-passe"|' \
  "src/app/(boutique)/compte/connexion/formulaire-connexion-client.tsx"
jouer "un type=password nu revient sur la connexion client" \
  "champ de mot de passe sans bascule"

# ---------------------------------------------------------------------------
# Cas 2 : le composant cesse de faire basculer le type.
#
# LE SENS 1 SEUL SERAIT UN DEMI-CONTRÔLE. Un dépôt sans aucun `type="password"`
# nu peut très bien avoir un composant vidé de sa substance : les six écrans
# l'importeraient sans qu'aucun ne bascule quoi que ce soit. Motif « règle à
# deux versants ».
# ---------------------------------------------------------------------------
perl -0pi -e 's/type=\{visible \? "text" : "password"\}/type="password"/' \
  src/components/champ-mot-de-passe.tsx
jouer "le composant ne fait plus basculer le type" \
  "ne fait plus basculer le type du champ"

# ---------------------------------------------------------------------------
# Cas 3 : le libellé disparaît du CODE, mais reste dans un commentaire.
#
# LE CAS QUI A TROUVÉ LE TROU, et il vise délibérément la deuxième occurrence :
# le composant cite « Afficher le mot de passe » dans le commentaire qui
# explique `aria-controls`, cinquante lignes sous le code. Un `grep` nu trouvait
# la prose et déclarait le libellé présent.
#
# `perl -0pi` SANS `/g` remplace la PREMIÈRE occurrence, qui est ici celle du
# code, ligne 131. La substitution est ancrée sur le deux-points du ternaire
# pour ne pas dépendre de l'ordre des lignes.
# ---------------------------------------------------------------------------
perl -0pi -e 's/    : "Afficher le mot de passe";/    : "Voir";/' \
  src/components/champ-mot-de-passe.tsx
jouer "le libellé disparaît du code en restant dans un commentaire" \
  "le nom accessible ne dit plus l'état"

# ---------------------------------------------------------------------------
# Cas 4 : le nom accessible est figé, il ne dit plus l'état.
#
# La forme la plus probable d'une régression : un refactor qui simplifie le
# ternaire en gardant un seul libellé. Le bouton reste nommé, donc `axe-core` ne
# voit rien, et un lecteur d'écran ne sait plus si le mot de passe est visible.
# ---------------------------------------------------------------------------
perl -0pi -e 's/  const nomAccessible = visible\n    \? "Masquer le mot de passe"\n    : "Afficher le mot de passe";/  const nomAccessible = "Afficher le mot de passe";/' \
  src/components/champ-mot-de-passe.tsx
jouer "le nom accessible est figé sur un seul libellé" \
  "le nom accessible ne dit plus l'état"

# ---------------------------------------------------------------------------
# Cas 5 : la position du curseur n'est plus reposée.
#
# INVISIBLE À LA RELECTURE ET AU RENDU. Changer le `type` d'un input monté remet
# le curseur à la fin sur WebKit : au milieu d'une phrase de seize caractères,
# la frappe suivante atterrit ailleurs qu'attendu. Aucun test de rendu ne le
# voit, et le composant paraît fonctionner.
# ---------------------------------------------------------------------------
perl -0pi -e 's/        champ\.setSelectionRange\(debut, fin\);/        \/* retire *\//' \
  src/components/champ-mot-de-passe.tsx
jouer "la position du curseur n'est plus reposée" \
  "la position du curseur n'est plus reposée"

# ---------------------------------------------------------------------------
# Verdict
# ---------------------------------------------------------------------------
echo
if [ "$echecs" -gt 0 ]; then
  echo "ECHEC $echecs cas sur $cas non détecté(s) par $SCRIPT_CIBLE."
  echo "      Un contrôle qui reste vert sur son propre défaut n'en est pas un."
  exit 1
fi

echo "OK $reussites mutations sur $cas détectées par $SCRIPT_CIBLE."
