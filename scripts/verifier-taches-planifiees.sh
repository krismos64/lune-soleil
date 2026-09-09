#!/usr/bin/env bash
#
# Confronte la table `TACHES` de l'application au fichier de planification.
# LS-206.
#
# CE QU'IL REPOND : « toute tache declaree est-elle reellement declenchee ».
#
# POURQUOI IL EXISTE. Le 8 septembre 2026, en construisant la composition de
# production, la mesure a montre que `src/services/tache-planifiee.ts` declarait
# CINQ taches et que `docker/cron/crontab` en planifiait TROIS. Les deux
# absentes avaient leur service, leur verrou et leur route interne : tout
# fonctionnait, rien ne les appelait.
#
# LA PLUS GRAVE ETAIT `envoi-emails`. Un client paie, la commande est correcte,
# le stock est decremente, `/api/sante` rend 200, et AUCUNE confirmation ni
# facture ne part. Le defaut se decouvre au premier client qui ecrit.
#
# LA CAUSE EST UNE LISTE ECRITE A LA MAIN. L'en-tete du crontab parlait encore
# de « cinq minutes » et « un quart d'heure » : il datait de LS-72, avant que
# LS-82 et LS-102 n'ajoutent deux taches au service sans que le fichier suive.
# Une liste tenue a la main est une opinion tant qu'aucun controle ne la
# confronte a sa source.
#
# IL VERIFIE LES DEUX SENS. Une tache declaree non planifiee ne tourne jamais ;
# une tache planifiee non declaree fait echouer la route interne a chaque
# echeance, en silence dans `docker logs`.
#
# CODE DE SORTIE : 0 si tout concorde, 1 sinon. Ne pas enchainer de pipe pour
# le lire, `./verifier-taches-planifiees.sh | tail` rend le code de `tail`.
#
# Usage : ./scripts/verifier-taches-planifiees.sh

set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_TACHES="$RACINE/src/services/tache-planifiee.ts"
CRONTAB="$RACINE/docker/cron/crontab"

anomalies=()

# Un controle qui ne peut pas conclure ECHOUE, il ne se saute pas en silence.
# Le projet a deja livre un script qui affichait « migration additive » devant
# un DROP TABLE parce qu'une etape absorbait son erreur, LS-42.
abandonner() {
  echo "ABANDON : $1" >&2
  echo "Ce script ne peut pas conclure, il refuse de rendre un vert trompeur." >&2
  exit 2
}

[ -f "$SOURCE_TACHES" ] || abandonner "$SOURCE_TACHES introuvable."
[ -f "$CRONTAB" ] || abandonner "$CRONTAB introuvable."

# ---------------------------------------------------------------------------
# Les taches DECLAREES, lues dans la table `TACHES`
#
# L'EXTRACTION EST BORNEE AU BLOC `TACHES`, de sa ligne d'ouverture au
# `} as const`. Sans cette borne, le motif ramasserait toute cle de tout objet
# du fichier, et le controle comparerait deux listes dont l'une n'est pas celle
# qu'il croit.
#
# Le motif exige une cle CITEE suivie de `{`, forme de cette table. Les lignes
# de commentaire sont ecartees par le filtre sur `*` et `//`, sans quoi un nom
# de tache cite dans un commentaire entrerait dans la liste : le projet a deja
# rencontre trois fois un controle satisfait par un commentaire.
# ---------------------------------------------------------------------------

DECLAREES=$(awk '
  /^export const TACHES = \{/ { dans = 1; next }
  dans && /^\} as const/      { exit }
  dans {
    ligne = $0
    sub(/^[ \t]+/, "", ligne)
    if (ligne ~ /^\*/ || ligne ~ /^\/\// || ligne ~ /^\/\*/) next
    if (match(ligne, /^"[a-z0-9-]+":[ \t]*\{/)) {
      cle = substr(ligne, RSTART + 1, RLENGTH - 1)
      sub(/":[ \t]*\{$/, "", cle)
      print cle
    }
  }
' "$SOURCE_TACHES" | sort -u)

[ -n "$DECLAREES" ] || abandonner "aucune tache extraite de $SOURCE_TACHES, l'ancrage est casse."

# ---------------------------------------------------------------------------
# Les taches PLANIFIEES, lues dans le crontab
#
# Le nom est le dernier champ de la ligne d'appel a `declencher.sh`. Les lignes
# de commentaire et les lignes vides sont ecartees.
# ---------------------------------------------------------------------------

PLANIFIEES=$(grep -vE '^[[:space:]]*(#|$)' "$CRONTAB" \
  | grep 'declencher\.sh' \
  | awk '{ print $NF }' \
  | sort -u)

[ -n "$PLANIFIEES" ] || abandonner "aucune tache extraite de $CRONTAB, l'ancrage est casse."

NB_DECLAREES=$(printf '%s\n' "$DECLAREES" | wc -l | tr -d ' ')
NB_PLANIFIEES=$(printf '%s\n' "$PLANIFIEES" | wc -l | tr -d ' ')

# ---------------------------------------------------------------------------
# Les deux sens
# ---------------------------------------------------------------------------

while IFS= read -r tache; do
  [ -n "$tache" ] || continue
  if ! printf '%s\n' "$PLANIFIEES" | grep -Fxq "$tache"; then
    anomalies+=("la tache '$tache' est declaree dans TACHES mais AUCUNE ligne du crontab ne la declenche : elle ne tournera jamais")
  fi
done <<< "$DECLAREES"

while IFS= read -r tache; do
  [ -n "$tache" ] || continue
  if ! printf '%s\n' "$DECLAREES" | grep -Fxq "$tache"; then
    anomalies+=("la tache '$tache' est planifiee dans le crontab mais absente de TACHES : la route interne la refusera a chaque echeance")
  fi
done <<< "$PLANIFIEES"

# ---------------------------------------------------------------------------
# Le fuseau, qui se documente et ne se devine pas
#
# La machine est en `Etc/UTC`, ADR-036, et un lecteur francais lit une heure de
# cron en heure de Paris. Un fichier qui ne dit pas son fuseau fera deplacer
# une tache pour de mauvaises raisons.
# ---------------------------------------------------------------------------

if ! grep -qiE '\bUTC\b' "$CRONTAB"; then
  anomalies+=("le crontab ne mentionne nulle part son fuseau : la machine est en Etc/UTC, ADR-036, et un lecteur lira ces heures en heure de Paris")
fi

# ---------------------------------------------------------------------------

echo "TACHES PLANIFIEES, LS-206"
echo

if [ ${#anomalies[@]} -eq 0 ]; then
  echo "  $NB_DECLAREES tache(s) declaree(s), $NB_PLANIFIEES planifiee(s), les deux listes concordent"
  printf '%s\n' "$DECLAREES" | sed 's/^/    /'
  echo
  echo "OK toute tache declaree est declenchee, et reciproquement"
  exit 0
fi

echo "  $NB_DECLAREES tache(s) declaree(s), $NB_PLANIFIEES planifiee(s)"
echo
for a in "${anomalies[@]}"; do
  echo "  ECHEC $a"
done
echo
echo "Une tache non declenchee ne se voit sur aucun ecran : l'application"
echo "demarre, /api/sante rend 200, et le travail n'est simplement jamais fait."
exit 1
