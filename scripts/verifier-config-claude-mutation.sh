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
# La fiche de mutation 8 est créée dans le répertoire de mémoire, hors de $TMP :
# le `trap` doit l'emporter aussi, sans quoi une sortie en erreur la laisserait
# derrière elle et la session suivante la lirait comme une vraie fiche.
#
# LE TRAP RESTAURE AUSSI LES FICHIERS DU DÉPÔT, ajout du 10 août 2026. Il ne
# nettoyait que le temporaire : un `Ctrl-C` au mauvais moment laissait CLAUDE.md
# ou, depuis le cas 13, `.claude/settings.json` dans son état muté. Un
# settings.json portant un hook fantôme est précisément le défaut que ce script
# prétend détecter, il serait fâcheux qu'il l'introduise.
#
# `git checkout` est sûr ici parce que la garde plus bas impose déjà un dépôt
# propre sur ces cibles : il n'y a jamais de travail non commité à écraser.
nettoyer() {
  rm -rf "$TMP"
  rm -f "$MEM/lune-soleil-fiche-de-mutation-temporaire.md"
  git checkout -- CLAUDE.md docs/REFERENCES.md README.md .claude/settings.json 2>/dev/null || true
}
trap nettoyer EXIT

total=0
detectees=0

# Refus de travailler sur un dépôt sale : la restauration se fait par copie de
# sauvegarde, elle écraserait une modification en cours.
# LA LISTE SUIT LES CIBLES RÉELLEMENT MUTÉES, et doit être étendue en même temps
# qu'un nouveau cas. README.md et .claude/settings.json sont entrés le 10 août
# 2026 avec les cas 12 et 13 : sans eux dans cette garde, une exécution sur un
# dépôt sale aurait restauré une version d'avant les modifications en cours.
for f in CLAUDE.md docs/REFERENCES.md README.md .claude/settings.json; do
  [ -f "$f" ] || continue
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
#
# PIÈGE, rencontré à la première exécution : `"$CONTROLE" | grep -qi` sous
# `set -o pipefail` renvoyait TOUJOURS faux, et les sept mutations étaient
# annoncées non détectées alors que le contrôle fonctionnait parfaitement.
#
# Cause : `grep -q` ferme le tuyau dès la première correspondance, le script
# amont reçoit SIGPIPE, et `pipefail` fait échouer toute la chaîne. Le contrôle
# avait bien signalé le défaut, le test le niait.
#
# La sortie est donc capturée d'abord, puis examinée. Sans cette correction, ce
# script aurait « prouvé » l'inverse de la vérité, ce qui est pire qu'aucune
# preuve.
mutation() {
  local nom="$1" motif="$2" sortie
  total=$((total+1))
  sortie=$("$CONTROLE" 2>&1 || true)
  if echo "$sortie" | grep -qi "$motif"; then
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
  etat=$("$CONTROLE" 2>&1 || true)
  echo "$etat" | head -12
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

  # 8. Le CONTENU d'une fiche, et non sa seule présence dans l'index.
  #
  # Ajouté le 31 juillet 2026, sur un défaut réel : la fiche de protection de
  # branche a décrit `enforce_admins` à `false` plusieurs heures après son
  # passage à `true`, et rien ne l'a signalé. Les sept mutations précédentes
  # restaient vertes, aucune ne regardait ce que les fiches racontent.
  #
  # La fiche mutée est créée pour l'occasion puis supprimée : muter une vraie
  # fiche ferait dépendre la preuve de son contenu du jour.
  fiche_test="$MEM/lune-soleil-fiche-de-mutation-temporaire.md"
  cat > "$fiche_test" <<'FICHE'
---
name: lune-soleil-fiche-de-mutation-temporaire
description: Fiche creee par le script de mutation, supprimee aussitot
metadata:
  type: project
---

Le reglage reste volontairement à `false`, ce qui se périmera au premier
changement sans que rien ne le signale.
FICHE
  printf -- '- [Fiche de mutation](lune-soleil-fiche-de-mutation-temporaire.md) : temporaire\n' >> "$MEM/MEMORY.md"
  mutation "état transitoire dans une fiche mémoire" "état transitoire"
  rm -f "$fiche_test"
else
  echo "  IGNORE  contrôles de mémoire, MEMORY.md introuvable à $MEM"
fi

# 9. Un agent projet cité par CLAUDE.md n'a pas de fichier.
#
# Ajouté en LS-31. Le contrôle des renvois ne voit que les chemins écrits en
# entier, `.claude/agents/x.md`, alors que la section Agents cite ses agents par
# leur nom nu, qui est la forme d'invocation réelle. Renommer un fichier d'agent
# laissait donc CLAUDE.md pointer dans le vide en silence.
#
# La mutation ajoute une citation plutôt que de déplacer un vrai fichier
# d'agent : `restaurer` remet CLAUDE.md et deux autres fichiers, pas
# `.claude/agents/`. Une interruption au mauvais moment laisserait un agent
# disparu du dépôt.
printf '\nUtiliser `ls-agent-de-mutation` pour cette relecture.\n' >> CLAUDE.md
mutation "agent cité par CLAUDE.md sans fichier dans .claude/agents/" "absent de .claude/agents"

# 10. Un skill cité par CLAUDE.md n'a pas de dossier.
#
# Ajouté le 10 août 2026, même trou que le cas 9 sur les agents : le contrôle
# des renvois ne voit que les chemins complets, et CLAUDE.md cite ses skills par
# leur nom nu, « le skill `story` », qui est la forme d'invocation réelle.
printf '\nTout travail suit le skill `skill-de-mutation`.\n' >> CLAUDE.md
mutation "skill cité par CLAUDE.md sans dossier dans .claude/skills/" "absent de .claude/skills"

# 11. Un renvoi documentaire mort dans docs/REFERENCES.md.
#
# Le contrôle des renvois couvrait CLAUDE.md et s'arrêtait là, alors que
# REFERENCES.md est la table d'aiguillage que CLAUDE.md désigne pour trouver les
# ADR, les règles et leurs chemins. Un renvoi mort y envoie lire du vide.
printf '\nVoir `docs/architecture/FICHIER-DE-MUTATION.md` pour le détail.\n' >> docs/REFERENCES.md
mutation "renvoi mort dans docs/REFERENCES.md" "qui n'existe pas"

# 12. Le compte de mutations de la SUITE DE TESTS annoncé par le README dérive.
#
# Troisième compte du README à être recompté, après les overrides et les
# mutations de configuration. Celui-ci ne l'était par rien : il a été corrigé à
# la main pendant LS-79, sans garde-fou pour la fois suivante.
#
# La mutation change le CHIFFRE ANNONCÉ plutôt que le nombre de cas du script :
# `restaurer` ne remet pas `verifier-tests-mutation.sh`, et le modifier
# laisserait une suite de tests amputée si le script s'interrompait ici.
# LA SUBSTITUTION NE FIGE PAS LE CHIFFRE ACTUEL, et c'est ce qui manquait.
# Elle visait `vingt-et-une fois`, valeur du jour où elle a été écrite : le
# compte est passé à vingt-trois, vingt-sept, puis trente-six, et la
# substitution ne trouvait plus rien. Elle ne mutait donc RIEN, et le script
# concluait « non détecté » sur un contrôle parfaitement voyant, accusant le
# contrôle à la place de lui-même. Motif déjà rencontré trois fois sur ce dépôt.
#
# `\S+ fois` capte n'importe quel chiffre en lettres, et `mute_ou_echoue`
# vérifie que le fichier a bien changé.
cp README.md "$TMP/README.md"
avant_readme=$(cksum <README.md)
perl -0pi -e 's/casse \*\*\S+ fois\*\*/casse **trois fois**/' README.md
if [ "$(cksum <README.md)" = "$avant_readme" ]; then
  echo "  ECHEC la mutation du compte de README.md n'a rien modifié."
  echo "        La formulation « casse **N fois** » a changé : corriger ce"
  echo "        script, pas le contrôle."
  cp "$TMP/README.md" README.md
  # Comptée comme non détectée : le script doit sortir en échec, sans quoi il
  # annoncerait « toutes détectées » en n'ayant rien mesuré.
  total=$((total + 1))
else
  mutation "compte de mutations de la suite de tests faussé dans README.md" "mutations de la suite de tests"
fi
cp "$TMP/README.md" README.md

# 13. Un hook déclaré pointe vers un script absent.
#
# LE MODE D'ÉCHEC EST SILENCIEUX, confirmé par la documentation officielle : un
# hook dont la commande ne peut pas être lancée produit une erreur NON
# BLOQUANTE et l'action continue. Un `hook-block-secret-files.sh` renommé
# laisserait donc passer la lecture des `.env` sans que rien ne s'arrête.
#
# La mutation ajoute une DÉCLARATION vers un script inexistant plutôt que de
# renommer un vrai script de hook : renommer la protection des secrets, même
# une seconde, est exactement ce qu'il ne faut pas faire dans un script qui
# peut être interrompu.
if [ -f .claude/settings.json ] && command -v node >/dev/null 2>&1; then
  cp .claude/settings.json "$TMP/settings.json"
  node -e '
    const fs = require("fs");
    const s = JSON.parse(fs.readFileSync(".claude/settings.json", "utf8"));
    s.hooks = s.hooks || {};
    s.hooks.PreToolUse = s.hooks.PreToolUse || [];
    s.hooks.PreToolUse.push({
      matcher: "Read",
      hooks: [{ type: "command", command: "$CLAUDE_PROJECT_DIR/.claude/scripts/hook-de-mutation-absent.sh" }]
    });
    fs.writeFileSync(".claude/settings.json", JSON.stringify(s, null, 2) + "\n");
  '
  mutation "hook déclaré vers un script inexistant" "qui n'existe pas : la protection est muette"
  cp "$TMP/settings.json" .claude/settings.json
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
