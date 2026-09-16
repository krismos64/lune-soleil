#!/bin/bash
# Preuve par mutation du sens « numeros d'etape en doublon » de
# `verifier-config-claude.sh`, LS-202.
#
# Un controle qui n'a jamais echoue sur le defaut qu'il pretend attraper n'est
# pas un controle. Ce script reintroduit le defaut sous plusieurs formes,
# verifie que le controle rougit EN NOMMANT sa cible, puis restaure.
#
# CINQ CAS, dont trois qui ne vont pas de soi :
#
#   1. un doublon franc, le defaut de LS-202 lui-meme
#   2. un doublon dans un AUTRE workflow que `controles.yml`, le critere 1
#      demandant que la portee ne s'y limite pas
#   3. un doublon a TROIS etapes, le compte doit suivre
#   4. deux jobs portant chacun une etape « 1. » ne doivent PAS rougir : ce sont
#      deux sequences independantes, et seule la repetition DANS un job rend un
#      rapport d'echec ambigu
#   5. une etape `bis` ne doit PAS etre confondue avec celle qu'elle prouve :
#      `9c bis` et `9c` sont deux numeros distincts
#
# ---------------------------------------------------------------------------
# CE QUI RESTE OUVERT, LS-204, ET IL FAUT LE DIRE PLUTOT QUE DE LE TAIRE.
#
# Ce script a rougi UNE FOIS en integration continue, sur son cas 5, pendant une
# pull request purement documentaire. La cause exacte n'est PAS identifiee :
# elle ne se reproduit ni localement, ni dans un clone superficiel imitant le
# `fetch-depth: 1` de la CI, ni avec le fichier temoin present.
#
# MESURES FAITES, toutes vertes : 25 executions consecutives du controle,
# 6 executions du script complet dans un clone superficiel, et le controle lance
# pendant que le temoin du cas 4 existe.
#
# CE QUI EST CORRIGE est le seul defaut ETABLI : le rapport lancait le controle
# DEUX fois, et pouvait donc decrire une execution en concluant sur une autre.
# C'est ce qui rendait le diagnostic impossible, la sortie affichant
# « configuration Claude Code cohérente » sous le mot ECHEC.
#
# SI LE CAS 5 ROUGIT A NOUVEAU, sa sortie est desormais celle de l'execution qui
# a reellement echoue, avec son code : elle nommera la cause.
#
# CETTE PROMESSE ETAIT FAUSSE POUR UN TROISIEME APPEL, LS-233, ET LE MEME
# SYMPTOME EST REVENU LE 16 SEPTEMBRE 2026. LS-204 avait corrige les deux
# appels des cas de mutation et laisse celui du TEST DE REFERENCE, qui gardait
# la forme a deux executions. C'est lui qui a rougi sur la PR 444, purement
# documentaire elle aussi, en affichant « cohérente » sous le mot ECHEC.
#
# Les trois appels sont desormais alignes. LA DIVERGENCE ENTRE DEUX EXECUTIONS
# RESTE INEXPLIQUEE : ce qui est ferme est l'impossibilite de la diagnostiquer.
# ---------------------------------------------------------------------------
#
# Usage : ./scripts/verifier-numerotation-etapes-mutation.sh
# Aucun prerequis, ni Docker ni base.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-config-claude.sh"
CIBLE=".github/workflows/controles.yml"
TEMOIN=".github/workflows/temoin-mutation-ls202.yml"

[ -r "$CIBLE" ] || {
  echo "ECHEC fichier illisible : $CIBLE"
  exit 1
}

TMP="$(mktemp -d)"
# UNE INTERRUPTION DOIT SORTIR, PAS SEULEMENT RESTAURER, LS-230.
#
# `trap ... INT TERM` ne fait PAS quitter bash : il execute le gestionnaire,
# puis REPREND le script ou il en etait. Une preuve interrompue restaurait donc
# ses fichiers, puis muait le cas suivant, et le suivant, jusqu'a mourir sur une
# mutation en cours. Mesure le 14 septembre 2026 : le fichier etait sain pendant
# tout le nettoyage, et mute apres.
#
# Ce qui a ete laisse ainsi n'etait pas anodin : `src/lib/auth.ts` sans sa garde
# `input: false`, celle qui empeche un client de se declarer ADMINISTRATRICE, et
# la purge du journal des connexions avec son `lt` inverse en `gt`.
#
# `EXIT` garde le nettoyage de la sortie normale ; `INT TERM` restaure PUIS
# sort, ce qui empeche toute mutation ulterieure.
trap 'rm -rf "$TMP"; rm -f "$TEMOIN"' EXIT
trap 'interrompre_mutation' INT TERM
interrompre_mutation() {
  rm -rf "$TMP"; rm -f "$TEMOIN"
  echo >&2
  echo "INTERROMPU : les fichiers ont ete restaures." >&2
  exit 130
}
cp "$CIBLE" "$TMP/controles.yml"

restaurer() {
  cp "$TMP/controles.yml" "$CIBLE"
  rm -f "$TEMOIN"
}

# L'ETAT DE REFERENCE DOIT ETRE VERT, sans quoi tout « rouge » observe ensuite
# ne prouverait rien : il pourrait venir d'une anomalie preexistante.
#
# ---------------------------------------------------------------------------
# UNE SEULE EXECUTION, ET C'EST LE TROISIEME APPEL QUE LS-204 AVAIT OUBLIE.
#
# Les deux appels des cas de mutation ont ete corriges le 8 septembre 2026,
# commentaire plus bas. CELUI-CI EST RESTE A L'ANCIENNE FORME : un appel pour
# le code de sortie, un second pour l'affichage. L'en-tete du script annoncait
# pourtant que le rapport nommerait desormais la cause.
#
# MESURE DU 16 SEPTEMBRE 2026, en CI sur une pull request purement
# documentaire, PR 444, exactement le cas que LS-204 decrivait comme non
# reproductible :
#
#   etape 9a     ./scripts/verifier-config-claude.sh --strict
#                  configuration Claude Code cohérente
#   etape 9a bis ECHEC l'état de référence est déjà rouge
#                  configuration Claude Code cohérente
#
# La meme commande, verte une seconde plus tot dans l'etape voisine, verte a
# nouveau au second appel de celle-ci, et declaree rouge entre les deux. La
# sortie affichee ne pouvait pas nommer la cause : elle venait d'une AUTRE
# execution que celle qui avait echoue.
#
# CE QUE CETTE CORRECTION APPORTE, et ce qu'elle n'apporte pas : la sortie
# montree est desormais celle qui a reellement echoue, avec son code. La cause
# de la divergence entre deux executions reste ouverte, LS-233, mais un
# prochain rouge la nommera au lieu d'afficher un succes.
#
# ELLE NE CHANGE RIEN QUAND LES DEUX EXECUTIONS S'ACCORDENT, et c'est ce qui a
# rendu le defaut si long a voir : sur un rouge STABLE, un ADR hors table par
# exemple, l'ancienne forme nommait la cause aussi bien. Verifie le
# 16 septembre 2026 en rejouant les deux formes cote a cote.
#
# L'ECART N'APPARAIT QUE SUR UNE DIVERGENCE, mesure le meme jour sur un
# controle temoin rouge puis vert :
#
#   ancienne forme    ECHEC ... / « configuration Claude Code cohérente »
#   nouvelle forme    ECHEC ... / code 1 / la cause reelle, nommee
#
# La premiere ligne est mot pour mot ce que la CI a imprime sur la PR 444.
# ---------------------------------------------------------------------------
sortie_reference="$("$CONTROLE" --strict 2>&1)" && code_reference=0 || code_reference=$?

if [ "$code_reference" -ne 0 ]; then
  echo "ECHEC l'état de référence est déjà rouge, la mutation ne prouverait rien"
  echo "      code de sortie : $code_reference"
  printf '%s\n' "$sortie_reference" | sed 's/^/      /'
  exit 1
fi
echo "État de référence vert."
echo

ko=0
cas=0

attendre_rouge() {
  local titre="$1" motif="$2" sortie code
  cas=$((cas + 1))

  # UNE SEULE EXECUTION, meme motif que `attendre_vert`, LS-204 : la sortie
  # affichee et le code juge doivent venir du MEME appel, sans quoi le rapport
  # peut decrire une execution et conclure sur une autre.
  sortie="$("$CONTROLE" --strict 2>&1)" && code=0 || code=$?

  if [ "$code" -eq 0 ]; then
    echo "  NON DETECTE  $titre"
    echo "               le contrôle reste vert sur le défaut réintroduit"
    ko=1
  elif printf '%s' "$sortie" | grep -q "$motif"; then
    echo "  detecte      $titre"
  else
    echo "  MAL DETECTE  $titre"
    echo "               rouge, mais la sortie ne nomme pas « $motif »"
    printf '%s\n' "$sortie" | sed 's/^/               /'
    ko=1
  fi
  restaurer
}

attendre_vert() {
  local titre="$1" sortie code
  cas=$((cas + 1))

  # ---------------------------------------------------------------------------
  # UNE SEULE EXECUTION, ET C'EST LA CORRECTION DE LS-204.
  #
  # LA VERSION PRECEDENTE LANCAIT LE CONTROLE DEUX FOIS : une pour le code de
  # sortie, une seconde pour afficher sa sortie en cas d'echec. Deux executions
  # d'un controle qui LIT LE DEPOT peuvent diverger, et le rapport devenait
  # alors incomprehensible.
  #
  # MESURE DU 8 SEPTEMBRE 2026, en CI sur une pull request purement
  # documentaire : le cas 5 etait compte en FAUX POSITIF, et la ligne juste en
  # dessous affichait « configuration Claude Code cohérente », c'est-a-dire le
  # verdict de REUSSITE de la seconde execution. Un rapport qui affiche le
  # succes sous le mot ECHEC coute plus cher qu'il ne rapporte.
  #
  # LA SORTIE ET LE CODE VIENNENT DESORMAIS DU MEME APPEL, donc ils ne peuvent
  # plus se contredire. Meme motif que `attendre_rouge` ci-dessus, qui capturait
  # deja sa sortie mais relancait pour le code : les deux sont alignes.
  # ---------------------------------------------------------------------------
  sortie="$("$CONTROLE" --strict 2>&1)" && code=0 || code=$?

  if [ "$code" -eq 0 ]; then
    echo "  detecte      $titre"
  else
    echo "  FAUX POSITIF $titre"
    echo "               le contrôle sort en $code sur un dépôt sain"
    printf '%s\n' "$sortie" | sed 's/^/               /'
    ko=1
  fi
  restaurer
}

# ---------------------------------------------------------------------------
# Cas 1 : un doublon franc.
# ---------------------------------------------------------------------------
perl -pi -e 's{- name: 9f\. Contraste}{- name: 9c. Contraste}' "$CIBLE"
attendre_rouge "1. doublon franc dans controles.yml" "« 9c » sur 2 étapes"

# ---------------------------------------------------------------------------
# Cas 2 : un doublon dans un AUTRE workflow.
#
# La portee ne se limite pas a `controles.yml`, critere 1 de LS-202 : un
# fichier neuf heriterait sinon du desordre sans que rien ne le dise.
# ---------------------------------------------------------------------------
cat > "$TEMOIN" <<'YML'
# Témoin de mutation LS-202, écrit et supprimé par le script.
name: Temoin
on: workflow_dispatch
jobs:
  temoin:
    runs-on: ubuntu-latest
    steps:
      - name: 3a. Une etape
        run: 'true'
      - name: 3a. Une autre etape portant le meme numero
        run: 'true'
YML
attendre_rouge "2. doublon dans un autre workflow" "temoin-mutation-ls202.yml"

# ---------------------------------------------------------------------------
# Cas 3 : un doublon a trois etapes, le compte doit suivre.
#
# `6o` etait porte par TROIS etapes avant LS-179, d'ou ce cas : un controle qui
# dirait « 2 » sur trois etapes minimiserait le desordre.
# ---------------------------------------------------------------------------
perl -pi -e 's{- name: 9f\. Contraste}{- name: 9c. Contraste}' "$CIBLE"
perl -pi -e 's{- name: 9g\. Bordure}{- name: 9c. Bordure}' "$CIBLE"
attendre_rouge "3. doublon à trois étapes, le compte suit" "« 9c » sur 3 étapes"

# ---------------------------------------------------------------------------
# Cas 4 : deux JOBS portant chacun une etape « 1. » ne doivent pas rougir.
#
# CE CAS GARDE LE CONTROLE CONTRE LUI-MEME. Comparer les numeros sans tenir
# compte du job accuserait `nocturne.yml` et `controles.yml` des qu'ils
# porteraient une etape de meme rang, alors que ce sont deux sequences
# independantes et qu'aucun rapport d'echec n'en devient ambigu.
# ---------------------------------------------------------------------------
cat > "$TEMOIN" <<'YML'
# Témoin de mutation LS-202, écrit et supprimé par le script.
name: Temoin
on: workflow_dispatch
jobs:
  premier:
    runs-on: ubuntu-latest
    steps:
      - name: 1. Installation
        run: 'true'
  second:
    runs-on: ubuntu-latest
    steps:
      - name: 1. Installation, sequence independante
        run: 'true'
YML
attendre_vert "4. même numéro dans deux jobs distincts, aucun faux positif"

# ---------------------------------------------------------------------------
# Cas 5 : `9c bis` et `9c` sont deux numeros DISTINCTS.
#
# Une preuve par mutation porte le numero de ce qu'elle prouve, suffixe `bis`.
# Un controle qui tronquerait le suffixe verrait un doublon partout ou cette
# convention est appliquee, c'est-a-dire sur les quatre paires du fichier.
# ---------------------------------------------------------------------------
attendre_vert "5. « 9c bis » ne fait pas doublon avec « 9c »"

echo
echo "-----------------------------------------"
if [ "$ko" -eq 0 ]; then
  echo "  $cas cas sur $cas, le contrôle voit ce qu'il prétend voir"
  echo "-----------------------------------------"
  exit 0
fi
echo "  ECHEC preuve par mutation incomplète"
echo "-----------------------------------------"
exit 1
