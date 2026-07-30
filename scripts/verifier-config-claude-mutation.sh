#!/usr/bin/env bash
#
# Prouve `verifier-config-claude.sh` par mutation : réinjecte un par un les
# défauts qu'il prétend attraper, et exige qu'il les signale.
#
# POURQUOI. Un contrôle vert ne prouve rien tant qu'il n'a pas échoué sur le
# défaut qu'il prétend attraper. Ce projet en a fait l'expérience plusieurs fois,
# dont huit assertions mortes dans LS-13 et sept contrôles verts sans Docker dans
# LS-48. Le contrôle de configuration ne fait pas exception.
#
# Ce script MODIFIE des fichiers puis les restaure. Il refuse de démarrer si le
# dépôt porte des modifications non commitées sur ses cibles, pour ne jamais
# écraser un travail en cours.
#
# Usage : ./scripts/verifier-config-claude-mutation.sh

set -uo pipefail

cd "$(cd "$(dirname "$0")/.." && pwd)" || exit 1

CONTROLE=./scripts/verifier-config-claude.sh
MEM="${CLAUDE_MEMORY_DIR:-$HOME/.claude/projects/-Users-chris-Documents-sites-lune-soleil/memory}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

total=0
detectees=0

# Refus de travailler sur un dépôt sale : la restauration se fait par copie de
# sauvegarde, elle écraserait une modification en cours.
for f in CLAUDE.md docs/REFERENCES.md; do
  if ! git diff --quiet -- "$f" 2>/dev/null; then
    echo "ABANDON : $f porte des modifications non commitées."
    echo "Ce script modifie puis restaure ce fichier, il refuse d'écraser un travail en cours."
    exit 2
  fi
done

# Sauvegardes.
cp CLAUDE.md "$TMP/CLAUDE.md"
cp docs/REFERENCES.md "$TMP/REFERENCES.md"
[ -f "$MEM/MEMORY.md" ] && cp "$MEM/MEMORY.md" "$TMP/MEMORY.md"

restaurer() {
  cp "$TMP/CLAUDE.md" CLAUDE.md
  cp "$TMP/REFERENCES.md" docs/REFERENCES.md
  [ -f "$TMP/MEMORY.md" ] && cp "$TMP/MEMORY.md" "$MEM/MEMORY.md"
}

# Vérifie que le contrôle signale bien le motif attendu après mutation.
mutation() {
  local nom="$1" motif="$2"
  total=$((total+1))
  if "$CONTROLE" 2>&1 | grep -qi "$motif"; then
    echo "  OK    $nom"
    detectees=$((detectees+1))
  else
    echo "  ECHEC $nom : le contrôle n'a rien signalé"
  fi
  restaurer
}

echo "Preuve par mutation de verifier-config-claude.sh"
echo

# Le contrôle doit d'abord être vert : une mutation détectée sur un contrôle déjà
# rouge ne prouverait rien.
if ! "$CONTROLE" --strict >/dev/null 2>&1; then
  echo "ABANDON : le contrôle est déjà rouge avant mutation."
  echo "Corriger les anomalies réelles d'abord, sinon ce script ne prouve rien."
  "$CONTROLE" 2>&1 | head -12
  exit 2
fi
echo "  état initial vert, les mutations peuvent commencer"
echo

# 1. Un ADR accepté disparaît de la table d'aiguillage.
dernier=$(ls docs/adr/ADR-*.md 2>/dev/null | tail -1 | xargs basename 2>/dev/null | grep -oE '^ADR-[0-9]+')
if [ -n "$dernier" ]; then
  grep -v "^| $dernier" docs/REFERENCES.md > "$TMP/mut" && mv "$TMP/mut" docs/REFERENCES.md
  mutation "$dernier retiré de la table de REFERENCES.md" "absent de la table"
fi

# 2. La table cite un ADR qui n'existe pas.
printf '| ADR-999 | Décision fantôme | rien |\n' >> docs/REFERENCES.md
mutation "ADR-999 cité sans fichier correspondant" "aucun fichier dans docs/adr"

# 3. CLAUDE.md dépasse la limite.
for i in $(seq 1 6); do echo "ligne de remplissage $i" >> CLAUDE.md; done
mutation "CLAUDE.md au-delà de la limite de lignes" "au-delà de 200"

# 4. Un renvoi de CLAUDE.md pointe vers rien.
printf '\nVoir `docs/CE-FICHIER-NEXISTE-PAS.md`.\n' >> CLAUDE.md
mutation "renvoi cassé dans CLAUDE.md" "qui n'existe pas"

# 5. Un état transitoire réapparaît dans un fichier permanent.
printf '\nTant que le workflow de CI n existe pas encore, ignorer ceci.\n' >> CLAUDE.md
mutation "état transitoire dans CLAUDE.md" "état transitoire"

# 6 et 7. Mémoire : fiche hors index, puis lien mort.
if [ -f "$MEM/MEMORY.md" ]; then
  fiche=$(ls "$MEM"/*.md 2>/dev/null | grep -v MEMORY.md | tail -1 | xargs basename 2>/dev/null)
  if [ -n "$fiche" ]; then
    grep -v "$fiche" "$MEM/MEMORY.md" > "$TMP/mut" && mv "$TMP/mut" "$MEM/MEMORY.md"
    mutation "fiche mémoire '$fiche' retirée de l'index" "absente de MEMORY"
  fi

  printf '\nVoir [[fiche-inexistante-de-mutation]].\n' >> "$MEM/MEMORY.md"
  mutation "lien mémoire mort" "lien mémoire"
else
  echo "  IGNORE  contrôles de mémoire, MEMORY.md introuvable à $MEM"
fi

# Le retour au vert fait partie de la preuve : une restauration incomplète
# laisserait le dépôt modifié sans que personne ne le voie.
echo
if "$CONTROLE" --strict >/dev/null 2>&1; then
  echo "  état restauré, contrôle de nouveau vert"
else
  echo "  ECHEC la restauration a laissé une anomalie, vérifier git status"
  total=$((total+1))
fi

echo
echo "-----------------------------------------"
echo "  $total mutations, $detectees detectees"
echo "-----------------------------------------"

[ "$total" -eq "$detectees" ] || exit 1
