#!/bin/bash
# Vérifie que `NEXT_PUBLIC_MEDIA_PREFIXE` atteint réellement le bundle servi,
# LS-197.
#
# Motif. Une variable `NEXT_PUBLIC_` est SUBSTITUÉE par `next build` dans le
# bundle client, elle n'est pas lue à l'exécution. Une valeur posée dans
# l'environnement du conteneur au démarrage n'a donc aucun effet, et le défaut
# est SILENCIEUX : les images pointent l'ancien préfixe, aucune ligne de journal
# ne le dit, et le site fonctionne parfaitement tant que le préfixe ne change
# pas.
#
# CE QUE CE CONTRÔLE VÉRIFIE, DANS LES DEUX SENS :
#
#   1. le `Dockerfile` porte l'`ARG` ET l'`ENV` dans l'étape de CONSTRUCTION :
#      l'`ARG` seul ne suffit pas, Next.js lisant l'environnement du processus
#   2. le bundle réellement construit porte la valeur configurée, et aucune
#      autre : c'est le seul sens qui prouve que la chaîne entière fonctionne
#
# LE SENS 2 EST LE CRITÈRE 2 DE LS-197, et il ne peut se vérifier que sur un
# bundle existant. Sans `.next/`, le contrôle DIT qu'il n'a pas pu conclure et
# sort en échec plutôt que de se taire : un garde-fou qui ne peut pas conclure
# bloque, motif de `migrate-production.sh`.
#
# POURQUOI L'ARG SEUL NE SUFFIT PAS, mesuré. Un `ARG` de Dockerfile n'est pas
# exporté dans l'environnement des `RUN` suivants : il faut un `ENV` qui le
# reprend. Un Dockerfile qui déclarerait l'`ARG` sans l'`ENV` semblerait correct
# à la relecture et figerait quand même le repli dans le bundle.
#
# Usage : ./scripts/verifier-prefixe-medias.sh
# Prérequis : un bundle construit, `npm run build`. Aucune base ni conteneur.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
DOCKERFILE="$RACINE/Dockerfile"
EXEMPLE="$RACINE/.env.example"
BUNDLE="$RACINE/.next/static/chunks"
ko=0

[ -r "$DOCKERFILE" ] || {
  echo "ECHEC Dockerfile illisible : $DOCKERFILE"
  exit 1
}
[ -r "$EXEMPLE" ] || {
  echo "ECHEC .env.example illisible : $EXEMPLE"
  exit 1
}

echo "Préfixe public des médias, LS-197"
echo

# ---------------------------------------------------------------------------
# Sens 1 : le Dockerfile porte l'ARG ET l'ENV, dans l'étape de construction.
# ---------------------------------------------------------------------------
if grep -qE '^ARG NEXT_PUBLIC_MEDIA_PREFIXE=' "$DOCKERFILE"; then
  echo "  OK    le Dockerfile déclare l'ARG NEXT_PUBLIC_MEDIA_PREFIXE"
else
  echo "  ECHEC le Dockerfile ne déclare aucun ARG NEXT_PUBLIC_MEDIA_PREFIXE"
  echo "        Tout docker build figerait le repli dans le bundle servi, et"
  echo "        aucune configuration d'exécution ne pourrait le changer."
  ko=1
fi

if grep -qE '^ENV NEXT_PUBLIC_MEDIA_PREFIXE=' "$DOCKERFILE"; then
  echo "  OK    l'ARG est repris par un ENV, donc visible de next build"
else
  echo "  ECHEC l'ARG n'est repris par aucun ENV"
  echo "        Un ARG n'est PAS exporté dans l'environnement des RUN suivants :"
  echo "        sans l'ENV, next build ne le voit pas et fige le repli."
  ko=1
fi

# L'ARG doit vivre dans l'etape `builder`, jamais dans `runner` : la
# substitution a lieu a la construction, et un ARG pose apres ne servirait a
# rien tout en donnant l'apparence d'un reglage.
ligne_arg="$(grep -nE '^ARG NEXT_PUBLIC_MEDIA_PREFIXE=' "$DOCKERFILE" | cut -d: -f1)"
ligne_runner="$(grep -nE '^FROM .* AS runner' "$DOCKERFILE" | cut -d: -f1)"
if [ -n "${ligne_arg:-}" ] && [ -n "${ligne_runner:-}" ]; then
  if [ "$ligne_arg" -lt "$ligne_runner" ]; then
    echo "  OK    l'ARG vit dans l'étape de construction, avant l'étape runner"
  else
    echo "  ECHEC l'ARG est déclaré APRÈS l'étape runner, ligne $ligne_arg"
    echo "        La substitution a lieu à la construction : un ARG posé dans"
    echo "        l'étape d'exécution ne change rien au bundle deja fige."
    ko=1
  fi
fi

# ---------------------------------------------------------------------------
# Sens 2 : le bundle construit porte la valeur configurée.
#
# LA VALEUR ATTENDUE VIENT DE L'ENVIRONNEMENT SI ELLE Y EST, sinon du defaut de
# l'ARG. C'est exactement la resolution que `next build` applique, donc le
# controle compare ce que le bundle porte a ce que la construction devait y
# mettre, et non a une constante ecrite ici.
# ---------------------------------------------------------------------------
echo
defaut="$(grep -E '^ARG NEXT_PUBLIC_MEDIA_PREFIXE=' "$DOCKERFILE" | head -1 | cut -d= -f2-)"
attendu="${NEXT_PUBLIC_MEDIA_PREFIXE:-$defaut}"

if [ -z "$attendu" ]; then
  echo "  ECHEC aucune valeur attendue : ni l'environnement ni l'ARG n'en portent"
  exit 1
fi

if [ ! -d "$BUNDLE" ]; then
  echo "  ECHEC aucun bundle construit sous .next/static/chunks"
  echo "        Le contrôle NE PEUT PAS CONCLURE sur le sens 2, celui qui prouve"
  echo "        que la chaîne fonctionne. Lancer « npm run build » puis rejouer."
  exit 1
fi

# DEUX FORMES SONT LEGITIMES DANS LE BUNDLE, et ne pas le savoir produit un
# controle faux. Les deux ont ete mesurees le 7 septembre 2026 :
#
#   variable DEFINIE a la construction
#     -> Next.js INLINE la valeur dans un litteral de gabarit,
#        `/cdn-test/${e}/...`. Aucun `process.env` ne subsiste.
#
#   variable ABSENTE de l'environnement de construction
#     -> Next.js laisse l'expression ENTIERE,
#        `process.env.NEXT_PUBLIC_MEDIA_PREFIXE??"/medias"`, et c'est le repli
#        qui s'applique dans le navigateur, ou `process.env` est vide.
#
# La premiere version de ce controle cherchait `"$attendu"` avec ses guillemets,
# supposant une chaine litterale : elle ne trouvait NI l'une NI l'autre forme, et
# aurait ete un FAUX NEGATIF permanent, rouge sur une chaine qui fonctionne.
#
# CE QUI EST REELLEMENT VERIFIE est donc que le prefixe SERVI vaut la valeur
# attendue, par l'une ou l'autre voie. Un bundle portant un AUTRE prefixe inline
# echoue, ce qui est le critere 2 de la story.
inline="$(grep -rlF "$attendu/" "$BUNDLE" 2>/dev/null | head -1)"
repli="$(grep -rlF "NEXT_PUBLIC_MEDIA_PREFIXE??\"$attendu\"" "$BUNDLE" 2>/dev/null | head -1)"

if [ -n "$inline" ]; then
  echo "  OK    le bundle porte « $attendu » inline, valeur figée à la construction"
elif [ -n "$repli" ]; then
  echo "  OK    le bundle porte le repli « $attendu », aucune valeur n'était définie"
  echo "        Next.js laisse alors l'expression entière : c'est le repli qui"
  echo "        s'applique dans le navigateur, et il vaut la valeur attendue."
else
  echo "  ECHEC le bundle ne sert PAS « $attendu »"
  echo "        Ni valeur inline, ni repli concordant. La valeur configurée n'a"
  echo "        pas atteint next build : les URL de médias pointeront ailleurs,"
  echo "        en silence, LS-197."
  ko=1
fi

# ---------------------------------------------------------------------------
# Sens 2 bis : `.env.example` declare toujours la variable.
#
# Sans elle, `verifier-environnement.sh` cesserait de l'exiger et le reglage
# redeviendrait invisible a la relecture, ce qui est precisement l'etat que
# LS-192 a corrige.
# ---------------------------------------------------------------------------
if grep -qE '^NEXT_PUBLIC_MEDIA_PREFIXE=' "$EXEMPLE"; then
  echo "  OK    .env.example déclare toujours la variable"
else
  echo "  ECHEC .env.example ne déclare plus NEXT_PUBLIC_MEDIA_PREFIXE"
  echo "        Le réglage redeviendrait invisible à la relecture de la"
  echo "        configuration, l'état que LS-192 a corrigé."
  ko=1
fi

echo
echo "-----------------------------------------"
if [ "$ko" -eq 0 ]; then
  echo "  préfixe des médias conforme"
  echo "-----------------------------------------"
  exit 0
fi
echo "  ECHEC préfixe des médias"
echo "-----------------------------------------"
exit 1
