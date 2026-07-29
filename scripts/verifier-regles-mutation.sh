#!/usr/bin/env bash
# Preuve par mutation du controle de predicats de verifier-regles.sh, LS-49.
#
# Motif. Un controle vert ne prouve rien tant qu'il n'a pas echoue sur le defaut
# reel. Ce script reinjecte cinq fois le defaut corrige par LS-45 et par LS-13,
# et exige que verifier-regles.sh echoue a chaque fois.
#
# Il a servi a trouver un angle mort pendant l'ecriture du controle : ancrer sur
# le seul nom d'index ratait database.md, qui ne le nomme jamais et qui est
# pourtant le fichier charge au moment de coder le paiement.
#
# Les fichiers sont restaures par un trap, y compris en cas d'interruption.
#
# Usage : ./scripts/verifier-regles-mutation.sh
# Aucun prerequis, ni Docker ni base.
set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

DB=".claude/rules/database.md"
ML="docs/architecture/MODELE-LOGIQUE.md"

for f in "$DB" "$ML" ./scripts/verifier-regles.sh; do
  [ -r "$f" ] || { echo "ECHEC fichier illisible : $f"; exit 1; }
done

TMP="$(mktemp -d)"
cp "$DB" "$TMP/db.orig"; cp "$ML" "$TMP/ml.orig"
restaurer() { cp "$TMP/db.orig" "$DB"; cp "$TMP/ml.orig" "$ML"; }
nettoyer() { restaurer; rm -rf "$TMP"; }
trap nettoyer EXIT

echecs=0
cas() {
  local nom="$1"
  ./scripts/verifier-regles.sh >"$TMP/sortie.txt" 2>&1
  local code=$?
  if [ "$code" -ne 0 ]; then
    echo "  OK    $nom -> detecte (code $code)"
    grep '  ECHEC' "$TMP/sortie.txt" | sed 's/^/          /'
  else
    echo "  RATE  $nom -> NON detecte, le controle est aveugle"
    echecs=$((echecs+1))
  fi
  restaurer
}

echo "Preuve par mutation, controle des predicats d'index partiels"
echo

# Cas 1 : le defaut exact de LS-45, dans la regle chargee au moment de coder.
perl -0pi -e "s/WHERE statut IN \('REUSSI',\n *'PARTIELLEMENT_REMBOURSE',\n *'REMBOURSE'\)/WHERE statut = 'REUSSI'/" "$DB"
cas "database.md, filtre paiement reduit a REUSSI"

# Cas 2 : le meme defaut dans le modele logique.
perl -pi -e "s/\`statut IN \('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE'\)\`/\`statut = 'REUSSI'\`/" "$ML"
cas "MODELE-LOGIQUE.md, filtre paiement reduit a REUSSI"

# Cas 3 : un seul etat retire, l'erreur la plus discrete.
perl -0pi -e "s/'PARTIELLEMENT_REMBOURSE',\n *'REMBOURSE'\)/'PARTIELLEMENT_REMBOURSE')/" "$DB"
cas "database.md, REMBOURSE seul retire"

# Cas 4 : la cle email, RECONCILIATION retiree. C'est le second chemin de la
# decision D : sans lui, un webhook tardif renvoie une confirmation.
perl -pi -e "s/AND origine IN \('SYSTEME','RECONCILIATION'\)/AND origine IN ('SYSTEME')/" "$DB"
cas "database.md, RECONCILIATION retiree du filtre email"

# Cas 5 : l'index administratrice, sur un autre fichier encore.
perl -pi -e "s/\`role = 'ADMINISTRATRICE'\`/\`role = 'CLIENT'\`/" "$ML"
cas "MODELE-LOGIQUE.md, filtre administratrice fausse"

echo
echo "-----------------------------------------"
if [ "$echecs" -eq 0 ]; then
  echo "  5 mutations, 5 detectees"
else
  echo "  $echecs mutation(s) non detectee(s)"
fi
echo "-----------------------------------------"
[ "$echecs" -eq 0 ]
