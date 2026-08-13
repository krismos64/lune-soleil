#!/bin/bash
# Preuve par mutation de `verifier-registre-traitements.sh`, LS-90 critère 4.
#
# Motif. Un contrôle qui n'a jamais échoué sur le défaut qu'il prétend attraper
# n'est pas un contrôle. Celui-ci sort « OK » sur le dépôt actuel : son vert ne
# prouve rien par lui-même, et sans ce script il serait indistinguable d'un
# contrôle qui ne regarde rien.
#
# Chaque cas injecte un défaut réel, exige que le contrôle rougisse, puis
# restaure. Un cas qui ne fait pas rougir est un trou dans le contrôle.
#
# Usage : ./scripts/verifier-registre-traitements-mutation.sh
# Aucun prérequis, ni Docker ni base.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-registre-traitements.sh"
SCHEMA="prisma/schema.prisma"
REGISTRE="docs/architecture/REGISTRE-DES-TRAITEMENTS.md"

detectes=0
total=0

# Restaure les deux fichiers que les cas touchent. Appelé après chaque cas ET
# par le piège de sortie : une interruption au milieu laisserait sinon le dépôt
# muté, et une modification jamais indexée n'est récupérable nulle part.
restaurer() {
  git checkout "$SCHEMA" "$REGISTRE" 2>/dev/null
}
trap restaurer EXIT

# Vérifie que la mutation a bien modifié le fichier avant de juger le contrôle.
#
# UNE SUBSTITUTION QUI RATE SA CIBLE accuse les tests à tort : le contrôle
# reste vert parce que rien n'a changé, et le cas serait compté « non
# détecté ». Le projet a déjà payé ce défaut plusieurs fois.
muter() {
  local fichier="$1"
  local avant
  avant=$(md5 -q "$fichier" 2>/dev/null || md5sum "$fichier" | awk '{print $1}')
  shift
  "$@"
  local apres
  apres=$(md5 -q "$fichier" 2>/dev/null || md5sum "$fichier" | awk '{print $1}')

  if [ "$avant" = "$apres" ]; then
    echo "MUTATION SANS EFFET sur $fichier, le cas ne teste rien"
    return 1
  fi
  return 0
}

# Joue un cas : la mutation est déjà faite par l'appelant, lance le contrôle,
# exige un échec.
#
# `$CONTROLE` est appelé SANS pipe vers grep. Le pipe vers `grep -q` renvoie
# toujours le code de grep, ce qui avait fait passer sept mutations pour « non
# détectées » à tort sur ce projet.
attendre_echec() {
  local libelle="$1"
  total=$((total + 1))

  if "$CONTROLE" >/dev/null 2>&1; then
    echo "NON DETECTE  $libelle"
  else
    echo "detecte      $libelle"
    detectes=$((detectes + 1))
  fi

  restaurer
}

echo "=== Preuve par mutation du contrôle du registre des traitements ==="
echo

# --- Cas 1 : une table entre au schéma sans entrer au registre -------------
# LE CAS QUE LE TICKET DEMANDE EXPLICITEMENT, critère 4 : « une table qui porte
# une donnée personnelle sans figurer au registre fait échouer ». C'est le
# scénario réel de la story suivante, qui ajoute un modèle et oublie le
# document.
printf '\nmodel NouvelleTablePersonnelle {\n  id String @id @default(uuid())\n  emailContact String\n}\n' >> "$SCHEMA"
attendre_echec "cas 1, table du schéma absente du registre"

# --- Cas 2 : un traitement perd une de ses tables --------------------------
# Le registre cesse de citer `JournalConnexion`, qui reste au schéma. Sans le
# sens 1, retirer une ligne d'un tableau passerait inaperçu.
if muter "$REGISTRE" perl -0pi -e 's/\| Tables \| `JournalConnexion` \|/| Tables | |/' "$REGISTRE"; then
  attendre_echec "cas 2, table du schéma retirée d'un traitement"
else
  total=$((total + 1)); restaurer
fi

# --- Cas 3 : le registre cite une table qui n'existe plus ------------------
# Sens 2. Une table renommée au schéma laisse le registre parler d'un fantôme.
if muter "$REGISTRE" perl -0pi -e 's/`AdresseCarnet`/`CarnetDAdresses`/' "$REGISTRE"; then
  attendre_echec "cas 3, table citée par le registre absente du schéma"
else
  total=$((total + 1)); restaurer
fi

# --- Cas 4 : une table à donnée personnelle rangée hors périmètre ----------
# LE CAS LE PLUS IMPORTANT, sens 3. Les sens 1 et 2 seraient satisfaits en
# rangeant n'importe quelle table dans « sans donnée personnelle » : le
# registre resterait complet en apparence, et faux. C'est le défaut réel commis
# lors de l'écriture de ce registre, sur `MouvementStock`.
if muter "$REGISTRE" perl -0pi -e 's/^(`Categorie`, `Produit`)/`Commande`, $1/m' "$REGISTRE"; then
  attendre_echec "cas 4, table à donnée personnelle déclarée sans donnée personnelle"
else
  total=$((total + 1)); restaurer
fi

# --- Cas 5 : une table citée des deux côtés à la fois ----------------------
# Le registre se contredit. Sans ce cas, une table pourrait être « couverte »
# par le sens 1 tout en étant déclarée hors périmètre, et le sens 3 la jugerait
# sur son mauvais classement sans que la contradiction soit nommée.
if muter "$REGISTRE" perl -0pi -e 's/^(`Categorie`, `Produit`)/`Facture`, $1/m' "$REGISTRE"; then
  attendre_echec "cas 5, table citée en traitement ET hors périmètre"
else
  total=$((total + 1)); restaurer
fi

# --- Cas 6 : la mention de l'adresse IP disparaît --------------------------
# Critère 3 du ticket. Une phrase peut disparaître d'un document sans que rien
# ne le signale.
if muter "$REGISTRE" perl -0pi -e "s/L'adresse IP est une donnée personnelle/L'adresse IP est journalisée/" "$REGISTRE"; then
  attendre_echec "cas 6, l'adresse IP n'est plus dite donnée personnelle"
else
  total=$((total + 1)); restaurer
fi

# --- Cas 7 : le journal des connexions disparaît du registre ---------------
# Critère 3, second volet.
if muter "$REGISTRE" perl -0pi -e 's/JournalConnexion/JournalDesAcces/g' "$REGISTRE"; then
  attendre_echec "cas 7, le journal des connexions ne figure plus au registre"
else
  total=$((total + 1)); restaurer
fi

# --- Cas 8 : le document ne se distingue plus de la politique --------------
# Critère 5. Le registre doit dire ce qu'il n'est pas.
if muter "$REGISTRE" perl -0pi -e 's/politique de confidentialité/politique maison/g' "$REGISTRE"; then
  attendre_echec "cas 8, la distinction avec la politique de confidentialité disparaît"
else
  total=$((total + 1)); restaurer
fi

# --- Cas 9 : la distinction avec les mentions légales disparaît ------------
if muter "$REGISTRE" perl -0pi -e 's/mentions légales/informations du site/g' "$REGISTRE"; then
  attendre_echec "cas 9, la distinction avec les mentions légales disparaît"
else
  total=$((total + 1)); restaurer
fi

# --- Cas 10 : l'ancrage du contrôle est cassé ------------------------------
# La section « Tables sans donnée personnelle » est renommée. Le contrôle ne
# sait alors plus séparer les deux zones, et DOIT le dire plutôt que de
# continuer à vérifier une moitié du document en silence.
#
# Ce cas est celui du garde-fou qui cesse de garder sans changer de couleur,
# rencontré plusieurs fois sur ce projet.
if muter "$REGISTRE" perl -0pi -e 's/^## Tables sans donnée personnelle/## Autres tables/m' "$REGISTRE"; then
  attendre_echec "cas 10, section d'ancrage renommée"
else
  total=$((total + 1)); restaurer
fi

# --- Cas 11 : la forme des tableaux de traitement change -------------------
# Second ancrage. Si la ligne « | Tables | » disparaît, le contrôle ne relève
# plus aucune table de traitement et doit refuser de conclure.
if muter "$REGISTRE" perl -0pi -e 's/^\| Tables \|/| Entités |/mg' "$REGISTRE"; then
  attendre_echec "cas 11, ligne « | Tables | » des tableaux renommée"
else
  total=$((total + 1)); restaurer
fi

# --- Cas 12 : le schéma ne déclare plus aucun modèle -----------------------
# Troisième ancrage, côté schéma. Un contrôle qui relève zéro modèle et sort
# « OK » aurait exactement la couleur du succès sans rien vérifier.
if muter "$SCHEMA" perl -0pi -e 's/^model /modele /mg' "$SCHEMA"; then
  attendre_echec "cas 12, aucun modèle relevable dans le schéma"
else
  total=$((total + 1)); restaurer
fi

# --- Cas 13 : une durée de conservation s'annonce provisoire ---------------
# LE DÉFAUT HISTORIQUE, REJOUÉ À L'IDENTIQUE. Le 12 août 2026, T7 portait
# exactement cette formule : « trois ans après publication, durée retenue par
# ADR non encore rédigé ». Elle contredisait la décision I du modèle conceptuel,
# rendue le 28 juillet, qui posait déjà une conservation indéfinie et motivée.
#
# La contradiction a vécu un jour sans que rien ne la signale, et elle n'a été
# trouvée qu'en cherchant autre chose. Une valeur qui se déclare provisoire dans
# un document de référence n'est relue par personne : c'est l'état transitoire
# écrit au présent, motif rencontré plusieurs fois ici.
if muter "$REGISTRE" perl -0pi -e 's/^\| Conservation \| \*\*sans limite de durée\*\*[^\n]*/| Conservation | **trois ans** après publication, durée retenue par ADR non encore rédigé |/m' "$REGISTRE"; then
  attendre_echec "cas 13, durée de conservation annoncée comme provisoire"
else
  total=$((total + 1)); restaurer
fi

# --- Cas 14 : un traitement perd sa durée de conservation ------------------
# La ligne disparaît, le tableau reste bien formé, et le registre annonce alors
# une durée pour huit traitements sur neuf. Rien ne le signale à la lecture :
# il faut compter pour le voir.
if muter "$REGISTRE" perl -0pi -e 's/^\| Conservation \| \*\*six mois\*\*[^\n]*\n//m' "$REGISTRE"; then
  attendre_echec "cas 14, un traitement sans ligne Conservation"
else
  total=$((total + 1)); restaurer
fi

# --- Cas 15 : l'ancrage du sens 4 est cassé --------------------------------
# Quatrième ancrage. Les titres de traitement renommés, le contrôle relève zéro
# traitement et doit refuser de conclure plutôt que de comparer zéro à neuf.
#
# LA PREMIÈRE VERSION DE CE CAS NE MUTAIT RIEN, et le contrôle passait au vert :
# elle remplaçait « ### T1 » par « ### Traitement 1 », qui commence toujours par
# « ### T ». Le motif compte donc pareil. C'est la mutation sans effet
# observable, et elle accusait le contrôle à tort.
if muter "$REGISTRE" perl -0pi -e 's/^### T(\d)/### Fiche $1/mg' "$REGISTRE"; then
  attendre_echec "cas 15, titres de traitement renommés, ancrage du sens 4"
else
  total=$((total + 1)); restaurer
fi

echo
echo "=== $detectes / $total mutations détectées ==="

if [ "$detectes" -eq "$total" ]; then
  echo "OK le contrôle attrape chacun des défauts qu'il prétend attraper"
  exit 0
fi

echo "ECHEC $((total - detectes)) mutation(s) non détectée(s), le contrôle a un trou"
exit 1
