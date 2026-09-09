#!/usr/bin/env bash
#
# Verifie le durcissement SSH de la machine de production. LS-139.
#
# CE QU'IL FERME, ET LE DEFAUT ETAIT REEL. Le 9 septembre 2026, la machine
# acceptait l'authentification PAR MOT DE PASSE, sous 11 210 tentatives
# d'intrusion en vingt-quatre heures, alors qu'un fichier
# `/etc/ssh/sshd_config.d/hardening.conf` ecrit en janvier 2026 annoncait
# `PasswordAuthentication no`.
#
# POURQUOI CE DURCISSEMENT NE S'APPLIQUAIT PAS. SSH retient la PREMIERE valeur
# rencontree, et `Include /etc/ssh/sshd_config.d/*.conf` lit par ordre
# alphabetique : `50-cloud-init.conf` disait `yes` et gagnait sur les deux
# fichiers suivants qui disaient `no`. Un durcissement ecrit, jamais applique,
# pendant huit mois. Motif deja rencontre ici sous « garde-fou declaratif ».
#
# LA LECON QUI JUSTIFIE CE SCRIPT : un fichier de configuration qui contient la
# bonne valeur ne prouve RIEN. Seule la valeur EFFECTIVE compte, celle que
# `sshd -T` calcule apres avoir applique tout l'ordre de lecture.
#
# IL S'EXECUTE SUR LA MACHINE, jamais sur le poste : c'est la configuration de
# production qui est mesuree. Depuis le poste, le lancer par
#   ssh <hote> 'sudo bash -s' < scripts/verifier-durcissement-ssh.sh
#
# Usage : sudo ./verifier-durcissement-ssh.sh

set -uo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Arret : ce controle demande root, sshd -T en a besoin." >&2
  exit 1
fi

if ! command -v sshd >/dev/null 2>&1; then
  echo "Arret : sshd introuvable, ce controle doit tourner sur la machine." >&2
  exit 1
fi

ECHECS=0
SENS=0

# LA VALEUR EFFECTIVE ET NON LE CONTENU DES FICHIERS. `sshd -T` applique
# l'ordre de lecture, les Include et les Match, et rend ce que le demon servira.
# La sortie est mise en minuscules par sshd lui-meme pour les mots-cles.
CONFIG=$(sshd -T 2>/dev/null)

if [ -z "$CONFIG" ]; then
  echo "Arret : sshd -T n'a rien rendu, la configuration est peut-etre invalide." >&2
  exit 1
fi

# attendre <directive> <valeur attendue> <pourquoi>
attendre() {
  local DIRECTIVE="$1" ATTENDU="$2" POURQUOI="$3"
  SENS=$((SENS + 1))

  local OBTENU
  OBTENU=$(printf '%s\n' "$CONFIG" | awk -v d="$DIRECTIVE" '$1==d {print $2; exit}')

  if [ -z "$OBTENU" ]; then
    echo "  ECHEC $DIRECTIVE absente de sshd -T"
    echo "        $POURQUOI"
    ECHECS=$((ECHECS + 1))
    return
  fi

  if [ "$OBTENU" = "$ATTENDU" ]; then
    echo "  OK    $DIRECTIVE $OBTENU"
  else
    echo "  ECHEC $DIRECTIVE vaut '$OBTENU', attendu '$ATTENDU'"
    echo "        $POURQUOI"
    ECHECS=$((ECHECS + 1))
  fi
}

echo "Durcissement SSH, valeurs EFFECTIVES rendues par sshd -T"
echo

# LE SENS QUI A TROUVE LE DEFAUT REEL.
attendre passwordauthentication no \
  "Le compte deploy est dans le groupe docker, donc equivalent root. Un mot de passe devine donne la machine, SmartPlanning compris."

# `keyboard-interactive` est une SECONDE PORTE vers le mot de passe, via PAM.
# La fermer seule ne suffit pas, mais laisser l'autre ouverte annulerait le sens
# precedent : les deux se ferment ensemble ou aucune.
attendre kbdinteractiveauthentication no \
  "Seconde voie vers le mot de passe par PAM. La laisser ouverte annule la fermeture de passwordauthentication."

attendre permitemptypasswords no \
  "Un compte sans mot de passe serait joignable par n'importe qui."

attendre pubkeyauthentication yes \
  "C'est la SEULE voie restante : la fermer couperait tout acces a la machine."

# `without-password` est le nom rendu par sshd -T pour `prohibit-password`.
# Les deux graphies designent le meme comportement, root par cle seulement.
SENS=$((SENS + 1))
ROOT=$(printf '%s\n' "$CONFIG" | awk '$1=="permitrootlogin" {print $2; exit}')
case "$ROOT" in
  without-password | prohibit-password | no)
    echo "  OK    permitrootlogin $ROOT"
    ;;
  *)
    echo "  ECHEC permitrootlogin vaut '$ROOT', attendu prohibit-password ou no"
    echo "        root par mot de passe est la cible la plus attaquee de la machine."
    ECHECS=$((ECHECS + 1))
    ;;
esac

# MaxAuthTries borne le nombre d'essais par connexion. Six est le defaut
# d'OpenSSH ; trois divise par deux le rendement d'une attaque qui rouvre des
# connexions, sans gener un usage normal par cle.
SENS=$((SENS + 1))
TENTATIVES=$(printf '%s\n' "$CONFIG" | awk '$1=="maxauthtries" {print $2; exit}')
if [ -n "$TENTATIVES" ] && [ "$TENTATIVES" -le 3 ] 2>/dev/null; then
  echo "  OK    maxauthtries $TENTATIVES"
else
  echo "  ECHEC maxauthtries vaut '${TENTATIVES:-absent}', attendu 3 ou moins"
  ECHECS=$((ECHECS + 1))
fi

echo

# ---------------------------------------------------------------------------
# LE SENS QUI SURVIT AU REDEMARRAGE.
#
# cloud-init est ACTIF sur cette machine et reecrit `50-cloud-init.conf` a
# partir de sa propre configuration. Corriger le fichier sans poser
# `ssh_pwauth: false` laisserait un durcissement qui tient jusqu'au prochain
# redemarrage, ce qui est pire qu'un durcissement absent : il serait cru acquis.
# ---------------------------------------------------------------------------

SENS=$((SENS + 1))
if ! systemctl is-enabled cloud-init >/dev/null 2>&1; then
  echo "  OK    cloud-init inactif, aucun risque de reecriture"
elif grep -rqE '^\s*ssh_pwauth:\s*(false|0|no)\b' /etc/cloud/cloud.cfg /etc/cloud/cloud.cfg.d/ 2>/dev/null; then
  echo "  OK    cloud-init actif mais ssh_pwauth est fige a false"
else
  echo "  ECHEC cloud-init est actif SANS ssh_pwauth: false"
  echo "        Il reecrira 50-cloud-init.conf au redemarrage et rouvrira le mot de passe."
  ECHECS=$((ECHECS + 1))
fi

# ---------------------------------------------------------------------------
# LE PARE-FEU.
#
# `ufw status` donne une fausse assurance et NE MONTRE PAS les ports publies
# par Docker, qui insere ses regles DNAT en amont. Ce sens verifie la politique
# par defaut, qui est ce qu'ufw garantit reellement ; l'exposition des ports
# applicatifs se mesure DEPUIS L'EXTERIEUR, ce qu'un script sur la machine ne
# peut pas faire. LS-151 porte cette mesure.
# ---------------------------------------------------------------------------

SENS=$((SENS + 1))
if ! command -v ufw >/dev/null 2>&1; then
  echo "  ECHEC ufw absent"
  ECHECS=$((ECHECS + 1))
elif ufw status verbose 2>/dev/null | grep -q 'Default: deny (incoming)'; then
  echo "  OK    ufw actif, politique entrante par defaut deny"
else
  echo "  ECHEC ufw n'est pas en deny par defaut sur les entrees"
  ECHECS=$((ECHECS + 1))
fi

# fail2ban ne FERME rien, il ralentit. Il est verifie parce que son absence
# changerait le profil de risque, pas parce qu'il remplace le durcissement.
SENS=$((SENS + 1))
if systemctl is-active fail2ban >/dev/null 2>&1; then
  echo "  OK    fail2ban actif"
else
  echo "  ECHEC fail2ban inactif"
  ECHECS=$((ECHECS + 1))
fi

echo
if [ "$SENS" -lt 9 ]; then
  echo "ECHEC : $SENS sens joues, 9 attendus. L'ancrage du controle est casse."
  exit 1
fi

if [ "$ECHECS" -eq 0 ]; then
  echo "$SENS sens verifies, aucun ecart."
  exit 0
fi

echo "$SENS sens verifies, $ECHECS ecart(s)."
exit 1
