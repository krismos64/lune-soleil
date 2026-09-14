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

  # LES COMMENTAIRES NE COMPTENT PAS, motif « contrôle satisfait par un
  # commentaire » déjà en fiche sur ce dépôt.
  #
  # `src/lib/auth.ts` cite `input: false` DEUX fois en commentaire avant la
  # ligne qui le pose, et `MODELE-LOGIQUE.md` cite son prédicat dans une phrase
  # explicative. Un `grep` nu restait donc vert quand la mutation retournait la
  # valeur réelle : mesuré le 14 septembre 2026, `input: true` passait sans
  # alerte, sur la garde même qui empêche un client de se déclarer
  # ADMINISTRATRICE.
  #
  # Les lignes ouvertes par `*`, `//` ou `#` sont écartées. Les tableaux
  # Markdown, qui portent les prédicats des documents d'architecture, commencent
  # par `|` et restent examinés.
  # NI `grep -q` NI PIPE, ET C'EST `pipefail` QUI L'IMPOSE.
  #
  # `set -o pipefail` en tête de ce script remonte le code du premier élément du
  # pipe qui échoue. Or `grep -q` s'arrête dès la première correspondance et tue
  # `grep -vE` en cours d'écriture : celui-ci meurt sur SIGPIPE, le pipe rend
  # 141, et `pipefail` le présente comme un échec. Le contrôle échouait donc
  # PRÉCISÉMENT QUAND IL TROUVAIT, ce qui est le pire des comportements.
  #
  # Mesuré le 14 septembre 2026 : le même pipe rend 0 sans `pipefail` et 141
  # avec. Le filtrage passe donc par une variable, sans pipe et sans `-q`.
  local lignes trouve code
  lignes=$(grep -vE "^[[:space:]]*(\*|//|#)" "$fichier")

  # LE CODE DE `grep` SE DISTINGUE DE SON COMPTE, et la nuance est un garde-fou.
  #
  # `grep -c` rend 1 quand il ne trouve rien, et 2 ou plus sur une ERREUR. Un
  # `|| true` nu avalait les deux : le compte devenait une chaîne vide, que
  # `${trouve:-0}` transformait en zéro, donc en « ne porte plus le motif ».
  # Le contrôle aurait accusé une mutation là où son propre appel avait échoué,
  # ce qui envoie chercher au mauvais endroit.
  set +e
  trouve=$(grep -cF "$motif" <<<"$lignes")
  code=$?
  set -e

  if [ "$code" -gt 1 ]; then
    echo "  ÉCHEC la recherche a échoué sur $fichier, code $code."
    echo "        Ce n'est PAS une mutation : le contrôle lui-même est en panne."
    defauts=$((defauts + 1))
    return
  fi

  if [ "${trouve:-0}" -eq 0 ]; then
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

verifier "tests/aide/reservation-sql.ts" "quantite_physique - c.q" \
  "La conversion en vente ne décrémenterait plus le stock physique."

verifier "tests/aide/reservation-sql.ts" "quantite_reservee - e.q" \
  "Une réservation expirée ne libérerait plus la quantité réservée."

verifier "docs/architecture/MODELE-LOGIQUE.md" "role = 'ADMINISTRATRICE'" \
  "Le document décrirait l'index E1 à l'envers de la réalité."

# UN MOTIF COURT ET SANS AMBIGUITE. La chaine complete du predicat,
# `statut IN ('REUSSI', ...)`, s'est reveleee impossible a faire correspondre de
# facon fiable depuis ce script alors qu'elle correspond en ligne de commande.
# Plutot que de s'acharner, le controle vise le terme que la mutation RETIRE :
# reduire le predicat au seul `REUSSI` fait disparaitre `PARTIELLEMENT_REMBOURSE`
# du document, et c'est ce qui se mesure.
verifier "docs/architecture/MODELE-CONCEPTUEL.md" \
  "PARTIELLEMENT_REMBOURSE" \
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
