#!/usr/bin/env bash
# Preuve par mutation de verifier-regles.sh, LS-49 puis LS-88.
#
# Motif. Un controle vert ne prouve rien tant qu'il n'a pas echoue sur le defaut
# reel. Ce script reinjecte les defauts corriges par LS-45, LS-13 et LS-88, et
# exige que verifier-regles.sh echoue a chaque fois.
#
# DEUX SUJETS, ne pas les confondre :
#   - cas 1 a 8, ce qu'une regle DIT : un predicat d'index partiel perime
#   - cas 9 a 12, ou une regle SE DECLENCHE : un dossier de src/ que le paths
#     d'aucune regle ne couvre, defaut trouve le 10 aout 2026 sur src/lib
#
# Il a servi a trouver un angle mort pendant l'ecriture du controle : ancrer sur
# le seul nom d'index ratait database.md, qui ne le nomme jamais et qui est
# pourtant le fichier charge au moment de coder le paiement.
#
# Les fichiers sont restaures par un trap, y compris en cas d'interruption.
#
# Usage : ./scripts/verifier-regles-mutation.sh
# Aucun prerequis, ni Docker ni base.
set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

DB=".claude/rules/database.md"
ML="docs/architecture/MODELE-LOGIQUE.md"
MC="docs/architecture/MODELE-CONCEPTUEL.md"
SEC=".claude/rules/securite.md"

# Dossier temoin cree puis supprime par le cas de couverture, LS-88. Il ne doit
# exister a aucun autre moment : le nom est choisi pour qu'une trace oubliee se
# remarque immediatement.
DOSSIER_TEMOIN="src/dossier-temoin-mutation"
FICHIER_TEMOIN="src/integrations/temoin-mutation.ts"
FICHIER_TEMOIN_SERVICE="src/services/temoin-mutation.ts"
SOCLE=".claude/services-socle-prisma.txt"

for f in "$DB" "$ML" "$MC" "$SEC" "$SOCLE" ./scripts/verifier-regles.sh; do
  [ -r "$f" ] || { echo "ECHEC fichier illisible : $f"; exit 1; }
done

TMP="$(mktemp -d)"
cp "$DB" "$TMP/db.orig"; cp "$ML" "$TMP/ml.orig"; cp "$MC" "$TMP/mc.orig"
cp "$SEC" "$TMP/sec.orig"; cp "$SOCLE" "$TMP/socle.orig"
restaurer() {
  cp "$TMP/db.orig" "$DB"; cp "$TMP/ml.orig" "$ML"; cp "$TMP/mc.orig" "$MC"
  cp "$TMP/sec.orig" "$SEC"; cp "$TMP/socle.orig" "$SOCLE"
  rm -rf "${RACINE:?}/$DOSSIER_TEMOIN"
  rm -f "${RACINE:?}/$FICHIER_TEMOIN"
  rm -f "${RACINE:?}/$FICHIER_TEMOIN_SERVICE"
}
nettoyer() { restaurer; rm -rf "$TMP"; }
trap nettoyer EXIT

echecs=0
total=0
cas() {
  total=$((total+1))
  local nom="$1"
  ./scripts/verifier-regles.sh >"$TMP/sortie.txt" 2>&1
  local code=$?
  if [ "$code" -ne 0 ]; then
    echo "  OK    $nom -> detecte (code $code)"
    grep '  ECHEC' "$TMP/sortie.txt" | sed 's/^/          /'
  else
    echo "  RATE  $nom -> NON detecte, le controle est aveugle"
    echecs=$((echecs+1))
  fi
  restaurer
}

echo "Preuve par mutation de verifier-regles.sh, predicats puis couverture"
echo

# Cas 1 : le defaut exact de LS-45, dans la regle chargee au moment de coder.
perl -0pi -e "s/WHERE statut IN \('REUSSI',\n *'PARTIELLEMENT_REMBOURSE',\n *'REMBOURSE'\)/WHERE statut = 'REUSSI'/" "$DB"
cas "database.md, filtre paiement reduit a REUSSI"

# Cas 2 : le meme defaut dans le modele logique.
perl -pi -e "s/\`statut IN \('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE'\)\`/\`statut = 'REUSSI'\`/" "$ML"
cas "MODELE-LOGIQUE.md, filtre paiement reduit a REUSSI"

# Cas 3 : un seul etat retire, l'erreur la plus discrete.
perl -0pi -e "s/'PARTIELLEMENT_REMBOURSE',\n *'REMBOURSE'\)/'PARTIELLEMENT_REMBOURSE')/" "$DB"
cas "database.md, REMBOURSE seul retire"

# Cas 4 : la cle email, RECONCILIATION retiree. C'est le second chemin de la
# decision D : sans lui, un webhook tardif renvoie une confirmation.
perl -pi -e "s/AND origine IN \('SYSTEME','RECONCILIATION'\)/AND origine IN ('SYSTEME')/" "$DB"
cas "database.md, RECONCILIATION retiree du filtre email"

# Cas 5 : l'index administratrice, sur un autre fichier encore.
perl -pi -e "s/\`role = 'ADMINISTRATRICE'\`/\`role = 'CLIENT'\`/" "$ML"
cas "MODELE-LOGIQUE.md, filtre administratrice fausse"

# Cas 6 : la meme valeur sans apostrophes, forme de la regle V14 du modele
# conceptuel. Exiger les apostrophes laissait passer le predicat perime dans le
# document le plus structurant. Trouve apres coup, d'ou ce cas.
perl -pi -e "s/statut IN \('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE'\)\`, voir/statut = REUSSI\`, voir/" "$MC"
cas "MODELE-CONCEPTUEL.md, V14 sans apostrophes"

# Cas 7 et 8 : le tableau des quatre cles d'idempotence et le recapitulatif des
# unicites partielles. Ces deux lignes ecrivent `paiement (commandeId)` sans
# nommer l'index ni le mot UNIQUE : une quatrieme forme, qui echappait aux trois
# ancres de la version precedente. Le controle etait vert alors que les deux
# lignes portaient encore le predicat perime.
#
# Trouves par un rapport externe apres cloture de LS-49, pas par ce script :
# une mutation ne prouve que ce qu'elle mute, elle ne devine pas les formes
# d'ecriture que personne n'a pensees.
perl -pi -e "s/^\| paiement confirmé \| \`paiement \(commandeId\)\` filtré sur \`statut IN \('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE'\)\`/| paiement confirmé | \`paiement (commandeId)\` filtré sur \`statut = REUSSI\`/" "$MC"
cas "MODELE-CONCEPTUEL.md, tableau des quatre cles d'idempotence"

perl -pi -e "s/^\| \`paiement \(commandeId\)\` \| \`statut IN \('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE'\)\`/| \`paiement (commandeId)\` | \`statut = REUSSI\`/" "$MC"
cas "MODELE-CONCEPTUEL.md, recapitulatif des unicites partielles"
# Cas 8bis : DEUX INDEX PARTIELS SUR LA MEME TABLE, LS-106.
#
# `mouvement_stock` est la premiere table du projet a en porter deux,
# `mouvement_vente_web_unique` et `mouvement_compense_unique`. L'ancre sur la
# table les confondait : documenter la compensation faisait reclamer `VENTE_WEB`
# a un bloc dont le predicat n'a rien a voir, et le controle criait sur du texte
# juste. Le controle ignore desormais un bloc qui nomme un AUTRE index sans
# nommer celui en cours.
#
# CE CAS PROUVE QUE CET AFFINAGE N'A PAS RENDU L'AUTRE BLOC INVISIBLE. Il mute
# le predicat de la VENTE WEB, sur cette meme table a deux index.
#
# POURQUOI PAS MUTER LA COMPENSATION. Remplacer son predicat par
# `type = 'VENTE_WEB'` produit un texte que ce controle ne PEUT PAS distinguer :
# il verifie que les valeurs ATTENDUES sont citees, et `VENTE_WEB` est justement
# celle qu'il attend pour l'autre index. Une mutation indetectable par
# construction n'accuse pas le controle, elle accuse son auteur.
perl -pi -e "s/\(commande_id, variante_id\) WHERE type = 'VENTE_WEB'/(commande_id, variante_id) WHERE type = 'RETOUR'/" "$DB"
cas "database.md, filtre de la vente web fausse sur une table a deux index"

# ---------------------------------------------------------------------------
# Cas 9 a 12 : la couverture des dossiers de src/, LS-88.
#
# Le controle precedent verifie ce qu'une regle DIT. Ceux-ci verifient qu'une
# regle se declenche la ou il faut. Le defaut reel : le 10 aout 2026, editer
# src/lib/auth.ts ne chargeait aucune regle, alors que ce fichier porte le
# secret de signature et l'attribut Secure du cookie.
# ---------------------------------------------------------------------------

# Cas 9 : le defaut exact de LS-88, src/lib sans regle. C'est le critere
# d'acceptation 5 du ticket, « retirer un paths le fait rougir ».
perl -pi -e 's|^  - "src/lib/\*\*/\*\.ts"$|  - "src/lib-inexistant/**/*.ts"|' "$SEC"
cas "securite.md, paths de src/lib retire"

# Cas 10 : le second ecart du ticket, src/integrations/email sans regle.
perl -pi -e 's|^  - "src/integrations/email/\*\*/\*\.ts"$|  - "src/integrations/email-inexistant/**/*.ts"|' "$SEC"
cas "securite.md, paths de src/integrations/email retire"

# Cas 11 : un dossier NEUF, non couvert. C'est le cas que le ticket vise en
# ecrivant « sans lui, le meme ecart se reformera a la prochaine creation de
# dossier ». Il mute l'ARBORESCENCE et non un fichier : sans lui, une liste de
# dossiers ecrite a la main resterait verte ici.
mkdir -p "$DOSSIER_TEMOIN"
cas "un dossier neuf de src/ sans regle"

# Cas 12 : un fichier pose A LA RACINE d'un dossier qui n'etait couvert que par
# ses descendants. src/integrations ne porte que le sous-dossier email/, couvert :
# le parent passait donc pour couvert alors qu'un fichier pose a sa racine
# n'entrerait dans le paths d'aucune regle.
echo "export const temoin = 1;" > "$FICHIER_TEMOIN"
cas "un fichier a la racine d'un dossier couvert par ses seuls descendants"
rm -f "$FICHIER_TEMOIN"

# ---------------------------------------------------------------------------
# Cas 13 et 14 : la frontiere Prisma des services, LS-158.
#
# Le defaut reel : six services appelaient un modele directement quand le
# fichier de garde envoyait toute requete dans repositories/, et rien ne le
# voyait. L'arbitrage retient trois derogations de socle, et le controle tient
# les deux sens, comme celui des actions sensibles.
# ---------------------------------------------------------------------------

# Cas 13 : un service hors liste appelle un modele. Le temoin est un fichier
# NEUF, cree puis supprime : muter un vrai service laisserait un defaut de
# frontiere sur le disque si le script s'interrompait ici.
echo "export const temoin = () => prisma.utilisateur.findMany();" > "$FICHIER_TEMOIN_SERVICE"
cas "un service hors socle appelle un modele Prisma directement"
rm -f "$FICHIER_TEMOIN_SERVICE"

# Cas 14 : une derogation perimee, citant un service qui n'appelle plus aucun
# modele. Une liste qui ne se confronte qu'au sens 1 grossirait sans jamais
# maigrir, et chaque ligne morte affaiblirait la frontiere qu'elle pretend
# encadrer. sante.ts est choisi parce qu'il n'appelle que $queryRaw, hors motif.
printf 'src/services/sante.ts\tderogation de mutation\n' >> "$SOCLE"
cas "une derogation de socle perimee, service sans appel de modele"

echo
echo "-----------------------------------------"
if [ "$echecs" -eq 0 ]; then
  # Le compte est CALCULE et non ecrit en dur : trois comptes de ce depot ont
  # deja derive apres l'ajout d'un cas que personne n'a reporte.
  echo "  $total mutations, $total detectees"
else
  echo "  $echecs mutation(s) non detectee(s) sur $total"
fi
echo "-----------------------------------------"
[ "$echecs" -eq 0 ]
