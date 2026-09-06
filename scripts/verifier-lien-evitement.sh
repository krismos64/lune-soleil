#!/bin/bash
# Vérifie que le contenu de chaque écran d'administration est atteignable par le
# lien d'évitement, LS-194, critère 6. WCAG 2.4.1, niveau A.
#
# POURQUOI UN CONTRÔLE TEXTUEL ALORS QUE LA SUITE DE BOUT EN BOUT TESTE DÉJÀ LE
# FOCUS. Le test e2e exerce UN écran, `/administration/commandes`, et il le fait
# très bien : il prouve que le focus se déplace vraiment, ce qu'aucun texte ne
# peut voir. Il ne dit rien des quinze autres, ni surtout du dix-septième que
# personne n'a encore écrit.
#
# C'EST EXACTEMENT LE DÉFAUT QUE LS-194 FERME, sous sa forme reproductible. Le
# lien a manqué pendant seize écrans parce que chaque story ajoutait le sien sans
# rien pour signaler l'oubli. Un test sur un écran ne changerait pas cela : il
# resterait vert le jour où un écran neuf ouvre un `main` nu.
#
# CE QU'IL VÉRIFIE, DANS LES DEUX SENS.
#
#   1. le layout d'administration pose bien le lien
#      -> sinon toutes les ancres du dépôt ne servent de cible à rien, ce qui
#         était l'état d'avant cette story
#   2. tout écran rendu SOUS ce layout avec la barre porte l'ancre `#contenu`
#      avec son `tabIndex={-1}`
#      -> sinon le lien mène nulle part sur cet écran précis
#
# LE SENS 1 SEUL SERAIT UN DEMI-CONTRÔLE, et le sens 2 seul aussi : seize ancres
# sans lien, c'est le défaut de LS-191 ; un lien sans ancre, c'est un raccourci
# qui ne raccourcit rien. Les deux moitiés se périment séparément.
#
# `tabIndex={-1}` EST VÉRIFIÉ AVEC L'ANCRE, jamais séparément. Une cible sans lui
# fait défiler la page en laissant le focus où il était : le lien paraît marcher
# et ne marche pas. C'est le piège classique, rencontré en LS-85 puis en LS-122.
#
# Usage : ./scripts/verifier-lien-evitement.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN="$RACINE/src/app/administration"
LAYOUT="$ADMIN/layout.tsx"
ko=0

[ -d "$ADMIN" ] || { echo "ECHEC dossier d'administration introuvable : $ADMIN"; exit 1; }
[ -r "$LAYOUT" ] || { echo "ECHEC layout d'administration illisible : $LAYOUT"; exit 1; }

# ---------------------------------------------------------------------------
# Les fichiers délibérément sans ancre, chacun avec sa raison.
#
# CETTE LISTE EST LA SEULE PARTIE MANUSCRITE, et y ajouter une ligne demande
# d'écrire pourquoi un écran n'a pas besoin d'être atteignable au clavier. C'est
# précisément la décision qu'on veut rendre consciente.
#
#   connexion/page.tsx           rendue HORS session au rôle : le layout sort par
#                                son retour anticipé, ni barre ni lien. Il n'y a
#                                donc rien à contourner, et une ancre y serait
#                                une cible sans lien.
#   reauthentification/page.tsx  même chose, on y arrive sans session fraîche
#   echec-rendu/page.tsx         lève à dessein, LS-191 : elle ne rend jamais de
#                                `main`, l'ancre n'aurait aucun support
# ---------------------------------------------------------------------------
EXCLUSIONS="
connexion/page.tsx
reauthentification/page.tsx
echec-rendu/page.tsx
"

est_exclu() {
  printf '%s\n' "$EXCLUSIONS" | grep -qxF "$1"
}

# ---------------------------------------------------------------------------
# Sens 1 : le layout pose le lien, et il le pose SOUS le test de rôle.
#
# L'ANCRAGE PORTE SUR LE `href`, pas sur le libellé. Un libellé se traduit ou se
# reformule ; la cible du lien est ce qui doit rester.
# ---------------------------------------------------------------------------
if ! grep -q 'href="#contenu"' "$LAYOUT"; then
  echo "ECHEC le layout d'administration ne pose plus de lien d'évitement"
  echo "      les seize écrans redeviennent alors une traversée de onze"
  echo "      rubriques au clavier avant le contenu, WCAG 2.4.1 niveau A."
  ko=$((ko + 1))
fi

# LE LIEN VIT APRÈS LE RETOUR ANTICIPÉ, et l'ordre des lignes le dit. Posé
# au-dessus, il s'afficherait sur l'écran de connexion en pointant vers une
# cible que cette page ne porte pas : un lien d'évitement sans cible occupe la
# première tabulation et ne mène nulle part, ce qui est pire que son absence.
ligne_retour=$(grep -n 'if (!estAdministratrice)' "$LAYOUT" | head -1 | cut -d: -f1)
ligne_lien=$(grep -n 'href="#contenu"' "$LAYOUT" | head -1 | cut -d: -f1)

if [ -z "$ligne_retour" ]; then
  echo "ECHEC le retour anticipé hors rôle a disparu du layout"
  echo "      l'ancrage de ce contrôle est cassé : soit le test de rôle a été"
  echo "      renommé, soit il a été retiré, et le second serait grave."
  ko=$((ko + 1))
elif [ -n "$ligne_lien" ] && [ "$ligne_lien" -lt "$ligne_retour" ]; then
  echo "ECHEC le lien d'évitement est posé AVANT le test de rôle"
  echo "      il s'afficherait alors sur l'écran de connexion, où aucune ancre"
  echo "      #contenu n'existe : première tabulation vers nulle part."
  ko=$((ko + 1))
fi

# ---------------------------------------------------------------------------
# Sens 2 : tout écran rendu sous la barre porte l'ancre focalisable.
#
# C'EST LE SENS QUI ATTRAPE LE DÉFAUT D'ORIGINE. Une story future ajoutera un
# écran d'administration, et ce contrôle échouera tant qu'elle ne lui aura pas
# donné sa cible, ou ne l'aura pas exclu en écrivant pourquoi.
#
# LES `error.tsx` ET `loading.tsx` COMPTENT AUTANT QUE LES `page.tsx`. Ils
# remplacent la page sous un layout qui reste monté, donc sous une barre qui
# reste à traverser. L'état de chargement est même le moment où le lien sert le
# plus : il suit immédiatement une navigation.
# ---------------------------------------------------------------------------
ecrans=$(find "$ADMIN" \( -name "page.tsx" -o -name "error.tsx" -o -name "loading.tsx" \) 2>/dev/null \
  | sed "s|$ADMIN/||" | sort)

if [ -z "$ecrans" ]; then
  echo "ECHEC aucun écran d'administration trouvé"
  echo "      l'ancrage du contrôle est cassé : le dossier a été déplacé."
  exit 1
fi

# LE COMPOSANT PARTAGÉ REND LE `main` DE DIX ÉCRANS en état de chargement. Un
# `loading.tsx` qui le délègue n'écrit donc pas l'ancre lui-même, et l'exiger
# dans son fichier serait faux. C'est le composant qui doit la porter, vérifié
# une fois ci-dessous.
PARTAGE="$RACINE/src/components/chargement-administration.tsx"

if [ ! -r "$PARTAGE" ]; then
  echo "ECHEC composant de chargement partagé illisible : $PARTAGE"
  ko=$((ko + 1))
elif ! grep -q 'id="contenu" tabIndex={-1}' "$PARTAGE"; then
  echo "ECHEC le composant de chargement partagé ne porte plus l'ancre"
  echo "      il rend le <main> de dix écrans pendant leur chargement, soit"
  echo "      exactement le moment qui suit une navigation, celui où le lien"
  echo "      d'évitement sert le plus."
  ko=$((ko + 1))
fi

nb_examines=0
nb_delegues=0

while IFS= read -r ecran; do
  [ -n "$ecran" ] || continue
  est_exclu "$ecran" && continue

  fichier="$ADMIN/$ecran"
  nb_examines=$((nb_examines + 1))

  # L'écran délègue son `main` au composant partagé : l'ancre y est vérifiée.
  if grep -q 'ChargementAdministration' "$fichier" && ! grep -q '<main' "$fichier"; then
    nb_delegues=$((nb_delegues + 1))
    continue
  fi

  if ! grep -q '<main' "$fichier"; then
    echo "ECHEC $ecran ne rend aucun <main>"
    echo "      le lien d'évitement n'a alors pas de cible sur cet écran, et"
    echo "      la page n'a pas de repère principal pour un lecteur d'écran."
    ko=$((ko + 1))
    continue
  fi

  # L'ANCRE ET SON `tabIndex` SE VÉRIFIENT ENSEMBLE. Les deux peuvent vivre sur
  # des lignes différentes d'un `<main>` multiligne, d'où la recherche dans le
  # fichier plutôt que sur une seule ligne.
  if ! grep -q 'id="contenu"' "$fichier"; then
    echo "ECHEC $ecran ne porte pas id=\"contenu\""
    echo "      le lien d'évitement du layout pointe vers une ancre absente :"
    echo "      il occupe la première tabulation et ne mène nulle part."
    ko=$((ko + 1))
    continue
  fi

  if ! grep -q 'tabIndex={-1}' "$fichier"; then
    echo "ECHEC $ecran porte l'ancre sans tabIndex={-1}"
    echo "      la page défilerait jusqu'au contenu en laissant le focus au"
    echo "      menu : la tabulation suivante repartirait de la barre, ce que"
    echo "      le lien existe précisément pour éviter."
    ko=$((ko + 1))
  fi
done <<EOF
$ecrans
EOF

echo "Écrans d'administration examinés : $nb_examines"
echo "Dont délégués au composant partagé : $nb_delegues"

echo
if [ "$ko" -eq 0 ]; then
  echo "OK le lien d'évitement est posé, et chaque écran porte sa cible focalisable"
else
  echo "$ko problème(s) détecté(s)"
fi

exit "$ko"
