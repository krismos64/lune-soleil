#!/bin/bash
# Vérifie que la protection de `main` porte encore ce dont la chaîne dépend.
# LS-176.
#
# POURQUOI CE CONTRÔLE EXISTE, ET CE QU'IL EMPÊCHE. LS-176 a supprimé le
# déclenchement de la chaîne sur `main` après fusion. Cette suppression n'est pas
# gratuite : elle est vraie PARCE QUE `required_status_checks.strict` vaut true,
# ce qui force une branche à être à jour avec `main` avant de fusionner. L'arbre
# fusionné est alors exactement celui que la pull request a testé.
#
# SI CE RÉGLAGE REPASSAIT À FALSE, une fusion pourrait produire un arbre que
# personne n'a jamais testé, et plus rien ne le vérifierait : le déclencheur qui
# l'aurait attrapé a été retiré. La protection sauterait en silence, des mois
# après le changement de réglage, et le lien entre les deux serait perdu.
#
# C'est le motif du garde-fou déclaratif déjà rencontré ici : `engines` n'empêche
# rien sans `engine-strict`. Une condition écrite dans un commentaire n'est pas
# une condition vérifiée.
#
# CE CONTRÔLE NE REMPLACE PAS LA PROTECTION, il constate qu'elle tient. Le
# distinguo compte : il ne peut pas empêcher un push direct, il peut seulement
# dire que le réglage sur lequel un autre choix s'appuie a changé.
#
# OÙ IL CONCLUT VRAIMENT, ET IL FAUT LE SAVOIR POUR NE PAS SE RASSURER À TORT.
# Lire la protection de branche exige la portée `administration: read`, que
# `controles.yml` n'accorde pas : il tourne en `contents: read`, durcissement
# délibéré. En intégration continue, ce script se tait donc et sort en 0.
#
# ÉLARGIR LES DROITS DU JETON POUR LE FAIRE PARLER SERAIT UN MAUVAIS ÉCHANGE :
# on ajouterait une permission d'administration à chaque exécution, y compris sur
# une pull request venue d'ailleurs, pour un contrôle de cohérence. Le risque
# créé dépasserait le risque couvert.
#
# IL CONCLUT DONC EN LOCAL, où le jeton personnel lit tout, et par
# `derive-documentation.yml` qui tourne chaque lundi et ouvre une issue. Une
# dérive de la protection serait vue en une semaine au pire, ce qui est le bon
# ordre de grandeur pour un réglage que personne ne change par accident.
#
# IL VÉRIFIE AUSSI LE NOM DU CONTRÔLE REQUIS. Renommer un job renomme son check,
# et la protection cesse alors d'exiger quoi que ce soit : une pull request
# devient fusionnable SANS AUCUN contrôle vert, sans message d'erreur. Le nom
# attendu est donc confronté à celui que le workflow déclare, les deux venant de
# sources différentes.
#
# Usage : ./scripts/verifier-protection-branche.sh

set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
WORKFLOW="$RACINE/.github/workflows/controles.yml"
DEPOT="krismos64/lune-soleil"

ko=0
verifies=0

signaler() {
  echo "ECHEC $1"
  ko=$((ko + 1))
}

# ---------------------------------------------------------------------------
# SANS `gh` UTILISABLE, LE CONTRÔLE SE TAIT ET SORT EN 0.
#
# Il tourne sur un poste de développement comme en intégration continue, et tous
# n'ont pas de jeton autorisé à lire la protection de branche. Échouer là-dessus
# ferait rougir une chaîne pour une raison sans rapport avec le code, et la
# rougeur serait relâchée plutôt que corrigée.
#
# IL LE DIT PLUTÔT QUE DE PRÉTENDRE AVOIR VÉRIFIÉ. Un contrôle qui sort en 0 en
# silence est indiscernable d'un contrôle qui a réussi, et c'est exactement le
# défaut que ce dépôt refuse ailleurs.
# ---------------------------------------------------------------------------
if ! command -v gh >/dev/null 2>&1; then
  echo "IGNORÉ gh absent, la protection de branche n'a pas été vérifiée."
  exit 0
fi

protection=$(gh api "repos/$DEPOT/branches/main/protection" 2>/dev/null)

if [ -z "$protection" ]; then
  echo "IGNORÉ protection de branche illisible, jeton sans droit d'administration."
  echo "       Ce contrôle n'a rien vérifié, il ne conclut pas que tout va bien."
  exit 0
fi

# ---------------------------------------------------------------------------
# UNE REPONSE PARTIELLE N'EST PAS UNE PROTECTION DESACTIVEE.
#
# MESURE DU 4 SEPTEMBRE 2026, ET C'EST CE SCRIPT QUI S'EST FAIT PRENDRE. Sa
# premiere version testait seulement `[ -z "$protection" ]`. En integration
# continue, le `github.token` par defaut n'a pas le droit d'administration : il
# ne rend pas une reponse VIDE, il rend un objet AMPUTE, sans
# `required_status_checks`. Le script a donc lu « absent » et conclu que `strict`
# valait autre chose que true, faisant echouer la chaine sur une protection qui
# etait pourtant intacte.
#
# En local, avec un jeton personnel, la meme commande rend l'objet complet : le
# defaut ne se voyait pas avant de tourner en CI.
#
# C'est exactement le defaut que ce script pretend eviter, retourne contre
# lui-meme : conclure a partir de ce qu'on n'a pas pu mesurer. Un champ absent
# veut dire « je n'ai pas pu lire », jamais « le reglage est desactive ».
#
# LA PRESENCE DE LA CLE EST DONC TESTEE AVANT SA VALEUR, et par `has` plutot que
# par une comparaison a une chaine : un `null` legitime doit se distinguer d'une
# cle absente.
# ---------------------------------------------------------------------------
if ! printf '%s' "$protection" | jq -e 'has("required_status_checks")' >/dev/null 2>&1; then
  echo "IGNORÉ réponse partielle de l'API, sans « required_status_checks »."
  echo "       Le jeton lit la protection mais pas son détail, cas du jeton par"
  echo "       défaut en intégration continue."
  echo "       Ce contrôle n'a rien vérifié, il ne conclut pas que tout va bien."
  exit 0
fi

# ---------------------------------------------------------------------------
# 1. `strict` : la branche doit être à jour avant fusion.
#
# C'est LA condition qui autorise la chaîne à ne plus se déclencher sur `main`.
# ---------------------------------------------------------------------------
verifies=$((verifies + 1))
strict=$(printf '%s' "$protection" | jq -r '.required_status_checks.strict // "absent"')

if [ "$strict" != "true" ]; then
  signaler "required_status_checks.strict vaut « $strict » et non true.

  La chaîne ne se déclenche plus sur « main » après fusion, LS-176, et cette
  suppression repose ENTIÈREMENT sur ce réglage : sans lui, une fusion peut
  produire un arbre que personne n'a testé.

  Deux corrections possibles, et la mauvaise est plus rapide :
    - remettre strict à true, ce qui rétablit la condition
    - ou remettre « push: branches: [main] » dans controles.yml

  Ne pas neutraliser ce contrôle : il porte le lien entre les deux."
fi

# ---------------------------------------------------------------------------
# 2. Le contrôle requis existe, et son nom est celui que le workflow déclare.
#
# LES DEUX SOURCES SONT DISTINCTES, et c'est ce qui donne sa valeur au contrôle :
# le nom attendu est lu dans le YAML, le nom exigé est lu dans l'API. Les écrire
# tous deux à la main ici ne vérifierait que ma capacité à recopier.
# ---------------------------------------------------------------------------
verifies=$((verifies + 1))

# `name:` du job, deuxième niveau d'indentation sous `jobs:`. La première
# occurrence après `jobs:` est celle du job des contrôles.
nom_declare=$(awk '
  /^jobs:/ { dans_jobs = 1; next }
  dans_jobs && /^    name: / { sub(/^    name: /, ""); print; exit }
' "$WORKFLOW")

if [ -z "$nom_declare" ]; then
  signaler "aucun nom de job lisible dans $WORKFLOW.

  Ce contrôle confronte le nom déclaré par le workflow à celui exigé par la
  protection. Sans le premier, il ne peut rien conclure."
else
  requis=$(printf '%s' "$protection" | jq -r '.required_status_checks.contexts[]?')

  if [ -z "$requis" ]; then
    signaler "la protection de main n'exige AUCUN contrôle.

  Une pull request est donc fusionnable sans qu'aucun contrôle ne soit vert."
  elif ! printf '%s\n' "$requis" | grep -qxF "$nom_declare"; then
    signaler "le contrôle requis ne porte pas le nom du job.

  Exigé par la protection : $(printf '%s' "$requis" | tr '\n' ' ')
  Déclaré par le workflow : $nom_declare

  Un job renommé renomme son check, et la protection cesse alors d'exiger quoi
  que ce soit : la pull request devient fusionnable SANS AUCUN contrôle vert, et
  aucun message ne le signale. Mettre à jour la protection :

    gh api -X PATCH repos/$DEPOT/branches/main/protection/required_status_checks \\
      -f 'contexts[]=$nom_declare'"
  fi
fi

# ---------------------------------------------------------------------------
# 3. `enforce_admins` : la protection s'applique au propriétaire.
#
# Vérifié ici parce que CLAUDE.md et CONTRIBUTING.md l'affirment tous deux, et
# qu'une affirmation non vérifiée s'est déjà périmée sur ce dépôt : un commentaire
# du workflow a décrit enforce_admins à false pendant dix jours après son
# passage à true.
# ---------------------------------------------------------------------------
verifies=$((verifies + 1))
admins=$(printf '%s' "$protection" | jq -r '.enforce_admins.enabled // "absent"')

if [ "$admins" != "true" ]; then
  signaler "enforce_admins vaut « $admins » et non true.

  CLAUDE.md et CONTRIBUTING.md affirment tous deux qu'un push direct sur main est
  refusé « y compris pour le propriétaire ». Cette affirmation est fausse tant
  que ce réglage ne vaut pas true."
fi

echo "Réglages de protection vérifiés : $verifies"

if [ "$ko" -gt 0 ]; then
  echo "ECHEC $ko réglage(s) ne portent plus ce dont la chaîne dépend"
  exit 1
fi

echo "OK la protection de main porte les réglages dont la chaîne dépend"
