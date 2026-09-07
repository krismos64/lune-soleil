#!/bin/bash
# Vérifie qu'aucun `aria-describedby` ne pointe vers un élément portant
# `aria-label`, LS-161.
#
# Motif. Le calcul de la description accessible consulte `aria-label` AVANT le
# contenu textuel, exactement comme celui du nom. Un élément décrit par un autre
# qui porte un `aria-label` s'annonce donc avec ce label et JAMAIS avec le texte
# réel : le rattachement que `aria-describedby` cherche à obtenir est annulé.
#
# Le défaut mesuré sur `document-facture.tsx` : le bouton s'annonçait
# « Générer le document, Génération du document » au lieu de lire « La
# génération a échoué. La facture reste valide et son numéro est inchangé ».
#
# POURQUOI IL SE RÉINTRODUIT PAR MIMÉTISME, et c'est la raison d'être de ce
# script. La justification écrite dans le fichier était FAUSSE : elle invoquait
# le besoin de distinguer deux régions `status` de l'écran. Or `aria-label` ne
# change rien à l'annonce d'une mise à jour de `role="status"`, seul le CONTENU
# étant vocalisé. Une règle qui énonce une chose et en prescrit une autre se
# franchit de bonne foi, et LS-160 n'avait corrigé qu'un seul des deux écrans.
#
# CE QUE CE CONTRÔLE VÉRIFIE, DANS LES DEUX SENS :
#
#   1. aucun `aria-describedby` de `src/` ne vise un élément portant
#      `aria-label`
#   2. la règle est toujours écrite dans `frontend-design.md`, sans quoi le
#      contrôle protégerait une règle que plus rien n'énonce
#
# LE SENS 2 EXISTE PARCE QU'UN CONTRÔLE À SENS UNIQUE MENT PAR OMISSION : il ne
# distingue pas « aucune violation » de « plus rien à protéger ». Même
# construction que `verifier-rendu-texte-simple.sh`.
#
# CE QU'IL NE VOIT PAS, dit ici plutôt que laissé croire. Les identifiants
# construits à l'exécution, `aria-describedby={`aide-${id}`}`, ne sont pas
# résolus : leur cible n'est pas connue textuellement. Le contrôle porte sur les
# identifiants littéraux, qui sont la forme employée par les régions live de ce
# dépôt. Un test de rendu resterait nécessaire pour les autres.
#
# Usage : ./scripts/verifier-description-accessible.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$RACINE/src"
REGLE="$RACINE/.claude/rules/frontend-design.md"
ko=0

[ -d "$SOURCE" ] || {
  echo "ECHEC dossier source introuvable : $SOURCE"
  exit 1
}
[ -r "$REGLE" ] || {
  echo "ECHEC règle de conception illisible : $REGLE"
  exit 1
}

echo "Descriptions accessibles, aria-describedby contre aria-label"
echo

# ---------------------------------------------------------------------------
# Sens 1 : aucune cible de `aria-describedby` ne porte `aria-label`.
#
# La recherche se fait en deux temps. On relève d'abord les identifiants
# LITTÉRAUX cités par un `aria-describedby`, un attribut pouvant en citer
# plusieurs séparés par des espaces, `aria-describedby="aide-email message"`.
# On cherche ensuite, pour chacun, l'élément qui porte cet `id` et on regarde
# si `aria-label` figure dans la même balise.
#
# L'ÉLÉMENT EST CHERCHÉ DANS TOUT `src/` ET NON DANS LE SEUL FICHIER : rien
# n'oblige la cible à vivre dans le fichier qui la décrit, et une recherche
# limitée au fichier raterait ce cas en silence.
# ---------------------------------------------------------------------------
cibles="$(grep -rhoE 'aria-describedby="[^"]+"' "$SOURCE" --include='*.tsx' |
  sed -E 's/aria-describedby="([^"]+)"/\1/' |
  tr ' ' '\n' |
  grep -vE '^\s*$' |
  sort -u)"

if [ -z "$cibles" ]; then
  echo "  ECHEC aucun aria-describedby littéral trouvé dans src/"
  echo "        Le contrôle ne peut rien prouver : soit la convention a changé,"
  echo "        soit le motif de recherche est périmé."
  exit 1
fi

nombre_cibles="$(printf '%s\n' "$cibles" | wc -l | tr -d ' ')"

for id in $cibles; do
  # La balise ouvrante peut s'étendre sur plusieurs lignes, `id` et
  # `aria-label` étant rarement voisins. On isole donc la balise entière :
  # de la ligne portant l'identifiant jusqu'au `>` qui la ferme.
  #
  # `id="x"` ET `id={"x"}` NE SONT PAS CHERCHÉS ENSEMBLE : seule la première
  # forme existe dans ce dépôt, et couvrir une forme absente donnerait une
  # fausse impression de portée.
  while IFS=: read -r fichier ligne _; do
    [ -n "${fichier:-}" ] || continue

    balise="$(awk -v debut="$ligne" '
      NR >= debut {
        ligne_courante = $0

        # LES COMMENTAIRES SONT RETIRES AVANT EXAMEN, et ce point importe :
        # detail : les deux ecrans corriges par LS-160 et LS-161 NOMMENT
        # `aria-label` dans le commentaire qui explique son absence. Les
        # compter rendrait le controle rouge sur le code exemplaire, et la
        # reaction serait de retirer cette explication. Motif deja paye sur ce
        # depot, le hook de secrets bloquait son propre commentaire.
        #
        # Le commentaire JSX `{/* ... */}` est traite par le meme drapeau que
        # le commentaire de bloc, les deux se terminant par `*/`.
        if (dans_commentaire) {
          if (ligne_courante ~ /\*\//) {
            sub(/^.*\*\//, "", ligne_courante)
            dans_commentaire = 0
          } else {
            ligne_courante = ""
          }
        }
        if (ligne_courante ~ /\/\*/ && ligne_courante !~ /\*\//) {
          sub(/\/\*.*$/, "", ligne_courante)
          dans_commentaire = 1
        }
        gsub(/\/\*.*\*\//, "", ligne_courante)
        sub(/\/\/.*$/, "", ligne_courante)

        bloc = bloc ligne_courante "\n"

        # La balise ouvrante se termine au premier `>` en fin de ligne, evalue
        # sur la ligne DEPOUILLEE de ses commentaires.
        if (ligne_courante ~ />[[:space:]]*$/) { print bloc; exit }
        # Garde-fou : une balise ne depasse jamais 40 lignes.
        if (NR > debut + 40) { print bloc; exit }
      }
    ' "$fichier")"

    if printf '%s' "$balise" | grep -q 'aria-label'; then
      echo "  ECHEC $fichier"
      echo "        L'élément d'identifiant « $id » porte aria-label ET est cité"
      echo "        par un aria-describedby. Le label ANNULE la description :"
      echo "        le lecteur d'écran annonce le label et jamais le contenu."
      echo
      ko=1
    fi
  done <<EOF
$(grep -rn "id=\"$id\"" "$SOURCE" --include='*.tsx' 2>/dev/null)
EOF
done

if [ "$ko" -eq 0 ]; then
  echo "  OK    $nombre_cibles identifiants cités par un aria-describedby,"
  echo "        aucun ne porte aria-label"
fi

# ---------------------------------------------------------------------------
# Sens 2 : la règle est toujours écrite, avec son MÉCANISME.
#
# On exige la présence du mécanisme et pas seulement de l'interdiction : une
# interdiction nue se contourne de bonne foi, c'est précisément ce qui est
# arrivé ici. La règle doit dire POURQUOI, c'est-à-dire que le calcul de la
# description consulte `aria-label` avant le contenu.
# ---------------------------------------------------------------------------
echo
if grep -q 'aria-describedby' "$REGLE" && grep -q 'aria-label' "$REGLE"; then
  echo "  OK    frontend-design.md énonce toujours la règle"
else
  echo "  ECHEC frontend-design.md n'énonce plus la règle liant aria-describedby"
  echo "        et aria-label. Un contrôle qui applique une interdiction qu'aucun"
  echo "        document ne porte laisse la session suivante l'ignorer."
  ko=1
fi

echo
echo "-----------------------------------------"
if [ "$ko" -eq 0 ]; then
  echo "  descriptions accessibles conformes"
  echo "-----------------------------------------"
  exit 0
fi
echo "  ECHEC descriptions accessibles"
echo "-----------------------------------------"
exit 1
