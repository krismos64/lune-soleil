#!/bin/bash
# PreToolUse hook (Bash) — bloque les commandes qui EXPOSENT un secret a `ps`.
#
# POURQUOI CE HOOK EXISTE, ET CE QUE L'AUTRE NE COUVRE PAS.
#
# `hook-block-secret-files.sh` lit `tool_input.file_path`, un champ que seuls
# Read, Edit et Write renseignent. Une commande Bash n'en a pas : ce hook-la
# sort en 0 sans rien verifier des lors que l'appel passe par Bash.
#
# Les regles `deny` de settings.json portent sur `Read(./.env)` et attrapent
# bien un `cat .env` ou un `grep X .env`, parce que Claude Code reconnait la
# lecture d'un fichier nomme. Elles ne peuvent rien contre une commande qui
# lit `.env` SANS LE NOMMER, et c'est exactement ce qui s'est produit pendant
# LS-72 : `docker compose config` resout les variables du fichier
# d'environnement et les imprime en clair, mot de passe de base compris. Aucun
# garde-fou ne l'a vu, la commande ne nommant aucun fichier interdit.
#
# CE QUE CE HOOK NE PRETEND PAS FAIRE. Il ne peut pas fermer tous les chemins :
# un script quelconque peut lire `.env` et l'afficher, et aucune liste de
# motifs ne couvrira toutes les formulations. Il ferme les chemins CONNUS et
# nommes, ce qui vaut mieux que rien, et sa liste s'allonge quand un nouveau
# chemin se decouvre. Le garde-fou reel reste la regle de conduite : pour
# diagnostiquer, lister les NOMS de variables sans leur contenu.
#
# IL EST UNE COUCHE PARMI D'AUTRES, jamais la seule : les regles `deny` et
# `hook-block-secret-files.sh` couvrent les acces par nom de fichier.
#
# POLITIQUE, REVISEE LE 7 SEPTEMBRE 2026, arbitrage de Christophe.
#
# LA LECTURE D'UN `.env` EST DESORMAIS AUTORISEE, par l'outil Read comme par une
# commande : `cat .env`, `grep X .env` et `docker compose config` passent. La
# politique d'avant les bloquait, elle a ete levee pour que l'assistant voie les
# defauts de configuration au lieu de les deviner.
#
# CE QUI RESTE BLOQUE, ET POURQUOI CE N'EST PAS LA MEME CHOSE : une valeur
# passee en ARGUMENT de commande. Lire une valeur la fait entrer dans
# l'historique de session, ce que Christophe accepte ; la passer en argument la
# rend lisible par TOUT AUTRE UTILISATEUR de la machine via `ps`, ce qui est une
# fuite hors du perimetre de la session. Les deux risques sont distincts, et
# seul le second reste ferme.
#
# Cle privee et certificat restent bloques dans les deux sens, cote fichiers.

set -u
input=$(cat)

# ---------------------------------------------------------------------------
# DEFAUT FERME SUR L'OUTILLAGE, et c'est le premier correctif d'une revue de
# securite automatique passee sur ce fichier.
#
# La premiere version sortait en 0 quand `jq` etait absent ou quand l'entree
# etait malformee : un hook de securite qui echoue OUVERT ne protege rien, et
# son absence de protection serait invisible. Un `jq` manquant est un incident
# d'environnement, pas une autorisation.
# ---------------------------------------------------------------------------
if ! command -v jq >/dev/null 2>&1; then
  echo "Hook BLOCK: jq est absent, ce hook ne peut pas analyser la commande." >&2
  echo "Il refuse plutot que de laisser passer sans avoir verifie." >&2
  exit 2
fi

commande=$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null)

# Une entree sans commande n'est pas une commande a bloquer : c'est un appel
# d'un autre type, ou une charge utile inattendue. Sortir en 0 est correct ici,
# a la difference du cas `jq` absent : il n'y a rien a analyser.
[ -z "$commande" ] && exit 0

# ---------------------------------------------------------------------------
# CE QUI A ETE RETIRE LE 7 SEPTEMBRE 2026, et qui se retrouve dans l'historique
# git si le besoin se represente : trois blocs bloquaient `docker compose
# config`, `printenv` et `env` nus, et la lecture directe d'un fichier
# d'environnement par `cat`, `sed`, `awk` et consorts.
#
# Ils fermaient les chemins par lesquels une VALEUR devenait visible. Cette
# visibilite est desormais assumee : la lever etait le sens de l'arbitrage.
#
# LE SENS QUI SUIT N'EST PAS DU MEME ORDRE et il est conserve pour cela.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# UNE VALEUR DE SECRET PASSEE EN ARGUMENT, LS-156 critere 6.
#
# LE CHEMIN DE COTE QUE CE HOOK NE COUVRAIT PAS. Les motifs ci-dessus arretent
# les commandes qui LISENT un secret ; celui-ci arrete les commandes qui en
# PORTENT un, deja extrait par ailleurs.
#
# Cas reel du 31 aout 2026 : `stripe listen --api-key sk_...` a ete lance avec
# la cle en argument. La valeur devient alors lisible par tout `ps` de la
# machine, et elle est ressortie telle quelle dans la sortie d un `pgrep -fl` en
# fin de seance, donc dans l historique de session. Le hook avait pourtant
# bloque `sed` et `awk` sur le `.env` deux fois le meme jour : son perimetre
# s arretait avant ce chemin.
#
# LA DETECTION PORTE SUR LA FORME DE LA VALEUR, jamais sur le nom de l option ni
# sur la commande. Une liste d options serait perdue d avance, `--api-key`,
# `--token`, `--password`, `-p`, et une liste de commandes le serait aussi : ce
# qui fuit est la VALEUR, quel que soit ce qui la porte.
#
# LES PREFIXES SONT CEUX QUI IDENTIFIENT UN SECRET SANS AMBIGUITE. Un mot de
# passe quelconque n en a pas, et ce hook ne pretend pas le voir : il ferme les
# chemins reconnaissables, ce qui vaut mieux que rien. Meme politique que le
# reste du fichier.
#
# `whsec_` EST INCLUS bien qu il ne soit pas une cle d API : il signe les
# webhooks, donc quiconque le detient peut forger un evenement de paiement
# confirme, ce qui est au moins aussi grave.
# ---------------------------------------------------------------------------
if grep -qE '(sk_live_|sk_test_|rk_live_|rk_test_|whsec_|pk_live_|xoxb-|ghp_|github_pat_)[A-Za-z0-9_-]{8,}' <<<"$commande"; then
  echo "Hook BLOCK: cette commande porte une VALEUR de secret en argument." >&2
  echo "" >&2
  echo "Elle devient lisible par tout ps de la machine, et elle ressort dans" >&2
  echo "un pgrep, un journal de processus ou l historique de session." >&2
  echo "" >&2
  echo "Le chemin sur : laisser le processus lire la valeur lui-meme." >&2
  echo "  stripe listen                      # lit ~/.config/stripe" >&2
  echo "  node --env-file=.env script.mjs    # le processus lit le fichier" >&2
  echo "  UNE_VAR=x commande                 # l environnement, pas argv" >&2
  echo "" >&2
  echo "ATTENTION, la substitution ne protege PAS : --api-key \"\$(cat .env)\"" >&2
  echo "expose autant, le shell developpant la valeur AVANT l execution." >&2
  exit 2
fi

exit 0
