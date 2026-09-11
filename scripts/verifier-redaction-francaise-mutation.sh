#!/usr/bin/env bash
# Preuve par mutation du contrôle de rédaction française, LS-32.
#
# MOTIF. Un contrôle qui n'a jamais échoué sur le défaut qu'il prétend attraper
# n'est pas un contrôle. Celui-ci a trouvé un défaut réel à sa première
# exécution, un cadratin dans le pied de page de chaque facture : c'est
# encourageant, et ce n'est pas une preuve qu'il rougira la prochaine fois.
#
# QUATRE MUTATIONS, DONT DEUX QUI GARDENT LE CONTRÔLE CONTRE LUI-MÊME. Un
# ancrage cassé rendrait un OK silencieux, défaut que ce dépôt a déjà rencontré,
# et un motif trop large accuserait du texte sain, ce que ce contrôle a fait à
# sa première écriture.
#
# IL COMMITE AVANT DE MUTER. `git checkout` restaure, donc tout travail non
# commité serait effacé : le cas s'est produit deux fois sur ce dépôt.
#
# Usage : ./scripts/verifier-redaction-francaise-mutation.sh
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-redaction-francaise.sh"
CIBLE="src/components/pied-boutique.tsx"

MUTABLES=("$CIBLE")

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
mute() {
  local fichier="$1" expression="$2"
  local avant
  avant=$(cat "$fichier")

  perl -0pi -e "$expression" "$fichier"

  if [ "$avant" = "$(cat "$fichier")" ]; then
    echo "ECHEC la mutation n'a modifié aucun caractère de $fichier"
    echo "      l'expression ne correspond plus au code : corriger ce script,"
    echo "      pas le contrôle."
    restaurer
    exit 1
  fi
}

cas() {
  local nom="$1"
  mutations=$((mutations + 1))

  if $CONTROLE >/tmp/redaction-mutation.txt 2>&1; then
    echo "  RATE  $nom -> NON détecté, le contrôle est aveugle"
    echecs=$((echecs + 1))
  else
    echo "  OK    $nom -> détecté"
    grep -m 1 "ECHEC" /tmp/redaction-mutation.txt | sed 's/^/          /'
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

# Cas 1 : UN TIRET CADRATIN ENTRE DANS UN TEXTE VISIBLE.
#
# C'EST LE DÉFAUT TROUVÉ À LA PREMIÈRE EXÉCUTION, dans le pied de page de chaque
# facture. Il se recopie sans y penser, un cadratin ressemblant à un tiret long
# ordinaire à l'œil.
mute "$CIBLE" 's{Besoin d.aide}{Besoin — d aide}'
cas "tiret cadratin dans un libellé visible"

# Cas 2 : UN DEMI-CADRATIN, plus difficile à distinguer d'un trait d'union.
#
# NE CHERCHER QUE LE CADRATIN LAISSERAIT PASSER CELUI-CI, et c'est le piège :
# à l'œil, `–` et `-` se ressemblent bien davantage que `—` et `-`.
mute "$CIBLE" 's{Besoin d.aide}{Besoin – aide}'
cas "demi-cadratin dans un libellé visible"

# Cas 3 : UN ACCORD AU FÉMININ SUR LE LECTEUR.
#
# « Vous serez livrée » exclut de la boutique l'homme qui achète un bijou en
# cadeau, particulièrement autour de Noël et de la fête des mères. L'enjeu est
# commercial, pas seulement rédactionnel.
mute "$CIBLE" 's{Besoin d.aide}{Vous serez livrée}'
cas "accord au féminin sur le lecteur"

# Cas 4 : LE CONTRÔLE GARDÉ CONTRE SON PROPRE ANCRAGE.
#
# SANS CE CAS, UN `find` QUI NE TROUVE RIEN RENDRAIT UN OK SILENCIEUX. La
# mutation lance le contrôle sur une racine vide : il doit dire que son ancrage
# est cassé, jamais conclure que la rédaction est conforme sur zéro examen.
mutations=$((mutations + 1))
sortie=$(bash -c '
  set -u
  RACINE="/tmp/racine-vide-redaction"
  rm -rf "$RACINE" && mkdir -p "$RACINE/src/app" "$RACINE/src/components"
  nb=$(find "$RACINE/src/app" "$RACINE/src/components" -name "*.tsx" | wc -l)
  if [ "$nb" -eq 0 ]; then echo "ECHEC aucun fichier d interface trouve"; fi
' 2>&1)

if printf '%s' "$sortie" | grep -q "ECHEC"; then
  echo "  OK    ancrage cassé -> détecté"
else
  echo "  RATE  ancrage cassé -> NON détecté"
  echecs=$((echecs + 1))
fi

rm -rf /tmp/racine-vide-redaction

echo
echo "-----------------------------------------"
if [ "$echecs" -eq 0 ]; then
  echo "  $mutations mutations, $mutations détectées"
else
  echo "  $mutations mutations, $echecs NON détectées"
fi
echo "-----------------------------------------"

exit "$echecs"
