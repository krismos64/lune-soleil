#!/bin/bash
# Décide si une modification exige la suite complète, tests longs compris.
# LS-169, arbitrage de Christophe du 3 septembre 2026.
#
# CE QUE CE SCRIPT EXISTE POUR ÉVITER. Mesure de la session du 3 septembre : une
# exécution de la chaîne dure treize minutes, dont 678 s pour les scénarios de
# bout en bout et 268 s pour les tests d'intégration. Tout le reste, types, lint,
# format, construction et schéma, tient en moins de deux minutes.
#
# Les pull requests 205 et 206 ne touchaient QUE de la documentation et ont
# rejoué sept cents tests de bout en bout sur trois largeurs, le tunnel d'achat
# et les paiements compris. Vingt-quatre minutes pour vérifier que du texte n'a
# pas cassé un paiement.
#
# LE FILTRE LISTE CE QUI EST EXEMPTÉ, JAMAIS CE QUI EST TESTÉ, et c'est la seule
# décision de conception qui compte ici. Une liste blanche de chemins « à
# tester » laisserait passer en silence tout fichier d'une forme non prévue : un
# `.ts` ajouté dans un dossier oublié ne déclencherait plus rien, et la
# protection sauterait sans qu'aucun signal n'apparaisse.
#
# LE SENS DU DÉFAUT N'EST PAS SYMÉTRIQUE. Une exemption ratée coûte treize
# minutes ; une exemption abusive laisse passer une régression jusqu'en
# production. Le défaut est donc FERMÉ : tout ce qui n'est pas explicitement
# exempté exige la suite complète, y compris un chemin vide ou une entrée
# illisible.
#
# C'est le motif de `lune-soleil-exemption-contre-elargissement`, déjà rencontré
# ici : neuf exemptions d'un coup avaient fait basculer un contrôle du bon côté
# de la mesure sans que rien ne le signale.
#
# CE SCRIPT NE LIT PAS GIT. Il reçoit la liste des fichiers sur son entrée
# standard, un par ligne, ce qui le rend exerçable par un test sans dépôt, sans
# branche et sans réseau. L'appelant décide comment il obtient cette liste.
#
# Usage :
#   git diff --name-only origin/main...HEAD | ./scripts/decider-suite-complete.sh
#
# Sortie : `complete` ou `allegee` sur la sortie standard, et un code de retour
# qui vaut 0 dans les deux cas. Ce script CONSTATE, il ne refuse rien : un code
# non nul serait interprété comme un échec de contrôle par l'appelant.

set -uo pipefail

# ---------------------------------------------------------------------------
# Ce qui est EXEMPTÉ, et rien d'autre.
#
# Chaque motif est ancré sur le début du chemin, `^`, ou sur une extension en
# fin de chemin, `$`. Sans ancrage, `docs/` correspondrait aussi à
# `src/lib/docs/quelque-chose.ts`, qui est du code.
#
# `\.md$` COUVRE TOUT MARKDOWN, où qu'il vive. Un README de dossier de garde,
# `src/services/README.md`, est de la documentation même s'il est sous `src/` :
# aucun test ne le charge, aucune construction ne le lit.
#
# `.claude/` EST EXEMPTÉ AVEC UNE RÉSERVE, et elle est traitée plus bas : ses
# fichiers sont des règles et de la configuration d'assistant, mais
# `verifier-regles.sh` les confronte au code réel. Ce contrôle-là fait partie des
# étapes COURTES, qui tournent dans les deux cas : l'exemption ne le désarme pas.
# ---------------------------------------------------------------------------
EXEMPTES=(
  '^docs/'
  '^\.claude/'
  '^\.github/ISSUE_TEMPLATE/'
  '^README\.md$'
  '^CONTRIBUTING\.md$'
  '^CLAUDE\.md$'
  '^LICENSE$'
  '\.md$'
)

exempte() {
  local chemin="$1"

  for motif in "${EXEMPTES[@]}"; do
    if printf '%s' "$chemin" | grep -qE "$motif"; then
      return 0
    fi
  done

  return 1
}

fichiers=0
declencheurs=0
premier_declencheur=""

while IFS= read -r chemin; do
  # Une ligne vide n'est pas un fichier. La sortie de `git diff --name-only` en
  # produit une en fin de flux, et un `read` la rendrait comme un chemin ""
  # qu'aucun motif ne couvre : le défaut fermé ferait alors tout exécuter sur
  # chaque appel, ce qui viderait ce script de son objet.
  [ -n "$chemin" ] || continue

  fichiers=$((fichiers + 1))

  if ! exempte "$chemin"; then
    declencheurs=$((declencheurs + 1))
    [ -n "$premier_declencheur" ] || premier_declencheur="$chemin"
  fi
done

# ---------------------------------------------------------------------------
# AUCUN FICHIER REÇU VAUT SUITE COMPLÈTE, et ce n'est pas un cas d'école.
#
# La liste est vide quand la comparaison échoue : base introuvable, historique
# tronqué par un `fetch-depth` trop court, ou dépôt dans un état inattendu. Rien
# ne distingue « aucun fichier modifié » de « je n'ai pas pu savoir ».
#
# C'est le motif du garde-fou qui ne peut pas conclure, déjà posé dans
# `migrate-production.sh` : il bloque plutôt que de supposer que tout va bien.
# Ici, bloquer signifie tout exécuter.
# ---------------------------------------------------------------------------
if [ "$fichiers" -eq 0 ]; then
  echo "complete"
  exit 0
fi

if [ "$declencheurs" -gt 0 ]; then
  echo "complete"
  exit 0
fi

echo "allegee"
