#!/bin/bash
# Tout écran d'administration en `force-dynamic` porte un état de chargement,
# LS-188, critère 6.
#
# LE DÉFAUT QUE CE CONTRÔLE FERME. Quinze écrans déclaraient
# `dynamic = "force-dynamic"` et aucun n'avait d'état de chargement : chaque
# navigation attendait le rendu serveur complet sans que rien ne bouge à
# l'écran. Le défaut est resté invisible quinze écrans durant, chaque story
# ajoutant le sien sans que rien ne le signale.
#
# POURQUOI UN SCRIPT ET NON UN TEST. Aucun test de rendu ne voit un état de
# chargement : Playwright attend que la page soit chargée, donc il observe
# précisément le moment où le squelette a disparu. Le seizième écran
# reproduirait l'oubli sans qu'aucune assertion ne rougisse.
#
# DEUX FORMES SONT ACCEPTÉES, et la distinction est structurante :
#
#   1. un `loading.tsx` dans le segment, pour les écrans ordinaires
#   2. un `<Suspense>` DANS la page, pour les deux écrans qui appellent
#      `notFound()`, à qui la règle C32 interdit le `loading.tsx`
#
# LE SENS INVERSE EST GARDÉ PAR `verifier-loading-et-404.sh`, qui interdit le
# `loading.tsx` sur une route à `notFound()`. Les deux scripts se complètent :
# celui-ci exige un état de chargement, l'autre interdit la forme qui casserait
# le 404. Un écran à `notFound()` doit satisfaire les deux, donc employer la
# seconde forme.
#
# Usage : ./scripts/verifier-chargement-administration.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN="$RACINE/src/app/administration"
ko=0

[ -d "$ADMIN" ] || { echo "ECHEC dossier d'administration introuvable : $ADMIN"; exit 1; }

# ---------------------------------------------------------------------------
# Les écrans qui n'ont AUCUNE attente à annoncer, et c'est mesuré.
#
# UN `loading.tsx` DONT LE REPLI NE S'AFFICHE JAMAIS EST DU CODE MORT, et pire
# qu'inutile : il prétend protéger une attente qui n'existe pas, et une session
# future le prendrait pour la preuve que le sujet est traité.
#
# LA MESURE, pas la supposition. `tests/e2e/chargement-administration.spec.ts`
# capture le repli par `waitUntil: "commit"`, qui rend la main dès que la
# réponse commence. Sur `reauthentification`, le corps porte alors DÉJÀ le
# formulaire complet : la page ne fait qu'un seul `await`, la garde de session,
# et ne lit aucune donnée métier ensuite. Son `force-dynamic` sert à ne jamais
# mettre en cache une page liée à la session, jamais à attendre une requête.
#
# LE CRITÈRE EST STRUCTUREL, PAS CHRONOMÉTRIQUE, et c'est ce qui empêche cette
# liste de tout avaler. Un écran entre ici quand il n'a RIEN à lire après sa
# garde, pas quand sa lecture est rapide.
#
# LA MÊME MESURE a montré `produits/nouveau`, `retractations` et `messages`
# également muets en local, et ils sont pourtant RESTÉS hors de cette liste :
# ils font deux lectures chacun, invisibles seulement parce qu'une base locale
# répond en quelques millisecondes. Sur le VPS, avec la latence réseau, leur
# repli s'affichera. Les retirer sur la foi d'une mesure locale reviendrait à
# concevoir pour la machine de développement, alors que le ticket dit
# explicitement que le décalage se verra surtout une fois déployé.
# ---------------------------------------------------------------------------
declare -a SANS_ATTENTE=(
  # réauthentification : mesuré le 5 septembre 2026, le corps porte le
  # formulaire complet dès le `commit` de la réponse.
  "reauthentification"
)

# ---------------------------------------------------------------------------
# Les écrans dispensés du composant partagé, chacun avec sa raison.
#
# LA DISPENSE PORTE SUR LA FORME, jamais sur l'existence de l'état : ces écrans
# ont bien un état de chargement, il ne ressemble simplement pas à l'armature de
# lignes. Un écran n'entre pas ici parce qu'écrire son squelette est fastidieux,
# mais parce que l'armature partagée y serait FAUSSE.
#
# ELLE NE DIT RIEN DE LA FORME EMPLOYÉE, `loading.tsx` ou `<Suspense>` interne,
# et la nuance est structurante : le tableau de bord y figure alors qu'il N'A PAS
# de `loading.tsx` et ne doit jamais en recevoir, sa frontière couvrant les seize
# écrans du sous-arbre dont deux appellent `notFound()`.
# ---------------------------------------------------------------------------
declare -a FORMES_PROPRES=(
  # tableau de bord : rend quatre tuiles en grille, pas une liste. Une armature
  # de lignes empilées y ferait le saut de mise en page que le critère 3
  # interdit. Il passe par un `<Suspense>` interne et NON par un `loading.tsx`,
  # que C32 lui interdit : voir l'en-tête de `administration/page.tsx`.
  "."
  # nouveau produit : rend un formulaire, pas une liste. Il lit bien les
  # catégories, donc l'attente est réelle, mais l'armature de lignes annoncerait
  # un contenu qui n'arrive pas. Même raison que la réauthentification, sur un
  # écran dont l'attente, elle, n'est pas nulle.
  "produits/nouveau"
)

ecrans_examines=0
avec_loading=0
avec_suspense=0
sans_attente_comptes=0

while IFS= read -r page; do
  [ -n "$page" ] || continue

  # Seuls les écrans en `force-dynamic` sont concernés : une page statique ou
  # mise en cache n'attend pas le serveur à chaque navigation.
  #
  # LA RECHERCHE EXCLUT LES COMMENTAIRES. Plusieurs fichiers du dépôt NOMMENT
  # `force-dynamic` pour expliquer un choix voisin ; les compter rendrait le
  # contrôle rouge sur du code exemplaire, et la réaction serait de retirer
  # l'explication. Motif « contrôle satisfait par un commentaire », déjà en
  # fiche sur ce dépôt.
  declare_dynamique=$(grep -nE '^[[:space:]]*export const dynamic[[:space:]]*=' "$page" \
    | grep -F 'force-dynamic' || true)
  [ -n "$declare_dynamique" ] || continue

  ecrans_examines=$((ecrans_examines + 1))

  segment="$(dirname "$page")"
  relatif="${segment#"$ADMIN"/}"
  [ "$segment" = "$ADMIN" ] && relatif="."

  # Les écrans sans attente mesurable sortent ici : leur exiger un état de
  # chargement produirait du code mort, voir la liste en tête.
  sans_attente=0
  for muet in "${SANS_ATTENTE[@]}"; do
    [ "$relatif" = "$muet" ] && sans_attente=1
  done
  if [ "$sans_attente" -eq 1 ]; then
    sans_attente_comptes=$((sans_attente_comptes + 1))
    continue
  fi

  # Forme 1 : un `loading.tsx` dans le segment.
  if [ -f "$segment/loading.tsx" ]; then
    avec_loading=$((avec_loading + 1))
    continue
  fi

  # Forme 2 : un `<Suspense>` dans la page elle-même, hors commentaire.
  #
  # LE MOTIF EXIGE LE CHEVRON OUVRANT, `<Suspense`, et non le mot seul : le mot
  # « Suspense » apparaît dans les commentaires qui expliquent C32, et sur ces
  # deux écrans précisément. Chercher le mot nu rendrait le contrôle satisfait
  # par sa propre explication.
  suspense=$(grep -nE '<Suspense' "$page" \
    | grep -vE ':[[:space:]]*(//|\*|/\*)' || true)

  if [ -n "$suspense" ]; then
    avec_suspense=$((avec_suspense + 1))
    continue
  fi

  echo "ECHEC $relatif est en force-dynamic sans aucun état de chargement"
  echo "      chaque navigation attend le rendu serveur complet, requête en"
  echo "      base comprise, sans que rien ne bouge à l'écran : le geste semble"
  echo "      n'avoir pas été pris."
  echo "      Deux formes possibles, et le choix n'est pas libre :"
  echo "      - la page n'appelle pas notFound() : ajouter un loading.tsx dans"
  echo "        le segment, en s'appuyant sur ChargementAdministration"
  echo "      - la page appelle notFound() : C32 INTERDIT le loading.tsx, il"
  echo "        faut un <Suspense> DANS la page, garde d'existence au-dessus"
  ko=$((ko + 1))
done <<EOF
$(find "$ADMIN" -name "page.tsx" 2>/dev/null | sort || true)
EOF

echo "Écrans d'administration en force-dynamic examinés : $ecrans_examines"
echo "  dont $avec_loading avec loading.tsx, $avec_suspense avec <Suspense> interne,"
echo "  et $sans_attente_comptes sans attente mesurable"

# ---------------------------------------------------------------------------
# L'ANCRAGE SE PROUVE. Zéro écran examiné signifie que le contrôle ne regarde
# plus rien, et un contrôle muet qui rend « OK » est pire que son absence.
#
# LE SEUIL EST À DIX ET NON À UN. Le dépôt en portait quinze au moment de
# LS-188 : tomber à trois ou quatre signalerait un déplacement de dossier ou un
# changement de convention bien avant d'atteindre zéro. Un seuil à un ne verrait
# ce genre de dérive qu'au tout dernier écran.
# ---------------------------------------------------------------------------
if [ "$ecrans_examines" -lt 10 ]; then
  echo "ECHEC seulement $ecrans_examines écran(s) examiné(s), le dépôt en porte"
  echo "      une quinzaine : l'ancrage du contrôle est cassé (dossier déplacé,"
  echo "      ou la déclaration force-dynamic a changé de forme)."
  ko=$((ko + 1))
fi

# ---------------------------------------------------------------------------
# Second sens : les deux écrans à `notFound()` emploient bien la SECONDE forme.
#
# SANS CE SENS, LE CONTRÔLE MENTIRAIT PAR OMISSION sur le cas le plus délicat.
# Il resterait vert si ces deux écrans perdaient leur `<Suspense>` interne au
# profit d'un `loading.tsx` : la boucle ci-dessus accepte les deux formes sans
# distinction, et c'est `verifier-loading-et-404.sh` qui refuserait la seconde.
# Le vérifier ici aussi rend le message actionnable au bon endroit, en nommant
# la forme attendue plutôt que celle qui est interdite.
# ---------------------------------------------------------------------------
while IFS= read -r page; do
  [ -n "$page" ] || continue

  # LE MÊME FILTRE `force-dynamic` QUE LA PREMIÈRE BOUCLE, et son absence était
  # un défaut de ce script : sans lui, il réclamait un `<Suspense>` à
  # `echec-rendu`, la route de test de LS-191, qui n'est pas en `force-dynamic`,
  # ne lit aucune donnée et n'a donc rien à charger. Elle lève ou rend 404.
  #
  # EXEMPTER CETTE ROUTE NOMMÉMENT AURAIT ÉTÉ LE MAUVAIS GESTE. Le défaut ne
  # tenait pas à elle mais au périmètre de la boucle, et une exemption nominale
  # aurait laissé le même faux positif se reproduire sur la prochaine page sans
  # lecture. Motif « élargir la source plutôt qu'exempter », déjà en fiche.
  declare_dynamique=$(grep -nE '^[[:space:]]*export const dynamic[[:space:]]*=' "$page" \
    | grep -F 'force-dynamic' || true)
  [ -n "$declare_dynamique" ] || continue

  appelle_notfound=$(grep -nE '(^|[^a-zA-Z.])notFound\(\)' "$page" \
    | grep -vE ':[[:space:]]*(//|\*|/\*)' || true)
  [ -n "$appelle_notfound" ] || continue

  segment="$(dirname "$page")"
  relatif="${segment#"$ADMIN"/}"

  suspense=$(grep -nE '<Suspense' "$page" \
    | grep -vE ':[[:space:]]*(//|\*|/\*)' || true)

  if [ -z "$suspense" ]; then
    echo "ECHEC $relatif appelle notFound() sans <Suspense> interne"
    echo "      C32 lui interdit le loading.tsx, la seule forme qui lui reste"
    echo "      est une frontière DANS la page, garde d'existence au-dessus."
    ko=$((ko + 1))
  fi
done <<EOF
$(find "$ADMIN" -name "page.tsx" 2>/dev/null | sort || true)
EOF

# ---------------------------------------------------------------------------
# Troisième sens : le composant partagé existe, et les écrans ordinaires
# s'appuient dessus.
#
# POURQUOI LE VÉRIFIER. Sans lui, chaque `loading.tsx` réécrirait sa propre
# armature, et le douzième écran copierait celui qu'il a sous la main plutôt
# que la forme voulue. C'est le motif d'érosion que ce projet a déjà vu sur les
# liens Jira : une convention écrite et non vérifiée ne tient pas.
# ---------------------------------------------------------------------------
PARTAGE="$RACINE/src/components/chargement-administration.tsx"

if [ ! -f "$PARTAGE" ]; then
  echo "ECHEC le composant partagé a disparu : $PARTAGE"
  echo "      sans lui, chaque écran réécrit son armature et elles divergent."
  ko=$((ko + 1))
else
  # Chaque `loading.tsx` d'administration l'emploie, sauf les formes propres
  # documentées en tête de ce script.
  while IFS= read -r fichier; do
    [ -n "$fichier" ] || continue

    segment="$(dirname "$fichier")"
    relatif="${segment#"$ADMIN"/}"
    [ "$segment" = "$ADMIN" ] && relatif="."

    dispense=0
    for propre in "${FORMES_PROPRES[@]}"; do
      [ "$relatif" = "$propre" ] && dispense=1
    done
    [ "$dispense" -eq 1 ] && continue

    if ! grep -q 'ChargementAdministration' "$fichier"; then
      echo "ECHEC $relatif/loading.tsx n'emploie pas ChargementAdministration"
      echo "      et ne figure pas dans les formes propres documentées en tête"
      echo "      de ce script. Soit il reprend le composant partagé, soit sa"
      echo "      raison de s'en écarter s'écrit dans FORMES_PROPRES."
      ko=$((ko + 1))
    fi
  done <<EOF
$(find "$ADMIN" -name "loading.tsx" 2>/dev/null | sort || true)
EOF
fi

echo
if [ "$ko" -eq 0 ]; then
  echo "OK tout écran d'administration en force-dynamic a un état de chargement"
else
  echo "$ko problème(s) détecté(s)"
fi

exit "$ko"
