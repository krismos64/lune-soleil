#!/bin/bash
# Preuve par mutation de `verifier-mentions-retractation.sh`, LS-136, critère 6.
#
# LE CRITÈRE EXIGE UNE MUTATION PAR EMPLACEMENT, SÉPARÉMENT, et pas un test
# générique. La raison est mécanique : un contrôle qui chercherait sa mention
# n'importe où dans le dépôt resterait vert en retirant celle du tunnel, les
# conditions générales satisfaisant le motif à sa place. Motif « mutation
# satisfaite ailleurs », en fiche sur ce dépôt.
#
# CHAQUE MUTATION EXIGE QUE LE CONTRÔLE NOMME L'EMPLACEMENT FAUTIF. Un rouge
# global prouverait seulement qu'il sait échouer, pas qu'il a vu le bon fichier :
# motif « mutation vue par le mauvais test ».
#
# LA RESTAURATION PASSE PAR `git checkout`, jamais par une réécriture inverse :
# une substitution de retour peut rater sa cible après reformatage et laisser le
# dépôt muté.
#
# Usage : ./scripts/verifier-mentions-retractation-mutation.sh

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-mentions-retractation.sh"
ko=0

MUTABLES=(
  "src/app/(boutique)/commande/etapes-tunnel.tsx"
  "src/app/(boutique)/informations-legales/page.tsx"
  "src/app/(boutique)/compte/commandes/[id]/retractation/formulaire-retractation.tsx"
  "src/lib/mentions-retractation.ts"
)

restaurer() {
  git checkout -- "${MUTABLES[@]}" 2>/dev/null || true
}
trap restaurer EXIT

if ! git diff --quiet -- "${MUTABLES[@]}"; then
  echo "ECHEC des modifications non commitées portent sur les fichiers à muter."
  echo "      Les commiter ou les remiser avant de lancer cette preuve."
  exit 1
fi

if ! "$CONTROLE" >/dev/null 2>&1; then
  echo "ECHEC le contrôle est déjà rouge avant toute mutation."
  "$CONTROLE"
  exit 1
fi
echo "Point de départ : contrôle vert."
echo

# $1 libellé, $2 fichier muté, $3 motif attendu dans la sortie, $4 mutation
muter() {
  local libelle="$1" fichier="$2" motif="$3" commande="$4"

  eval "$commande"

  # LA MUTATION DOIT AVOIR MODIFIÉ LE FICHIER. Une substitution qui rate sa
  # cible laisse le contrôle vert, et ce script conclurait « non détecté »
  # alors que rien n'a été muté. Motif « cible de mutation déplacée ».
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
    echo "ECHEC [$libelle] rouge, mais le contrôle ne nomme pas « $motif »"
    printf '%s\n' "$sortie" | head -4
    ko=$((ko + 1))
  else
    echo "OK    [$libelle] rouge, et le contrôle nomme l'emplacement"
    printf '%s\n' "$sortie" | grep "$motif" | head -1 | sed 's/^/        /'
  fi

  restaurer
}

# ---------------------------------------------------------------------------
# Mutation 1, l'emplacement 1 : la mention disparaît du tunnel.
#
# C'EST LE DÉFAUT QUE LA STORY FERME. Au 5 septembre 2026, avant LS-136, le
# tunnel ne portait AUCUNE occurrence du mot « rétractation » : cette mutation
# reproduit exactement l'état d'avant.
# ---------------------------------------------------------------------------
muter "emplacement 1, tunnel" \
  "src/app/(boutique)/commande/etapes-tunnel.tsx" \
  "emplacement 1" \
  "perl -0pi -e 's/MENTION_TUNNEL/MENTION_ABSENTE/g' 'src/app/(boutique)/commande/etapes-tunnel.tsx'"

# ---------------------------------------------------------------------------
# Mutation 2, l'emplacement 2 : les frais de retour quittent les CGV.
#
# ELLE VISE LES FRAIS ET NON LE DROIT, parce que les deux notions se retirent
# indépendamment : un texte peut annoncer parfaitement le droit de rétractation
# en oubliant qui paie le renvoi, et c'est l'oubli le plus courant.
# ---------------------------------------------------------------------------
muter "emplacement 2, frais de retour dans les CGV" \
  "src/app/(boutique)/informations-legales/page.tsx" \
  "les frais de retour" \
  "perl -0pi -e 's/frais de retour/frais de renvoi éventuels/g' 'src/app/(boutique)/informations-legales/page.tsx'"

# ---------------------------------------------------------------------------
# Mutation 3, l'emplacement 3 : le formulaire type perd sa mention.
# ---------------------------------------------------------------------------
muter "emplacement 3, formulaire type" \
  "src/app/(boutique)/compte/commandes/[id]/retractation/formulaire-retractation.tsx" \
  "emplacement 3" \
  "perl -0pi -e 's/MENTION_FORMULAIRE/MENTION_RETIREE/g' 'src/app/(boutique)/compte/commandes/[id]/retractation/formulaire-retractation.tsx'"

# ---------------------------------------------------------------------------
# Mutation 4, le délai découplé du calcul.
#
# Annoncer un délai que le service n'applique pas est l'information incorrecte
# que l'article L221-20 sanctionne, et c'est l'affichage qui engage.
# ---------------------------------------------------------------------------
muter "délai découplé du calcul de LS-133" \
  "src/lib/mentions-retractation.ts" \
  "DUREE_RETRACTATION_JOURS" \
  "perl -0pi -e 's/export \{ DUREE_RETRACTATION_JOURS \} from \"\@\/lib\/retractation\";/export const DELAI_ANNONCE = 14;/' 'src/lib/mentions-retractation.ts'"

# ---------------------------------------------------------------------------
# Mutation 5, LE CONTRÔLE SATISFAIT PAR UN COMMENTAIRE.
#
# Le critère 7 de la story l'exige nommément : la mention est DÉPLACÉE dans un
# commentaire, donc le mot reste dans le fichier alors que l'appel a disparu.
#
# CE PIÈGE A ÉTÉ PAYÉ LA VEILLE sur `verifier-seo.sh`, où deux mutations sur
# quatre laissaient le contrôle vert parce que le mot cherché subsistait dans le
# commentaire qui l'expliquait. J'y avais même écrit qu'une clé ne s'écrit pas
# dans une phrase : elle s'y écrivait trois lignes plus haut.
# ---------------------------------------------------------------------------
muter "mention déplacée dans un commentaire" \
  "src/app/(boutique)/commande/etapes-tunnel.tsx" \
  "emplacement 1" \
  "perl -0pi -e 's|<p className=\{styles.texteLegal\}>\{MENTION_TUNNEL.droit\}</p>|{/* MENTION_TUNNEL.droit retiré */}|' 'src/app/(boutique)/commande/etapes-tunnel.tsx' && perl -0pi -e 's/\{MENTION_TUNNEL.fraisRetour\}\{\" \"\}/{\" \"}/' 'src/app/(boutique)/commande/etapes-tunnel.tsx'"

echo
if [ "$ko" -eq 0 ]; then
  echo "OK les cinq mutations sont détectées, et l'emplacement fautif est nommé"
else
  echo "$ko mutation(s) NON détectée(s) : le contrôle ne protège pas ce qu'il annonce"
fi

exit "$ko"
