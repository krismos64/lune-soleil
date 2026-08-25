#!/usr/bin/env bash
#
# Ce que le code ajoute doit se retrouver dans le document qui le recense.
#
# POURQUOI CE SCRIPT EXISTE
#
# Le 25 aout 2026, trois documents de docs/ etaient en retard sur la journee.
# Deux relevaient d'un simple oubli de propagation, et c'est cette part que ce
# script rend mecanique :
#
#   VALIDATION.md s'arretait a schemaPanier alors que LS-115 avait porte le
#   socle de sept a quatorze schemas. Le document de reference du socle Zod
#   ignorait la moitie de ce qu'il pretend recenser.
#
# LE TROISIEME NE SE MECANISE PAS, et il faut le dire plutot que de faire croire
# le contraire : le registre des traitements ignorait le cookie de tunnel, qui
# porte un nom, une adresse et un telephone. Un cookie n'est pas une table, donc
# aucun controle confrontant un document au schema Prisma ne peut le voir. La
# table de propagation du skill `story` porte cette ligne, et la section
# concernee du registre porte l'avertissement.
#
# CE QU'IL NE FAIT PAS
#
# Il ne juge pas ce qui est ecrit. Un schema cite dans une ligne vide de sens lui
# convient : il verifie la PRESENCE, jamais la justesse. Ce que le document dit
# d'un schema se relit.
#
# USAGE
#
#   ./scripts/verifier-propagation-docs.sh
#
# Sort en 1 des qu'un schema exporte manque au document. Aucun mode permissif.

set -euo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE"

SOCLE="src/lib/validation.ts"
DOCUMENT="docs/architecture/VALIDATION.md"

echo
echo "Schemas du socle Zod, confrontes a VALIDATION.md"
echo

for fichier in "$SOCLE" "$DOCUMENT"; do
  if [ ! -f "$fichier" ]; then
    echo "  ECHEC  $fichier est introuvable"
    echo
    echo "Un controle qui ne peut pas conclure bloque, il ne suppose pas que"
    echo "tout va bien."
    exit 1
  fi
done

# LES NOMS SONT RELEVES SUR LE FICHIER, jamais recopies ici. Une liste ecrite
# dans ce script serait une opinion, et resterait verte le jour ou un schema
# s'ajoute sans que personne ne pense a l'y inscrire : exactement le defaut que
# ce controle vise.
schemas=$(grep -oE '^export const schema[A-Za-z]+' "$SOCLE" | sed 's/export const //' | sort -u)

if [ -z "$schemas" ]; then
  echo "  ECHEC  aucun schema exporte trouve dans $SOCLE"
  echo
  echo "Soit le fichier a change de forme, soit le motif de ce controle est"
  echo "devenu faux. Dans les deux cas il ne mesure plus rien."
  exit 1
fi

manquants=""
total=0

while IFS= read -r schema; do
  total=$((total + 1))
  # Le nom peut etre cite dans une table, une phrase ou un exemple de code :
  # la presence suffit, la forme appartient a la redaction du document.
  if ! grep -q "\b${schema}\b" "$DOCUMENT"; then
    manquants="$manquants $schema"
  fi
done <<< "$schemas"

if [ -n "$manquants" ]; then
  for schema in $manquants; do
    echo "  ECHEC  $schema est exporte par le socle et absent du document"
  done
  echo
  echo "-----------------------------------------"
  echo "  un document de reference incomplet trompe"
  echo "-----------------------------------------"
  echo
  echo "VALIDATION.md recense les schemas partages : un schema absent y est un"
  echo "schema que la prochaine session reecrira, ou contredira. L'ajouter a la"
  echo "table, avec ce qu'il accepte et ce qu'il refuse."
  exit 1
fi

echo "  OK    $total schemas exportes, tous presents dans le document"
echo
echo "-----------------------------------------"
echo "  socle Zod et son document accordes"
echo "-----------------------------------------"
echo
