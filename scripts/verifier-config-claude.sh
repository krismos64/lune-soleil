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

    # Ancré sur la LIGNE DE TABLE, `| ADR-027 | ...`, et non sur l'identifiant
    # n'importe où dans le fichier. Trouvé par mutation en LS-31 : ADR-027 est
    # aussi cité en passant dans la table des fichiers sensibles, à propos de la
    # durée de session. Cette seconde mention satisfaisait la recherche, donc sa
    # ligne d'aiguillage pouvait disparaître sans que rien ne le signale. Même
    # motif que la mutation satisfaite ailleurs déjà rencontrée ici.
    grep -qE "^\| *$id *\|" docs/REFERENCES.md \
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
# Réglages dont l'état change et qu'une fiche décrit souvent au présent. Ajouté
# le 31 juillet 2026 : la fiche sur la protection de branche décrivait
# `enforce_admins` à `false` et le push direct comme réussissant, plusieurs
# heures après le passage à `true`. Rien ne l'avait signalé.
motifs="$motifs|(reste|est|vaut) (volontairement )?à (\`)?(false|true)"
permanents=(CLAUDE.md docs/REFERENCES.md .claude/rules/*.md .claude/skills/*/SKILL.md)

# LES FICHES MÉMOIRE ENTRENT DANS CE CONTRÔLE, ajout du 31 juillet 2026.
#
# Elles sont chargées à chaque session au même titre que CLAUDE.md, et rien ne
# vérifiait leur contenu : le contrôle ne regardait que leur présence dans
# l'index et la validité de leurs liens. Une fiche décrivant un état disparu est
# pire qu'une fiche absente, elle est rappelée avec autorité.
#
# `MEMORY.md` est exclu, c'est un index de titres où le motif produirait du bruit
# sans rien apprendre.
if [ -d "$MEM" ]; then
  while IFS= read -r fiche; do
    permanents+=("$fiche")
  done < <(find "$MEM" -name '*.md' ! -name 'MEMORY.md' 2>/dev/null)
fi

# Une ligne qui CITE un état transitoire pour l'interdire n'en est pas un. Le
# skill adr donne « tant que src/ est vide » en exemple de ce qu'il ne faut pas
# écrire : le contrôle l'a signalé à sa première exécution, faux positif par
# construction. Le marqueur `[exemple-perimable]` en commentaire de ligne, ou
# l'encadrement par des guillemets français, exclut la ligne.
#
# Ce marqueur ne s'utilise que pour de la prose qui parle de la règle. L'employer
# pour faire taire un vrai état transitoire viderait le contrôle de son sens.
#
# L'EXCLUSION PAR GUILLEMETS ÉTAIT ANNONCÉE ET NON IMPLÉMENTÉE, corrigé le
# 31 juillet 2026 : seul le marqueur était testé. Écart trouvé en étendant le
# contrôle aux fiches mémoire, dont trois citent « tant que src/ est vide » pour
# l'interdire et étaient signalées à tort.
#
# La citation doit encadrer le motif lui-même, pas seulement apparaître sur la
# ligne : une ligne qui cite autre chose et porte par ailleurs un vrai état
# transitoire doit rester signalée.

for f in "${permanents[@]}"; do
  [ -f "$f" ] || continue
  while IFS=: read -r ligne texte; do
    [ -n "$ligne" ] || continue
    case "$texte" in
      *'[exemple-perimable]'*) continue ;;
    esac
    # Retirer ce qui est entre guillemets français, puis re-tester : si le motif
    # ne subsiste pas hors citation, la ligne parle de la formulation au lieu de
    # l'employer.
    hors_citation=$(echo "$texte" | sed 's/«[^»]*»//g')
    echo "$hors_citation" | grep -qiE "$motifs" || continue
    anomalies+=("état transitoire possible, $f:$ligne : $(echo "$texte" | sed 's/^ *//' | cut -c1-70)")
  done < <(grep -niE "$motifs" "$f" 2>/dev/null || true)
done

# ---------------------------------------------------------------------------
# 8. Le compte de hooks annoncé par CLAUDE.md correspond au réel
# ---------------------------------------------------------------------------
#
# CLAUDE.md a annoncé « deux hooks » pendant que settings.json en déclarait
# trois : le PostToolUse qui rejoue verifier-regles.sh n'était mentionné nulle
# part, ajouté sans que la phrase soit reprise. Personne ne l'a vu, aucun
# contrôle ne recomptait.
#
# Même motif que le README annonçant trois overrides pour cinq. Un compte écrit
# à la main est une opinion tant qu'un contrôle ne le confronte pas à la source.
#
# Le script lit les clés d'événement de settings.json, pas le nombre de
# commandes : deux hooks sur un même événement restent un seul type déclaré,
# et c'est bien de types que parle la phrase de CLAUDE.md.

if [ -f CLAUDE.md ] && [ -f .claude/settings.json ] && command -v node >/dev/null 2>&1; then
  reel=$(node -e '
    try {
      const s = require("./.claude/settings.json");
      console.log(Object.keys(s.hooks || {}).length);
    } catch (e) { console.log(""); }
  ' 2>/dev/null)

  # « Trois hooks l'appuient », le chiffre est en toutes lettres.
  #
  # Le texte est APLATI avant la recherche : le retour à la ligne tombe souvent
  # entre le chiffre et le mot « hooks », et un motif ligne à ligne rate alors
  # la phrase. Une première version de ce contrôle est restée verte sur « Deux
  # hooks » coupé en fin de ligne.
  aplati=$(tr '\n' ' ' < CLAUDE.md | tr -s ' ')

  annonce=""
  echo "$aplati" | grep -qiE "\bun hook l('|’)appuie" && annonce=1
  echo "$aplati" | grep -qiE "\bdeux hooks" && annonce=2
  echo "$aplati" | grep -qiE "\btrois hooks" && annonce=3
  echo "$aplati" | grep -qiE "\bquatre hooks" && annonce=4

  if [ -n "$reel" ] && [ -n "$annonce" ] && [ "$reel" != "$annonce" ]; then
    anomalies+=("CLAUDE.md annonce $annonce hooks, .claude/settings.json en déclare $reel")
  fi
fi

# ---------------------------------------------------------------------------
# 9. Les comptes annoncés par README.md correspondent au réel
# ---------------------------------------------------------------------------
#
# Le README a annoncé « trois overrides » pendant que package.json en déclarait
# cinq, deux ayant été ajoutés le matin même. Même motif que le contrôle 8 : un
# compte écrit à la main dérive dès que la chose comptée change.
#
# Ne sont contrôlés que les comptes dont la source est mécanique. « Huit
# contrôles de CONTRIBUTING » n'en est pas : ce sont des étapes nommées dans un
# document, pas des objets dénombrables sans ambiguïté.
#
# Le texte est APLATI, l'enveloppe à 80 colonnes coupant régulièrement entre le
# chiffre et le nom. Voir le contrôle 8, dont la première version ratait « Deux
# hooks » pour cette raison exacte.

# LA TABLE MONTE À TRENTE, ET CE N'EST PAS DU CONFORT.
#
# Elle s'arrêtait à « dix » jusqu'au 10 août 2026. Au-delà, `chiffre_en_lettres`
# rendait une chaîne vide, `compte_annonce` aussi, et la comparaison était
# SAUTÉE : le contrôle passait au vert sans avoir rien vérifié.
#
# C'est un mode fail-open, le même que LS-42 a corrigé sur le script de
# migration, et il était déjà atteint : `verifier-tests-mutation.sh` porte
# vingt-et-un cas, un compte que le README écrit en toutes lettres. Les mutations
# de configuration sont à neuf, donc à une story du même silence.
#
# Un contrôle qui se tait quand il ne comprend pas est pire qu'un contrôle
# absent : il occupe la place et personne ne le remplace.
chiffre_en_lettres() {
  case "$(echo "$1" | tr '[:upper:]' '[:lower:]')" in
    un|une) echo 1 ;; deux) echo 2 ;; trois) echo 3 ;; quatre) echo 4 ;;
    cinq) echo 5 ;; six) echo 6 ;; sept) echo 7 ;; huit) echo 8 ;;
    neuf) echo 9 ;; dix) echo 10 ;; onze) echo 11 ;; douze) echo 12 ;;
    treize) echo 13 ;; quatorze) echo 14 ;; quinze) echo 15 ;;
    seize) echo 16 ;; dix-sept) echo 17 ;; dix-huit) echo 18 ;;
    dix-neuf) echo 19 ;; vingt) echo 20 ;;
    vingt-et-un|vingt-et-une) echo 21 ;; vingt-deux) echo 22 ;;
    vingt-trois) echo 23 ;; vingt-quatre) echo 24 ;; vingt-cinq) echo 25 ;;
    vingt-six) echo 26 ;; vingt-sept) echo 27 ;; vingt-huit) echo 28 ;;
    vingt-neuf) echo 29 ;; trente) echo 30 ;;
    trente-et-une) echo 31 ;; trente-et-un) echo 31 ;;
    trente-deux) echo 32 ;; trente-trois) echo 33 ;;
    trente-quatre) echo 34 ;; trente-cinq) echo 35 ;;
    trente-six) echo 36 ;; trente-sept) echo 37 ;;
    trente-huit) echo 38 ;; trente-neuf) echo 39 ;;
    # LA TABLE S'ARRETAIT A QUARANTE, et le controle a echoue le jour ou le
    # compte reel est passe a quarante-cinq, LS-94. Le symptome etait
    # trompeur : il annoncait « README.md annonce 5 mutations », parce que
    # l'alternance ne connaissant pas « quarante-cinq », la recherche
    # « <nombre> fois » captait un « cinq » situe ailleurs dans la phrase.
    #
    # UN CONTROLE DONT LA TABLE EST TROP COURTE NE SE TAIT PAS, IL MENT. Il
    # aurait ete tentant de lire « 5 au lieu de 45 » comme une faute du README.
    # Etendre jusqu'a quarante-neuf laisse de la marge ; au-dela, il faudra
    # etendre a nouveau, et le symptome sera le meme.
    quarante) echo 40 ;;
    quarante-et-une) echo 41 ;; quarante-et-un) echo 41 ;;
    quarante-deux) echo 42 ;; quarante-trois) echo 43 ;;
    quarante-quatre) echo 44 ;; quarante-cinq) echo 45 ;;
    quarante-six) echo 46 ;; quarante-sept) echo 47 ;;
    quarante-huit) echo 48 ;; quarante-neuf) echo 49 ;;
    *) echo "" ;;
  esac
}

# LA TABLE MONTE À QUARANTE, étendue en LS-80. Elle s'arrêtait à trente, et le
# seuil a été franchi le jour même où le script de mutation est passé à
# trente-et-un cas : `trente-et-une` n'était pas reconnu, l'alternance retenait
# `une` seul, et le contrôle annonçait « README.md annonce 1 mutations ». Le
# message était juste dans son intention et faux dans son chiffre, ce qui est le
# genre d'écart qui fait suspecter le document plutôt que l'outil. Même motif que
# l'extension de dix à trente, décrite plus bas.
#
# L'ALTERNANCE EST ORDONNÉE DU PLUS LONG AU PLUS COURT, et cet ordre est
# porteur. `grep -oE` retient la première alternative qui correspond : avec
# « dix » avant « dix-sept », « dix-sept mutations » rendait « dix », soit 10 au
# lieu de 17. Le contrôle aurait alors signalé un écart imaginaire, ce qui use
# la confiance aussi sûrement qu'un silence.
NOMBRES_EN_LETTRES='trente-et-une|trente-et-un|trente-quatre|trente-trois|trente-cinq|trente-deux|trente-sept|trente-huit|trente-neuf|trente-six|vingt-et-une|vingt-et-un|vingt-quatre|vingt-trois|vingt-cinq|vingt-deux|vingt-sept|vingt-huit|vingt-neuf|vingt-six|quarante-et-une|quarante-et-un|quarante-quatre|quarante-trois|quarante-cinq|quarante-deux|quarante-sept|quarante-huit|quarante-neuf|quarante-six|quarante|dix-sept|dix-huit|dix-neuf|quatorze|quinze|seize|treize|douze|trente|vingt|onze|dix|neuf|huit|sept|cinq|deux|trois|quatre|six|une|un'

# Cherche « <chiffre en lettres> <nom> » dans un texte aplati et rend le nombre.
#
# Le gras Markdown est retiré AVANT la recherche : le README écrit volontiers
# `**vingt-et-une** fois`, et les astérisques collées au chiffre font échouer la
# limite de mot `\b`. Ce défaut a déjà rendu un contrôle vert devant un compte
# faux, il est noté plus bas sur le compte des mutations de configuration.
compte_annonce() {
  local texte="$1" nom="$2" mot
  texte=$(echo "$texte" | tr -d '*')
  mot=$(echo "$texte" | grep -oiE "\b($NOMBRES_EN_LETTRES) $nom\b" | head -1 | awk '{print $1}')
  [ -n "$mot" ] && chiffre_en_lettres "$mot"
}

if [ -f README.md ] && command -v node >/dev/null 2>&1; then
  readme_aplati=$(tr '\n' ' ' < README.md | tr -s ' ')

  # Overrides : la source est package.json.
  reel=$(node -e '
    try { console.log(Object.keys(require("./package.json").overrides || {}).length); }
    catch (e) { console.log(""); }
  ' 2>/dev/null)
  annonce=$(compte_annonce "$readme_aplati" "overrides")
  if [ -n "$reel" ] && [ -n "$annonce" ] && [ "$reel" != "$annonce" ]; then
    anomalies+=("README.md annonce $annonce overrides, package.json en déclare $reel")
  fi

  # Mutations de la configuration : la source est le nombre d'appels du script.
  #
  # Ajouté en LS-31, sur un compte trouvé faux pour la deuxième fois. Le README
  # annonçait « sept mutations » quand le script en portait neuf, et le contrôle
  # 8 comme le 9 restaient verts : ils ne recomptaient pas celui-ci. Le même
  # compte avait déjà dérivé le 10 août, corrigé à la main, donc sans rien qui
  # empêche la troisième fois.
  #
  # LE CHIFFRE S'ÉCRIT SANS GRAS dans le README. `compte_annonce` cherche
  # « neuf mutations » avec un espace simple, et `**neuf mutations**` colle les
  # astérisques au chiffre, ce qui fait échouer la limite de mot. La première
  # version de ce contrôle est restée verte devant un compte faux pour cette
  # seule raison. Vaut pour tous les comptes lus par ce contrôle.
  if [ -f scripts/verifier-config-claude-mutation.sh ]; then
    reel=$(grep -cE '^\s*mutation "' scripts/verifier-config-claude-mutation.sh 2>/dev/null || echo 0)
    annonce=$(compte_annonce "$readme_aplati" "mutations, toutes détectées")
    if [ "$reel" -gt 0 ] && [ -n "$annonce" ] && [ "$reel" != "$annonce" ]; then
      anomalies+=("README.md annonce $annonce mutations de configuration, le script en porte $reel")
    fi
  fi

  # Largeurs Playwright : la source est la liste des projets de sa configuration.
  if [ -f playwright.config.ts ]; then
    reel=$(grep -cE '^\s*name:\s*"' playwright.config.ts 2>/dev/null || echo 0)
    annonce=$(compte_annonce "$readme_aplati" "largeurs")
    if [ "$reel" -gt 0 ] && [ -n "$annonce" ] && [ "$reel" != "$annonce" ]; then
      anomalies+=("README.md annonce $annonce largeurs Playwright, playwright.config.ts en déclare $reel")
    fi
  fi

  # Mutations de la SUITE DE TESTS, à ne pas confondre avec celles de la
  # configuration recomptées juste au-dessus. Deux scripts distincts, deux
  # comptes distincts, et seul le second était vérifié.
  #
  # Ajouté le 10 août 2026. Le README annonçait « dix-neuf fois » quand LS-79 a
  # porté le script à vingt-et-un cas ; le chiffre a été corrigé à la main
  # pendant la story, donc sans rien qui empêche la prochaine dérive. C'est la
  # troisième fois qu'un compte du README se périme, après les overrides et les
  # mutations de configuration.
  #
  # L'ANCRAGE PORTE LE NOM DU SCRIPT, et pas seulement le mot « fois ».
  #
  # Première version ancrée sur « <nombre> fois » seul : elle a rendu 8 au lieu
  # de 21, en captant « le script de mutation réinjecte huit fois un défaut »,
  # phrase qui parle d'un TROISIÈME script, celui des règles. Le README emploie
  # « fois » à trois endroits pour trois scripts différents.
  #
  # C'est le défaut d'ancrage trop large déjà rencontré ici : le contrôle criait
  # sur un compte parfaitement juste. La recherche part donc du nom du script,
  # qui est sans ambiguïté, et lit le nombre qui suit dans la même phrase.
  if [ -f scripts/verifier-tests-mutation.sh ]; then
    reel=$(grep -cE '^cas ' scripts/verifier-tests-mutation.sh 2>/dev/null || echo 0)
    phrase=$(echo "$readme_aplati" | grep -oE 'verifier-tests-mutation\.sh[^.]{0,60}fois' | head -1)
    annonce=$(compte_annonce "$phrase" "fois")
    if [ "$reel" -gt 0 ] && [ -n "$annonce" ] && [ "$reel" != "$annonce" ]; then
      anomalies+=("README.md annonce $annonce mutations de la suite de tests, verifier-tests-mutation.sh en porte $reel")
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 12 bis. Chaque script de hook présent est DÉCLARÉ
# ---------------------------------------------------------------------------
#
# LE CONTRÔLE 12 VÉRIFIE UN SEUL SENS, « déclaré donc présent », et cette
# asymétrie a laissé passer un défaut réel le 11 août 2026.
#
# `hook-block-secret-commands.sh` a été écrit, prouvé sur vingt-quatre cas par
# `verifier-hook-secrets.sh`, commité et poussé sur `main`. Sa DÉCLARATION dans
# `settings.json` a en revanche disparu entre son écriture et le commit,
# vraisemblablement restaurée par le `git checkout` d'un script de mutation, qui
# remet les fichiers suivis. Le script existait donc, son contrôle passait au
# vert, et il ne s'exécutait jamais.
#
# UN HOOK NON DÉCLARÉ EST PIRE QU'UN HOOK ABSENT : le dépôt porte le script, son
# contrôle, sa documentation et sa fiche mémoire, tout indique qu'il protège, et
# il ne protège rien. Aucun symptôme ne le trahit.
#
# Le nom du fichier suffit à décider : `.claude/scripts/hook-*.sh` est un hook
# par convention, il n'a aucune autre raison d'exister.

if [ -d .claude/scripts ] && command -v node >/dev/null 2>&1; then
  declares=$(node -e '
    try {
      const s = require("./.claude/settings.json");
      const out = [];
      for (const groupes of Object.values(s.hooks || {}))
        for (const g of (groupes || []))
          for (const h of (g.hooks || [])) {
            const c = (h.command || "").replace("$CLAUDE_PROJECT_DIR/", "").split(" ")[0];
            if (c) out.push(c);
          }
      console.log(out.join(" "));
    } catch (e) { }
  ' 2>/dev/null)

  for script in .claude/scripts/hook-*.sh; do
    [ -e "$script" ] || continue
    case " $declares " in
      *" $script "*) ;;
      *) anomalies+=("$script existe mais n'est déclaré dans aucun hook de settings.json : il ne s'exécute jamais") ;;
    esac
  done
fi

# ---------------------------------------------------------------------------
# 12. Chaque hook déclaré pointe vers un script exécutable
# ---------------------------------------------------------------------------
#
# LE MODE D'ÉCHEC EST SILENCIEUX, et la documentation officielle le confirme :
# un hook dont la commande ne peut pas être lancée produit une erreur NON
# BLOQUANTE, « hook error », et l'action continue. Le garde-fou disparaît sans
# que rien ne s'arrête.
#
# Appliqué ici, cela veut dire qu'un `hook-block-secret-files.sh` renommé,
# déplacé, ou dont le bit exécutable est perdu par un `git checkout` maladroit,
# laisserait passer la lecture des `.env` en silence. C'est la protection la
# plus sensible du dépôt, invariant 9, et rien ne la vérifiait.
#
# Il n'existe aucun lint officiel de `settings.json` : `/hooks` liste la
# configuration, il ne valide pas que les scripts existent. Ce contrôle comble
# donc un trou que l'outillage amont ne couvre pas.

if [ -f .claude/settings.json ] && command -v node >/dev/null 2>&1; then
  while IFS= read -r ligne; do
    [ -n "$ligne" ] || continue
    evenement=${ligne%%$'\t'*}
    commande=${ligne#*$'\t'}
    [ -n "$commande" ] || continue

    if [ ! -e "$commande" ]; then
      anomalies+=("hook $evenement déclare '$commande', qui n'existe pas : la protection est muette, l'action continue")
    elif [ ! -x "$commande" ]; then
      anomalies+=("hook $evenement déclare '$commande', présent mais NON EXÉCUTABLE : erreur non bloquante, l'action continue")
    fi
  done < <(node -e '
    try {
      const s = require("./.claude/settings.json");
      const out = [];
      for (const [ev, groupes] of Object.entries(s.hooks || {}))
        for (const g of (groupes || []))
          for (const h of (g.hooks || [])) {
            const c = (h.command || "").replace("$CLAUDE_PROJECT_DIR/", "").split(" ")[0];
            if (c) out.push(ev + "\t" + c);
          }
      console.log(out.join("\n"));
    } catch (e) { }
  ' 2>/dev/null)
fi

# ---------------------------------------------------------------------------
# 13. Chaque skill cité par CLAUDE.md existe dans .claude/skills/
# ---------------------------------------------------------------------------
#
# Même trou que le contrôle 11 sur les agents, et pour la même raison : le
# contrôle 3 ne voit que les renvois portant un CHEMIN. CLAUDE.md cite ses
# skills par leur nom nu, « le skill `story` », qui est la forme d'invocation
# réelle. Renommer le dossier laisserait la consigne « tout travail suit le
# skill story » pointer dans le vide.
#
# L'ancrage exige le mot « skill » devant le nom : les autres noms entre accents
# graves de CLAUDE.md sont des commandes, des fichiers et des variables, et un
# motif plus large crierait sur eux.

if [ -f CLAUDE.md ]; then
  aplati_claude=$(tr '\n' ' ' < CLAUDE.md | tr -s ' ')
  while read -r skill; do
    [ -n "$skill" ] || continue
    [ -f ".claude/skills/$skill/SKILL.md" ] \
      || anomalies+=("CLAUDE.md cite le skill '$skill', absent de .claude/skills/$skill/SKILL.md")
  done < <(echo "$aplati_claude" | grep -oiE 'skills? `[a-z0-9-]+`' | grep -oE '`[a-z0-9-]+`' | tr -d '`' | sort -u)
fi

# ---------------------------------------------------------------------------
# 14. Les renvois de docs/REFERENCES.md pointent vers des fichiers existants
# ---------------------------------------------------------------------------
#
# Le contrôle 3 couvre CLAUDE.md et s'arrête là. Or REFERENCES.md est LA table
# d'aiguillage du projet, celle que CLAUDE.md désigne pour trouver les ADR, les
# règles et leurs chemins de déclenchement. Un renvoi mort y envoie une session
# lire un fichier absent, exactement le défaut que le contrôle 3 prévient sur
# l'autre fichier.
#
# Le sens ADR est déjà couvert par le contrôle 1, dans les deux directions. Ce
# contrôle-ci porte sur les autres cibles : règles, skills, agents, documents
# d'architecture et scripts.
#
# `src/` EST VOLONTAIREMENT EXCLU, et c'est la différence avec le contrôle 3.
# REFERENCES.md porte la table des chemins de DÉCLENCHEMENT des règles, qui
# désignent légitimement des dossiers pas encore créés : `payments.md` se
# déclenchera sur `src/integrations/stripe/**` quand la phase 3 l'écrira. Un
# contrôle qui exigerait leur existence crierait à chaque session sur une
# anticipation parfaitement saine, et un contrôle bruyant finit ignoré.
#
# Ce qui doit exister, ce sont les cibles documentaires : un renvoi vers un ADR,
# une règle, un skill ou un script absent envoie la session lire du vide.

if [ -f docs/REFERENCES.md ]; then
  while read -r chemin; do
    [ -n "$chemin" ] || continue
    [ -e "$chemin" ] \
      || anomalies+=("docs/REFERENCES.md renvoie vers '$chemin', qui n'existe pas")
  done < <(grep -ohE '`(docs|scripts|prisma|\.claude)/[A-Za-z0-9_./-]+`' docs/REFERENCES.md 2>/dev/null | tr -d '`' | sort -u)
fi

# ---------------------------------------------------------------------------
# 10. Chaque dossier de src/ porte son README de garde
# ---------------------------------------------------------------------------
#
# CLAUDE.md a affirmé que « chaque dossier de src/ » portait un fichier de
# garde, alors que trois n'en avaient pas, dont app/ où arrivent les entrées non
# fiables. L'affirmation générale masquait le trou au lieu de le montrer.
#
# generated/ est exclu, son contenu est produit par Prisma. styles/ aussi, il ne
# porte que des jetons CSS et aucune règle d'entrée.

if [ -d src ]; then
  for d in src/*/; do
    nom=$(basename "$d")
    case "$nom" in generated|styles) continue ;; esac
    [ -f "$d/README.md" ] \
      || anomalies+=("src/$nom/ n'a pas de README.md de garde : ce qui a le droit d'y entrer n'est écrit nulle part")
  done
fi

# ---------------------------------------------------------------------------
# 11. Chaque agent projet cité par CLAUDE.md existe dans .claude/agents/
# ---------------------------------------------------------------------------
#
# Le contrôle 3 ne voit que les renvois PORTANT UN CHEMIN, `.claude/agents/x.md`.
# La section Agents cite ses agents par leur nom nu, `ls-critical-reviewer`, qui
# est la forme d'invocation réelle : aucun chemin, donc aucune vérification.
# Renommer ou supprimer un fichier d'agent laissait CLAUDE.md pointer dans le
# vide sans que rien ne le signale. Trou trouvé par mutation en LS-31.
#
# L'ancrage est le préfixe `ls-`, seul motif mécaniquement décidable : les autres
# noms nus de CLAUDE.md sont des commandes système, `ssh` ou `gh`, et des
# fichiers de règles. Un contrôle plus large crierait sur eux.

if [ -f CLAUDE.md ]; then
  while read -r agent; do
    [ -n "$agent" ] || continue
    [ -f ".claude/agents/$agent.md" ] \
      || anomalies+=("CLAUDE.md cite l'agent '$agent', absent de .claude/agents/")
  done < <(grep -ohE '`ls-[a-z0-9-]+`' CLAUDE.md 2>/dev/null | tr -d '`' | sort -u)
fi

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
