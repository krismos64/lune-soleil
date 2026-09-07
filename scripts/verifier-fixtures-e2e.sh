#!/usr/bin/env bash
# Garde des adresses de comptes de la suite de bout en bout, LS-168.
#
# CE QUE CE CONTRÔLE EMPÊCHE. Une fixture qui fabrique son adresse à l'exécution
# crée un compte NEUF à chaque exécution, et `/sign-up/email` n'accepte que
# TROIS inscriptions par minute et par IP. La suite se bloque alors elle-même,
# et le défaut se voit très loin de sa cause : la préparation échoue en 429,
# Playwright marque tous les tests « non exécutés », et un script de mutation
# conclut « le test est aveugle » sur des tests parfaitement voyants.
#
# LE DÉFAUT A ÉTÉ CORRIGÉ TROIS FOIS, ET IL EST REVENU DEUX FOIS. LS-111 l'a
# fermé sur la session d'administration, LS-113 sur la session cliente, et il
# restait entier sur `session-verifiee.setup.ts` et `compte-profil.spec.ts`
# jusqu'à LS-168. Chaque correction portait pourtant un commentaire expliquant
# le piège : ce sont ces commentaires qui n'ont pas suffi, et c'est la raison
# d'être de ce script.
#
# CE QU'IL VÉRIFIE EXACTEMENT : qu'aucun fichier de la suite ne construise une
# adresse `@exemple.test` à partir d'une valeur qui change d'une exécution à
# l'autre, `Date.now()`, `Math.random()`, `randomUUID` ou un horodatage.
#
# CE QU'IL NE VÉRIFIE PAS. Que les trois paliers soient réellement implémentés,
# ni qu'ils fonctionnent : cela demande un serveur qui tourne, et c'est la suite
# elle-même qui le mesure en s'exécutant trois fois d'affilée. Un contrôle
# textuel ne remplace pas un test d'exécution, motif déjà en fiche sur ce dépôt.
#
# Usage : ./scripts/verifier-fixtures-e2e.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
DOSSIER="$RACINE/tests/e2e"
ko=0

if [ ! -d "$DOSSIER" ]; then
  echo "ÉCHEC : tests/e2e est introuvable, le contrôle ne peut pas conclure."
  exit 1
fi

# ---------------------------------------------------------------------------
# Les sources de valeur qui changent d'une exécution à l'autre.
#
# `randomUUID` ET `crypto.randomUUID` sont couverts par le même motif, l'un
# étant un préfixe de l'autre.
# ---------------------------------------------------------------------------
VARIABLES='Date\.now\(\)|Math\.random\(\)|randomUUID|toISOString\(\)|process\.hrtime'

# ---------------------------------------------------------------------------
# ANCRAGE SUR LE GABARIT ENTIER ET NON SUR LA SEULE VARIABLE.
#
# Un fichier a parfaitement le droit d'appeler `Date.now()` pour autre chose,
# une référence de commande par exemple. Ce qui est interdit est précisément
# d'en faire une ADRESSE : le motif exige donc les deux sur la même ligne,
# le gabarit `@exemple.test` et la source variable.
#
# LES DEUX ORDRES SONT CHERCHÉS. `${Date.now()}@exemple.test` est la forme
# rencontrée, mais rien n'empêche d'écrire l'inverse en découpant autrement.
# ---------------------------------------------------------------------------
fautives=$(grep -rnE "@exemple\.test" "$DOSSIER" --include='*.ts' \
  | grep -E "$VARIABLES" || true)

if [ -n "$fautives" ]; then
  echo "ÉCHEC : une adresse de compte de test est construite à l'exécution."
  echo
  echo "$fautives"
  echo
  echo "Une adresse qui change à chaque exécution crée un compte neuf et"
  echo "consomme une des TROIS places par minute de /sign-up/email, LS-168."
  echo "Poser une adresse FIXE et les trois paliers : réutiliser l'état,"
  echo "sinon se connecter, sinon s'inscrire."
  ko=1
fi

# ---------------------------------------------------------------------------
# LE RÉESSAI ESPACÉ EST LUI AUSSI INTERDIT, et c'est le second sens du contrôle.
#
# Il était la parade AVANT LS-168 : attendre 21 secondes puis réessayer. Il
# répartit la consommation sans la supprimer, allonge la suite de plusieurs
# minutes, et échoue quand même dès qu'une exécution est relancée dans la
# minute. Le réintroduire signerait un retour au raisonnement que LS-168 écarte.
#
# LE SEUIL EST À 10 SECONDES : une attente courte relève de la synchronisation
# d'interface, une attente de plus de dix secondes dans un fichier de test ne
# s'explique que par un plafond que l'on subit.
#
# UNE EXEMPTION EXISTE, ET UNE SEULE. `connexion-administration.spec.ts` mesure
# le REFUS d'identifiants faux, code 401 : consommer le plafond de
# `/sign-in/email` est ce que ce test fait par nature, et aucune adresse fixe ne
# peut l'éviter puisque le compte visé n'existe justement pas. Son attente est
# le rattrapage d'un 429, pas une parade à une inscription évitable.
#
# ELLE EST NOMMÉE FICHIER PAR FICHIER, jamais par motif : une exemption large
# laisserait rentrer le défaut sous un nom voisin, et c'est exactement ainsi
# qu'il est revenu deux fois. Y ajouter un fichier demande de justifier
# pourquoi ce fichier-là ne peut pas se passer du plafond.
# ---------------------------------------------------------------------------
EXEMPTES='connexion-administration\.spec\.ts'

attentes=$(grep -rnE 'waitForTimeout\(\s*[0-9]{2,}_?[0-9]*\s*\)' "$DOSSIER" \
  --include='*.ts' \
  | grep -vE "$EXEMPTES" \
  | awk -F'waitForTimeout\\(' '{
      valeur = $2
      gsub(/[^0-9]/, "", valeur)
      if (valeur + 0 >= 10000) print $0
    }' || true)

if [ -n "$attentes" ]; then
  echo "ÉCHEC : une attente longue subsiste dans la suite de bout en bout."
  echo
  echo "$attentes"
  echo
  echo "Un réessai espacé répartit la consommation du plafond sans la"
  echo "supprimer, et échoue quand même sous charge, LS-168. La parade est"
  echo "une adresse fixe, qui ne consomme rien du tout."
  ko=1
fi

# ---------------------------------------------------------------------------
# L'EXEMPTION DOIT DÉSIGNER UN FICHIER QUI EXISTE.
#
# Un fichier renommé ou supprimé laisserait une exemption qui ne protège plus
# rien et n'alerte pas : le contrôle continuerait de passer en ayant cessé de
# couvrir ce qu'il croit couvrir. Motif « contrôle de mutation mort » déjà en
# fiche sur ce dépôt, où un chemin périmé arrêtait le script avant sa mesure.
# ---------------------------------------------------------------------------
if [ ! -f "$DOSSIER/connexion-administration.spec.ts" ]; then
  echo "ÉCHEC : l'exemption vise connexion-administration.spec.ts, qui n'existe plus."
  echo "Retirer l'exemption devenue sans objet, ou corriger le chemin."
  ko=1
fi

if [ "$ko" -eq 0 ]; then
  echo "OK : aucune adresse de test construite à l'exécution, aucune attente longue."
fi

exit "$ko"
