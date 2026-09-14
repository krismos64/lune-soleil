#!/bin/bash
# Vérifie que toute preuve par mutation du dépôt est soit rejouée par un
# workflow, soit écartée avec son motif. LS-230.
#
# POURQUOI CE CONTRÔLE EXISTE. `CLAUDE.md` pose le principe : un contrôle qui
# n'a jamais échoué sur le défaut qu'il prétend attraper n'est pas un contrôle.
# La preuve par mutation est l'instrument de ce principe, et elle se périme
# comme tout le reste.
#
# Mesuré le 14 septembre 2026 : le dépôt portait QUARANTE-TROIS preuves, la CI
# en rejouait QUINZE. Sur les vingt-huit dormantes, TROIS étaient cassées sans
# que personne ne le sache, et chacune d'une façon différente :
#
#   - `verifier-chargement-administration-mutation.sh` mutait deux `loading.tsx`
#     que C32 avait fait retirer. Il s'arrêtait sur son propre garde-fou de
#     présence, sans jamais muter
#   - `verifier-ponctuation-chargement-mutation.sh` mutait les deux mêmes
#     fichiers disparus : cinq de ses six cas ne muaient rien, et le contrôle
#     restant vert, ils s'annonçaient comme des trous
#   - `verifier-navigation-administration-mutation.sh` élargissait un ancrage
#     sur `RUBRIQUES_A_VENIR`, liste VIDE depuis LS-98. La mutation modifiait
#     bien le fichier, donc le garde-fou de mutation morte ne pouvait pas la
#     voir, et elle ne prouvait rien
#
# Les deux premières ont révélé de VRAIS trous dans les contrôles qu'elles
# éprouvent, restés ouverts tant qu'elles dormaient. Une preuve qui ne tourne
# pas ne protège rien, et se périme en silence.
#
# CE QU'IL VÉRIFIE, DANS LES TROIS SENS.
#
#   1. toute preuve du dépôt est citée par un workflow OU par le registre
#      d'écartées ci-dessous
#   2. aucune preuve écartée ne l'est sans motif : une exemption sans raison
#      est un interrupteur, pas une décision
#   3. le registre ne cite aucune preuve disparue, sans quoi il se périmerait
#      en sens inverse
#
# CE QU'IL NE VÉRIFIE PAS, et qui reste à la preuve par mutation elle-même :
# qu'une preuve rejouée prouve encore quelque chose. Un contrôle textuel lit des
# noms de fichiers, il ne les exécute pas.
#
# Usage : ./scripts/verifier-couverture-mutations.sh

set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

WORKFLOWS=".github/workflows"
REGISTRE="docs/PREUVES-PAR-MUTATION.md"

defauts=0

echo "Couverture des preuves par mutation, LS-230"
echo

# --------------------------------------------------------------- ancrage

# `-mutation.sh` AU SINGULIER, et la nuance compte : ce contrôle s'appelle
# `verifier-couverture-mutations.sh`, au pluriel, et se serait compté lui-même
# comme une preuve à rejouer.
preuves=$(find scripts -name "*-mutation.sh" 2>/dev/null | sed 's|scripts/||' | sort)
nb_preuves=$(printf '%s\n' "$preuves" | grep -c . || true)

if [ "$nb_preuves" -eq 0 ]; then
  echo "ÉCHEC aucune preuve par mutation trouvée dans scripts/."
  echo "      L'ancrage de ce contrôle est cassé : il ne prouve plus rien."
  exit 1
fi

if [ ! -f "$REGISTRE" ]; then
  echo "ÉCHEC $REGISTRE est introuvable."
  echo "      Sans registre, aucune preuve ne peut être écartée avec son motif."
  exit 1
fi

# --------------------------------------------------------------- sens 1 et 2

echo "1. Chaque preuve est rejouée par un workflow, ou écartée avec son motif"

rejouees=0
ecartees=0
orphelines=0

while IFS= read -r preuve; do
  [ -n "$preuve" ] || continue

  if grep -rqF "$preuve" "$WORKFLOWS" 2>/dev/null; then
    rejouees=$((rejouees + 1))
    continue
  fi

  # LA DISPENSE SE LIT DANS LA SECTION DES ÉCARTÉES, PAS AILLEURS.
  #
  # Une première version cherchait le nom dans TOUT le registre : les cinq
  # preuves que LS-230 a réparées, citées dans son tableau historique, passaient
  # alors pour écartées alors qu'elles devaient entrer en CI. Un récit n'est pas
  # une décision, et une mention n'est pas une dispense.
  #
  # La recherche se borne donc à ce qui suit « ## Les preuves écartées ».
  zone_ecartees=$(sed -n '/^## Les preuves écartées/,$p' "$REGISTRE")
  ligne=$(printf '%s\n' "$zone_ecartees" | grep -F "$preuve" | head -1)

  if [ -z "$ligne" ]; then
    echo "   ÉCHEC $preuve n'est ni rejouée ni écartée."
    echo "         Une preuve qui ne tourne pas ne protège rien : l'ajouter à un"
    echo "         workflow, ou l'écarter dans $REGISTRE avec sa raison."
    defauts=$((defauts + 1))
    orphelines=$((orphelines + 1))
    continue
  fi

  # Le motif est ce qui suit le nom sur la ligne. `sed` retire tout jusqu'au
  # nom compris, puis la ponctuation de tableau qui l'entoure.
  motif=$(printf '%s' "$ligne" | sed "s/.*$preuve//" | tr -d '|`* ' | tr -s ' ')

  if [ ${#motif} -lt 20 ]; then
    echo "   ÉCHEC $preuve est écartée sans motif suffisant."
    echo "         Une exemption sans raison est un interrupteur, pas une"
    echo "         décision. Écrire POURQUOI elle ne peut pas tourner en CI."
    defauts=$((defauts + 1))
    continue
  fi

  ecartees=$((ecartees + 1))
done <<EOF
$preuves
EOF

if [ "$orphelines" -eq 0 ] && [ "$defauts" -eq 0 ]; then
  echo "   OK   $nb_preuves preuves : $rejouees rejouées, $ecartees écartées avec motif"
fi

echo

# --------------------------------------------------------------- sens 3

echo "2. Le registre ne cite aucune preuve disparue"

citees=$(grep -oE 'verifier-[a-z0-9-]+-mutation\.sh' "$REGISTRE" 2>/dev/null | sort -u)
nb_citees=$(printf '%s\n' "$citees" | grep -c . || true)

if [ "$nb_citees" -eq 0 ]; then
  echo "   ÉCHEC le registre ne cite aucune preuve."
  echo "         Son ancrage est cassé, ou son format a changé : le sens 1"
  echo "         écarterait alors tout, sans rien vérifier."
  defauts=$((defauts + 1))
else
  fantomes=0
  while IFS= read -r citee; do
    [ -n "$citee" ] || continue
    if [ ! -f "scripts/$citee" ]; then
      echo "   ÉCHEC $REGISTRE cite $citee, qui n'existe plus."
      echo "         Un registre qui garde des noms morts se périme en sens"
      echo "         inverse, et couvre une absence."
      defauts=$((defauts + 1))
      fantomes=$((fantomes + 1))
    fi
  done <<EOF
$citees
EOF

  if [ "$fantomes" -eq 0 ]; then
    echo "   OK   $nb_citees preuve(s) citée(s), toutes présentes dans scripts/"
  fi
fi

echo

# --------------------------------------------------------------- verdict

if [ "$defauts" -gt 0 ]; then
  echo "ÉCHEC : $defauts défaut(s) de couverture."
  echo
  echo "Une preuve par mutation qui ne tourne nulle part se périme en silence."
  echo "Trois l'ont fait avant LS-230, et deux cachaient un trou réel."
  exit 1
fi

echo "OK : toute preuve tourne ou porte la raison écrite de ne pas tourner."
