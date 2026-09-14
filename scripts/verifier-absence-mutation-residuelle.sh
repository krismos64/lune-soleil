#!/bin/bash
# Vérifie qu'aucune mutation de preuve n'est restée dans le dépôt. LS-230.
#
# POURQUOI CE CONTRÔLE EXISTE, ET CE QU'IL A COÛTÉ DE NE PAS L'AVOIR.
#
# Une preuve par mutation abîme volontairement le dépôt, puis restaure. Quand
# elle est interrompue, la restauration peut ne pas avoir lieu : le défaut reste
# alors dans le code, indiscernable d'une modification voulue.
#
# TROIS MUTATIONS ONT ÉTÉ TROUVÉES AINSI le 14 septembre 2026, dont deux avaient
# déjà été COMMITÉES :
#
#   - `src/lib/auth.ts` privé de `input: false`, la garde qui empêche un client
#     de se déclarer ADMINISTRATRICE depuis le corps d'une requête, règle E11
#   - `src/services/journal-connexion.ts` avec son `lt` inversé en `gt` : la
#     purge aurait effacé les lignes RÉCENTES en gardant les périmées
#   - `src/repositories/stock.ts` privé de `vente_web_activee = true` dans
#     `SQL_RESERVER` : une variante retirée de la vente web serait restée
#     réservable, ce que l'invariant 6 interdit
#
# UNE QUATRIÈME est apparue pendant l'écriture même de ce contrôle :
# `src/services/autorisation.ts` privé de son test de rôle, ce qui aurait ouvert
# l'administration à tout client connecté. Elle a été vue parce que le dépôt
# était surveillé, pas parce qu'un contrôle l'a dite : c'est exactement ce que
# celui-ci corrige.
#
# Deux autres dormaient dans les documents d'architecture, dont une décrivant
# l'index E1 comme filtré sur `role = 'CLIENT'` là où il filtre sur
# `'ADMINISTRATRICE'` : la documentation disait l'inverse de l'invariant réel.
#
# CE QU'IL VÉRIFIE. Les invariants les plus sensibles du dépôt, ceux qu'une
# preuve mute et qu'un œil ne rattrape pas en relisant un diff de cinquante
# fichiers. La liste est volontairement courte : elle ne remplace pas les
# contrôles de domaine, elle attrape ce qu'une restauration ratée laisse.
#
# CE QU'IL NE VÉRIFIE PAS. Toute mutation possible. Un contrôle exhaustif
# reviendrait à rejouer l'ensemble des contrôles du dépôt, ce que la CI fait
# déjà. Celui-ci est fait pour tourner AVANT un commit, en une seconde.
#
# Usage : ./scripts/verifier-absence-mutation-residuelle.sh

set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

defauts=0

echo "Absence de mutation résiduelle, LS-230"
echo

# Chaque invariant : un fichier, un motif qui DOIT s'y trouver, et ce que son
# absence signifierait. Le motif est celui que la mutation retire.
verifier() {
  local fichier="$1" motif="$2" sens="$3"

  if [ ! -r "$fichier" ]; then
    echo "  ÉCHEC $fichier est introuvable."
    echo "        L'ancrage de ce contrôle est cassé : il ne prouve plus rien."
    defauts=$((defauts + 1))
    return
  fi

  if ! grep -qF "$motif" "$fichier"; then
    echo "  ÉCHEC $fichier ne porte plus « $motif »."
    echo "        $sens"
    echo "        Une preuve par mutation a-t-elle été interrompue ?"
    defauts=$((defauts + 1))
    return
  fi

  echo "  OK    ${fichier#src/}"
}

verifier "src/lib/auth.ts" "input: false" \
  "Sans elle, le rôle se pose depuis le corps d'une requête, règle E11."

verifier "src/services/autorisation.ts" 'role !== "ADMINISTRATRICE"' \
  "Sans elle, tout client connecté accède à l'administration."

verifier "src/services/journal-connexion.ts" "creeA: { lt:" \
  "Avec « gt », la purge efface les lignes récentes et garde les périmées."

verifier "src/repositories/stock.ts" "AND vente_web_activee = true" \
  "Sans elle, une variante hors vente web reste réservable, invariant 6."

verifier "docs/architecture/MODELE-LOGIQUE.md" "role = 'ADMINISTRATRICE'" \
  "Le document décrirait l'index E1 à l'envers de la réalité."

verifier "docs/architecture/MODELE-CONCEPTUEL.md" \
  "statut IN ('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE')" \
  "Le prédicat réduit au seul REUSSI rendrait une commande remboursée impayable."

echo

if [ "$defauts" -gt 0 ]; then
  echo "ÉCHEC : $defauts invariant(s) absent(s) du dépôt."
  echo
  echo "Ne rien commiter avant d'avoir compris pourquoi. Une preuve interrompue"
  echo "laisse un défaut que rien ne distingue d'une modification voulue."
  exit 1
fi

echo "OK : les invariants mutés par les preuves sont tous en place."
