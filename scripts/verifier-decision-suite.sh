#!/bin/bash
# Éprouve `decider-suite-complete.sh` sur les cas qui décident. LS-169.
#
# POURQUOI UN SCRIPT ET NON UN TEST VITEST. La décision vit dans un script shell
# appelé par l'intégration continue, hors du monde TypeScript : la charger dans
# Vitest exigerait un enrobage qui testerait l'enrobage. Ce fichier appelle le
# vrai script, par son entrée standard, comme le workflow le fait.
#
# CE QU'IL DOIT ATTRAPER, ET LE SENS COMPTE. Une exemption ratée coûte treize
# minutes ; une exemption ABUSIVE laisse passer une régression en production. Les
# cas sont donc écrits dans les deux sens, et la moitié d'entre eux exige
# `complete` sur des chemins qu'un filtre trop large laisserait filer.
#
# Usage : ./scripts/verifier-decision-suite.sh

set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
DECIDEUR="$RACINE/scripts/decider-suite-complete.sh"

[ -x "$DECIDEUR" ] || {
  echo "ECHEC décideur introuvable ou non exécutable : $DECIDEUR"
  exit 1
}

ko=0
verifies=0

# $1 verdict attendu, $2 intitulé, $3.. les chemins
attendre() {
  local attendu="$1"
  local intitule="$2"
  shift 2

  verifies=$((verifies + 1))

  local obtenu
  obtenu=$(printf '%s\n' "$@" | "$DECIDEUR")

  if [ "$obtenu" != "$attendu" ]; then
    echo "ECHEC $intitule"
    echo "      attendu « $attendu », obtenu « $obtenu »"
    echo "      chemins : $*"
    ko=$((ko + 1))
  fi
}

# ---------------------------------------------------------------------------
# Ce qui doit être ALLÉGÉ. Ces cas mesurent le gain.
# ---------------------------------------------------------------------------
attendre allegee "journal seul" "docs/journal/2026-09-03-a.md"
attendre allegee "README seul" "README.md"
attendre allegee "règle Claude seule" ".claude/rules/securite.md"
attendre allegee "CLAUDE.md seul" "CLAUDE.md"
attendre allegee "plusieurs documents" \
  "docs/REFERENCES.md" "README.md" "docs/adr/ADR-034-x.md"

# UN README DE DOSSIER DE GARDE EST DE LA DOCUMENTATION, où qu'il vive : aucun
# test ne le charge, aucune construction ne le lit.
attendre allegee "README sous src/" "src/services/README.md"

# ---------------------------------------------------------------------------
# Ce qui doit être COMPLET. Ces cas mesurent la protection, et ils comptent
# davantage : une erreur ici laisse passer une régression.
# ---------------------------------------------------------------------------
attendre complete "un fichier de src" "src/lib/auth.ts"
attendre complete "un test" "tests/integration/x.sequential.test.ts"
attendre complete "le schéma" "prisma/schema.prisma"
attendre complete "un script" "scripts/verifier-schema.sh"
attendre complete "le verrou de dépendances" "package-lock.json"
attendre complete "package.json" "package.json"
attendre complete "le workflow lui-même" ".github/workflows/controles.yml"
attendre complete "une feuille de style" "src/styles/tokens.css"
attendre complete "la configuration Playwright" "playwright.config.ts"
attendre complete "le Dockerfile" "Dockerfile"

# ---------------------------------------------------------------------------
# LES CAS MÉLANGÉS, ET C'EST LE CŒUR DU FILTRE. Une story livre presque toujours
# du code ET sa documentation : si un seul fichier de code suffit à basculer, le
# cas nominal du projet est couvert.
# ---------------------------------------------------------------------------
attendre complete "documentation ET un fichier de code" \
  "docs/journal/x.md" "README.md" "src/lib/auth.ts"

attendre complete "beaucoup de documentation, un seul test" \
  "docs/a.md" "docs/b.md" "docs/c.md" "README.md" "tests/e2e/x.spec.ts"

# ---------------------------------------------------------------------------
# LES PIÈGES, chacun ayant une raison d'exister.
# ---------------------------------------------------------------------------

# `docs/` NON ANCRÉ correspondrait à ce chemin, qui est du CODE. C'est la raison
# d'être du `^` dans le motif.
attendre complete "un dossier nommé docs SOUS src" "src/lib/docs/outil.ts"

# Même piège dans l'autre sens : un fichier dont le nom CONTIENT « README ».
attendre complete "un fichier dont le nom contient README" \
  "src/lib/readme-generateur.ts"

# `\.md` SANS ANCRAGE DE FIN exempterait ces deux chemins, qui sont du CODE.
# Ce cas manquait, et la mutation l'a montré : retirer le `$` du motif laissait
# les vingt-deux autres cas VERTS. Un contrôle qu'aucune mutation ne fait rougir
# ne protège pas ce qu'il prétend protéger.
attendre complete "un module dont le nom contient md" "src/lib/md-parser.ts"
attendre complete "un fichier .mdx, qui n'est pas du Markdown pur" \
  "src/app/page.mdx.ts"

# `.claude/` est exempté, mais un script exécutable qui y vit ne l'est pas par
# accident : ce cas fige le comportement actuel plutôt que de le laisser
# implicite. Les hooks y vivent, et les modifier ne casse aucun test applicatif.
attendre allegee "un script de hook Claude" ".claude/scripts/hook-warn-unpushed.sh"

# ---------------------------------------------------------------------------
# LE DÉFAUT FERMÉ. Une entrée vide signifie « je n'ai pas pu savoir », jamais
# « rien n'a changé » : base introuvable, historique tronqué. Tout exécuter.
# ---------------------------------------------------------------------------
verifies=$((verifies + 1))
vide=$(printf '' | "$DECIDEUR")
if [ "$vide" != "complete" ]; then
  echo "ECHEC entrée vide : attendu « complete », obtenu « $vide »"
  echo "      une liste vide signifie « je n'ai pas pu savoir », pas « rien n'a changé »"
  ko=$((ko + 1))
fi

# ---------------------------------------------------------------------------
# L'ANCRAGE SE PROUVE. Zéro cas vérifié signifierait que ce fichier ne mesure
# rien, et rendrait « OK » sans avoir rien exercé.
# ---------------------------------------------------------------------------
if [ "$verifies" -eq 0 ]; then
  echo "ECHEC aucun cas exercé, l'ancrage de ce contrôle est cassé"
  exit 1
fi

echo "Cas de décision vérifiés : $verifies"

if [ "$ko" -gt 0 ]; then
  echo "ECHEC $ko cas en échec"
  exit 1
fi

echo "OK la décision de suite distingue documentation et code"
