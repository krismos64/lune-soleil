#!/bin/bash
# Vérifie que toute annonce de chargement du dépôt se termine par un point de
# suspension unique, LS-195, règle C35 de `frontend-design.md`.
#
# CE QU'IL GARDE, ET POURQUOI CE N'EST PAS QU'UNE VIRGULE. Une attente en cours
# se dit avec des points de suspension ; le point final ferme la phrase, donc
# l'action, et annonce un chargement terminé alors qu'il commence. Un lecteur
# d'écran marque la pause différemment sur les deux formes.
#
# LE DÉFAUT QU'IL FERME EST UN DÉFAUT DE RECOPIE INVERSÉE. Le catalogue public
# a porté le point final de LS-104 à LS-195, seul des quinze annonces du dépôt,
# alors qu'il était la RÉFÉRENCE citée par le composant partagé. Les quatorze
# copies ont corrigé la forme sans que l'original le soit : c'est l'original qui
# a divergé de ses copies, ce qu'aucune relecture de diff ne montre.
#
# IL EST GÉNÉRIQUE, jamais une liste de fichiers écrite à la main. Il part des
# annonces réellement présentes dans `src/`, une liste manuscrite étant une
# opinion sur ce qui existe, qui se périme au premier écran ajouté. Motif
# « contrôle générique et complétude », déjà en fiche sur ce dépôt.
#
# TROIS POINTS VÉRIFIÉS, ET LES DEUX DERNIERS SE RATENT FACILEMENT :
#
#   1. l'annonce se termine par des points de suspension
#   2. le caractère est `…`, U+2026, et non trois points successifs `...`
#   3. tout état de chargement du dépôt PORTE une annonce
#
# Le deuxième passe la relecture visuelle, les deux formes se ressemblant à
# l'écran. Elles ne s'entendent pas pareil et ne se cherchent pas pareil.
#
# LE TROISIÈME EST CE QUI DONNE UN DÉNOMINATEUR, et sa première version ne
# l'avait pas. Partir des textes trouvés vérifie la forme de ce qui existe et ne
# dit rien de ce qui manque : mesuré par la revue d'interface du 6 septembre
# 2026, reformuler une annonce en « Les stocks se chargent. » ou la supprimer
# faisait simplement passer le compte de 15 à 14, en silence et en vert.
#
# Le contrôle croise donc les textes avec l'INVENTAIRE des états de chargement,
# comme `verifier-lien-evitement.sh` part de `find` et non des ancres trouvées.
# Motif « numérateur et dénominateur appariés », en fiche sur ce dépôt.
#
# Usage : ./scripts/verifier-ponctuation-chargement.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$RACINE/src"
ko=0

[ -d "$SRC" ] || { echo "ECHEC dossier src introuvable : $SRC"; exit 1; }

# ---------------------------------------------------------------------------
# Les annonces, relevées sur ce qui existe.
#
# DEUX FORMES COEXISTENT dans le dépôt, et les deux comptent :
#
#   annonce="Chargement des comptes…"     propriété passée au composant partagé
#   Chargement des indicateurs…           texte JSX rendu directement
#
# LE MOTIF S'ANCRE SUR « Chargement » EN DÉBUT DE TEXTE, ce qui est la forme
# qu'impose déjà le composant partagé : « Chargement des commandes » plutôt que
# « Chargement de Commandes », le français ne permettant pas de dériver
# l'annonce du titre. Les lignes de COMMENTAIRE qui citent ces textes sont
# exclues, sinon le contrôle s'accuserait lui-même sur de la documentation.
# Motif « contrôle satisfait par un commentaire », rencontré à l'envers ici.
# ---------------------------------------------------------------------------
annonces=$(grep -rn "Chargement " "$SRC" --include="*.tsx" \
  | grep -v '^\([^:]*\):\([0-9]*\):\s*\*' \
  | grep -v '^\([^:]*\):\([0-9]*\):\s*//' \
  | grep -v '^\([^:]*\):\([0-9]*\):\s*/\*' \
  | sed "s|$RACINE/||")

if [ -z "$annonces" ]; then
  echo "ECHEC aucune annonce de chargement trouvée dans src/"
  echo "      l'ancrage du contrôle est cassé : soit les états de chargement"
  echo "      ont disparu, soit leur formulation a changé. Le second cas"
  echo "      demande de rouvrir ce motif, le premier est grave."
  exit 1
fi

nb=0

while IFS= read -r ligne; do
  [ -n "$ligne" ] || continue
  nb=$((nb + 1))

  # Le texte de l'annonce, sans son emplacement ni son indentation.
  texte=$(printf '%s' "$ligne" | sed 's|^[^:]*:[0-9]*:||')
  ou=$(printf '%s' "$ligne" | sed 's|\(^[^:]*:[0-9]*\):.*|\1|')

  # TROIS POINTS SUCCESSIFS, la forme qui passe la relecture visuelle.
  #
  # LE MOTIF NE S'ANCRE PAS SUR LA FIN DE LIGNE, et la première version le
  # faisait : `*"..."` exige que le TEXTE finisse par les trois points, ce qui
  # est vrai du JSX rendu mais faux d'une propriété, qui finit par `..."` avec
  # sa guillemet. Mesuré à l'écriture de la preuve par mutation : le contrôle
  # rougissait bien, mais par la branche de la terminaison, en annonçant un
  # défaut qui n'était pas celui-là. Un message faux vaut un contrôle faux, la
  # personne qui le lit corrigeant la mauvaise chose.
  case "$texte" in
    *"...")   trois_points=1 ;;
    *'..."'*) trois_points=1 ;;
    *)        trois_points=0 ;;
  esac

  if [ "$trois_points" -eq 1 ]; then
    echo "ECHEC $ou emploie trois points au lieu du caractère …"
    echo "      les deux se ressemblent à l'écran, ne s'entendent pas pareil"
    echo "      et ne se cherchent pas pareil. C35."
    ko=$((ko + 1))
    continue
  fi

  # LA TERMINAISON. Le texte peut finir par une guillemet fermante, `…"`, quand
  # l'annonce est une propriété, ou par le point de suspension seul quand elle
  # est du JSX rendu.
  case "$texte" in
    *"…"* ) ;;
    *)
      echo "ECHEC $ou ne se termine pas par un point de suspension"
      echo "      une attente EN COURS se dit avec des points de suspension :"
      echo "      un point final ferme la phrase, donc l'action, et annonce un"
      echo "      chargement terminé alors qu'il commence. C35."
      ko=$((ko + 1))
      ;;
  esac
done <<EOF
$annonces
EOF

# ---------------------------------------------------------------------------
# Sens 2 : tout état de chargement PORTE une annonce.
#
# C'EST LE DÉNOMINATEUR, et le sens 1 seul ne l'a pas. Il vérifie la forme des
# annonces qu'il TROUVE : une annonce supprimée ou reformulée fait baisser le
# compte sans rien faire rougir.
#
# L'INVENTAIRE PART DES FICHIERS, `loading.tsx` et `error.tsx` exclus, plus les
# appels au composant partagé qui portent une annonce dans un `<Suspense>`
# interne. C'est la même mécanique que `verifier-lien-evitement.sh`, et pour la
# même raison : une liste de textes est une opinion sur ce qui existe.
#
# UN ÉTAT DE CHARGEMENT PEUT DÉLÉGUER SON ANNONCE, en passant la propriété au
# composant partagé, ou la rendre lui-même en JSX. Les deux formes portent le
# mot « Chargement », d'où la recherche dans le fichier entier : ce qui est
# vérifié ici est la PRÉSENCE, la forme l'étant par le sens 1.
#
# L'ANCRAGE NE PART PLUS DE `loading.tsx`, ET C'EST LS-139 QUI L'A CHANGÉ. Les
# dix fichiers de segment ont été retirés : sous un `loading.tsx`, la frontière
# couvre la page ENTIÈRE, donc une base injoignable rendait 200 avec l'armature
# figée au lieu du 500 que `error.tsx` doit servir. Les états vivent désormais
# en `fallback` d'un `<Suspense>` INTERNE, dans la page elle-même.
#
# CE CONTRÔLE A ROUGI À CE MOMENT-LÀ, et c'est sa garde contre lui-même qui a
# fonctionné : il annonçait « aucun loading.tsx trouvé, l'ancrage est cassé »
# plutôt que de rendre un OK muet sur zéro fichier examiné. Un contrôle dont la
# cible disparaît doit le dire.
# ---------------------------------------------------------------------------
#
# L'INVENTAIRE PORTE SUR LES FICHIERS QUI RENDENT L'ANNONCE, jamais sur ceux
# qui référencent le composant : une page qui pose `<Suspense fallback={...}>`
# délègue l'annonce à l'armature, et l'exiger d'elle la déclarerait fautive
# alors qu'elle est exemplaire. Première écriture de cet élargissement, et sa
# mesure l'a montrée sur le catalogue.
#
# LE MOTIF N'EMPLOIE AUCUN INTERVALLE DE CARACTERES ACCENTUES, et sa premiere
# ecriture le faisait : `[a-zà-ÿ]` depend de la LOCALE, donc il trouvait seize
# fichiers sur ce poste et AUCUN sur la CI, ou la locale est différente. Le
# contrôle passait en local et rougissait en intégration, sur son propre
# ancrage. Motif « grep BSD et alternance », déjà en fiche sous une autre forme.
#
# `Chargement ` suivi d'un espace suffit : c'est la forme de toutes les annonces
# du dépôt, « Chargement des pièces… », et elle ne contient aucun accent avant
# l'espace.
etats=$(grep -rlE 'annonce=|Chargement ' "$SRC/app" "$SRC/components" 2>/dev/null \
  | grep -vE '/(error|not-found|global-error)\.tsx$' \
  | sed "s|$RACINE/||" | sort -u)

if [ -z "$etats" ]; then
  echo "ECHEC aucun état de chargement trouvé dans src/"
  echo "      l'ancrage de ce sens est cassé : soit les états de chargement ont"
  echo "      disparu, ce qui serait grave, soit ils ont changé de forme."
  echo "      Depuis LS-139 ils vivent en fallback d'un <Suspense> interne,"
  echo "      plus dans un loading.tsx de segment."
  exit 1
fi

nb_etats=0

while IFS= read -r etat; do
  [ -n "$etat" ] || continue
  nb_etats=$((nb_etats + 1))

  if ! grep -q "Chargement " "$RACINE/$etat"; then
    echo "ECHEC $etat ne porte aucune annonce de chargement"
    echo "      l'armature s'affiche alors sans qu'un lecteur d'écran apprenne"
    echo "      que la page travaille : six cartes vides n'annoncent rien."
    echo "      C35 et la section « États obligatoires »."
    ko=$((ko + 1))
  fi
done <<EOF
$etats
EOF

echo "Annonces de chargement examinées : $nb"
echo "États de chargement inventoriés   : $nb_etats"

# SECONDE GARDE, sur le NOMBRE D'ANNONCES RETENUES et non sur la recherche.
#
# Elle ne double pas celle du haut, et la nuance vient d'une mutation de
# LS-139 : celle du haut sort quand `grep` ne trouve RIEN, celle-ci attrape le
# cas où il trouve des lignes dont la boucle ne retient aucune annonce, un
# filtre trop strict par exemple. Le contrôle rendrait alors « OK » en n'ayant
# examiné aucune annonce.
if [ "$nb" -eq 0 ]; then
  echo
  echo "ECHEC aucune annonce de chargement examinée"
  echo "      des lignes ont été trouvées, mais la boucle n'en a retenu aucune :"
  echo "      le filtre est devenu trop strict. Un contrôle qui n'examine rien"
  echo "      ne prouve rien."
  ko=$((ko + 1))
fi

echo
if [ "$ko" -eq 0 ]; then
  echo "OK toute annonce de chargement se termine par un point de suspension, C35"
else
  echo "$ko problème(s) détecté(s)"
fi

exit "$ko"
