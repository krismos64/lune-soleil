#!/bin/bash
# Preuve par mutation de `verifier-chargement-administration.sh`, LS-188.
#
# Motif. Ce contrôle a déjà trouvé un défaut réel avant même d'être commité : il
# a signalé `produits/nouveau`, quinzième écran en `force-dynamic` que le ticket
# LS-188 avait manqué, son constat datant d'un jour où le dépôt n'en portait que
# quatorze. Ce qui reste à prouver est qu'il rougit sur chacun des défauts qu'il
# prétend attraper, et pas seulement sur celui-là.
#
# TROIS SENS À ÉPROUVER, ET ILS SE RATENT SÉPARÉMENT. Le contrôle exige un état
# de chargement, exige la BONNE FORME sur les deux écrans à `notFound()`, et
# exige que les écrans ordinaires passent par le composant partagé. Un script
# qui ne prouverait que le premier resterait vert sur un `<Suspense>` remplacé
# par un `loading.tsx`, c'est-à-dire sur une régression de C32.
#
# Usage : ./scripts/verifier-chargement-administration-mutation.sh
# Aucun prérequis, ni Docker ni base.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-chargement-administration.sh"
ADMIN="src/app/administration"

# LS-188 A RETIRÉ `commandes/loading.tsx` EN COURS DE ROUTE, son segment
# couvrant `commandes/[id]` qui appelle `notFound()`. La cible est donc un
# écran de liste dont AUCUN descendant n'appelle `notFound()`.
LOADING_LISTE="$ADMIN/factures/loading.tsx"
PAGE_DETAIL="$ADMIN/produits/[id]/page.tsx"
LOADING_CLIENTS="$ADMIN/clients/loading.tsx"
PARTAGE="src/components/chargement-administration.tsx"

detectes=0
total=0

# LES FICHIERS SONT SAUVEGARDÉS PAR COPIE et non par `git checkout` : une
# restauration qui dépend de l'index échoue sur un fichier non encore suivi, ce
# qui est le cas de tous les `loading.tsx` tant que la story n'est pas commitée.
# Motif « git checkout est atomique », en fiche sur ce dépôt.
SAUVEGARDE="$(mktemp -d)"
mkdir -p "$SAUVEGARDE/copies"

declare -a MUTABLES=(
  "$LOADING_LISTE"
  "$PAGE_DETAIL"
  "$LOADING_CLIENTS"
  "$PARTAGE"
)

# CHAQUE FICHIER MUTÉ EST DANS `MUTABLES`, et c'est vérifié plutôt que supposé :
# un fichier muté hors de cette liste ne serait jamais restauré et laisserait le
# dépôt cassé après coup. Motif « mutation non restaurée », en fiche.
for i in "${!MUTABLES[@]}"; do
  fichier="${MUTABLES[$i]}"
  if [ ! -f "$fichier" ]; then
    echo "ECHEC fichier à muter introuvable : $fichier"
    echo "      le chemin a changé : ce script s'arrêterait avant la mutation"
    echo "      qu'il prétend faire, motif « contrôle de mutation mort »."
    rm -rf "$SAUVEGARDE"
    exit 1
  fi
  cp "$fichier" "$SAUVEGARDE/copies/$i"
done

restaurer() {
  for i in "${!MUTABLES[@]}"; do
    cp "$SAUVEGARDE/copies/$i" "${MUTABLES[$i]}"
  done
  # Le cas 2 crée un fichier, il faut le retirer aussi.
  rm -f "$ADMIN/produits/[id]/loading.tsx"
}

nettoyer() {
  restaurer
  rm -rf "$SAUVEGARDE"
}
trap nettoyer EXIT INT TERM

# Le contrôle doit être VERT avant toute mutation, sans quoi les rouges qui
# suivent ne prouveraient rien : un script cassé rougit sur tout.
if ! "$CONTROLE" > /dev/null 2>&1; then
  echo "ECHEC le contrôle rougit AVANT toute mutation, l'arbre n'est pas sain"
  "$CONTROLE"
  exit 1
fi

essayer() {
  local intitule="$1"
  total=$((total + 1))

  if "$CONTROLE" > /dev/null 2>&1; then
    echo "  RATÉ     $intitule"
    echo "           le contrôle reste vert sur ce défaut"
  else
    echo "  détecté  $intitule"
    detectes=$((detectes + 1))
  fi

  restaurer
}

echo "Mutations de l'état de chargement de l'administration"
echo

# ---------------------------------------------------------------------------
# CAS 1 : un écran perd son état de chargement.
#
# C'est le défaut d'origine, celui que quinze écrans portaient. Le fichier est
# retiré, pas vidé : c'est la forme exacte que prendrait l'oubli du seizième
# écran, qui n'écrirait simplement jamais le sien.
# ---------------------------------------------------------------------------
rm -f "$LOADING_LISTE"
essayer "un écran en force-dynamic perd son loading.tsx"

# ---------------------------------------------------------------------------
# CAS 2 : un écran à `notFound()` TROQUE son `<Suspense>` contre un
# `loading.tsx`, ce qu'un développeur ferait en toute bonne foi pour
# « uniformiser » avec les treize autres écrans.
#
# CE QUE CE CAS PROUVE EXACTEMENT, et le nommer faux serait pire que ne pas le
# faire. Ce contrôle-ci rougit sur la DISPARITION du `<Suspense>`, par son
# second sens. La régression de C32 elle-même, le 404 qui devient 200, est
# attrapée par `verifier-loading-et-404.sh`, et c'est vérifié plus bas plutôt
# que supposé : ajouter le `loading.tsx` EN GARDANT le `<Suspense>` laisse ce
# contrôle-ci muet sur C32, seul l'autre script voyant le défaut.
#
# LES DEUX SCRIPTS SONT DONC NÉCESSAIRES, et aucun ne remplace l'autre. Motif
# « mutation vue par le mauvais test » : exiger « ça rougit » sans regarder QUI
# rougit valide une protection qui n'existe pas.
#
# LE FICHIER CRÉÉ EST MINIMAL ET VALIDE. Un fichier vide ferait échouer la
# construction plutôt que le contrôle, ce qui prouverait autre chose.
# ---------------------------------------------------------------------------
cat > "$ADMIN/produits/[id]/loading.tsx" <<'TSX'
export default function Chargement() {
  return <p>Chargement…</p>;
}
TSX
perl -0777 -i -pe 's/<Suspense fallback=\{<ChargementFiche \/>\}>/<div>/; s/<\/Suspense>/<\/div>/' "$PAGE_DETAIL"
essayer "un écran à notFound() troque son <Suspense> contre un loading.tsx"

# ---------------------------------------------------------------------------
# CAS 3 : le `<Suspense>` interne disparaît sans être remplacé.
#
# L'écran de détail redevient muet pendant sa lecture, et surtout la seule forme
# que C32 lui laisse a disparu. Sans le second sens du contrôle, la première
# boucle seule resterait ici verte : elle accepte les deux formes, et cet écran
# n'aurait plus aucune des deux, donc elle rougirait aussi. Ce cas prouve donc
# que les DEUX sens voient le défaut, pas seulement le second.
# ---------------------------------------------------------------------------
perl -0777 -i -pe 's/<Suspense fallback=\{<ChargementFiche \/>\}>/<div>/; s/<\/Suspense>/<\/div>/' "$PAGE_DETAIL"
essayer "l'écran de détail perd son <Suspense> interne"

# ---------------------------------------------------------------------------
# CAS 4 : un écran s'écarte du composant partagé.
#
# C'est l'érosion, pas la panne : l'écran garde un état de chargement, il cesse
# seulement de passer par la forme commune. Sans le troisième sens du contrôle,
# rien ne le dirait, et le douzième écran copierait celui qu'il a sous la main.
# Ce projet a déjà vu ce motif sur les liens Jira, où une convention écrite et
# non vérifiée s'est érodée jusqu'à 38 tickets.
#
# LA SUBSTITUTION VISE L'IMPORT ET L'APPEL. Renommer le seul appel laisserait
# l'import, donc le nom, donc un contrôle vert sur un fichier cassé : motif
# « mutation sans effet observable », en fiche.
# ---------------------------------------------------------------------------
perl -0777 -i -pe 's/ChargementAdministration/ArmatureLocale/g' "$LOADING_CLIENTS"
essayer "un écran réécrit son armature au lieu du composant partagé"

# ---------------------------------------------------------------------------
# CAS 5 : le composant partagé disparaît.
#
# Le contrôle doit le voir explicitement, et pas seulement à travers les écrans
# qui l'importent : un dépôt où il aurait été supprimé et où chaque écran aurait
# recopié son armature satisferait les trois autres sens.
# ---------------------------------------------------------------------------
rm -f "$PARTAGE"
essayer "le composant partagé est supprimé"

# ---------------------------------------------------------------------------
# CAS 6 : la frontière de C32 est franchie SANS que ce contrôle-ci puisse la
# voir, et c'est la vérification qui empêche de lui prêter une protection qu'il
# n'a pas.
#
# Le `loading.tsx` est ajouté sur la route à `notFound()` en GARDANT son
# `<Suspense>` : la page satisfait alors les trois sens de ce script, qui reste
# vert à juste titre, pendant que le 404 est devenu un 200. Le défaut n'est
# visible que par `verifier-loading-et-404.sh`.
#
# CE CAS S'ATTEND À DEUX RÉSULTATS OPPOSÉS, d'où sa forme à part : les autres
# cas exigent un rouge, celui-ci exige un vert ICI et un rouge LÀ-BAS. Un
# `essayer` ordinaire le compterait comme raté.
# ---------------------------------------------------------------------------
# LE FICHIER CRÉÉ EST CONFORME AUX TROIS SENS DE CE SCRIPT, composant partagé
# compris, et c'est le point : un fichier bâclé le ferait rougir par le
# troisième sens, ce qui masquerait ce que ce cas veut isoler. Première version
# de ce cas justement ratée pour cette raison, le contrôle rougissant pour une
# raison sans rapport avec C32.
total=$((total + 1))
cat > "$ADMIN/produits/[id]/loading.tsx" <<'TSX'
import { ChargementAdministration } from "@/components/chargement-administration";

import styles from "./editeur.module.css";

export default function Chargement() {
  return (
    <ChargementAdministration
      titre="Fiche produit"
      annonce="Chargement de la fiche…"
      classePage={styles.page}
      classeTitre={styles.titre}
    />
  );
}
TSX

if "$CONTROLE" > /dev/null 2>&1 \
  && ! ./scripts/verifier-loading-et-404.sh > /dev/null 2>&1; then
  echo "  détecté  C32 franchie, vue par verifier-loading-et-404.sh seul"
  detectes=$((detectes + 1))
else
  echo "  RATÉ     C32 franchie, la répartition des rôles n'est pas celle décrite"
  echo "           attendu : ce contrôle vert, verifier-loading-et-404.sh rouge"
  echo "           obtenu  : ce contrôle $("$CONTROLE" > /dev/null 2>&1 && echo vert || echo rouge)," \
       "l'autre $(./scripts/verifier-loading-et-404.sh > /dev/null 2>&1 && echo vert || echo rouge)"
fi
restaurer

echo
echo "Mutations détectées : $detectes sur $total"

if [ "$detectes" -ne "$total" ]; then
  echo "ECHEC au moins une mutation n'est pas détectée : le contrôle a un trou"
  exit 1
fi

echo "OK le contrôle rougit sur chacun des défauts qu'il prétend attraper"
exit 0
