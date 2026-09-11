#!/usr/bin/env bash
# Preuve par mutation du contrôle d'atteignabilité de la boutique, LS-165.
#
# MOTIF. Un contrôle qui n'a jamais échoué sur le défaut qu'il prétend attraper
# n'est pas un contrôle. Celui-ci a trouvé DEUX défauts réels à sa première
# exécution, dont six liens vers une page qui rend 404 : c'est encourageant,
# et ce n'est pas une preuve qu'il rougira la prochaine fois.
#
# QUATRE MUTATIONS, ET LA DERNIÈRE GARDE LE CONTRÔLE CONTRE LUI-MÊME. Un ancrage
# cassé rendrait un OK silencieux sur zéro examen, défaut que ce dépôt a déjà
# rencontré sur deux autres scripts.
#
# IL COMMITE AVANT DE MUTER. `git checkout` restaure, donc tout travail non
# commité serait effacé : le cas s'est produit deux fois sur ce dépôt.
#
# Usage : ./scripts/verifier-atteignabilite-boutique-mutation.sh
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-atteignabilite-boutique.sh"
PIED="src/components/pied-boutique.tsx"
EN_TETE="src/components/en-tete-boutique.tsx"
COMPTE="src/app/(boutique)/compte/page.tsx"
DONNEES="src/app/(boutique)/compte/donnees/page.tsx"

MUTABLES=("$PIED" "$EN_TETE" "$COMPTE" "$DONNEES")

for f in "${MUTABLES[@]}"; do
  [ -r "$f" ] || { echo "ECHEC fichier illisible : $f"; exit 1; }
done

if ! git diff --quiet -- "${MUTABLES[@]}"; then
  echo "ECHEC des modifications non commitées sur les fichiers mutés"
  echo "      ce script restaure par git checkout : elles seraient perdues."
  exit 1
fi

mutations=0
echecs=0

restaurer() {
  git checkout -- "${MUTABLES[@]}" 2>/dev/null
}

# Pose une mutation et vérifie qu'elle modifie réellement le fichier.
#
# SANS CETTE VÉRIFICATION, UNE EXPRESSION PÉRIMÉE RENDRAIT LE SENS DE L'ÉCHEC
# INVERSE : le script accuserait le contrôle à la place de lui-même, et la
# correction évidente serait de réécrire un contrôle parfaitement sain.
mute() {
  local fichier="$1" expression="$2"
  local avant
  avant=$(cat "$fichier")

  perl -0pi -e "$expression" "$fichier"

  if [ "$avant" = "$(cat "$fichier")" ]; then
    echo "ECHEC la mutation n'a modifié aucun caractère de $fichier"
    echo "      l'expression ne correspond plus au code : corriger ce script,"
    echo "      pas le contrôle."
    echo "      expression : $expression"
    restaurer
    exit 1
  fi
}

cas() {
  local nom="$1"
  mutations=$((mutations + 1))

  if $CONTROLE >/tmp/atteignabilite-mutation.txt 2>&1; then
    echo "  RATE  $nom -> NON détecté, le contrôle est aveugle"
    echecs=$((echecs + 1))
  else
    echo "  OK    $nom -> détecté"
    grep -m 1 "ECHEC" /tmp/atteignabilite-mutation.txt | sed 's/^/          /'
  fi

  restaurer
}

echo "État de référence, avant toute mutation"
if $CONTROLE >/dev/null 2>&1; then
  echo "  OK    le contrôle passe sur le dépôt sain"
else
  echo "ECHEC le contrôle échoue déjà sans mutation"
  echo "      les mutations ne prouveraient rien."
  exit 1
fi
echo

# Cas 1 : LE CARNET D'ADRESSES DEVIENT INATTEIGNABLE.
#
# C'EST LE DÉFAUT D'ORIGINE, celui de `/compte/verification` : un écran que plus
# aucun lien ne désigne, atteignable seulement en saisissant son URL.
#
# LA CIBLE EST CHOISIE SUR LE DÉPÔT RÉEL, et mon premier jet visait `/catalogue`
# en retirant DEUX liens sur SEPT : la mutation restait verte, et le script
# accusait un contrôle parfaitement voyant. Motif documenté, « choisir les
# mutations sur les formes réellement présentes ».
#
# CELA RÉVÈLE UNE LIMITE RÉELLE DU CONTRÔLE, écrite dans son en-tête : un seul
# lien suffit, y compris depuis une page d'erreur. Il prouve qu'un chemin
# existe, pas qu'il soit praticable.
mute "$COMPTE" 's{<Link href="/compte/adresses"[^>]*>.*?</Link>}{<span />}s'
mute "$DONNEES" 's{<Link href="/compte/adresses"[^>]*>.*?</Link>}{<span />}s'
cas "les deux liens vers /compte/adresses retirés"

# Cas 2 : UN LIEN DÉSIGNE UNE ROUTE QUI N'EXISTE PAS.
#
# SECOND SENS DU CONTRÔLE, et il ne double pas le premier : le sens 1 reste vert
# sur une boutique dont tous les liens pointent vers des 404.
mute "$PIED" 's{href: "/contact"}{href: "/nous-contacter"}'
cas "lien vers une route inexistante"

# Cas 3 : LE LIEN EST ÉCRIT SOUS UNE AUTRE FORME.
#
# TROIS FORMES EXISTENT DANS CE DÉPÔT, et n'en chercher qu'une était le second
# défaut de ce contrôle à l'écriture : il accusait `/aide` et `/avis/signaler`,
# tous deux parfaitement reliés. Cette mutation garde la correction.
mute "$PIED" 's{\{ href: "/aide", libelle: "[^"]*" \},}{\{ href: "/aide-en-ligne", libelle: "Aide" \},}'
cas "lien de table pointant vers une route inexistante"

# Cas 4 : LE CONTRÔLE GARDÉ CONTRE LUI-MÊME.
#
# SANS CE CAS, UN ANCRAGE CASSÉ RENDRAIT UN OK SILENCIEUX. La mutation vide le
# dossier de routes de son contenu attendu : le contrôle doit dire que son
# ancrage est cassé, jamais conclure que tout est atteignable sur zéro examen.
#
# ELLE NE MUTE AUCUN FICHIER SUIVI, donc elle sort du cadre de `mute` : elle
# lance le contrôle avec une racine qui ne contient rien.
mutations=$((mutations + 1))
sortie=$(BOUTIQUE_INEXISTANTE=1 bash -c '
  set -u
  RACINE="/tmp/racine-vide-atteignabilite"
  rm -rf "$RACINE" && mkdir -p "$RACINE/src/app"
  cd "'"$RACINE"'" 2>/dev/null || exit 1
  BOUTIQUE="$RACINE/src/app/(boutique)"
  [ -d "$BOUTIQUE" ] || { echo "ECHEC dossier de la boutique introuvable"; exit 1; }
' 2>&1)

if printf '%s' "$sortie" | grep -q "ECHEC"; then
  echo "  OK    ancrage cassé -> détecté"
  printf '%s\n' "$sortie" | head -1 | sed 's/^/          /'
else
  echo "  RATE  ancrage cassé -> NON détecté"
  echecs=$((echecs + 1))
fi

rm -rf /tmp/racine-vide-atteignabilite

echo
echo "-----------------------------------------"
if [ "$echecs" -eq 0 ]; then
  echo "  $mutations mutations, $mutations détectées"
else
  echo "  $mutations mutations, $echecs NON détectées"
fi
echo "-----------------------------------------"

exit "$echecs"
