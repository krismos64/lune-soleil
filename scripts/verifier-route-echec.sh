#!/usr/bin/env bash
# Garde de la route qui échoue à dessein, LS-191.
#
# CE QUE CE CONTRÔLE EMPÊCHE. `src/app/administration/echec-rendu/page.tsx`
# existe pour une seule raison : permettre à la suite de bout en bout de
# traverser la vraie frontière d'erreur, sous le vrai layout, avec la barre de
# navigation réellement rendue. C'est le critère 6 de la story, qui refuse
# qu'une frontière soit livrée sans qu'aucun test ne l'ait franchie.
#
# ELLE NE DOIT JAMAIS ÊTRE ATTEIGNABLE EN PRODUCTION. Une page qui lève à la
# demande donne à n'importe qui le moyen de provoquer une erreur serveur, donc
# d'écrire dans le journal à volonté et de mesurer le comportement du site en
# panne. Sa garde est un `notFound()` placé AVANT le `throw`.
#
# L'ORDRE DES DEUX INSTRUCTIONS EST TOUTE LA PROTECTION, et c'est exactement ce
# qu'un contrôle textuel sait vérifier. Les inverser laisserait un fichier qui
# se relit sans alerter : les deux instructions sont toujours là, la page rend
# toujours 404 sans la variable, et pourtant elle aurait levé avant.
#
# CE QU'IL NE VÉRIFIE PAS. Que la page rende bien 404 quand la variable est
# absente : cela demande un serveur qui tourne, et c'est
# `tests/e2e/erreur-administration.spec.ts` qui le mesure. Un contrôle textuel
# ne remplace pas un test d'exécution, motif déjà en fiche sur ce dépôt.
#
# Usage : ./scripts/verifier-route-echec.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="$RACINE/src/app/administration/echec-rendu/page.tsx"
ko=0

# ---------------------------------------------------------------------------
# La page peut disparaître, et ce n'est pas une erreur.
#
# Si une story future trouve un moyen de provoquer l'erreur sans code dédié,
# elle supprimera ce fichier et ce script avec lui. Échouer sur son absence
# obligerait à garder une page dont on ne veut pas.
# ---------------------------------------------------------------------------
if [ ! -f "$PAGE" ]; then
  echo "OK aucune route d'échec dans le dépôt, rien à garder"
  exit 0
fi

# ---------------------------------------------------------------------------
# LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE RECHERCHE, et la première version de
# ce script ne le faisait pas : elle restait verte sur l'ordre inversé, parce
# que l'en-tête du fichier EXPLIQUE que `notFound()` s'exécute avant le `throw`.
# Le motif était donc trouvé ligne 24, dans la phrase qui le décrit, bien avant
# l'instruction réelle ligne 55.
#
# Un contrôle textuel ne distingue pas l'explication de la chose expliquée, et
# la mutation seule l'a montré. Motif « contrôle satisfait par un commentaire »,
# déjà en fiche sur ce dépôt.
#
# Les lignes vidées sont CONSERVÉES et non supprimées : `perl` travaille en
# place, donc la numérotation reste celle du fichier réel et les messages
# d'erreur désignent la bonne ligne.
# ---------------------------------------------------------------------------
sans_commentaires() {
  perl -0777 -pe 's{/\*.*?\*/}{ my $t = $&; $t =~ s/[^\n]//g; $t }gse; s{^\s*//.*$}{}gm' "$1"
}

ligne_garde=$(sans_commentaires "$PAGE" | grep -n "notFound()" | head -1 | cut -d: -f1)
ligne_echec=$(sans_commentaires "$PAGE" | grep -n "throw new Error" | head -1 | cut -d: -f1)

if [ -z "$ligne_garde" ]; then
  echo "ECHEC la route d'échec ne porte aucun notFound()"
  echo "      sans lui elle lève en production, pour n'importe quel appelant"
  ko=$((ko + 1))
elif [ -z "$ligne_echec" ]; then
  echo "ECHEC la route d'échec ne lève plus"
  echo "      le test de LS-191 ne traverserait plus la frontière d'erreur"
  ko=$((ko + 1))
elif [ "$ligne_garde" -gt "$ligne_echec" ]; then
  echo "ECHEC la route d'échec lève AVANT sa garde"
  echo "      notFound() ligne $ligne_garde, throw ligne $ligne_echec"
  echo "      dans cet ordre la page lève en production, la garde n'étant"
  echo "      jamais atteinte. Remettre notFound() au-dessus du throw."
  ko=$((ko + 1))
fi

# La garde doit tenir sur une variable d'environnement, et refuser par défaut.
# Un `=== "0"` ou un `!== "production"` ouvrirait la route partout où la
# variable est simplement absente, ce qui est le cas de la production.
if ! sans_commentaires "$PAGE" | grep -q 'process.env.AUTORISER_ECHEC_RENDU !== "1"'; then
  echo "ECHEC la garde de la route d'échec n'est plus un défaut fermé"
  echo "      attendu : process.env.AUTORISER_ECHEC_RENDU !== \"1\""
  echo "      une garde qui teste l'inverse ouvre la route dès que la"
  echo "      variable est absente, c'est-à-dire en production"
  ko=$((ko + 1))
fi

echo
if [ "$ko" -eq 0 ]; then
  echo "OK la route d'échec est gardée, notFound() ligne $ligne_garde avant throw ligne $ligne_echec"
else
  echo "$ko problème(s) détecté(s)"
fi

exit "$ko"
