#!/bin/bash
# Preuve par mutation de `verifier-seo.sh`, LS-137, critère 6.
#
# POURQUOI CE FICHIER EXISTE. `verifier-seo.sh` est vert sur le dépôt. Un
# contrôle vert ne prouve rien tant qu'on ne l'a pas vu ROUGIR sur le défaut
# qu'il prétend attraper : il pourrait être vert parce qu'il ne regarde rien, ou
# parce que sa recherche ne trouve jamais sa cible. Ce dépôt a déjà rencontré
# les deux cas.
#
# CHAQUE MUTATION VISE UN DÉFAUT DISTINCT, et le script exige que le contrôle
# NOMME le fichier fautif : un rouge global prouverait seulement qu'il sait
# échouer, pas qu'il a vu la bonne ligne. Motif « mutation vue par le mauvais
# test », en fiche sur ce dépôt.
#
# LA RESTAURATION PASSE PAR `git checkout`, jamais par une réécriture inverse :
# une substitution de retour peut rater sa cible après reformatage et laisser le
# dépôt muté. Motif déjà payé ici.
#
# Usage : ./scripts/verifier-seo-mutation.sh

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-seo.sh"
ko=0

# LES FICHIERS MUTÉS SONT DÉCLARÉS ICI, et la restauration les reprend TOUS,
# qu'une mutation ait été appliquée ou non. Un fichier muté hors de cette liste
# resterait modifié après le script, motif « mutation non restaurée », en fiche.
MUTABLES=(
  "src/app/(boutique)/aide/page.tsx"
  "src/app/administration/stocks/page.tsx"
  "src/app/layout.tsx"
  "src/app/robots.ts"
  "src/app/(boutique)/compte/page.tsx"
)

restaurer() {
  git checkout -- "${MUTABLES[@]}" 2>/dev/null || true
}
trap restaurer EXIT

# L'arbre doit être propre sur les fichiers mutés, sans quoi la restauration
# écraserait du travail non commité. Motif « travail non commité perdu ».
if ! git diff --quiet -- "${MUTABLES[@]}"; then
  echo "ECHEC des modifications non commitées portent sur les fichiers à muter."
  echo "      Les commiter ou les remiser avant de lancer cette preuve."
  exit 1
fi

# Vert AVANT toute mutation. Sans ce point de départ, un rouge plus bas pourrait
# venir d'un défaut préexistant plutôt que de la mutation.
if ! "$CONTROLE" >/dev/null 2>&1; then
  echo "ECHEC le contrôle est déjà rouge avant toute mutation."
  "$CONTROLE"
  exit 1
fi
echo "Point de départ : contrôle vert."
echo

# ---------------------------------------------------------------------------
# Applique une mutation, exige un rouge NOMMANT le fichier, restaure.
#
# $1 libellé, $2 fichier muté, $3 motif attendu dans la sortie,
# $4 commande de mutation (évaluée)
# ---------------------------------------------------------------------------
muter() {
  local libelle="$1" fichier="$2" motif="$3" commande="$4"

  eval "$commande"

  # LA MUTATION DOIT AVOIR MODIFIÉ LE FICHIER. Une substitution qui rate sa
  # cible laisse le contrôle vert, et le script conclurait « le contrôle ne
  # détecte pas » alors que rien n'a été muté. Motif « correction échouée en
  # silence » et « cible de mutation déplacée », tous deux en fiche.
  if git diff --quiet -- "$fichier"; then
    echo "ECHEC [$libelle] la mutation n'a modifié aucune ligne de $fichier"
    echo "      la cible a bougé : corriger ce script avant de conclure."
    ko=$((ko + 1))
    restaurer
    return
  fi

  local sortie
  sortie="$("$CONTROLE" 2>&1)"
  local code=$?

  if [ "$code" -eq 0 ]; then
    echo "ECHEC [$libelle] le contrôle reste VERT sur la mutation"
    ko=$((ko + 1))
  elif ! printf '%s' "$sortie" | grep -q "$motif"; then
    echo "ECHEC [$libelle] le contrôle rougit mais ne nomme pas « $motif »"
    echo "      un rouge qui désigne autre chose ne prouve pas la détection."
    printf '%s\n' "$sortie" | head -5
    ko=$((ko + 1))
  else
    echo "OK    [$libelle] rouge, et le contrôle nomme la cause"
    printf '%s\n' "$sortie" | grep "$motif" | head -2 | sed 's/^/        /'
  fi

  restaurer
}

# ---------------------------------------------------------------------------
# Mutation 1, le défaut principal du critère 5 : une page publique perd son
# canonical. C'est exactement la mutation que la story demande de prouver.
# ---------------------------------------------------------------------------
muter "canonical retiré d'une page publique" \
  "src/app/(boutique)/aide/page.tsx" \
  "aide/page.tsx est une page publique sans canonical" \
  "perl -0pi -e 's/alternates: \{ canonical: \"\/aide\" \},//' 'src/app/(boutique)/aide/page.tsx'"

# ---------------------------------------------------------------------------
# Mutation 2, le défaut symétrique et le plus coûteux : un écran privé perd son
# noindex. Le retrait d'un index public prend des semaines.
# ---------------------------------------------------------------------------
muter "noindex retiré d'un écran d'administration" \
  "src/app/administration/stocks/page.tsx" \
  "stocks/page.tsx est une route privée sans noindex" \
  "perl -0pi -e 's/index: false/index: true/' 'src/app/administration/stocks/page.tsx'"

# ---------------------------------------------------------------------------
# Mutation 3, le défaut invisible : `metadataBase` disparaît du layout racine.
#
# AUCUNE PAGE NE CHANGE, chaque canonical reste écrit dans son fichier. Ils sont
# simplement émis relatifs, donc résolus contre l'hôte de la requête. Rien à
# l'écran, rien dans les types, rien dans les tests de page.
# ---------------------------------------------------------------------------
muter "metadataBase retirée du layout racine" \
  "src/app/layout.tsx" \
  "ne déclare plus metadataBase" \
  "perl -0pi -e 's/metadataBase: new URL\(urlDuSite\(\)\),//' 'src/app/layout.tsx'"

# ---------------------------------------------------------------------------
# Mutation 4, la description perdue sur une page publique.
# ---------------------------------------------------------------------------
muter "description retirée d'une page publique" \
  "src/app/(boutique)/aide/page.tsx" \
  "aide/page.tsx est une page publique sans description" \
  "perl -0pi -e 's/^\s*description:\s*\$//gm; s/\"Modes de livraison, tarifs, droit de rétractation et réponses aux questions fréquentes sur les bijoux Lune & Soleil\\.\",//; s/description//g' 'src/app/(boutique)/aide/page.tsx'"

# ---------------------------------------------------------------------------
# Mutation 5, le titre doublé, sur une page PRIVÉE.
#
# Elle vise `/compte` et non une page publique, délibérément : vingt-trois des
# vingt-cinq pages qu'avait laissées doublées la première version de LS-137
# étaient privées, et le contrôle a dû être déplacé avant l'aiguillage
# public/privé pour les voir. Muter une page publique laisserait ce
# déplacement non prouvé.
# ---------------------------------------------------------------------------
muter "nom de la boutique réécrit dans un titre" \
  "src/app/(boutique)/compte/page.tsx" \
  "compte/page.tsx ecrit « Lune & Soleil » dans son titre" \
  "perl -0pi -e 's/title: \"Mon compte\"/title: \"Mon compte, Lune & Soleil\"/' 'src/app/(boutique)/compte/page.tsx'"

# ---------------------------------------------------------------------------
# Mutation 6, la route à jeton retirée de robots.txt.
#
# C'EST LE DÉFAUT DE SÉCURITÉ QUE LA REVUE A TROUVÉ. `/facture/` sert un PDF
# portant nom, adresse et montants à un client SANS session, sur seule
# signature. Son absence de la liste laissait un explorateur suivre un lien
# fuité depuis un email.
#
# LE CONTRÔLE NE PEUT PAS LE VOIR : il n'énumère que les `page.tsx`, et cette
# route est un `route.ts`. La mutation le prouve, et c'est utile de le savoir :
# ce qui protège ici est le test de bout en bout, pas le contrôle textuel.
# ---------------------------------------------------------------------------
sortie_robots="$(perl -0pi -e 's/\`\$\{CHEMIN_ACCES_DOCUMENT\}\/\`,//' 'src/app/robots.ts' && echo mute)"
if [ "$sortie_robots" = "mute" ] && ! git diff --quiet -- "src/app/robots.ts"; then
  echo "NOTE  [/facture retiré de robots.txt] le contrôle textuel ne le voit pas,"
  echo "        et c'est attendu : il n'énumère que les page.tsx. La garde est"
  echo "        tests/e2e/referencement.spec.ts, qui lit le fichier servi."
  restaurer
else
  echo "ECHEC [/facture retiré de robots.txt] la mutation n'a rien modifié :"
  echo "      la cible a bougé, corriger ce script."
  ko=$((ko + 1))
  restaurer
fi

echo
if [ "$ko" -eq 0 ]; then
  echo "OK les cinq mutations vérifiables sont détectées, et nommées"
else
  echo "$ko mutation(s) NON détectée(s) : le contrôle ne protège pas ce qu'il annonce"
fi

exit "$ko"
