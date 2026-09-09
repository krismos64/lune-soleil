#!/usr/bin/env bash
#
# Prouve par mutation que `verifier-statut-base-morte.sh` detecte vraiment ce
# qu'il pretend detecter. LS-211, ADR-039.
#
# IL TRAVAILLE SUR DES COPIES, dans un bac temporaire, et jamais sur le depot :
# les scripts de mutation de ce projet restaurent par `git checkout` et ont deja
# efface du travail non commite, deux fois.
#
# CHAQUE MUTATION VISE UNE FORME REELLEMENT PRESENTE, jamais celle qui serait la
# plus commode a ecrire. Ce depot a paye trois fois la lecon le 9 septembre
# 2026 : un prefixe qui laisse la cible atteignable, un motif qui rate un chemin
# a parentheses, et une substitution sans effet.
#
# Usage : ./scripts/verifier-statut-base-morte-mutation.sh

set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROLE="$RACINE/scripts/verifier-statut-base-morte.sh"

BAC=$(mktemp -d)
trap 'rm -rf "$BAC"' EXIT

ECHECS=0
CAS=0

# Le controle lit ses fichiers par des chemins relatifs a SA racine. On fabrique
# donc une fausse racine avec la meme arborescence.
FAUSSE="$BAC/depot"
mkdir -p "$FAUSSE/scripts" "$FAUSSE/src/app/(boutique)/catalogue"
cp "$CONTROLE" "$FAUSSE/scripts/"
CONTROLE_COPIE="$FAUSSE/scripts/$(basename "$CONTROLE")"

CONFIG_REEL="$RACINE/next.config.ts"
CATALOGUE_REEL="$RACINE/src/app/(boutique)/catalogue/page.tsx"
CONFIG="$FAUSSE/next.config.ts"
CATALOGUE="$FAUSSE/src/app/(boutique)/catalogue/page.tsx"

restaurer() {
  cp "$CONFIG_REEL" "$CONFIG"
  cp "$CATALOGUE_REEL" "$CATALOGUE"
}
restaurer

# UNE MUTATION QUI NE MODIFIE RIEN NE PROUVE RIEN, et c'est la fausse preuve la
# plus couteuse : le controle reste vert, et on en conclut qu'il est aveugle
# alors qu'il n'a rien eu a examiner.
mutation_effective() {
  if diff -q "$CONFIG_REEL" "$CONFIG" >/dev/null 2>&1 \
    && diff -q "$CATALOGUE_REEL" "$CATALOGUE" >/dev/null 2>&1; then
    return 1
  fi
  return 0
}

# attendre <description> <code attendu> [motif attendu]
attendre() {
  local DESC="$1" ATTENDU="$2" MOTIF="${3:-}"
  CAS=$((CAS + 1))

  if [ "$DESC" != "depot intact accepte" ] && ! mutation_effective; then
    echo "  ECHEC $DESC : la mutation n'a modifie aucun fichier, elle ne prouve rien"
    ECHECS=$((ECHECS + 1))
    restaurer
    return
  fi

  local SORTIE OBTENU
  SORTIE=$(cd "$FAUSSE" && bash "$CONTROLE_COPIE" 2>&1)
  OBTENU=$?

  if [ "$OBTENU" -ne "$ATTENDU" ]; then
    echo "  ECHEC $DESC : code $OBTENU, attendu $ATTENDU"
    printf '%s\n' "$SORTIE" | sed 's/^/        | /'
    ECHECS=$((ECHECS + 1))
  elif [ -n "$MOTIF" ] && ! printf '%s' "$SORTIE" | grep -q "$MOTIF"; then
    # LE CODE DE SORTIE NE SUFFIT PAS : un controle peut rougir pour une raison
    # qui n'est pas celle qu'on croit eprouver.
    echo "  ECHEC $DESC : code correct mais le motif '$MOTIF' est absent"
    ECHECS=$((ECHECS + 1))
  else
    echo "  OK   $DESC"
  fi

  restaurer
}

echo "Mutations de verifier-statut-base-morte.sh"
echo

# Le temoin. Sans lui, des echecs prouveraient que le controle est casse, pas
# qu'il detecte.
attendre "depot intact accepte" 0 "aucun ecart"

# Mutation 1 : le reglage disparait, cas d'une refactorisation qui fait le
# menage dans la configuration.
perl -0pi -e 's/^\s*htmlLimitedBots:.*\n//m' "$CONFIG"
attendre "htmlLimitedBots retire" 1 "htmlLimitedBots absent"

# Mutation 2 : la PORTEE est retrecie. Le nom du reglage reste dans le fichier,
# donc un controle qui chercherait seulement `htmlLimitedBots` resterait vert
# alors que le defaut est rouvert pour les navigateurs.
perl -0pi -e 's{^(\s*)htmlLimitedBots:\s*/\.\*/,}{$1htmlLimitedBots: /Twitterbot/,}m' "$CONFIG"
attendre "portee retrecie a un seul robot" 1 "sa portee n'est pas"

# Mutation 3 : le renvoi vers l'ADR disparait, le reglage parait gratuit.
perl -0pi -e 's/ADR-039/ADR-000/g' "$CONFIG"
attendre "renvoi vers ADR-039 retire" 1 "ne cite pas ADR-039"

# Mutation 4 : la mise en garde du catalogue disparait.
perl -0pi -e 's/ne pas reessayer/voir plus haut/gi; s/ne pas réessayer/voir plus haut/gi' "$CATALOGUE"
perl -0pi -e 's/annulé/retiré/g; s/annule/retire/g' "$CATALOGUE"
attendre "mise en garde du catalogue retiree" 1 "mise en garde"

# Mutation 5 : LE DEFAUT LUI-MEME REVIENT, un catch dans generateMetadata.
#
# C'est LA mutation qui compte : le commentaire de la mutation 4 peut rester
# intact pendant que le code reintroduit ce qu'il decrit, motif « controle
# satisfait par un commentaire », en fiche.
#
# ECRITE EN awk ET NON EN perl, apres un echec instructif : le delimiteur `s{}{}`
# de Perl entre en conflit avec les accolades du code injecte, et la substitution
# ne s'applique pas. Le garde-fou `mutation_effective` l'a refusee plutot que de
# la compter comme une preuve, ce qui est exactement son role.
#
# `catch (` EST INSERE SUR SA PROPRE LIGNE, au debut du corps de la fonction :
# le controle cherche cette forme, et une insertion en fin de fichier ne serait
# pas dans le corps de `generateMetadata`.
restaurer
awk '
  /^export async function generateMetadata/ { dedans = 1 }
  { print }
  dedans && /\{$/ && !injecte { print "  } catch (erreur) {"; injecte = 1 }
' "$CATALOGUE" > "$CATALOGUE.mute" && mv "$CATALOGUE.mute" "$CATALOGUE"
attendre "un catch revient dans generateMetadata" 1 "catch est revenu"

# Garde-fou de ce script contre lui-meme : un ancrage casse rendrait un OK muet.
echo
if [ "$CAS" -lt 6 ]; then
  echo "ECHEC : $CAS cas joues, 6 attendus. L'ancrage est casse."
  exit 1
fi

if [ "$ECHECS" -eq 0 ]; then
  echo "$CAS cas joues, $ECHECS echec. Le controle est eprouve."
  exit 0
fi

echo "$CAS cas joues, $ECHECS echec(s)."
exit 1
