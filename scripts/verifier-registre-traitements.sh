#!/bin/bash
# Confronte le registre des traitements au schéma Prisma, LS-90 critère 4.
#
# Motif. Un registre est une liste écrite à la main, et c'est exactement la
# forme du défaut rencontré trois fois sur ce projet : une énumération qui
# reste verte pendant que le code s'en éloigne. Ajouter une table portant une
# adresse email sans l'inscrire au registre ne fait rougir aucun test, aucun
# type, aucun lint. Le document se périme dès la story suivante, en ayant l'air
# complet.
#
# Ce que ce contrôle confronte, dans LES DEUX SENS :
#
#   1. tout modèle du schéma Prisma est cité par le registre, soit dans un
#      traitement, soit dans la liste des tables sans donnée personnelle
#   2. tout modèle cité par le registre existe encore au schéma
#   3. tout modèle portant un champ personnel DÉTECTABLE est rangé dans un
#      traitement, et non dans la liste des tables sans donnée personnelle
#
# LE SENS 3 EST CELUI QUI PROTÈGE VRAIMENT. Sans lui, les sens 1 et 2 seraient
# satisfaits en rangeant n'importe quelle table dans « sans donnée
# personnelle » : le registre resterait complet en apparence, et faux. Le sens
# 3 relève les champs personnels sur le schéma, jamais sur une liste écrite
# ici, et refuse ce classement.
#
# CE QUE CE CONTRÔLE NE FAIT PAS. Il ne juge ni la finalité, ni la base légale,
# ni la durée de conservation : ce sont des questions de droit, que le projet
# interdit de trancher automatiquement. Elles se vérifient aux sources, et le
# registre porte ses liens.
#
# Usage : ./scripts/verifier-registre-traitements.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
SCHEMA="$RACINE/prisma/schema.prisma"
REGISTRE="$RACINE/docs/architecture/REGISTRE-DES-TRAITEMENTS.md"
ko=0

[ -r "$SCHEMA" ] || { echo "ECHEC schéma Prisma illisible : $SCHEMA"; exit 1; }
[ -r "$REGISTRE" ] || { echo "ECHEC registre illisible : $REGISTRE"; exit 1; }

# ---------------------------------------------------------------------------
# Les modèles du schéma, relevés sur le fichier et jamais recopiés ici.
#
# UNE LISTE ÉCRITE DANS CE SCRIPT SERAIT UNE OPINION, et resterait verte le
# jour où une table entre au schéma sans entrer au registre : précisément le
# trou que ce contrôle ferme.
# ---------------------------------------------------------------------------
modeles=$(grep -oE '^model[[:space:]]+[A-Za-z0-9_]+' "$SCHEMA" | awk '{print $2}' | sort -u)
nombre_modeles=$(printf '%s\n' "$modeles" | grep -c . || true)

if [ "$nombre_modeles" -eq 0 ]; then
  echo "ECHEC aucun modèle relevé dans le schéma : l'ancrage du contrôle est cassé"
  echo "      (la forme des déclarations a changé, le contrôle ne vérifie plus rien)"
  exit 1
fi

echo "Modèles relevés dans le schéma Prisma : $nombre_modeles"

# ---------------------------------------------------------------------------
# Les deux zones du registre.
#
# Un modèle cité dans un traitement est couvert. Un modèle cité dans la section
# « Tables sans donnée personnelle » est déclaré hors périmètre. Les deux zones
# sont lues SÉPARÉMENT : c'est ce qui permet au sens 3 de distinguer un bon
# classement d'un mauvais.
#
# Le découpage s'ancre sur le titre de la section, dont l'absence est traitée
# comme une casse d'ancrage plutôt que comme un registre vide.
# ---------------------------------------------------------------------------
if ! grep -q '^## Tables sans donnée personnelle' "$REGISTRE"; then
  echo "ECHEC section « Tables sans donnée personnelle » introuvable dans le registre"
  echo "      (le titre a changé, le contrôle ne sait plus séparer les deux zones)"
  exit 1
fi

zone_traitements=$(sed -n '/^## Les traitements/,/^## Tables sans donnée personnelle/p' "$REGISTRE")
zone_hors=$(sed -n '/^## Tables sans donnée personnelle/,/^## Mesures de sécurité/p' "$REGISTRE")

if [ -z "$zone_traitements" ]; then
  echo "ECHEC zone des traitements vide : l'ancrage du contrôle est cassé"
  exit 1
fi

# Les noms de modèles sont cités entre accents graves, mais SEULES LES LIGNES
# QUI LISTENT DES TABLES sont lues, et non la zone entière.
#
# La prose des traitements cite `CASCADE`, `SET NULL` ou `Commande.dissocieA`
# entre accents graves, et une lecture large les prendrait pour des noms de
# tables. Le contrôle accusait ainsi le registre de citer une table `CASCADE`
# inexistante : un faux positif qui, laissé en place, aurait appris à ignorer
# la sortie du contrôle.
#
# Dans les traitements, la ligne `| Tables | ... |` du tableau fait foi. Dans
# la zone hors périmètre, les lignes d'énumération, à l'exclusion des
# paragraphes explicatifs qui suivent.
cites_traitements=$(printf '%s\n' "$zone_traitements" \
  | grep -E '^\|[[:space:]]*Tables[[:space:]]*\|' \
  | grep -oE '`[A-Z][A-Za-z0-9_]+`' | tr -d '`' | sort -u)

cites_hors=$(printf '%s\n' "$zone_hors" \
  | grep -E '^`[A-Z]' \
  | grep -oE '`[A-Z][A-Za-z0-9_]+`' | tr -d '`' | sort -u)

if [ -z "$cites_traitements" ]; then
  echo "ECHEC aucune ligne « | Tables | » relevée : l'ancrage du contrôle est cassé"
  echo "      (la forme des tableaux de traitement a changé)"
  exit 1
fi

# ---------------------------------------------------------------------------
# Sens 1 : tout modèle du schéma est cité quelque part dans le registre.
# ---------------------------------------------------------------------------
echo
echo "--- Sens 1 : chaque table du schéma figure au registre ---"

couverts=0
for modele in $modeles; do
  dans_traitement=$(printf '%s\n' "$cites_traitements" | grep -cx "$modele" || true)
  dans_hors=$(printf '%s\n' "$cites_hors" | grep -cx "$modele" || true)

  if [ "$dans_traitement" -eq 0 ] && [ "$dans_hors" -eq 0 ]; then
    echo "ECHEC $modele : table du schéma absente du registre"
    echo "      la ranger dans un traitement, ou dans « Tables sans donnée personnelle »"
    ko=$((ko + 1))
  elif [ "$dans_traitement" -gt 0 ] && [ "$dans_hors" -gt 0 ]; then
    echo "ECHEC $modele : cité À LA FOIS dans un traitement et comme sans donnée personnelle"
    echo "      le registre se contredit, une table relève de l'un ou de l'autre"
    ko=$((ko + 1))
  else
    couverts=$((couverts + 1))
  fi
done

echo "  $couverts modèle(s) correctement rangé(s) sur $nombre_modeles"

# ---------------------------------------------------------------------------
# Sens 2 : tout modèle cité par le registre existe encore au schéma.
#
# Sans ce sens, renommer ou supprimer une table laisserait le registre parler
# d'une table morte, ce qui est la forme documentaire du renvoi cassé.
# ---------------------------------------------------------------------------
echo
echo "--- Sens 2 : chaque table citée existe au schéma ---"

fantomes=0
for cite in $cites_traitements $cites_hors; do
  if ! printf '%s\n' "$modeles" | grep -qx "$cite"; then
    echo "ECHEC $cite : cité par le registre, absent du schéma Prisma"
    echo "      table renommée ou supprimée, le registre doit suivre"
    ko=$((ko + 1))
    fantomes=$((fantomes + 1))
  fi
done

[ "$fantomes" -eq 0 ] && echo "  aucun nom fantôme"

# ---------------------------------------------------------------------------
# Sens 3 : un modèle portant un champ personnel détectable ne peut pas être
# rangé parmi les tables sans donnée personnelle.
#
# LES MOTIFS SONT DES INDICES, PAS UNE DÉFINITION JURIDIQUE. Ils attrapent ce
# qui est mécaniquement visible : une adresse email, un nom de personne, un
# téléphone, une adresse IP, un agent utilisateur, une relation vers
# `Utilisateur`. Un champ personnel nommé autrement échappera à cette liste,
# et c'est assumé : ce contrôle réduit la surface du défaut, il ne prétend pas
# la fermer. La relecture humaine reste requise, le registre le dit.
#
# `nom` seul est volontairement EXCLU des motifs : `Categorie.nom` et
# `Produit.nom` le portent sans désigner personne. Les noms de personnes de ce
# schéma sont `nomClient` et `nomComplet`, tous deux attrapés par le motif
# `nom[A-Z]`.
# ---------------------------------------------------------------------------
echo
echo "--- Sens 3 : aucune table à donnée personnelle rangée hors traitement ---"

MOTIFS='email|Email|telephone|nom[A-Z]|adresseIp|ipAddress|userAgent|agentUtilisateur|destinataire|Utilisateur[[:space:]]*@relation|Utilisateur\?[[:space:]]*@relation'

mal_ranges=0
for modele in $cites_hors; do
  # Le corps du modèle, de sa déclaration à l'accolade fermante en colonne 1.
  corps=$(awk -v m="$modele" '
    $0 ~ "^model[[:space:]]+" m "[[:space:]]*\\{" { dedans = 1; next }
    dedans && /^\}/ { exit }
    dedans { print }
  ' "$SCHEMA")

  # Les commentaires sont retirés avant l'examen : une explication en prose
  # cite souvent « adresse email » sans qu'aucune colonne ne la porte, et le
  # contrôle accuserait alors une table sur son commentaire.
  champs=$(printf '%s\n' "$corps" | sed 's://.*::' | grep -vE '^[[:space:]]*///')

  trouve=$(printf '%s\n' "$champs" | grep -oE "$MOTIFS" | sort -u | tr '\n' ' ')

  if [ -n "$trouve" ]; then
    echo "ECHEC $modele : rangé comme sans donnée personnelle, mais porte : $trouve"
    echo "      le déplacer dans un traitement, ou justifier au registre"
    ko=$((ko + 1))
    mal_ranges=$((mal_ranges + 1))
  fi
done

[ "$mal_ranges" -eq 0 ] && echo "  aucun classement contredit par le schéma"

# ---------------------------------------------------------------------------
# Sens 4 : chaque traitement porte une durée, et aucune ne s'annonce provisoire.
# Ajouté par LS-93, le 13 août 2026.
#
# CE CONTRÔLE NE JUGE PAS DU DROIT, et c'est la limite que le préambule de ce
# script pose : la justesse d'une durée est une question juridique, tranchée par
# un ADR et non par un `grep`. Il vérifie deux propriétés purement mécaniques,
# celles qui manquaient.
#
# PREMIÈRE : un traitement sans ligne « Conservation » ne se voit pas. Le tableau
# reste bien formé, la ligne manque simplement, et le registre annonce alors une
# durée pour huit traitements sur neuf sans que rien ne le dise. La cardinalité
# le rend visible.
#
# SECONDE, ET C'EST ELLE QUI A MANQUÉ : une durée qui s'annonce elle-même comme
# provisoire. Le 12 août 2026, T7 portait « trois ans après publication, durée
# retenue par ADR non encore rédigé ». Cette formule contredisait la décision I
# du modèle conceptuel, rendue le 28 juillet, qui posait déjà une conservation
# indéfinie et motivée. La contradiction a vécu jusqu'au 13 août, trouvée par
# hasard en cherchant autre chose.
#
# Une valeur qui se déclare provisoire dans un document de référence est un état
# transitoire écrit au présent, motif rencontré plusieurs fois sur ce projet :
# personne ne relit le document pour vérifier si le provisoire a été levé. Le
# contrôle refuse donc la formule plutôt que la durée.
# ---------------------------------------------------------------------------
echo
echo "--- Sens 4 : chaque traitement porte une durée, non provisoire ---"

nombre_traitements=$(grep -c '^### T' "$REGISTRE" || true)
nombre_durees=$(grep -c '^| Conservation |' "$REGISTRE" || true)

echo "  traitements : $nombre_traitements, lignes Conservation : $nombre_durees"

if [ "$nombre_traitements" -eq 0 ]; then
  echo "ECHEC aucun traitement relevé dans le registre"
  echo "      l'ancrage du sens 4 est cassé : le format des titres « ### Tn » a changé"
  ko=$((ko + 1))
elif [ "$nombre_durees" -ne "$nombre_traitements" ]; then
  echo "ECHEC $nombre_traitements traitement(s) pour $nombre_durees ligne(s) Conservation"
  echo "      un traitement sans durée de conservation ne se voit pas à la lecture :"
  echo "      le tableau reste bien formé, la ligne manque simplement"
  ko=$((ko + 1))
fi

# Les formules qui trahissent une durée non arbitrée. Cherchées sur la seule
# ligne « Conservation », et non dans tout le document : les sections de prose
# ont le droit de RACONTER qu'une durée fut provisoire, comme celle qui explique
# la correction de T7 juste en dessous du tableau.
provisoires=$(grep '^| Conservation |' "$REGISTRE" \
  | grep -icE 'non encore rédigé|à trancher|à définir|provisoire|en attente|TODO' || true)

if [ "$provisoires" -gt 0 ]; then
  echo "ECHEC $provisoires durée(s) de conservation annoncée(s) comme provisoire(s)"
  echo "      une valeur qui se déclare provisoire dans un document de référence"
  echo "      n'est relue par personne. C'est ainsi que T7 a contredit le modèle"
  echo "      conceptuel pendant un jour. Trancher par un ADR, puis écrire la"
  echo "      décision au présent en citant l'ADR."
  ko=$((ko + 1))
fi

[ "$ko" -eq 0 ] && echo "  chaque traitement porte une durée arbitrée"

# ---------------------------------------------------------------------------
# Le journal des connexions et l'adresse IP, critère 3 de LS-90.
#
# Cette exigence est nommément dans le ticket : le registre doit dire que
# l'adresse IP est une donnée personnelle. Une phrase peut disparaître d'un
# document sans que rien ne le signale.
# ---------------------------------------------------------------------------
echo
echo "--- Mentions exigées par le ticket ---"

if ! grep -q 'JournalConnexion' "$REGISTRE"; then
  echo "ECHEC le journal des connexions ne figure pas au registre, critère 3"
  ko=$((ko + 1))
fi

# Le motif exige la forme affirmative, et non le seul mot « adresse IP » qui
# apparaît dans plusieurs tableaux : le contrôle chercherait sinon sa propre
# satisfaction dans une colonne de catégories de données.
if ! grep -qE "L'adresse IP est une donnée personnelle" "$REGISTRE"; then
  echo "ECHEC le registre n'énonce pas que l'adresse IP est une donnée personnelle, critère 3"
  ko=$((ko + 1))
fi

if ! grep -q 'politique de confidentialité' "$REGISTRE"; then
  echo "ECHEC le registre ne dit pas qu'il ne remplace pas la politique de confidentialité, critère 5"
  ko=$((ko + 1))
fi

if ! grep -q 'mentions légales' "$REGISTRE"; then
  echo "ECHEC le registre ne dit pas qu'il ne remplace pas les mentions légales, critère 5"
  ko=$((ko + 1))
fi

[ "$ko" -eq 0 ] && echo "  les quatre mentions exigées sont présentes"

# ---------------------------------------------------------------------------
echo
if [ "$ko" -eq 0 ]; then
  echo "OK registre cohérent avec le schéma, $nombre_modeles table(s) rangée(s)"
  exit 0
fi

echo "ECHEC $ko anomalie(s)"
exit 1
