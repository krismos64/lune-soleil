#!/usr/bin/env bash
# Preuve par mutation de verifier-hook-alertes.sh, LS-257.
#
# CE QUI EST MUTÉ EST LE HOOK, jamais le contrôle : ce qui doit être gardé est
# que le démarrage de session continue de montrer les alertes, et de dire
# quand il n'a pas pu les lire.
#
# LES MUTATIONS VISENT LES FORMES RÉELLEMENT PRÉSENTES dans le hook. La
# troisième pose le défaut que la mise à mort du groupe de processus corrige :
# tuer `gh` seul laisse un descendant tenir le tube, et la borne ne tient plus.
#
# Usage : ./scripts/verifier-hook-alertes-mutation.sh
# Prérequis : jq et perl. Ni réseau, ni gh.

set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CIBLE=".claude/scripts/hook-session-start.sh"
CONTROLE="./scripts/verifier-hook-alertes.sh"

[ -r "$CIBLE" ] || { echo "ECHEC hook introuvable : $CIBLE"; exit 1; }
[ -x "$CONTROLE" ] || { echo "ECHEC contrôle introuvable : $CONTROLE"; exit 1; }

TMP=$(mktemp -d)
SAUVEGARDE="$TMP/hook.sh"
cp "$CIBLE" "$SAUVEGARDE"

restaurer() { cp "$SAUVEGARDE" "$CIBLE"; }

# Nettoyage idempotent puis filet `git checkout`, motifs de LS-230 détaillés
# dans `verifier-ecart-production-mutation.sh`.
DEJA_NETTOYE=0
nettoyer() {
  [ "$DEJA_NETTOYE" -eq 1 ] && return
  DEJA_NETTOYE=1
  restaurer
  git -C "$RACINE" checkout -- "$CIBLE" 2>/dev/null || true
  rm -rf "$TMP"
}
trap nettoyer EXIT
trap 'interrompre_mutation' INT TERM
interrompre_mutation() {
  nettoyer
  echo >&2
  echo "INTERROMPU : les fichiers ont ete restaures." >&2
  exit 130
}

echecs=0
mutations=0

if ! "$CONTROLE" >"$TMP/reference.txt" 2>&1; then
  echo "ECHEC le contrôle n'est pas vert AVANT mutation."
  echo "      Aucune mutation ne peut rien prouver dans cet état."
  echo
  sed 's/^/      /' "$TMP/reference.txt"
  exit 1
fi

echo "Etat de reference : le contrôle est vert"
echo

# Refuse une substitution qui ne change rien : une expression périmée
# accuserait d'aveuglement un contrôle qui voit.
mute() {
  local expression="$1"
  local avant

  avant=$(cksum <"$CIBLE")
  perl -0pi -e "$expression" "$CIBLE"

  if [ "$(cksum <"$CIBLE")" = "$avant" ]; then
    echo "  ECHEC la mutation n'a modifié aucun caractère du hook"
    echo "        L'expression ne correspond plus au fichier : corriger ce"
    echo "        script, pas le contrôle."
    echo "        expression : $expression"
    exit 1
  fi
}

# $1 intitulé, $2 motif attendu dans la sortie du contrôle
cas() {
  local nom="$1" motif_attendu="$2"
  mutations=$((mutations + 1))

  if "$CONTROLE" >"$TMP/sortie.txt" 2>&1; then
    echo "  RATE  $nom -> NON détecté, le contrôle est aveugle"
    echecs=$((echecs + 1))
    restaurer
    return
  fi

  if grep -qF -- "$motif_attendu" "$TMP/sortie.txt"; then
    echo "  OK    $nom -> détecté, et par le cas attendu"
  else
    echo "  RATE  $nom -> échec constaté, mais PAS sur le cas attendu"
    echo "          attendu : $motif_attendu"
    grep "ECHEC" "$TMP/sortie.txt" | head -3 | sed 's/^/            /'
    echecs=$((echecs + 1))
  fi

  restaurer
}

# Cas 1 : les alertes trouvées ne sont plus injectées, l'état d'avant LS-257.
mute 's{elif \[ -n "\$\{alertes\}" \]; then}{elif false; then}'
cas "alertes trouvées mais tues" "ECHEC alerte ouverte"

# Cas 2 : un échec de gh devient silencieux, et se lit comme « aucune alerte ».
mute 's{(then\n)    lignes\+=\(""\)\n    lignes\+=\("ALERTES NON VÉRIFIÉES : gh n.a pas répondu[^\n]*\n[^\n]*\n}{$1    :\n}'
cas "échec de gh passé sous silence" "ECHEC gh en échec"

# Cas 3 : seul gh est tué, pas son groupe. Le descendant tient le tube.
mute 's{kill "KILL", -\$pid}{kill "KILL", \$pid}'
cas "borne qui ne tue que gh" "la borne ne tient pas"

# Cas 4 : plus de borne du tout.
mute 's{alarm \$delai;}{1;}'
cas "borne retirée" "la borne ne tient pas"

# Cas 5 : une étiquette de surveillance oubliée dans la liste.
mute 's{,"ecart-production"}{}'
cas "étiquette ecart-production oubliée" "#512"

# Cas 6 : le filtre disparaît, toute issue passe pour une alerte.
mute 's{\| select\(\$e \| length > 0\)\n}{\n}'
cas "filtre par étiquette retiré" "présent à tort"

echo
echo "-----------------------------------------"
if [ "$echecs" -eq 0 ]; then
  echo "  $mutations mutations, $mutations détectées"
else
  echo "  $mutations mutations, $echecs NON détectées"
fi
echo "-----------------------------------------"

exit "$echecs"
