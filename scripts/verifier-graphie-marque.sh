#!/usr/bin/env bash
# Garde de la graphie du nom commercial, LS-193.
#
# ----------------------------------------------------------------------------
# CE QUE CE CONTRÔLE EMPÊCHE, ET IL A DÉJÀ COÛTÉ.
#
# Le logo écrit « Lune-soleil », trait d'union et minuscule à soleil, ce que
# l'ADR-022 confirme. Le code a porté « Lune & Soleil » jusqu'au 8 septembre
# 2026, dans DOUZE fichiers écrivant le nom en dur, dont plusieurs qui
# importaient déjà `NOM_BOUTIQUE` pour autre chose.
#
# L'ÉCART S'EST VU DANS UNE SEULE IMAGE. Le générateur d'images de marque
# composait le titre « Lune & Soleil » à côté du médaillon qui dit
# « Lune-soleil » : les deux graphies coexistaient dans l'image que les réseaux
# sociaux affichent.
#
# POURQUOI CE N'EST PAS COSMÉTIQUE. Les moteurs, classiques comme génératifs,
# recoupent le texte des pages, le JSON-LD `Organization`, le JSON-LD `Brand` et
# le logo pour établir l'entité commerciale. Deux graphies concurrentes
# affaiblissent ce recoupement, et le référencement est priorité maximale sur ce
# projet.
# ----------------------------------------------------------------------------
#
# DEUX SENS, ET LE SECOND EST LE PLUS UTILE À LONG TERME :
#
#   1. l'ancienne graphie ne revient nulle part
#   2. le nom ne s'écrit pas en dur, il se dérive de `NOM_BOUTIQUE`
#
# Le premier seul laisserait recopier « Lune-soleil » dans vingt fichiers, et le
# prochain changement de graphie rouvrirait le même écart.
#
# CE QU'IL NE VÉRIFIE PAS : le HTML réellement servi. C'est
# `tests/e2e/referencement.spec.ts` qui le mesure, un contrôle textuel ne
# remplaçant pas un test d'exécution.
#
# Usage : ./scripts/verifier-graphie-marque.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1
ko=0

# ---------------------------------------------------------------------------
# LA GRAPHIE DE RÉFÉRENCE EST LUE DANS LE CODE, jamais recopiée ici : un
# contrôle qui porte sa propre copie du nom devient faux au premier changement,
# et il le devient EN SILENCE puisque c'est lui qui juge.
# ---------------------------------------------------------------------------
SOURCE="src/lib/seo.ts"

if [ ! -f "$SOURCE" ]; then
  echo "ÉCHEC : $SOURCE est introuvable, le contrôle ne peut pas conclure."
  exit 1
fi

NOM=$(grep -oE 'export const NOM_BOUTIQUE = "[^"]+"' "$SOURCE" \
  | sed 's/.*= "//; s/"$//')

if [ -z "$NOM" ]; then
  echo "ÉCHEC : NOM_BOUTIQUE n'a pas pu être lue dans $SOURCE."
  echo "La constante a-t-elle été renommée ou sa forme modifiée ?"
  exit 1
fi

# ---------------------------------------------------------------------------
# SENS 1, L'ANCIENNE GRAPHIE NE REVIENT PAS.
#
# `docs/journal/` EST EXCLU, et c'est délibéré : le journal RACONTE ce qui s'est
# passé, donc il cite forcément l'ancienne graphie. Le corriger réécrirait
# l'histoire, ce que `CLAUDE.md` interdit par ailleurs sur les documents publiés.
#
# `src/generated/` est exclu comme partout, il est engendré.
# ---------------------------------------------------------------------------
ANCIENNE='Lune & Soleil'

anciennes=$(grep -rn "$ANCIENNE" src/ tests/ scripts/ public/ 2>/dev/null \
  | grep -v '^src/generated/' \
  | grep -v 'verifier-graphie-marque.sh' \
  || true)

# ---------------------------------------------------------------------------
# UNE CITATION EN COMMENTAIRE EST LÉGITIME, et il en existe plusieurs : les
# fichiers qui EXPLIQUENT le changement doivent pouvoir nommer l'ancienne
# graphie, sans quoi le motif du défaut devient intransmissible.
#
# LE FILTRE RECONNAÎT LE COMMENTAIRE ET NON LE FICHIER, ce qui évite une liste
# d'exemptions à tenir à jour. Trois formes suffisent ici, `*` pour un bloc
# JSDoc continué, `//` et `#`, et la ligne doit COMMENCER par l'une d'elles :
# du code suivi d'un commentaire reste refusé.
# ---------------------------------------------------------------------------
anciennes=$(echo "$anciennes" | grep -vE ':[[:space:]]*(\*|//|#)' || true)

if [ -n "$anciennes" ]; then
  echo "ÉCHEC : l'ancienne graphie « $ANCIENNE » est revenue."
  echo
  echo "$anciennes"
  echo
  echo "Le logo écrit « $NOM », ADR-022 et arbitrage du 5 septembre 2026."
  echo "Deux graphies concurrentes affaiblissent le recoupement d'entité que"
  echo "les moteurs font entre le texte, le JSON-LD et le logo, LS-193."
  ko=1
fi

# ---------------------------------------------------------------------------
# SENS 2, LE NOM NE S'ÉCRIT PAS EN DUR.
#
# `NOM_BOUTIQUE` reste la seule source, critère 1 du ticket. Ce sens est le plus
# utile des deux : sans lui, le nom se recopierait dans vingt fichiers et le
# prochain changement rouvrirait exactement le même écart.
#
# QUATRE EXEMPTIONS, CHACUNE NOMMÉE ET JUSTIFIÉE :
#
#   - `src/lib/seo.ts`, qui PORTE la constante
#   - `scripts/engendrer-images-marque.mjs`, module autonome lancé hors du
#     bundle Next.js : résoudre l'alias `@/` y demanderait une chaîne de build
#     pour une seule chaîne de caractères, et c'est ce contrôle qui ferme
#     l'écart à la place
#   - les tests, qui doivent FIGER la valeur attendue : un test qui dérive la
#     constante qu'il vérifie ne teste rien, motif « valeurs qui coïncident »
#     déjà en fiche sur ce dépôt
#   - les deux scripts de MUTATION, `verifier-seo-mutation.sh` et celui de ce
#     contrôle : une mutation INJECTE la valeur exacte qu'elle fabrique, et la
#     dériver la rendrait toujours vraie, donc sans pouvoir de détection
# ---------------------------------------------------------------------------
EXEMPTS='^src/lib/seo\.ts:|^scripts/engendrer-images-marque\.mjs:|^tests/|^scripts/verifier-graphie-marque(-mutation)?\.sh:|^scripts/verifier-seo-mutation\.sh:'

en_dur=$(grep -rn "$NOM" src/ scripts/ 2>/dev/null \
  | grep -v '^src/generated/' \
  | grep -vE "$EXEMPTS" \
  || true)

# Une citation en COMMENTAIRE est légitime : elle explique, elle ne sert pas de
# valeur. Le motif retire les lignes dont le contenu commence par un marqueur de
# commentaire, jamais celles qui portent du code.
en_dur=$(echo "$en_dur" | grep -vE ':[[:space:]]*(\*|//|/\*|#|<!--)' || true)

if [ -n "$en_dur" ]; then
  echo "ÉCHEC : le nom « $NOM » est écrit en dur hors de sa source."
  echo
  echo "$en_dur"
  echo
  echo "NOM_BOUTIQUE de src/lib/seo.ts est la seule source du nom commercial,"
  echo "critère 1 de LS-193. Douze fichiers l'écrivaient en dur avant cette"
  echo "story, dont plusieurs qui l'importaient déjà : c'est ce qui a laissé"
  echo "deux graphies coexister pendant des semaines."
  ko=1
fi

# ---------------------------------------------------------------------------
# LE CONTRÔLE DOIT AVOIR TROUVÉ DES USAGES.
#
# Zéro usage de `NOM_BOUTIQUE` signifierait que la constante n'est plus lue par
# personne, donc que le nom est revenu en dur sous une forme que les motifs
# ci-dessus ne reconnaissent pas. Motif « contrôle satisfait par l'absence »,
# déjà rencontré sur ce dépôt.
# ---------------------------------------------------------------------------
usages=$(grep -rl 'NOM_BOUTIQUE' src/ 2>/dev/null | grep -v '^src/generated/' | wc -l | tr -d ' ')

if [ "$usages" -lt 5 ]; then
  echo "ÉCHEC : seulement $usages fichiers lisent NOM_BOUTIQUE."
  echo "Le nom est-il revenu en dur sous une autre forme ?"
  ko=1
fi

if [ "$ko" -eq 0 ]; then
  echo "OK : « $NOM » partout, dérivée de NOM_BOUTIQUE dans $usages fichiers,"
  echo "     et aucune trace de l'ancienne graphie."
fi

exit "$ko"
