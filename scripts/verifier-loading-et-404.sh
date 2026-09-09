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
# `notFound()` et si un `loading.tsx` le couvre.
#
# LA REMONTÉE VERS LES SEGMENTS PARENTS EST INDISPENSABLE, et son absence était
# un trou réel de ce contrôle, mesuré le 5 septembre 2026 en LS-188.
#
# UN `loading.tsx` COUVRE TOUT SON SOUS-ARBRE, pas seulement sa propre page,
# exactement comme un `error.tsx` couvre les seize écrans d'administration
# depuis LS-191. Un `loading.tsx` posé à la racine de `administration/` a donc
# fait passer en 200 les 404 de `produits/[id]` et `commandes/[id]`, deux
# dossiers plus bas, pendant que ce contrôle restait vert : il ne comparait que
# des fichiers VOISINS.
#
# MESURE : sur une route de diagnostic appelant `notFound()` en première
# instruction, 404 hors de `/administration`, 200 dedans, le seul écart étant la
# présence du `loading.tsx` racine.
#
# LES COMMENTAIRES SONT EXCLUS DE LA RECHERCHE. Plusieurs fichiers du dépôt
# NOMMENT `notFound()` pour expliquer pourquoi ils n'ont pas de `loading.tsx` :
# les compter comme des appels rendrait le contrôle rouge sur du code
# exemplaire, et la réaction serait de retirer l'explication. Motif « contrôle
# satisfait par un commentaire », déjà en fiche sur ce dépôt.
while IFS= read -r page; do
  [ -n "$page" ] || continue
  segments_examines=$((segments_examines + 1))

  segment="$(dirname "$page")"
  relatif="${segment#"$RACINE"/}"

  appelle_notfound=$(grep -nE '(^|[^a-zA-Z.])notFound\(\)' "$page" \
    | grep -vE ':[[:space:]]*(//|\*|/\*)' || true)

  [ -n "$appelle_notfound" ] || continue

  # On remonte du segment de la page jusqu'à `src/app`, à la recherche du
  # premier `loading.tsx` qui l'enveloppe. Le sien compte comme ceux de ses
  # parents : les deux posent une frontière au-dessus de l'appel.
  couvrant=""
  courant="$segment"
  while [ -n "$courant" ] && [ "$courant" != "$APP" ]; do
    if [ -f "$courant/loading.tsx" ]; then
      couvrant="$courant"
      break
    fi
    courant="$(dirname "$courant")"
  done
  # `src/app` lui-même porte le dernier segment à examiner.
  if [ -z "$couvrant" ] && [ -f "$APP/loading.tsx" ]; then
    couvrant="$APP"
  fi

  [ -n "$couvrant" ] || continue

  relatif_couvrant="${couvrant#"$RACINE"/}"

  echo "ECHEC $relatif appelle notFound() sous un loading.tsx"
  echo "      la frontière est posée par $relatif_couvrant/loading.tsx"
  echo "      elle démarre le streaming avant que notFound() soit atteint : le"
  echo "      statut reste 200 au lieu de 404, et un moteur indexe une page"
  echo "      inexistante. Mesuré en LS-111, puis en LS-188 sur un PARENT."
  echo "      Ce qui le rétablit sans le conflit : retirer ce loading.tsx et"
  echo "      placer le contenu lourd sous un <Suspense> DANS la page qui le"
  echo "      voulait, contrôle d'existence au-dessus."
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
# Deuxième sens : une page qui LIT LA BASE sous un `loading.tsx` doit sonder
# la disponibilité AVANT la frontière, LS-139.
#
# C'EST LE JUMEAU DU SENS PRÉCÉDENT, et il vient d'un incident réel. Le
# 9 septembre 2026, `lune-soleil-db` a été arrêtée sur la production : le
# catalogue a répondu **200** avec « Chargement des pièces… » comme état FINAL,
# 39 462 octets contre 45 748 au nominal, le flux se terminant sur deux
# `E{"digest":...}` sans que le contenu n'arrive jamais.
#
# LE MÉCANISME EST EXACTEMENT CELUI DU 404, à la source d'erreur près : la
# frontière du segment démarre le streaming avant que la lecture échoue, et un
# statut ne se change plus une fois les octets partis. `error.tsx` existait,
# était juste, et ne s'affichait qu'APRÈS hydratation JavaScript.
#
# CE QUE LE 200 COÛTE. Un visiteur sans JavaScript reste devant un chargement
# perpétuel ; un moteur indexe « Chargement… » sur la page commerciale
# principale ; une supervision qui lit le code HTTP conclut que tout va bien.
#
# CE SENS N'INTERDIT PAS le `loading.tsx`, contrairement au précédent : il sert
# ici un vrai besoin, les filtres d'URL de LS-104. Il EXIGE la sonde au-dessus.
# ---------------------------------------------------------------------------
pages_lisant_la_base=0

while IFS= read -r page; do
  [ -n "$page" ] || continue

  segment="$(dirname "$page")"
  relatif="${segment#"$RACINE"/}"

  # Une page publique qui lit le catalogue. L'ancrage porte sur l'APPEL, jamais
  # sur la présence du nom quelque part : un import ou un commentaire qui cite
  # la fonction ne lit rien, et le compter rendrait le contrôle rouge sur du
  # code exemplaire. Motif « contrôle satisfait par un commentaire ».
  lit_la_base=$(grep -nE 'await[[:space:]]+lireCataloguePublic\(' "$page" \
    | grep -vE ':[[:space:]]*(//|\*|/\*)' || true)

  [ -n "$lit_la_base" ] || continue

  # Même remontée que le sens précédent : un `loading.tsx` parent couvre tout
  # son sous-arbre, et l'oublier était un trou réel mesuré en LS-188.
  couvrant=""
  courant="$segment"
  while [ -n "$courant" ] && [ "$courant" != "$APP" ]; do
    if [ -f "$courant/loading.tsx" ]; then
      couvrant="$courant"
      break
    fi
    courant="$(dirname "$courant")"
  done
  if [ -z "$couvrant" ] && [ -f "$APP/loading.tsx" ]; then
    couvrant="$APP"
  fi

  # Sans frontière au-dessus, l'erreur produit un vrai 500 toute seule : rien
  # à exiger, et exiger la sonde ici ajouterait une requête pour rien.
  [ -n "$couvrant" ] || continue

  pages_lisant_la_base=$((pages_lisant_la_base + 1))

  # LA SONDE SE CHERCHE PAR SON APPEL, et il doit être ATTENDU : un
  # `verifierSante` importé sans être appelé, ou appelé sans `await`, ne
  # protège rien et laisserait le contrôle vert sur le défaut qu'il vise.
  sonde=$(grep -nE 'await[[:space:]]+[a-zA-Z]*[Ss]ante|await[[:space:]]+exigerBaseDisponible\(' "$page" \
    | grep -vE ':[[:space:]]*(//|\*|/\*)' || true)

  if [ -z "$sonde" ]; then
    relatif_couvrant="${couvrant#"$RACINE"/}"
    echo "ECHEC $relatif lit la base sous un loading.tsx sans sonder d'abord"
    echo "      la frontière est posée par $relatif_couvrant/loading.tsx"
    echo "      elle démarre le streaming avant que la lecture échoue : une base"
    echo "      injoignable rend 200 avec l'état de chargement FIGÉ, et error.tsx"
    echo "      ne s'affiche qu'après hydratation. Mesuré en LS-139 en arrêtant"
    echo "      réellement la base de production."
    echo "      Ce qui le ferme : un await sur la sonde de santé AVANT tout await"
    echo "      de données, en tête de la fonction de page."
    ko=$((ko + 1))
  fi
done <<EOF
$(find "$APP" -name "page.tsx" 2>/dev/null | sort || true)
EOF

echo "Pages lisant la base sous une frontière : $pages_lisant_la_base"

# ---------------------------------------------------------------------------
# Troisième sens : les trois pages d'erreur publiques existent toujours.
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
