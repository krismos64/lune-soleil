#!/usr/bin/env bash
#
# Mesure les Core Web Vitals du site DEPLOYE et confronte le resultat aux
# seuils. LS-140, critere 1.
#
# CE QU'IL AJOUTE AUX MESURES LOCALES, et c'est tout l'objet de la story : la
# latence reseau reelle, l'image reellement servie, la compression reelle de
# Nginx et le processeur reel du VPS. Aucune mesure locale ne reproduit cela,
# et ce depot a deja paye trois formes de mesure fausse.
#
# IL NE TOUCHE RIEN. Lighthouse charge des pages publiques en lecture, comme le
# ferait un visiteur. Il ne se connecte a aucun compte et n'appelle aucune
# Server Action : les pages d'administration et le tunnel de commande sont hors
# de sa portee, faute d'une session, et c'est deliberе.
#
# ------------------------------------------------------------------
# LE CATALOGUE EST REEL DEPUIS SEPTEMBRE 2026, et la mesure porte enfin sur
# lui. Jusqu'au 8 octobre 2026, ce script marquait l'accueil et le catalogue
# « attend LS-23 » : la production n'avait aucune piece, et un chiffre excellent
# sur un catalogue vide aurait ete un chiffre faux. Cinquante pieces
# photographiees sont en ligne : la reserve est levee, et une FICHE PRODUIT
# REELLE, tiree du sitemap a chaque execution, entre dans la mesure.
#
# UNE BOUTIQUE SANS FICHE AU SITEMAP EST UN ECHEC DE MESURE, pas une page de
# moins : c'est un catalogue vide, LS-278, et le dire vaut mieux que mesurer
# sept pages vertes autour d'une boutique fermee.
# ------------------------------------------------------------------
#
# Usage : ./scripts/mesurer-site-deploye.sh [URL de base]
#         SEUIL_LCP=2500 ./scripts/mesurer-site-deploye.sh

set -uo pipefail

BASE="${1:-https://lune-soleil.fr}"

# ---------------------------------------------------------------------------
# LES SEUILS SONT CEUX DE web.dev POUR « bon », et non des valeurs choisies pour
# que la mesure passe. Les inventer plus larges rendrait le controle vert sans
# rien garantir.
#
# LCP 2500 ms, CLS 0,1, TBT 200 ms. Le TBT remplace le FID, qui n'est pas
# mesurable en laboratoire : Lighthouse mesure ce que le navigateur PEUT faire,
# pas ce qu'un visiteur reel a vecu. La distinction compte, et la mesure de
# terrain appartiendrait a LS-141 si elle est retenue.
# ---------------------------------------------------------------------------
SEUIL_LCP="${SEUIL_LCP:-2500}"
SEUIL_CLS_MILLI="${SEUIL_CLS_MILLI:-100}"
SEUIL_TBT="${SEUIL_TBT:-200}"
SEUIL_PERF="${SEUIL_PERF:-90}"
SEUIL_A11Y="${SEUIL_A11Y:-100}"

# ---------------------------------------------------------------------------
# LES PAGES MESUREES, ET POURQUOI CELLES-CI.
#
# Les routes sont RELEVEES depuis `src/app/(boutique)` et non devinees : une
# premiere tentative a interroge `/mentions-legales` et `/connexion`, qui
# rendent 404. Les vraies sont `/informations-legales` et `/compte/connexion`.
# ---------------------------------------------------------------------------
PAGES=(
  "/|accueil"
  "/catalogue|catalogue"
  "/atelier|atelier"
  "/aide|aide"
  "/contact|contact"
  "/informations-legales|informations légales"
  "/compte/connexion|connexion"
  "/compte/inscription|inscription"
)

# LA FICHE PRODUIT VIENT DU SITEMAP, jamais d'un slug ecrit ici : une piece
# vendue ou archivee rendrait 404, et la mesure porterait sur une page
# d'erreur. La premiere fiche publiee suffit, le gabarit etant commun.
FICHE=$(curl -fsS --max-time 20 "$BASE/sitemap.xml" 2>/dev/null |
  grep -o '<loc>[^<]*/produit/[^<]*</loc>' | head -n 1 |
  sed -e 's#<loc>##' -e 's#</loc>##' -e "s#^$BASE##")

# LE REPERTOIRE EST CREE, ET CETTE LIGNE A COUTE UN DIAGNOSTIC.
#
# `mktemp -d` cree le repertoire ; une valeur fournie par l'environnement, NON.
# Lighthouse refuse alors d'ecrire, avec un message qui ne part que sur la
# sortie d'erreur : « --output-path (...) cannot be written to ». Le `2>&1` du
# `if` le masquait, et les SEPT pages echouaient d'un coup.
#
# Le garde-fou « aucune page mesuree » a refuse d'annoncer un vert sur zero
# mesure, ce qui est son role, mais il ne disait pas la cause. Elle n'est
# apparue qu'en relancant sans masquer la sortie d'erreur.
RAPPORTS="${RAPPORTS:-$(mktemp -d)}"
mkdir -p "$RAPPORTS" || {
  echo "Arret : $RAPPORTS ne peut pas etre cree." >&2
  exit 1
}
ECHECS=0
MESUREES=0

if [ -n "$FICHE" ]; then
  PAGES+=("$FICHE|fiche produit")
else
  echo "ECHEC : aucune fiche produit au sitemap de $BASE, le catalogue est vide."
  ECHECS=$((ECHECS + 1))
fi

echo "=========================================================================="
echo "CORE WEB VITALS DU SITE DEPLOYE, LS-140"
echo "$BASE, $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Seuils : LCP < ${SEUIL_LCP} ms, CLS < 0,$(printf '%02d' $((SEUIL_CLS_MILLI / 10))), TBT < ${SEUIL_TBT} ms,"
echo "         performance >= ${SEUIL_PERF}, accessibilite >= ${SEUIL_A11Y}"
echo "=========================================================================="
echo

printf '%-24s %-8s %-9s %-8s %-7s %-6s %s\n' \
  "PAGE" "LCP" "CLS" "TBT" "PERF" "A11Y" "VERDICT"
printf '%-24s %-8s %-9s %-8s %-7s %-6s %s\n' \
  "------------------------" "--------" "---------" "--------" "-------" "------" "-------"

for ENTREE in "${PAGES[@]}"; do
  IFS='|' read -r CHEMIN NOM <<<"$ENTREE"
  FICHIER="$RAPPORTS/$(printf '%s' "$NOM" | tr -c 'a-zA-Z0-9' '-').json"

  # `--only-categories` limite le travail aux deux categories du critere.
  # `--chrome-flags` : sans `--headless`, Lighthouse ouvre une fenetre reelle,
  # ce qui echoue sur une machine sans affichage comme un executeur de CI.
  # LA SORTIE D'ERREUR EST CAPTUREE ET NON JETEE, et c'est ce qui manquait a la
  # premiere version : elle partait dans `/dev/null`, donc les sept pages
  # echouaient en annoncant « Lighthouse n'a pas abouti » sans jamais dire
  # POURQUOI. La cause etait un repertoire absent, et le message le disait.
  JOURNAL_ERREUR="$RAPPORTS/$(basename "$FICHIER" .json).err"
  if ! npx --yes lighthouse "$BASE$CHEMIN" \
    --quiet \
    --output=json \
    --output-path="$FICHIER" \
    --only-categories=performance,accessibility \
    --chrome-flags="--headless=new --no-sandbox --disable-gpu" \
    >/dev/null 2>"$JOURNAL_ERREUR"; then
    printf '%-24s %s\n' "$NOM" "ECHEC de la mesure :"
    sed 's/^/    /' "$JOURNAL_ERREUR" | grep -vE '^\s*$' | head -4
    ECHECS=$((ECHECS + 1))
    continue
  fi
  rm -f "$JOURNAL_ERREUR"

  if [ ! -s "$FICHIER" ]; then
    printf '%-24s %s\n' "$NOM" "ECHEC, rapport vide"
    ECHECS=$((ECHECS + 1))
    continue
  fi

  # Les valeurs sont lues en NUMERIQUE et non dans le libelle affiche : « 1,2 s »
  # ne se compare pas a un seuil, et sa virgule depend de la locale.
  LCP=$(node -e "const r=require('$FICHIER');process.stdout.write(String(Math.round(r.audits['largest-contentful-paint']?.numericValue ?? -1)))" 2>/dev/null || echo "-1")
  CLS_MILLI=$(node -e "const r=require('$FICHIER');process.stdout.write(String(Math.round((r.audits['cumulative-layout-shift']?.numericValue ?? -1)*1000)))" 2>/dev/null || echo "-1")
  TBT=$(node -e "const r=require('$FICHIER');process.stdout.write(String(Math.round(r.audits['total-blocking-time']?.numericValue ?? -1)))" 2>/dev/null || echo "-1")
  PERF=$(node -e "const r=require('$FICHIER');process.stdout.write(String(Math.round((r.categories.performance?.score ?? -0.01)*100)))" 2>/dev/null || echo "-1")
  A11Y=$(node -e "const r=require('$FICHIER');process.stdout.write(String(Math.round((r.categories.accessibility?.score ?? -0.01)*100)))" 2>/dev/null || echo "-1")

  ECARTS=""
  [ "$LCP" -lt 0 ] 2>/dev/null && ECARTS="$ECARTS LCP illisible"
  [ "$LCP" -ge "$SEUIL_LCP" ] 2>/dev/null && ECARTS="$ECARTS LCP"
  [ "$CLS_MILLI" -ge "$SEUIL_CLS_MILLI" ] 2>/dev/null && ECARTS="$ECARTS CLS"
  [ "$TBT" -ge "$SEUIL_TBT" ] 2>/dev/null && ECARTS="$ECARTS TBT"
  [ "$PERF" -lt "$SEUIL_PERF" ] 2>/dev/null && ECARTS="$ECARTS perf"
  [ "$A11Y" -lt "$SEUIL_A11Y" ] 2>/dev/null && ECARTS="$ECARTS a11y"

  if [ -n "$ECARTS" ]; then
    VERDICT="ECART :$ECARTS"
    ECHECS=$((ECHECS + 1))
  else
    VERDICT="OK"
  fi

  MESUREES=$((MESUREES + 1))
  printf '%-24s %-8s %-9s %-8s %-7s %-6s %s\n' \
    "$NOM" "${LCP} ms" "0,$(printf '%03d' "$CLS_MILLI")" "${TBT} ms" "$PERF" "$A11Y" "$VERDICT"
done

echo
echo "Rapports complets : $RAPPORTS"
echo

# ---------------------------------------------------------------------------
# Garde-fou contre un ancrage casse.
#
# Si toutes les mesures echouaient, par exemple parce que le domaine a change,
# le script sortirait en echec en le DISANT plutot que d'annoncer un vert sur
# zero mesure. Motif deja rencontre plusieurs fois sur ce depot.
# ---------------------------------------------------------------------------
if [ "$MESUREES" -eq 0 ]; then
  echo "ECHEC : aucune page mesuree. Le site est-il joignable ?"
  exit 1
fi

echo
if [ "$ECHECS" -eq 0 ]; then
  echo "$MESUREES page(s) mesuree(s), aucun ecart aux seuils."
  exit 0
fi

echo "$MESUREES page(s) mesuree(s), $ECHECS ecart(s) aux seuils."
exit 1
