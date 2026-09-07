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
# La seconde exemption est `inscription-espacee.ts`, l'aide qui porte
# l'espacement des inscriptions sur base neuve, LS-168. Elle attend AVANT de
# dépasser le plafond, une seule fois dans la vie de la base, et jamais en
# régime établi : c'est l'inverse du réessai qui attend APRÈS avoir échoué, à
# chaque exécution. Centraliser l'attente là est précisément ce qui permet de
# l'interdire partout ailleurs.
# La troisième est `compte-profil.spec.ts`, LS-168. Il appelle
# `/change-password` deux fois, et les deux sont des mesures irréductibles : le
# refus d'un mot de passe actuel faux, et le changement qui ferme les autres
# sessions. Trois largeurs font six appels pour cinq places par minute, et
# Better Auth compte par IP sans option par session (vérifié via Context7). Son
# décalage est dérivé du rang de la largeur, donc fixe et connu d'avance : il
# empêche la collision AVANT qu'elle ait lieu, au lieu d'attendre après un
# échec.
EXEMPTES='connexion-administration\.spec\.ts|inscription-espacee\.ts|compte-profil\.spec\.ts'

# ---------------------------------------------------------------------------
# LES DEUX FORMES SONT CHERCHÉES, littérale ET calculée.
#
# La première version ne reconnaissait qu'un nombre écrit en clair,
# `waitForTimeout(21_000)`. Elle est restée VERTE sur
# `waitForTimeout(rang * DECALAGE_PAR_LARGEUR_MS)`, une attente de 25 à 50
# secondes : l'argument étant une expression, aucun chiffre n'apparaissait.
#
# Mesuré le 7 septembre 2026 en écrivant ce décalage. Un contrôle qui ne voit
# que la forme qu'il a servi à corriger ne protège que le passé.
#
# UNE ATTENTE CALCULÉE COMPTE DONC COMME LONGUE, sans chercher à évaluer sa
# valeur : un script textuel ne peut pas la connaître, et la supposer courte
# serait exactement l'erreur à éviter. Elle doit être exemptée nommément, ce qui
# oblige à écrire pourquoi.
# ---------------------------------------------------------------------------
attentes=$(grep -rnE 'waitForTimeout\(' "$DOSSIER" \
  --include='*.ts' \
  | grep -vE "$EXEMPTES" \
  | awk -F'waitForTimeout\\(' '{
      argument = $2
      # Un argument sans aucun chiffre est une expression : on ne peut pas
      # l évaluer, donc on la signale.
      if (argument !~ /[0-9]/) { print $0; next }
      valeur = argument
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
for exempte in connexion-administration.spec.ts inscription-espacee.ts compte-profil.spec.ts; do
  if [ ! -f "$DOSSIER/$exempte" ]; then
    echo "ÉCHEC : l'exemption vise $exempte, qui n'existe plus."
    echo "Retirer l'exemption devenue sans objet, ou corriger le chemin."
    ko=1
  fi
done

# ---------------------------------------------------------------------------
# LES DEUX LISTES DE LARGEURS DOIVENT COÏNCIDER.
#
# `comptes-profil.setup.ts` amorce un compte par largeur en lisant
# `PROJETS_LARGEUR`, et il s'exécute AVANT les projets de largeur : il ne peut
# donc pas découvrir leurs noms tout seul. Une largeur ajoutée à
# `playwright.config.ts` sans être inscrite dans cette liste verrait son compte
# manquer, et `compte-profil` retomberait sur une inscription au moment le plus
# chargé de la suite.
#
# LE DÉFAUT SERAIT INVISIBLE : la suite passerait, jusqu'au jour où le plafond
# se retrouve consommé. C'est le motif « une largeur ajoutée casse un compte »,
# jumeau de celui de l'enum ajouté à un index partiel, déjà rencontré ici.
#
# LA COMPARAISON PORTE SUR LES DEUX SENS, une largeur en trop dans la liste
# étant tout aussi fautive : elle amorcerait un compte que personne n'utilise,
# en consommant une place du plafond pour rien.
# ---------------------------------------------------------------------------
CONFIG="$RACINE/playwright.config.ts"
MODULE="$DOSSIER/chemin-session.ts"

if [ ! -f "$CONFIG" ] || [ ! -f "$MODULE" ]; then
  echo "ÉCHEC : playwright.config.ts ou chemin-session.ts est introuvable."
  exit 1
fi

# Les projets de largeur de la configuration : tout `name:` sauf `preparation`.
largeurs_config=$(grep -oE 'name: "[a-z0-9-]+"' "$CONFIG" \
  | sed 's/name: "//; s/"//' \
  | grep -v '^preparation$' \
  | sort)

# La liste déclarée, entre `PROJETS_LARGEUR = [` et le `]` qui la ferme.
largeurs_module=$(awk '/PROJETS_LARGEUR = \[/,/\]/' "$MODULE" \
  | grep -oE '"[a-z0-9-]+"' \
  | tr -d '"' \
  | sort)

# ÉCHOUER SI L'UNE DES DEUX EST VIDE : une extraction qui ne trouve rien
# comparerait deux listes vides et se déclarerait cohérente, motif « contrôle
# satisfait par l'absence » déjà rencontré sur ce dépôt.
if [ -z "$largeurs_config" ] || [ -z "$largeurs_module" ]; then
  echo "ÉCHEC : une des deux listes de largeurs est vide, le contrôle ne peut pas conclure."
  echo "  config : $(echo "$largeurs_config" | tr '\n' ' ')"
  echo "  module : $(echo "$largeurs_module" | tr '\n' ' ')"
  ko=1
elif [ "$largeurs_config" != "$largeurs_module" ]; then
  echo "ÉCHEC : PROJETS_LARGEUR ne correspond pas aux projets de playwright.config.ts."
  echo
  echo "  config : $(echo "$largeurs_config" | tr '\n' ' ')"
  echo "  module : $(echo "$largeurs_module" | tr '\n' ' ')"
  echo
  echo "comptes-profil.setup.ts amorce un compte par largeur en lisant cette"
  echo "liste. Une largeur absente verrait son compte manquer, et le fichier de"
  echo "profil retomberait sur une inscription, LS-168."
  ko=1
fi

# ---------------------------------------------------------------------------
# LA FENÊTRE RECOPIÉE DOIT SUIVRE LA CONFIGURATION RÉELLE.
#
# `inscription-espacee.ts` porte `FENETRE_MS` et `PLACES_PAR_FENETRE`, qui
# recopient `"/sign-up/email": { window: 60, max: 3 }` de `src/lib/auth.ts`.
# Une recopie se périme sans bruit : durcir le plafond à deux par minute
# laisserait l'aide en attendre trois, et l'amorçage échouerait en 429 sur une
# base neuve, très loin de la ligne qui aurait changé.
#
# LE SENS EST CELUI DE LA SÉCURITÉ. L'aide doit attendre AU MOINS aussi souvent
# que le plafond l'exige : une fenêtre déclarée plus longue ou moins de places
# que la réalité est prudente, l'inverse est faux. Le contrôle refuse donc les
# valeurs qui dépassent la configuration, pas celles qui restent en deçà.
# ---------------------------------------------------------------------------
AUTH="$RACINE/src/lib/auth.ts"
AIDE="$DOSSIER/inscription-espacee.ts"

if [ ! -f "$AUTH" ] || [ ! -f "$AIDE" ]; then
  echo "ÉCHEC : src/lib/auth.ts ou inscription-espacee.ts est introuvable."
  exit 1
fi

# `{ window: 60, max: 3 }` sur la ligne de `/sign-up/email`.
regle=$(grep -E '"/sign-up/email":' "$AUTH" | head -1)
fenetre_auth=$(echo "$regle" | grep -oE 'window: *[0-9]+' | grep -oE '[0-9]+')
places_auth=$(echo "$regle" | grep -oE 'max: *[0-9]+' | grep -oE '[0-9]+')

fenetre_aide=$(grep -E '^const FENETRE_MS' "$AIDE" | grep -oE '[0-9_]+' | tr -d '_')
places_aide=$(grep -E '^const PLACES_PAR_FENETRE' "$AIDE" | grep -oE '[0-9]+')

if [ -z "$fenetre_auth" ] || [ -z "$places_auth" ] ||
   [ -z "$fenetre_aide" ] || [ -z "$places_aide" ]; then
  echo "ÉCHEC : une des quatre valeurs de plafond n'a pas pu être lue."
  echo "  auth : window=$fenetre_auth max=$places_auth"
  echo "  aide : FENETRE_MS=$fenetre_aide PLACES=$places_aide"
  ko=1
else
  # La configuration est en SECONDES, l'aide en MILLISECONDES.
  attendu_ms=$((fenetre_auth * 1000))

  if [ "$fenetre_aide" -lt "$attendu_ms" ] || [ "$places_aide" -gt "$places_auth" ]; then
    echo "ÉCHEC : inscription-espacee.ts attend moins que le plafond n'exige."
    echo
    echo "  src/lib/auth.ts        window ${fenetre_auth}s (${attendu_ms} ms), max ${places_auth}"
    echo "  inscription-espacee.ts FENETRE_MS ${fenetre_aide}, PLACES ${places_aide}"
    echo
    echo "L'amorçage sur base neuve echouerait en 429, loin de la ligne changée."
    ko=1
  fi
fi

if [ "$ko" -eq 0 ]; then
  echo "OK : aucune adresse construite à l'exécution, aucune attente longue,"
  echo "     largeurs conformes à la configuration, et la fenêtre recopiée"
  echo "     couvre le plafond réel."
fi

exit "$ko"
