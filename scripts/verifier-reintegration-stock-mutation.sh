#!/bin/bash
# Preuve par mutation de l'etape 9 du parcours 5, LS-173, critere 6.
#
# ---------------------------------------------------------------------------
# CE QUE CE SCRIPT ETABLIT
#
# `CLAUDE.md` l'exige : un controle qui n'a jamais echoue sur le defaut qu'il
# pretend attraper n'est pas un controle. Les tests de LS-173 affirment quatre
# proprietes que rien ne prouvait avant :
#
#   1. la reception N'ECRIT AUCUN mouvement, regle S8, critere 6 explicite du
#      ticket. C'est le test de LS-135 que ce script eprouve en premier
#   2. une piece declaree PERDUE ne remonte pas au stock
#   3. le motif est obligatoire
#   4. la garde de role vit dans la FONCTION, jamais chez son appelee
#
# CE QUI EST MUTE EST LE CODE APPLICATIF, jamais un test. Retirer une assertion
# ferait rougir le test qui la porte sans rien prouver : ce qu'il faut etablir
# est qu'un DEFAUT du produit fait rougir le test qui pretend le garder.
#
# CHAQUE CAS EXIGE LE BON TEST, et pas seulement « la suite rougit ». Un cas
# satisfait par un test voisin validerait une protection qui n'existe pas :
# motif « mutation vue par le mauvais test », en fiche sur ce depot.
#
# LES MUTATIONS VISENT DES DEFAUTS PLAUSIBLES, jamais des formes commodes. La
# premiere est litteralement ce que le ticket redoute : « rendre l'ecriture
# automatique a la reception ». Motif « une mutation ne prouve que sa forme »,
# lecon de LS-193.
#
# Usage : ./scripts/verifier-reintegration-stock-mutation.sh
# Prerequis : Docker, les tests d'integration montant leur base ephemere.
# ---------------------------------------------------------------------------

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

SERVICE="src/services/traitement-retractation.ts"
DEPOT="src/repositories/retractation.ts"
# LA GARDE ELLE-MEME EST MUTABLE, cas 4 : l'affaiblir dans le service exigerait
# d'y importer une fonction absente, et une mutation qui ne compile pas fait
# rougir TOUTE la suite sans rien prouver. Motif « mutation trop brutale ».
AUTORISATION="src/services/autorisation.ts"
MUTABLES=("$SERVICE" "$DEPOT" "$AUTORISATION")

TMP="$(mktemp -d)"
mutations=0
echecs=0

# LES FICHIERS SONT SAUVEGARDES PAR COPIE et non par `git checkout`.
#
# DEUX RAISONS, la seconde ayant deja coute du travail sur ce depot. Une
# restauration qui depend de l'index efface tout travail non commite, motif
# « travail non commite perdu », rencontre deux fois. Et `git checkout` est
# atomique : un seul chemin non suivi fait echouer la commande entiere.
for fichier in "${MUTABLES[@]}"; do
  cp "$fichier" "$TMP/$(basename "$fichier").origine"
done

restaurer() {
  for fichier in "${MUTABLES[@]}"; do
    cp "$TMP/$(basename "$fichier").origine" "$fichier"
  done
}

nettoyer() {
  restaurer
  rm -rf "$TMP"
}
trap nettoyer EXIT INT TERM

# UN SEUL FICHIER DE TEST, et non toute la suite d'integration.
#
# La suite complete depasse sept minutes et monte sa base ephemere a chaque
# passe : six mutations la rendraient inutilisable en boucle d'ecriture. Motif
# « mutation, cas neufs seulement », en fiche.
suite() {
  npx vitest run --project integration \
    tests/integration/traitement-retractation.sequential.test.ts
}

# LA SUITE DOIT ETRE VERTE AVANT TOUTE MUTATION, sans quoi les rouges qui
# suivent ne prouveraient rien : une suite deja cassee rougit sur tout.
echo "Etat de reference, avant toute mutation"
if ! suite >"$TMP/reference.txt" 2>&1; then
  echo "  ECHEC la suite rougit AVANT mutation, le script ne peut pas conclure"
  grep -E '(×|Tests )' "$TMP/reference.txt" | head -10
  exit 1
fi
echo "  OK    la suite est verte"
echo

mute() {
  local fichier="$1" expression="$2"
  perl -0777 -i -pe "$expression" "$fichier"

  # LA MUTATION A-T-ELLE REELLEMENT CHANGE LE FICHIER ?
  #
  # Une substitution qui rate sa cible apres un reformatage laisse la suite
  # VERTE, et le script accuse alors les tests d'etre aveugles. Motif
  # « correction echouee en silence », qui s'est declenche pour de bon le
  # 8 septembre 2026 sur LS-189.
  if cmp -s "$fichier" "$TMP/$(basename "$fichier").origine"; then
    return 1
  fi
  return 0
}

cas() {
  local nom="$1" fichier="$2" expression="$3" motif_attendu="$4"
  # UNE SECONDE MUTATION FACULTATIVE, cas 5 : certaines proprietes reposent sur
  # DEUX filets, et n'en retirer qu'un laisse la suite verte a juste titre.
  local fichier2="${5:-}" expression2="${6:-}"
  mutations=$((mutations + 1))

  if ! mute "$fichier" "$expression"; then
    echo "  RATE  $nom -> la mutation n'a rien change, cible manquee"
    echecs=$((echecs + 1))
    restaurer
    return
  fi

  if [ -n "$fichier2" ] && ! mute "$fichier2" "$expression2"; then
    echo "  RATE  $nom -> la seconde mutation n'a rien change, cible manquee"
    echecs=$((echecs + 1))
    restaurer
    return
  fi

  if suite >"$TMP/sortie.txt" 2>&1; then
    echo "  RATE  $nom -> NON detecte, le test est aveugle"
    echecs=$((echecs + 1))
    restaurer
    return
  fi

  # Les lignes en echec seulement, marquees × par Vitest. Chercher le motif
  # dans toute la sortie confondrait un test en echec avec le meme test passe
  # au vert quelques lignes plus haut.
  local lignes_echec
  lignes_echec=$(grep -E '×' "$TMP/sortie.txt" || true)

  if printf '%s' "$lignes_echec" | grep -qF "$motif_attendu"; then
    echo "  OK    $nom -> detecte par le test attendu"
  else
    echo "  RATE  $nom -> echec constate, mais PAS sur le test attendu"
    echo "          attendu : $motif_attendu"
    printf '%s\n' "$lignes_echec" | head -5 | sed 's/^/          /'
    echecs=$((echecs + 1))
  fi

  restaurer
}

echo "Mutations"

# ---------------------------------------------------------------------------
# CAS 1 : LE CRITERE 6 DU TICKET, MOT POUR MOT.
#
# « Rendre l'ecriture automatique a la reception doit faire rougir le test qui
# verifie qu'aucun mouvement n'est ecrit par `constaterReception`. »
#
# C'est le defaut que S8 interdit : reintegrer sur la seule date de reception
# remettrait au catalogue un bijou revenu casse.
# ---------------------------------------------------------------------------
cas "reception qui reintegre automatiquement le stock, S8" \
  "$SERVICE" \
  's/(const \{ appliquee \} = await horodaterReception\(prisma, \{\n    demandeId,\n    recueA: new Date\(\),\n  \}\);)/$1\n\n  await prisma.mouvementStock.create({\n    data: {\n      varianteId: (await prisma.ligneCommande.findFirstOrThrow({\n        where: { commandeId: demande.commandeId },\n        select: { varianteId: true },\n      })).varianteId,\n      commandeId: demande.commandeId,\n      type: "RETOUR",\n      quantite: 1,\n      origine: "ADMIN",\n    },\n  });/s' \
  "constate la reception sans ecrire le moindre mouvement de stock"

# ---------------------------------------------------------------------------
# CAS 2 : UNE PERTE QUI REINTEGRE QUAND MEME.
#
# LE DEFAUT EST SILENCIEUX AU NOMINAL : la remise en vente continue de marcher,
# seul le cas « piece cassee » devient faux. Un test qui ne couvrirait que la
# remise en vente resterait vert, et une piece brisee retournerait au catalogue.
# ---------------------------------------------------------------------------
cas "perte constatee qui remonte quand meme le stock, S8" \
  "$SERVICE" \
  's/if \(parametres\.etat === "PERTE_CONSTATEE"\) \{\n        return null;\n      \}/if (false) {\n        return null;\n      }/s' \
  "ne remet rien en vente sur une piece declaree perdue ou cassee"

# ---------------------------------------------------------------------------
# CAS 3 : LE MOTIF CESSE D'ETRE OBLIGATOIRE, S14.
#
# Une compensation sans explication est inexploitable en controle : « il manque
# une piece » sans dire pourquoi ne se distingue pas d'une erreur de saisie six
# mois plus tard.
# ---------------------------------------------------------------------------
cas "motif du constat rendu facultatif, S14" \
  "$SERVICE" \
  's/if \(motif\.length === 0\) \{\n    return \{ statut: "MOTIF_REQUIS" \};\n  \}/if (false) {\n    return { statut: "MOTIF_REQUIS" };\n  }/s' \
  "refuse un constat sans motif, et n'ecrit alors rien du tout"

# ---------------------------------------------------------------------------
# CAS 4 : LA GARDE DE ROLE DEVIENT UNE SIMPLE GARDE DE SESSION.
#
# CE CAS EST DISTINCT D'UNE ABSENCE DE GARDE, et c'est ce qui le rend utile.
# `lireIdentite` rend l'identite de TOUT compte connecte, role compris : la
# garde devient « etre connecte » au lieu de « etre administratrice ». Un test
# qui n'exercerait que l'appel SANS session resterait vert sur ce defaut, une
# session cliente passant desormais. Motif « fabriquer la preuve sans le role »,
# en fiche sur ce depot.
# ---------------------------------------------------------------------------
cas "garde de role affaiblie en simple presence de session, invariant 2" \
  "$AUTORISATION" \
  's/if \(!identite \|\| identite\.role !== "ADMINISTRATRICE"\) \{/if (!identite) {/s' \
  "refuse le constat a une session cliente"

# ---------------------------------------------------------------------------
# CAS 5 : LES DEUX FILETS TOMBENT ENSEMBLE, ET C'EST LA SEULE MUTATION QUI
# PROUVE QUELQUE CHOSE ICI.
#
# ------------------------------------------------------------------
# CE QUE LA PREMIERE VERSION DE CE CAS A REVELE, le 8 septembre 2026.
#
# Retirer la SEULE clause conditionnelle du depot laissait la suite VERTE. Le
# script a affiche « le test est aveugle », et le diagnostic etait a moitie
# faux : la protection tient a DEUX filets, et le premier suffisait.
#
#   1. le service LIT `etatPieceRetournee` avant d'ecrire, ligne ~644
#   2. le depot pose `etatPieceRetournee: null` dans son `where`
#
# LE SECOND NE SERT QU'EN CONCURRENCE : deux constats simultanes passent tous
# deux la lecture, et c'est la clause du `where` qui en refuse un. Une suite
# SEQUENTIELLE ne peut donc pas le voir seule, motif « second filet non
# eprouve », deja en fiche sur ce depot.
#
# LA MUTATION RETIRE DONC LES DEUX. Un filet qui reste vert quand on retire son
# jumeau n'est pas prouve par ce script ; ce qui est prouve ici est que la
# propriete « un constat ne se reecrit pas » repose bien sur eux, et sur rien
# d'autre.
# ------------------------------------------------------------------
cas "les deux filets du constat unique retires ensemble" \
  "$DEPOT" \
  's/where: \{ id: parametres\.demandeId, etatPieceRetournee: null \},/where: { id: parametres.demandeId },/s' \
  "refuse un second constat sur une piece deja declaree perdue" \
  "$SERVICE" \
  's/if \(demande\.etatPieceRetournee !== null\) \{\n    return \{ statut: "DEJA_CONSTATE" \};\n  \}/if (false) {\n    return { statut: "DEJA_CONSTATE" };\n  }/s'

# ---------------------------------------------------------------------------
# CAS 6 : UNE SEULE LIGNE COMPENSEE SUR UNE COMMANDE A DEUX BIJOUX.
#
# CE DEFAUT A REELLEMENT EXISTE dans la premiere version du service, qui
# employait `findFirst`. Il est SILENCIEUX sur une commande a un article, cas de
# tous les autres tests de ce fichier : la seconde piece serait restee sortie du
# stock indefiniment, soit exactement le defaut que cette story ferme, reproduit
# a l'interieur d'elle-meme.
#
# LE WEBHOOK ECRIT UN MOUVEMENT PAR LIGNE, sa cle d'idempotence portant
# `(commandeId, varianteId)`. Une commande a deux bijoux porte donc deux ventes
# a compenser.
# ---------------------------------------------------------------------------
cas "une seule ligne compensee sur une commande a deux articles" \
  "$SERVICE" \
  's/const ventes = await tx\.mouvementStock\.findMany\(\{/const ventes = [await tx.mouvementStock.findFirst({/s ; s/(select: \{ id: true, varianteId: true, quantite: true \},\n      \})\);/$1)].filter((v) => v !== null);/s' \
  "reintegre les DEUX pieces d'une commande a deux articles"

# ---------------------------------------------------------------------------
# CAS 7 : LE CONSTAT POSE UN STATUT, regle L12.
#
# C'est le piege que LS-41 a ferme en supprimant `RECUE` : poser un statut ici
# ferait REGRESSER une demande deja `REMBOURSEE`, qui disparaitrait de toute
# liste filtree sur le statut.
# ---------------------------------------------------------------------------
cas "constat qui pose un statut et fait regresser la demande, L12" \
  "$DEPOT" \
  's/    data: \{\n      etatPieceRetournee: parametres\.etat,/    data: {\n      statut: "RETOUR_ATTENDU",\n      etatPieceRetournee: parametres.etat,/s' \
  "constate l'etat sans faire regresser le statut d'une demande REMBOURSEE"

echo
echo "-----------------------------------------"
echo "  $((mutations - echecs)) mutation(s) detectee(s) sur $mutations"
echo "-----------------------------------------"
[ "$echecs" -eq 0 ] || exit 1
