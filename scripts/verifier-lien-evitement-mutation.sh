#!/bin/bash
# Prouve que `verifier-lien-evitement.sh` attrape les défauts qu'il annonce,
# LS-194. Un contrôle qui n'a jamais échoué sur son propre défaut n'est pas un
# contrôle : c'est une opinion verte.
#
# CHAQUE CAS MUTE UNE SEULE CHOSE et vérifie que le script ROUGIT, puis restaure.
# Une mutation qui laisse le contrôle vert désigne un trou, jamais un succès.
#
# Usage : ./scripts/verifier-lien-evitement-mutation.sh
SCRIPT_CIBLE="./scripts/verifier-lien-evitement.sh"

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

# LES FICHIERS MUTABLES SONT DÉCLARÉS, et la restauration passe par eux.
# `git checkout` est ATOMIQUE : un chemin non suivi ferait échouer la commande
# entière, laissant les autres mutations en place. Motif déjà en fiche.
MUTABLES=(
  "src/app/administration/layout.tsx"
  "src/app/administration/commandes/page.tsx"
  "src/app/administration/categories/page.tsx"
  "src/app/administration/stocks/page.tsx"
  "src/components/chargement-administration.tsx"
  "src/components/en-tete-boutique.tsx"
  "src/app/(boutique)/catalogue/error.tsx"
)

# LA RESTAURATION PART DE `HEAD`, JAMAIS DE L'INDEX. `git checkout -- <chemin>`
# restaure depuis l'index quand il porte le fichier : sur un arbre dont le
# travail n'est pas encore commite, il rend la version d'AVANT le travail et
# non celle d'avant la mutation. La difference a coute quatre fichiers le
# 6 septembre 2026, l'un des lancements de ce script ayant restaure vers `main`
# pendant que le commit etait en cours.
restaurer() {
  git checkout HEAD -- "${MUTABLES[@]}" 2>/dev/null
}

trap restaurer EXIT

# L'ARBRE DOIT ETRE PROPRE SUR LES FICHIERS MUTABLES, et le script refuse de
# tourner sinon. C'est la seconde moitie de la lecon ci-dessus : restaurer
# depuis `HEAD` rend deterministe CE QUI est restaure, mais ecraserait quand
# meme un travail non commite. Les deux ensemble ferment le trou.
sales=$(git status --porcelain -- "${MUTABLES[@]}")

if [ -n "$sales" ]; then
  echo "ECHEC des fichiers mutables portent des modifications non commitees :"
  printf '%s\n' "$sales" | sed 's/^/        /'
  echo
  echo "      Ce script MUTE puis RESTAURE depuis HEAD : tourner ici ecraserait"
  echo "      ce travail sans retour possible. Commiter d'abord, puis relancer."
  exit 1
fi

reussites=0
echecs=0
cas=0

# Joue une mutation, attend un ECHEC du contrôle, restaure.
#
# LE MESSAGE ATTENDU EST VÉRIFIÉ, pas seulement le code de sortie. Un script qui
# rougirait pour une autre raison, un ancrage cassé par exemple, passerait un
# test qui ne regarde que le code de sortie : il rougirait sans avoir vu le
# défaut. Motif « mutation vue par le mauvais test ».
jouer() {
  local intitule="$1" motif_attendu="$2"
  cas=$((cas + 1))

  local sortie
  sortie=$("$SCRIPT_CIBLE" 2>&1)
  local code=$?

  restaurer

  if [ "$code" -eq 0 ]; then
    echo "ECHEC cas $cas, $intitule"
    echo "      le contrôle est resté VERT sur cette mutation : c'est un trou."
    echecs=$((echecs + 1))
    return
  fi

  if ! printf '%s' "$sortie" | grep -qF "$motif_attendu"; then
    echo "ECHEC cas $cas, $intitule"
    echo "      le contrôle a rougi, mais PAS sur le défaut visé."
    echo "      attendu : $motif_attendu"
    echo "      obtenu  :"
    printf '%s\n' "$sortie" | sed 's/^/        /'
    echecs=$((echecs + 1))
    return
  fi

  echo "OK    cas $cas, $intitule"
  reussites=$((reussites + 1))
}

echo "Preuve par mutation de $SCRIPT_CIBLE"
echo

# ---------------------------------------------------------------------------
# Cas 1 : le lien disparaît du layout.
# C'est l'état exact d'avant LS-194, seize écrans sans raccourci clavier.
# ---------------------------------------------------------------------------
perl -0pi -e 's/href="#contenu"/href="\/administration"/' src/app/administration/layout.tsx
jouer "le layout ne pose plus de lien d'évitement" \
      "ne pose plus de lien d'évitement"

# ---------------------------------------------------------------------------
# Cas 2 : une page perd son ancre.
# Le lien reste, et pointe vers rien sur cet écran précis.
# ---------------------------------------------------------------------------
perl -0pi -e 's/<main id="contenu" tabIndex=\{-1\} className=\{styles\.page\}>/<main className={styles.page}>/' src/app/administration/commandes/page.tsx
jouer "un écran perd son ancre #contenu" \
      "ne porte pas id=\"contenu\""

# ---------------------------------------------------------------------------
# Cas 3 : l'ancre reste, le `tabIndex` part.
# LE PIÈGE CLASSIQUE : la page défile, le focus ne bouge pas, et le lien a
# l'apparence exacte d'un lien qui marche. Sans ce cas, le contrôle pourrait se
# satisfaire de la seule présence de l'`id`.
# ---------------------------------------------------------------------------
perl -0pi -e 's/<main id="contenu" tabIndex=\{-1\} className=\{styles\.page\}>/<main id="contenu" className={styles.page}>/' src/app/administration/categories/page.tsx
jouer "une ancre perd son tabIndex={-1}" \
      "porte l'ancre sans tabIndex={-1}"

# ---------------------------------------------------------------------------
# Cas 4 : le composant partagé perd l'ancre.
# Il rend le `main` de huit écrans pendant leur chargement. Sans ce cas, la
# délégation deviendrait un angle mort : le script compte ces écrans comme
# couverts sans que rien ne le vérifie.
# ---------------------------------------------------------------------------
perl -0pi -e 's/<main id="contenu" tabIndex=\{-1\} className=\{classePage\}>/<main className={classePage}>/' src/components/chargement-administration.tsx
jouer "le composant de chargement partagé perd l'ancre" \
      "composant de chargement partagé ne porte plus l'ancre"

# ---------------------------------------------------------------------------
# Cas 5 : le lien remonte AVANT le test de rôle.
# Il s'afficherait alors sur l'écran de connexion, vers une ancre absente.
# C'est le seul cas qui porte sur l'ORDRE et non sur une présence.
# ---------------------------------------------------------------------------
perl -0pi -e 's/(  const estAdministratrice = )/  \/* mutation *\/ const _lien = <a href="#contenu">Aller au contenu<\/a>;\n$1/' src/app/administration/layout.tsx
jouer "le lien est posé avant le test de rôle" \
      "posé AVANT le test de rôle"

# ---------------------------------------------------------------------------
# Cas 6 : l'ancre migre du `<main>` vers un enfant.
#
# LE CAS QUI SE PRODUIRA VRAIMENT, lors d'une refonte d'écran : on déplace un
# attribut sans voir qu'il portait le lien d'évitement. La page défile bien
# jusqu'à l'ancre, mais le focus atterrit sur un `span` ou un titre au lieu du
# début du contenu.
#
# LES CINQ CAS PRÉCÉDENTS NE LE VOIENT PAS, tous RETIRANT l'ancre là où
# celui-ci la DÉPLACE. La première version du contrôle cherchait dans le
# fichier entier et restait verte sur cette forme, mesuré par la revue
# d'interface du 6 septembre 2026 : « chaque écran porte sa cible focalisable »
# sur un écran où le lien menait à un titre.
# ---------------------------------------------------------------------------
perl -0pi -e 's/<main id="contenu" tabIndex=\{-1\} className=\{styles\.page\}>/<main className={styles.page}>\n      <span id="contenu" tabIndex={-1} \/>/' src/app/administration/stocks/page.tsx
jouer "l'ancre migre du <main> vers un enfant" \
      "ne porte pas id=\"contenu\" SUR SON <main>"

# ---------------------------------------------------------------------------
# Cas 7 : la boutique perd son lien d'évitement.
#
# CE CAS ET LE SUIVANT EXISTENT PARCE QUE LE CONTRÔLE A ÉTÉ AVEUGLE À TOUT UN
# CÔTÉ DU SITE. Jusqu'à LS-196 il s'ancrait sur `src/app/administration` seul,
# et il annonçait pourtant « chaque écran porte sa cible focalisable ». Trois
# écrans publics rendaient un `<main>` nu pendant ce temps.
#
# LES SIX CAS PRÉCÉDENTS RESTERAIENT TOUS VERTS si l'extension à la boutique
# était retirée : ils mutent tous des fichiers d'administration. Sans ces deux
# cas, la moitié neuve du contrôle ne serait éprouvée par rien.
# ---------------------------------------------------------------------------
perl -0pi -e 's/href="#contenu"/href="#ailleurs"/' src/components/en-tete-boutique.tsx
jouer "la boutique perd son lien d'évitement" \
      "l'en-tête de la boutique ne pose plus de lien"

# ---------------------------------------------------------------------------
# Cas 8 : un écran de boutique perd son ancre.
#
# LA CIBLE EST UN `error.tsx`, ET C'EST DÉLIBÉRÉ : c'est l'un des trois fichiers
# qui portaient réellement le défaut avant LS-196. Un état d'erreur remplace la
# page sous un layout qui reste monté, donc sous une en-tête qui reste à
# traverser, et il est plus facile à oublier qu'une `page.tsx` parce qu'aucun
# parcours nominal ne le montre.
#
# LE MESSAGE ATTENDU PORTE LE CÔTÉ, `[boutique]`. Sans cette moitié, le cas
# resterait vert sur un contrôle qui aurait trouvé le même défaut ailleurs :
# c'est le motif « mutation vue par le mauvais test », en fiche ici.
# ---------------------------------------------------------------------------
perl -0pi -e 's/<main id="contenu" tabIndex=\{-1\} className=\{styles\.page\}>/<main className={styles.page}>/' "src/app/(boutique)/catalogue/error.tsx"
jouer "un écran de boutique perd son ancre" \
      "[boutique] catalogue/error.tsx ne porte pas id"

echo
echo "Cas joués : $cas, réussis : $reussites, en échec : $echecs"

if [ "$echecs" -ne 0 ]; then
  echo
  echo "$echecs cas n'ont pas fait rougir le contrôle sur le défaut visé."
  exit 1
fi

echo
echo "OK $reussites mutations sur $cas font rougir le contrôle, chacune par son propre message"
