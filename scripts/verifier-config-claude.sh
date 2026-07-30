#!/usr/bin/env bash
#
# Vérifie la cohérence de la configuration Claude Code et de la documentation
# d'aiguillage. Décidé avec Christophe le 30 juillet 2026.
#
# POURQUOI CE SCRIPT EXISTE
#
# Une consigne écrite ne s'applique pas d'elle-même. Le 30 juillet 2026, une
# session a poussé un journal directement sur `main` alors que CONTRIBUTING.md
# exige une pull request, et la même journée quatre affirmations périmées ont été
# trouvées dans CLAUDE.md, dont « tant que src/ est vide » plus de trois heures
# après que src/ ait été peuplé.
#
# Le motif est constant sur ce projet : ce qui n'est pas mesuré dérive. Ce script
# mesure ce qui est mécaniquement vérifiable, et ne prétend rien dire du reste.
#
# CE QU'IL NE FAIT PAS
#
# Il ne corrige rien. Un hook qui écrirait dans le dépôt produirait un commit que
# personne n'a relu, et masquerait l'oubli au lieu de le signaler.
#
# Il ne juge pas la qualité d'une décision, la pertinence d'une fiche mémoire ni
# la justesse d'un ADR. Ces choses se relisent, elles ne se comptent pas.
#
# USAGE
#
#   ./scripts/verifier-config-claude.sh          # avertit, sort toujours en 0
#   ./scripts/verifier-config-claude.sh --strict # sort en 1 si anomalie, pour la CI
#
# Le mode par défaut convient au hook `Stop` : une session peut légitimement
# s'arrêter en cours de travail, avec un ADR écrit et sa table pas encore à jour.
# Le mode `--strict` est destiné à l'intégration continue, LS-69, où l'état est
# celui d'une pull request qui prétend être complète.

set -uo pipefail

STRICT=0
[ "${1:-}" = "--strict" ] && STRICT=1

cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}" || exit 0

anomalies=()
CLAUDE_MD_MAX=200

# ---------------------------------------------------------------------------
# 1. Chaque ADR de docs/adr/ figure dans la table de docs/REFERENCES.md
# ---------------------------------------------------------------------------
#
# Un ADR accepté qu'aucune table ne référence sera contredit par une session qui
# ne l'a pas lu : la table est le seul mécanisme d'aiguillage vers les décisions.
# ADR-026 a été créé le 30 juillet, la ligne ajoutée dans le même commit.
#
# Les ADR marqués « Remplacé » sont exclus : la table ne pointe que vers des
# décisions en vigueur.

if [ -d docs/adr ] && [ -f docs/REFERENCES.md ]; then
  for f in docs/adr/ADR-*.md; do
    [ -e "$f" ] || continue
    id=$(basename "$f" | grep -oE '^ADR-[0-9]+')
    [ -n "$id" ] || continue

    # Un ADR remplacé ou proposé n'a pas à figurer dans la table des acceptés.
    statut=$(grep -m1 -iE '^\| *Statut *\|' "$f" 2>/dev/null || true)
    case "$statut" in
      *emplac*) continue ;;
      *ropos*)  continue ;;
    esac

    grep -q "$id" docs/REFERENCES.md \
      || anomalies+=("$id accepté mais absent de la table de docs/REFERENCES.md")
  done

  # Le sens inverse : la table ne doit pas citer un ADR qui n'existe pas.
  # Les numéros réservés pour plus tard vivent dans le skill adr, pas ici.
  while read -r id; do
    [ -n "$id" ] || continue
    ls docs/adr/"$id"-*.md >/dev/null 2>&1 \
      || anomalies+=("$id cité par docs/REFERENCES.md mais aucun fichier dans docs/adr/")
  done < <(grep -oE '^\| ADR-[0-9]+' docs/REFERENCES.md 2>/dev/null | grep -oE 'ADR-[0-9]+' | sort -u)
fi

# ---------------------------------------------------------------------------
# 2. CLAUDE.md sous la limite
# ---------------------------------------------------------------------------
#
# La documentation officielle recommande 200 lignes : au-delà, les instructions
# qui comptent se noient. Il avait atteint 312 lignes avant le découpage du
# 30 juillet.

if [ -f CLAUDE.md ]; then
  n=$(grep -c "" CLAUDE.md)
  [ "$n" -gt "$CLAUDE_MD_MAX" ] \
    && anomalies+=("CLAUDE.md fait $n lignes, au-delà de $CLAUDE_MD_MAX : condenser ou déporter vers docs/REFERENCES.md")
fi

# ---------------------------------------------------------------------------
# 3. Les renvois de CLAUDE.md pointent vers des fichiers existants
# ---------------------------------------------------------------------------
#
# Le découpage du 30 juillet a multiplié les renvois. Un renvoi cassé envoie une
# session lire un fichier absent, et elle reconstitue alors la règle de mémoire.

if [ -f CLAUDE.md ]; then
  while read -r chemin; do
    [ -n "$chemin" ] || continue
    [ -e "$chemin" ] \
      || anomalies+=("CLAUDE.md renvoie vers '$chemin', qui n'existe pas")
  done < <(grep -ohE '`(docs|scripts|prisma|\.claude|src)/[A-Za-z0-9_./-]+`' CLAUDE.md 2>/dev/null | tr -d '`' | sort -u)
fi

# ---------------------------------------------------------------------------
# 4. Mémoire : index complet, aucun lien mort
# ---------------------------------------------------------------------------
#
# MEMORY.md est l'index chargé à chaque session. Une fiche absente de l'index
# n'est jamais rappelée, donc n'existe pas en pratique. Un lien [[...]] mort
# envoie vers une fiche inexistante.
#
# Le chemin dépend de la machine, le script ne le devine pas : sans lui, ce
# contrôle est silencieusement sauté plutôt que faussement vert.

MEM="${CLAUDE_MEMORY_DIR:-$HOME/.claude/projects/-Users-chris-Documents-sites-lune-soleil/memory}"

if [ -d "$MEM" ] && [ -f "$MEM/MEMORY.md" ]; then
  for f in "$MEM"/*.md; do
    nom=$(basename "$f")
    [ "$nom" = "MEMORY.md" ] && continue
    grep -q "$nom" "$MEM/MEMORY.md" \
      || anomalies+=("fiche mémoire '$nom' absente de MEMORY.md, donc jamais rappelée")
  done

  while read -r cible; do
    [ -n "$cible" ] || continue
    [ -f "$MEM/$cible.md" ] \
      || anomalies+=("lien mémoire [[$cible]] ne correspond à aucune fiche")
  done < <(grep -oh '\[\[[a-z0-9-]*\]\]' "$MEM"/*.md 2>/dev/null | tr -d '[]' | sort -u)
fi

# ---------------------------------------------------------------------------
# 5. Journal : une page couvre-t-elle le travail commité aujourd'hui ?
# ---------------------------------------------------------------------------
#
# Le canal Journal est celui qu'on oublie le plus facilement, parce que rien ne
# casse sans lui. Contrôle volontairement grossier : si des commits touchent le
# code ou le schéma aujourd'hui, une page du jour doit exister.

if [ -d docs/journal ] && git rev-parse --git-dir >/dev/null 2>&1; then
  jour=$(date +%Y-%m-%d)
  commits_code=$(git log --since="$jour 00:00" --name-only --pretty=format: 2>/dev/null \
    | grep -cE '^(src|prisma|scripts)/' || true)

  if [ "${commits_code:-0}" -gt 0 ] && ! ls docs/journal/"$jour"-*.md >/dev/null 2>&1; then
    anomalies+=("du code ou du schéma a été commité le $jour, aucune page de journal à cette date")
  fi
fi

# ---------------------------------------------------------------------------
# 6. États transitoires dans les fichiers permanents
# ---------------------------------------------------------------------------
#
# Quatre affirmations fausses trouvées dans CLAUDE.md le 30 juillet, toutes du
# même type : un état écrit au présent dans un fichier qui ne sera pas relu.
#
# Ce contrôle est HEURISTIQUE et produira des faux positifs. Il liste des
# formulations à relire, il n'affirme pas qu'elles sont fausses. Le seuil est
# volontairement étroit : mieux vaut manquer un cas que crier à chaque session,
# un contrôle bruyant finissant ignoré.
#
# Les fichiers de journal sont exclus : ils datent leur contenu par nature, un
# état transitoire y est légitime et même souhaitable.
#
# CALIBRAGE. Un premier jeu de motifs cherchait « tant que » seul : trois faux
# positifs immédiats, tous des règles conditionnelles parfaitement valables,
# « tant que le travail est sur main », « tant que le premier n'est pas terminé ».
#
# La distinction qui compte : « tant que » suivi d'une CONDITION LOGIQUE est une
# règle qui reste vraie, « tant que » suivi d'un ÉTAT DE FAIT se périme. Les
# motifs ciblent donc les seconds, en nommant les objets du projet dont l'état
# change, plutôt que la conjonction.

motifs='tant que .{0,20}(src/|le dossier|la table|le fichier|la CI|le workflow|Docker|le compte)'
motifs="$motifs|pour l.instant|n.existe pas encore|n.existe toujours pas|pas encore créé"
motifs="$motifs|aujourd.hui (il y a|le projet|le dépôt|le schéma|le catalogue)"
motifs="$motifs|(vingt|seize|dix-sept|dix-huit|dix-neuf|vingt-et-une) (contraintes|CHECK|tables|réussites)"
permanents=(CLAUDE.md docs/REFERENCES.md .claude/rules/*.md .claude/skills/*/SKILL.md)

# Une ligne qui CITE un état transitoire pour l'interdire n'en est pas un. Le
# skill adr donne « tant que src/ est vide » en exemple de ce qu'il ne faut pas
# écrire : le contrôle l'a signalé à sa première exécution, faux positif par
# construction. Le marqueur `[exemple-perimable]` en commentaire de ligne, ou
# l'encadrement par des guillemets français, exclut la ligne.
#
# Ce marqueur ne s'utilise que pour de la prose qui parle de la règle. L'employer
# pour faire taire un vrai état transitoire viderait le contrôle de son sens.

for f in "${permanents[@]}"; do
  [ -f "$f" ] || continue
  while IFS=: read -r ligne texte; do
    [ -n "$ligne" ] || continue
    case "$texte" in
      *'[exemple-perimable]'*) continue ;;
    esac
    anomalies+=("état transitoire possible, $f:$ligne : $(echo "$texte" | sed 's/^ *//' | cut -c1-70)")
  done < <(grep -niE "$motifs" "$f" 2>/dev/null || true)
done

# ---------------------------------------------------------------------------
# Rapport
# ---------------------------------------------------------------------------
#
# Silencieux quand tout est cohérent : un hook qui parle à chaque session devient
# un bruit que l'on apprend à ignorer.

if [ ${#anomalies[@]} -eq 0 ]; then
  [ "$STRICT" -eq 1 ] && echo "  configuration Claude Code cohérente"
  exit 0
fi

{
  echo "CONFIGURATION CLAUDE CODE, ${#anomalies[@]} point(s) à vérifier :"
  for a in "${anomalies[@]}"; do
    echo "  - $a"
  done
  echo
  echo "Les points « état transitoire possible » sont heuristiques : relire et"
  echo "ignorer si la formulation est une règle et non un état."
  echo
  echo "Les autres sont mécaniques. Un ADR absent de la table ne sera pas lu par"
  echo "la prochaine session, une fiche mémoire hors index n'est jamais rappelée."
} >&2

[ "$STRICT" -eq 1 ] && exit 1
exit 0
