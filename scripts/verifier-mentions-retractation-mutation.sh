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
  "src/app/(boutique)/retractation/[jeton]/formulaire-jeton.tsx"
  "src/lib/mentions-retractation.ts"
  "src/lib/retractation.ts"
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
muter "emplacement 1, tunnel entier" \
  "src/app/(boutique)/commande/etapes-tunnel.tsx" \
  "emplacement 1, le droit lui-même" \
  "perl -0pi -e 's/MENTION_TUNNEL/MENTION_ABSENTE/g' 'src/app/(boutique)/commande/etapes-tunnel.tsx'"

# ---------------------------------------------------------------------------
# Mutation 1bis, LE DROIT SEUL DISPARAÎT, les frais restent.
#
# TROUVÉE EN REVUE CRITIQUE, et elle laissait le contrôle VERT : il cherchait
# `MENTION_TUNNEL` sans distinguer ses deux propriétés, et `fraisRetour`
# satisfaisait le motif à lui seul. L'écran annonçait alors qui paie le retour
# sans jamais dire qu'un droit de rétractation existe.
#
# Les deux notions se retirent indépendamment, elles se vérifient donc
# indépendamment. Motif « nom nu hors ancrage », deuxième occurrence dans ce
# même contrôle : je l'avais fermé pour l'import, pas pour le second usage.
# ---------------------------------------------------------------------------
muter "emplacement 1, le droit seul retiré" \
  "src/app/(boutique)/commande/etapes-tunnel.tsx" \
  "emplacement 1, le droit lui-même" \
  "perl -0pi -e 's/MENTION_TUNNEL\\.droit/TEXTE_RETIRE/g' 'src/app/(boutique)/commande/etapes-tunnel.tsx'"

# ---------------------------------------------------------------------------
# Mutation 1ter, les frais seuls disparaissent du tunnel.
#
# Le versant symétrique : sans cette mention, les frais de retour reviennent au
# vendeur, article L221-23, et la charge de la preuve pèse sur lui.
# ---------------------------------------------------------------------------
muter "emplacement 1, les frais seuls retirés" \
  "src/app/(boutique)/commande/etapes-tunnel.tsx" \
  "emplacement 1, les frais de retour" \
  "perl -0pi -e 's/MENTION_TUNNEL\\.fraisRetour/TEXTE_RETIRE/g' 'src/app/(boutique)/commande/etapes-tunnel.tsx'"

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
muter "emplacement 3, espace client" \
  "src/app/(boutique)/compte/commandes/[id]/retractation/formulaire-retractation.tsx" \
  "emplacement 3, formulaire type, espace client" \
  "perl -0pi -e 's/MENTION_FORMULAIRE/MENTION_RETIREE/g' 'src/app/(boutique)/compte/commandes/[id]/retractation/formulaire-retractation.tsx'"

# ---------------------------------------------------------------------------
# Mutation 3bis, LE CHEMIN SANS COMPTE.
#
# CE FICHIER MANQUAIT AU CONTRÔLE jusqu'à la revue critique : il portait sa
# propre copie du texte, identique par coïncidence et libre de diverger. C'est
# le chemin le PLUS exposé, `legal.md` : l'email de confirmation est le seul par
# lequel un acheteur sans compte reçoit son droit.
# ---------------------------------------------------------------------------
muter "emplacement 3, lien signé sans compte" \
  "src/app/(boutique)/retractation/[jeton]/formulaire-jeton.tsx" \
  "emplacement 3, formulaire type, lien signé sans compte" \
  "perl -0pi -e 's/MENTION_FORMULAIRE/MENTION_RETIREE/g' 'src/app/(boutique)/retractation/[jeton]/formulaire-jeton.tsx'"

# ---------------------------------------------------------------------------
# Mutation 4, le délai découplé du calcul.
#
# Annoncer un délai que le service n'applique pas est l'information incorrecte
# que l'article L221-20 sanctionne, et c'est l'affichage qui engage.
# ---------------------------------------------------------------------------
# LA CIBLE A CHANGÉ EN COURS DE STORY, et le garde-fou du script l'a dit plutôt
# que de conclure « non détecté » : la première version du module RÉEXPORTAIT la
# constante sans jamais la lire, ce que les deux revues ont relevé. Elle est
# désormais importée et consommée par `delaiEnLettres()`.
#
# LA MUTATION VISE DONC L'IMPORT, seul point par lequel le couplage passe.
muter "délai découplé du calcul de LS-133" \
  "src/lib/mentions-retractation.ts" \
  "DUREE_RETRACTATION_JOURS" \
  "perl -0pi -e 's/^import \{ DUREE_RETRACTATION_JOURS \} from \"\@\/lib\/retractation\";\$/const DUREE_RETRACTATION_JOURS = 14;/m' 'src/lib/mentions-retractation.ts'"

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

# ---------------------------------------------------------------------------
# Mutation 5, LE DÉLAI CHANGE ET LES TREIZE TEXTES NE SUIVENT PAS.
#
# TROUVÉE EN REVUE CRITIQUE. Le délai est écrit en dur dans treize textes
# visibles, hors source unique : accueil, fiche produit, aide, conditions
# générales, écrans d'expiration, détail de commande, formulaires et deux
# modèles d'email.
#
# La garde par table de nombres ne couvrait que `MENTION_TUNNEL.droit` : porter
# la constante à 30 faisait rougir ce seul test, et les treize autres textes
# auraient continué d'annoncer quatorze jours. Un délai annoncé plus COURT que
# le délai réel éteint un droit trop tôt, article L221-20, douze mois.
#
# LE CONTRÔLE NE RÉÉCRIT RIEN, il refuse le silence et nomme les fichiers.
# ---------------------------------------------------------------------------
muter "délai porté à 30 jours sans reprendre les textes" \
  "src/lib/retractation.ts" \
  "le délai de rétractation vaut 30 jours" \
  "perl -0pi -e 's/DUREE_RETRACTATION_JOURS = 14;/DUREE_RETRACTATION_JOURS = 30;/' 'src/lib/retractation.ts'"

echo
if [ "$ko" -eq 0 ]; then
  echo "OK les neuf mutations sont détectées, et la cause est nommée"
else
  echo "$ko mutation(s) NON détectée(s) : le contrôle ne protège pas ce qu'il annonce"
fi

exit "$ko"
