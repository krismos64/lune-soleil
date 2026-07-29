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
MC="docs/architecture/MODELE-CONCEPTUEL.md"

for f in "$DB" "$ML" "$MC" ./scripts/verifier-regles.sh; do
  [ -r "$f" ] || { echo "ECHEC fichier illisible : $f"; exit 1; }
done

TMP="$(mktemp -d)"
cp "$DB" "$TMP/db.orig"; cp "$ML" "$TMP/ml.orig"; cp "$MC" "$TMP/mc.orig"
restaurer() { cp "$TMP/db.orig" "$DB"; cp "$TMP/ml.orig" "$ML"; cp "$TMP/mc.orig" "$MC"; }
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

# Cas 6 : la meme valeur sans apostrophes, forme de la regle V14 du modele
# conceptuel. Exiger les apostrophes laissait passer le predicat perime dans le
# document le plus structurant. Trouve apres coup, d'ou ce cas.
perl -pi -e "s/statut IN \('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE'\)\`, voir/statut = REUSSI\`, voir/" "$MC"
cas "MODELE-CONCEPTUEL.md, V14 sans apostrophes"

# Cas 7 et 8 : le tableau des quatre cles d'idempotence et le recapitulatif des
# unicites partielles. Ces deux lignes ecrivent `paiement (commandeId)` sans
# nommer l'index ni le mot UNIQUE : une quatrieme forme, qui echappait aux trois
# ancres de la version precedente. Le controle etait vert alors que les deux
# lignes portaient encore le predicat perime.
#
# Trouves par un rapport externe apres cloture de LS-49, pas par ce script :
# une mutation ne prouve que ce qu'elle mute, elle ne devine pas les formes
# d'ecriture que personne n'a pensees.
perl -pi -e "s/^\| paiement confirmé \| \`paiement \(commandeId\)\` filtré sur \`statut IN \('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE'\)\`/| paiement confirmé | \`paiement (commandeId)\` filtré sur \`statut = REUSSI\`/" "$MC"
cas "MODELE-CONCEPTUEL.md, tableau des quatre cles d'idempotence"

perl -pi -e "s/^\| \`paiement \(commandeId\)\` \| \`statut IN \('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE'\)\`/| \`paiement (commandeId)\` | \`statut = REUSSI\`/" "$MC"
cas "MODELE-CONCEPTUEL.md, recapitulatif des unicites partielles"

echo
echo "-----------------------------------------"
if [ "$echecs" -eq 0 ]; then
  echo "  8 mutations, 8 detectees"
else
  echo "  $echecs mutation(s) non detectee(s)"
fi
echo "-----------------------------------------"
[ "$echecs" -eq 0 ]
