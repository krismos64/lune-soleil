#!/bin/bash
# Prouve que `verifier-ponctuation-chargement.sh` attrape les défauts qu'il
# annonce, LS-195. Un contrôle qui n'a jamais échoué sur son propre défaut n'est
# pas un contrôle.
#
# Usage : ./scripts/verifier-ponctuation-chargement-mutation.sh
SCRIPT_CIBLE="./scripts/verifier-ponctuation-chargement.sh"

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

# LES FICHIERS MUTABLES SONT DÉCLARÉS, et la restauration part de `HEAD` et non
# de l'index : `git checkout -- <chemin>` rend la version de l'INDEX quand
# celui-ci porte le fichier, donc celle d'avant le TRAVAIL sur un arbre non
# commité. Motif « checkout restaure depuis l'index », qui a coûté quatre
# fichiers le 6 septembre 2026.
MUTABLES=(
  "src/app/(boutique)/catalogue/loading.tsx"
  "src/app/administration/stocks/loading.tsx"
  "src/app/administration/page.tsx"
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
# Cas 1 : le point final revient sur le catalogue public.
# C'est l'état exact d'avant LS-195, celui que le ticket a relevé.
# ---------------------------------------------------------------------------
perl -0pi -e 's/Chargement des pièces…/Chargement des pièces./' "src/app/(boutique)/catalogue/loading.tsx"
jouer "le point final revient sur l'écran public" \
      "ne se termine pas par un point de suspension"

# ---------------------------------------------------------------------------
# Cas 2 : trois points successifs au lieu du caractère unique.
#
# LE CAS QUI PASSE LA RELECTURE VISUELLE, les deux formes se ressemblant à
# l'écran. Sans lui le contrôle se satisferait de « ... », qui ne s'entend pas
# pareil et ne se cherche pas pareil.
# ---------------------------------------------------------------------------
perl -0pi -e 's/Chargement des stocks…/Chargement des stocks.../' src/app/administration/stocks/loading.tsx
jouer "trois points successifs au lieu du caractère …" \
      "emploie trois points au lieu du caractère"

# ---------------------------------------------------------------------------
# Cas 3 : une annonce d'administration perd sa ponctuation.
#
# LE PREMIER CAS NE COUVRE QUE L'ÉCRAN PUBLIC, dont la forme est du JSX rendu.
# Celui-ci porte sur une PROPRIÉTÉ passée au composant partagé, `annonce="…"`,
# l'autre des deux formes que le dépôt emploie : un contrôle qui ne verrait
# qu'une forme resterait vert sur quatorze annonces.
# ---------------------------------------------------------------------------
perl -0pi -e 's/annonce="Chargement des stocks…"/annonce="Chargement des stocks."/' src/app/administration/stocks/loading.tsx
jouer "une annonce en propriété perd sa ponctuation" \
      "ne se termine pas par un point de suspension"

# ---------------------------------------------------------------------------
# Cas 4 : une annonce rendue dans un `<Suspense>` interne perd sa ponctuation.
#
# LA TROISIÈME FORME D'APPEL DU DÉPÔT, après le JSX d'un `loading.tsx` et la
# propriété passée au composant partagé. Elle est textuellement identique à la
# première, mais rien ne le disait : les cas 1 à 3 ne couvraient que deux des
# trois. Relevé par la revue d'interface.
# ---------------------------------------------------------------------------
perl -0pi -e 's/Chargement des indicateurs…/Chargement des indicateurs./' src/app/administration/page.tsx
jouer "une annonce sous <Suspense> interne perd sa ponctuation" \
      "ne se termine pas par un point de suspension"

# ---------------------------------------------------------------------------
# Cas 5 : une annonce est REFORMULÉE, et non malformée.
#
# LE CAS QUE LE SENS 1 SEUL NE VOIT PAS, et c'est tout l'objet du sens 2.
# Vérifier la forme des annonces TROUVÉES laisse passer leur disparition : le
# compte passe de 15 à 14, en silence et en vert. Mesuré par la revue
# d'interface du 6 septembre 2026, avant que le dénominateur existe.
# ---------------------------------------------------------------------------
perl -0pi -e 's/annonce="Chargement des stocks…"/annonce="Les stocks se chargent…"/' src/app/administration/stocks/loading.tsx
jouer "une annonce est reformulée sans le mot Chargement" \
      "ne porte aucune annonce de chargement"

# ---------------------------------------------------------------------------
# Cas 6 : une annonce DISPARAÎT d'un état de chargement.
#
# La forme la plus simple du même trou, et la plus probable : on retire une
# propriété en refondant un écran. Sans le sens 2, le contrôle reste vert sur un
# `loading.tsx` qui affiche une armature muette, ce qu'aucun lecteur d'écran ne
# peut interpréter.
# ---------------------------------------------------------------------------
perl -0pi -e 's/\s*annonce="Chargement des stocks…"\n//' src/app/administration/stocks/loading.tsx
jouer "une annonce disparaît d'un loading.tsx" \
      "ne porte aucune annonce de chargement"

echo
echo "Cas joués : $cas, réussis : $reussites, en échec : $echecs"

if [ "$echecs" -ne 0 ]; then
  echo
  echo "$echecs cas n'ont pas fait rougir le contrôle sur le défaut visé."
  exit 1
fi

echo
echo "OK $reussites mutations sur $cas font rougir le contrôle, chacune par son propre message"
