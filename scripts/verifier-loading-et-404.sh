#!/bin/bash
# Interdit un `loading.tsx` sur une route qui appelle `notFound()`, LS-146.
#
# LE DÉFAUT. `loading.tsx` enveloppe la page entière dans une frontière
# Suspense. Le streaming de la réponse commence donc AVANT que `notFound()` soit
# atteint, et Next.js ne peut plus changer le statut d'une réponse déjà
# commencée : il laisse 200 et se contente d'ajouter un `noindex`. Vérifié via
# Context7 et mesuré en LS-111, 404 sans le fichier et 200 avec.
#
# POURQUOI C'EST GRAVE ICI. Le SEO est prioritaire sur ce projet. Un moteur
# indexerait une fiche produit inexistante en 200, et le `noindex` ne protège
# que des moteurs qui le respectent. La page rendue est visuellement IDENTIQUE
# dans les deux cas : rien à l'écran ne distingue un 404 d'un 200.
#
# POURQUOI UN SCRIPT ALORS QU'UN TEST VÉRIFIE DÉJÀ LE STATUT. Le test de
# `pages-erreur.spec.ts` attrape le défaut APRÈS coup, et seulement sur les
# routes qu'il visite. Ce contrôle l'attrape à l'écriture, sur toutes les routes,
# et sans base ni navigateur. Le geste qu'il empêche est celui d'une bonne
# intention : `frontend-design.md` EXIGE un état de chargement, et l'ajouter sur
# une fiche produit paraît être une amélioration.
#
# CE N'EST PAS UNE INTERDICTION ABSOLUE, et le message le dit : le contenu lourd
# peut passer sous un `<Suspense>` DANS la page, en gardant le contrôle
# d'existence au-dessus. Ce qui est interdit est la frontière au niveau du
# SEGMENT, qui englobe l'appel à `notFound()`.
#
# Usage : ./scripts/verifier-loading-et-404.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
APP="$RACINE/src/app"
ko=0

[ -d "$APP" ] || { echo "ECHEC dossier des routes introuvable : $APP"; exit 1; }

segments_examines=0

# Pour chaque `page.tsx` du dépôt, on regarde si son segment appelle
# `notFound()` et s'il porte un `loading.tsx` voisin.
#
# LES COMMENTAIRES SONT EXCLUS DE LA RECHERCHE. Trois fichiers du dépôt NOMMENT
# `notFound()` pour expliquer pourquoi ils n'ont pas de `loading.tsx` : les
# compter comme des appels rendrait le contrôle rouge sur du code exemplaire, et
# la réaction serait de retirer l'explication. Motif « contrôle satisfait par un
# commentaire », déjà en fiche sur ce dépôt.
while IFS= read -r page; do
  [ -n "$page" ] || continue
  segments_examines=$((segments_examines + 1))

  segment="$(dirname "$page")"
  relatif="${segment#"$RACINE"/}"

  appelle_notfound=$(grep -nE '(^|[^a-zA-Z.])notFound\(\)' "$page" \
    | grep -vE ':[[:space:]]*(//|\*|/\*)' || true)

  [ -n "$appelle_notfound" ] || continue
  [ -f "$segment/loading.tsx" ] || continue

  echo "ECHEC $relatif porte un loading.tsx et appelle notFound()"
  echo "      la frontière Suspense du segment démarre le streaming avant que"
  echo "      notFound() soit atteint : le statut reste 200 au lieu de 404, et"
  echo "      un moteur indexe une page inexistante. Mesuré en LS-111."
  echo "      Ce qui le rétablit sans le conflit : déplacer le contenu lourd"
  echo "      sous un <Suspense> DANS la page, contrôle d'existence au-dessus."
  ko=$((ko + 1))
done <<EOF
$(find "$APP" -name "page.tsx" 2>/dev/null | sort || true)
EOF

echo "Segments de route examinés : $segments_examines"

# L'ANCRAGE SE PROUVE. Zéro segment examiné signifie que le contrôle ne regarde
# plus rien, et un contrôle muet qui rend « OK » est pire que son absence.
if [ "$segments_examines" -eq 0 ]; then
  echo "ECHEC aucun segment de route examiné : l'ancrage du contrôle est cassé"
  echo "      (src/app a été déplacé, ou la convention de nommage a changé)"
  ko=$((ko + 1))
fi

# ---------------------------------------------------------------------------
# Second sens : les trois pages d'erreur publiques existent toujours.
#
# SANS CE SENS, LE CONTRÔLE MENTIRAIT PAR OMISSION. Il resterait vert sur un
# dépôt d'où `not-found.tsx` aurait disparu : il ne distingue pas « aucune route
# fautive » de « plus aucune page 404 à protéger », et le défaut que LS-146
# ferme est précisément l'ABSENCE de ces fichiers.
# ---------------------------------------------------------------------------
for page in "not-found.tsx" "global-error.tsx"; do
  if [ ! -f "$APP/$page" ]; then
    echo "ECHEC src/app/$page a disparu"
    echo "      sans lui, Next.js sert sa page par défaut : en anglais, sans"
    echo "      navigation, sur le premier écran public que voit un visiteur."
    ko=$((ko + 1))
  fi
done

if [ ! -f "$APP/(boutique)/error.tsx" ]; then
  echo "ECHEC src/app/(boutique)/error.tsx a disparu"
  echo "      les écrans du groupe boutique retombent alors sur la page"
  echo "      d'erreur générique de Next.js."
  ko=$((ko + 1))
fi

echo
if [ "$ko" -eq 0 ]; then
  echo "OK aucun loading.tsx ne masque un 404, les pages d'erreur sont en place"
else
  echo "$ko problème(s) détecté(s)"
fi

exit "$ko"
