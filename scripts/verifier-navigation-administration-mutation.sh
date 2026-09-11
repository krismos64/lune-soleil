#!/bin/bash
# Preuve par mutation de `verifier-navigation-administration.sh`, LS-162.
#
# Motif. Ce contrôle compare deux listes et les trouve cohérentes : son vert est
# indistinguable de celui d'un script qui compare deux listes vides, ou qui lit
# la mauvaise partie du fichier.
#
# LE CAS 2 EST LE PLUS IMPORTANT. Il rejoue le défaut d'origine de LS-162, une
# story qui ajoute un écran sans le relier. C'est le seul cas qui prouve que le
# contrôle protège l'AVENIR et pas seulement l'état du jour.
#
# Usage : ./scripts/verifier-navigation-administration-mutation.sh
# Aucun prérequis, ni Docker ni base.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-navigation-administration.sh"
NAVIGATION="src/components/navigation-administration.tsx"
LAYOUT="src/app/administration/layout.tsx"
SPEC_NAVIGATION="tests/e2e/navigation-administration.spec.ts"
ECRAN_TEMOIN="src/app/administration/remises/page.tsx"

# TOUT FICHIER MUTÉ ENTRE ICI, sans quoi il n'est jamais restauré : les cas 5 à
# 7 mutent le TEST et le CONTRÔLE lui-même, que la liste d'origine ignorait.
# Motif « mutation non restaurée », déjà en fiche sur ce dépôt, où un fichier
# muté hors de la liste était resté modifié sur le disque.
MUTABLES=("$NAVIGATION" "$LAYOUT" "$SPEC_NAVIGATION" "$CONTROLE")

detectes=0
total=0

# LA RESTAURATION NE PASSE PAS PAR GIT : `git checkout` est atomique et échoue
# en entier sur un chemin non suivi, ce qui laisserait les fichiers suivis non
# restaurés eux non plus. Les deux fichiers d'ici sont neufs dans cette story.
SAUVEGARDE="$(mktemp -d)"

sauvegarder() {
  local fichier index=0
  for fichier in "${MUTABLES[@]}"; do
    [ -r "$fichier" ] || { echo "ECHEC fichier illisible : $fichier"; exit 1; }
    cp "$fichier" "$SAUVEGARDE/$index"
    index=$((index + 1))
  done
}

restaurer() {
  local fichier index=0
  for fichier in "${MUTABLES[@]}"; do
    [ -r "$SAUVEGARDE/$index" ] && cp "$SAUVEGARDE/$index" "$fichier"
    index=$((index + 1))
  done
  # L'écran témoin du cas 2 est créé dans un dossier neuf : le dossier part
  # avec lui, sans quoi un répertoire vide resterait dans `src/app`.
  rm -rf "$(dirname "$ECRAN_TEMOIN")"
}

nettoyer() {
  restaurer
  rm -rf "$SAUVEGARDE"
}

sauvegarder
trap nettoyer EXIT

# Appelé SANS pipe vers grep : le pipe renverrait le code de grep et non celui
# du contrôle, ce qui avait fait passer sept mutations pour « non détectées » à
# tort sur ce projet.
attendre_echec() {
  local libelle="$1"
  total=$((total + 1))

  if "$CONTROLE" >/dev/null 2>&1; then
    echo "NON DETECTE  $libelle"
  else
    echo "detecte      $libelle"
    detectes=$((detectes + 1))
  fi

  restaurer
}

# Vérifie qu'une substitution a bien mordu. Une cible déplacée par un
# reformatage laisserait le fichier intact, et le cas testerait alors le dépôt
# sain en accusant le contrôle.
muter() {
  local fichier="$1" expression="$2"
  local avant
  avant=$(cksum <"$fichier")

  perl -0pi -e "$expression" "$fichier"

  if [ "$(cksum <"$fichier")" = "$avant" ]; then
    echo "ECHEC la mutation n'a modifié aucun caractère de $fichier"
    echo "      l'expression ne correspond plus au code : corriger le script."
    exit 1
  fi
}

echo "État de référence, avant toute mutation"
if ! "$CONTROLE" >/dev/null 2>&1; then
  echo "  ECHEC le contrôle n'est pas vert AVANT mutation."
  exit 1
fi
echo "  OK    le contrôle est vert, les mutations peuvent commencer"
echo

# ---------------------------------------------------------------------------
# Cas 1 : la barre renvoie vers un écran qui n'existe pas.
#
# Le geste réel : écrire la rubrique en même temps que la story qui livrera
# l'écran, et livrer la barre avant l'écran. La barre promet alors une fonction
# et rend un 404.
# ---------------------------------------------------------------------------
#
# LA CIBLE A ÉTÉ DÉPLACÉE PAR LE DÉPÔT, corrigée le 11 septembre 2026, LS-140.
# Elle visait `{ chemin: "/administration/stocks", libelle: "Stocks" },` sur une
# seule ligne : la rubrique a depuis été renommée « Stocks et marchés » et son
# entrée étalée sur quatre lignes pour accueillir un compteur. La substitution ne
# mordait plus, et le garde-fou de `muter` sortait en ECHEC dès le cas 1.
#
# CE SCRIPT NE PROUVAIT DONC PLUS RIEN, et le contrôle qu'il garde n'était plus
# éprouvé. Personne ne l'a vu : il ne tourne ni en CI ni dans les huit contrôles
# de CONTRIBUTING. Motif « cible de mutation déplacée », déjà en fiche.
#
# LA NOUVELLE CIBLE EST UN CHEMIN ET NON UN LIBELLÉ, délibérément : un chemin
# change quand la route change, ce que le sens 1 verrait de toute façon, alors
# qu'un libellé change au premier ajustement de vocabulaire.
muter "$NAVIGATION" 's{chemin: "/administration/statistiques"}{chemin: "/administration/remises-saisonnieres"}'
attendre_echec "rubrique pointant vers un écran non livré"

# ---------------------------------------------------------------------------
# Cas 2 : une story ajoute un écran sans le mettre dans la barre.
#
# C'EST LE DÉFAUT D'ORIGINE DE LS-162, rejoué à l'identique. Chaque story a
# ajouté un écran sans le relier, et rien ne le signalait. Ce cas est la seule
# preuve que le contrôle protège les stories À VENIR : sans lui, il ne
# vérifierait que la cohérence du jour.
# ---------------------------------------------------------------------------
mkdir -p "$(dirname "$ECRAN_TEMOIN")"
cat > "$ECRAN_TEMOIN" <<'FIN'
export default function PageRemises() {
  return <main>Remises</main>;
}
FIN
attendre_echec "écran neuf ajouté sans entrer dans la barre"

# ---------------------------------------------------------------------------
# Cas 3 : la barre n'est plus posée par le layout.
#
# SANS LE TROISIÈME SENS, CE CAS PASSERAIT. Les deux listes resteraient
# parfaitement cohérentes pendant que l'administration redeviendrait un
# ensemble d'écrans sans aucun lien, c'est-à-dire l'état d'avant la story.
# ---------------------------------------------------------------------------
#
# SECONDE CIBLE PÉRIMÉE DE CE SCRIPT, corrigée le 11 septembre 2026 avec celle
# du cas 1. Elle visait `<NavigationAdministration />`, forme auto-fermante sans
# props : le composant prend depuis `comptages`, `nom` et `deconnexion`, étalés
# sur quatre lignes. La substitution ne mordait plus.
#
# LE NOUVEL ANCRAGE PORTE SUR LE NOM SEUL, jamais sur la liste de props : la
# première se périmerait au prochain prop ajouté, exactement comme celle-ci.
muter "$LAYOUT" 's{<NavigationAdministration\b}{<NavigationAbsente}'
attendre_echec "barre retirée du layout, les listes restant cohérentes"

# ---------------------------------------------------------------------------
# Cas 4 : l'écran courant n'est plus annoncé.
#
# L'information passerait par la seule couleur, ce que `frontend-design.md`
# interdit. Le rendu resterait visuellement identique pour qui voit l'écran, et
# muet pour un lecteur d'écran.
# ---------------------------------------------------------------------------
muter "$NAVIGATION" 's/aria-current=\{courante \? "page" : undefined\}/data-courante={courante}/'
attendre_echec "aria-current retiré, l'information ne passe plus que par la couleur"

# ---------------------------------------------------------------------------
# Cas 5 : une rubrique de la barre n'est cliquée par aucun test, LS-140.
#
# C'EST LE DÉFAUT RÉEL TROUVÉ LE 11 SEPTEMBRE 2026, rejoué. Cinq rubriques sur
# quatorze manquaient au tableau `RUBRIQUES` du test : Avis, Factures et avoirs,
# Clients, Statistiques et Vos passkeys. Les quatre premiers sens restaient
# verts, ne lisant que le composant.
#
# LA MUTATION PORTE SUR LE TEST ET NON SUR LE COMPOSANT, seule façon de
# reproduire l'écart : muter la barre ferait rougir les sens 1 ou 2, et le cas
# ne dirait rien du sens 5.
# ---------------------------------------------------------------------------
muter "$SPEC_NAVIGATION" 's{\{ libelle: "Avis", titre: "Avis" \},}{}'
attendre_echec "rubrique de la barre exercée par aucun test"

# ---------------------------------------------------------------------------
# Cas 6 : le test navigue vers une rubrique qui n'est plus dans la barre.
#
# LE SENS INVERSE DU PRÉCÉDENT, et il vaut son cas propre : sans lui, le sens 5
# pourrait n'être écrit que dans une direction, et un test cherchant un lien
# retiré échouerait par expiration de trente secondes plutôt que par diagnostic.
# ---------------------------------------------------------------------------
muter "$SPEC_NAVIGATION" 's{\{ libelle: "Avis", titre: "Avis" \},}{{ libelle: "Remises", titre: "Remises" },}'
attendre_echec "test naviguant vers une rubrique absente de la barre"

# ---------------------------------------------------------------------------
# Cas 7 : l'ancrage du sens 5 absorbe RUBRIQUES_A_VENIR.
#
# CE CAS GARDE LE CONTRÔLE CONTRE LUI-MÊME, et il rejoue une erreur commise en
# écrivant le sens 5 : `RUBRIQUES` est un PRÉFIXE de `RUBRIQUES_A_VENIR`, donc
# un ancrage trop large moissonne les deux tableaux et accuse « Paramètres »,
# rubrique délibérément non livrée. Le contrôle rougissait alors sur un dépôt
# sain, ce qui est pire qu'une absence de contrôle : la correction évidente
# aurait été d'ajouter au test une rubrique qui ne doit pas y être.
#
# LA MUTATION ÉLARGIT L'ANCRAGE et attend un ÉCHEC : le contrôle doit accuser
# « Paramètres » dès que son motif cesse d'exclure le suffixe.
# ---------------------------------------------------------------------------
#
# LA CIBLE EST LA LIGNE DE CODE ET NON LE MOTIF NU. `RUBRIQUES[^_A-Z]` apparaît
# DEUX fois dans le contrôle, une fois dans le commentaire qui l'explique et une
# fois dans le code : une substitution globale muterait les deux, et celle du
# commentaire ne change rien. La cible porte donc le `awk` qui l'entoure.
# Motif « contrôle satisfait par un commentaire », pris dans l'autre sens.
muter_ancrage_sens5() {
  local avant
  avant=$(cksum <"$CONTROLE")

  # `RUBRIQUES[^_A-Z]` devient `RUBRIQUES[^Z]`, qui n'exclut plus le suffixe :
  # la forme reste valide, la portée s'élargit. Seule la ligne qui porte `awk`
  # est visée, le commentaire voisin citant le même motif sans effet.
  perl -pi -e 's/RUBRIQUES\[\^_A-Z\]/RUBRIQUES[^Z]/ if /awk/' "$CONTROLE"

  if [ "$(cksum <"$CONTROLE")" = "$avant" ]; then
    echo "ECHEC la mutation du cas 7 n'a modifié aucun caractère de $CONTROLE"
    echo "      l'ancrage du sens 5 a changé de forme : corriger ce script."
    exit 1
  fi
}

muter_ancrage_sens5
attendre_echec "ancrage du sens 5 élargi à RUBRIQUES_A_VENIR"

echo
echo "-----------------------------------------"
if [ "$detectes" -eq "$total" ]; then
  echo "  $total mutations, $total détectées"
else
  echo "  $total mutations, $((total - detectes)) NON détectées"
fi
echo "-----------------------------------------"

[ "$detectes" -eq "$total" ]
