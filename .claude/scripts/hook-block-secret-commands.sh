#!/bin/bash
# PreToolUse hook (Bash) — bloque les commandes qui IMPRIMENT des secrets.
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
# Politique identique a celle des fichiers, decidee le 27 juillet 2026 :
# l'ecriture dans un `.env` est autorisee, la lecture des valeurs est bloquee.

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

refuser() {
  echo "Hook BLOCK: cette commande imprimerait des valeurs de secrets." >&2
  echo "" >&2
  echo "Motif reconnu : $1" >&2
  echo "" >&2
  echo "Une valeur lue entre dans l'historique de session sur le disque et" >&2
  echo "peut ressortir dans une sortie de commande ou un message d'erreur." >&2
  echo "" >&2
  echo "Pour diagnostiquer, lister les NOMS sans les valeurs :" >&2
  echo "  sed 's/=.*//' .env" >&2
  echo "  docker compose config --services      # sans resolution des valeurs" >&2
  echo "  docker compose config --quiet         # valide sans rien imprimer" >&2
  exit 2
}

# ---------------------------------------------------------------------------
# `docker compose config` imprime le fichier resolu, donc les valeurs du
# `.env`. Les sous-commandes de listage, elles, n'impriment aucune valeur.
#
# LA DETECTION PORTE SUR LES DEUX MOTS ET NON SUR LEUR ENCHAINEMENT EXACT.
# La premiere version exigeait un motif decrivant les options intermediaires,
# et `docker compose --file X config` passait au travers : `--file` n'y
# figurait pas, seul `-f` etait prevu. Une allowlist d'options est perdue
# d'avance, il y en a trop. Chercher `compose` puis `config` dans la meme
# commande accepte quelques faux positifs, ce qui est le bon sens de l'erreur.
# ---------------------------------------------------------------------------
if grep -qE '(docker[[:space:]]+compose|docker-compose)' <<<"$commande" \
  && grep -qE '(^|[[:space:]])config([[:space:]]|$)' <<<"$commande"; then
  if ! grep -qE '\-\-(services|volumes|profiles|images|quiet|hash)' <<<"$commande"; then
    refuser "docker compose config resout et imprime les variables du .env"
  fi
fi

# `printenv`, `env` et `export -p` sans argument deversent tout
# l'environnement, secrets du processus compris.
if grep -qE '(^|[;&|`(][[:space:]]*)(printenv|export[[:space:]]+-p)([[:space:]]*$|[[:space:]]*[;&|)])' <<<"$commande"; then
  refuser "printenv ou export -p imprime tout l'environnement"
fi

# `env` seul, sans commande a executer derriere. `env VAR=x commande` et
# `env -u VAR commande` restent autorises : ils POSENT un environnement, ils
# ne l'impriment pas, et `env -u DATABASE_URL npm run test:unitaire` est la
# commande qui prouve que la suite unitaire tourne sans base.
if grep -qE '(^|[;&|`(][[:space:]]*)env([[:space:]]*$|[[:space:]]*[|;&)])' <<<"$commande"; then
  refuser "env sans argument imprime tout l'environnement"
fi

# ---------------------------------------------------------------------------
# Lecture directe d'un fichier d'environnement par une commande d'affichage.
#
# Les regles `deny` de settings.json couvrent deja ce cas, et ce hook le
# double volontairement : une regle `deny` porte sur un chemin, elle ne voit
# pas `cat ../autre-projet/.env` ni une redirection. Deux couches valent mieux
# qu'une sur un depot public.
#
# `.env.example`, `.env.sample` et `.env.template` sont exclus : ils ne
# portent que des noms et des formats, et la story a besoin de les lire.
# ---------------------------------------------------------------------------
if grep -qE '(^|[;&|`(][[:space:]]*)(cat|less|more|head|tail|bat|xxd|od|strings|source|nl|sed|awk|perl|python3?|ruby|rg|grep|cut|tr|sort|uniq|tee|xargs|\.)[[:space:]]+[^;&|]*\.env([[:space:]]|$|[;&|])' <<<"$commande"; then
  if ! grep -qE '\.env\.(example|sample|template)' <<<"$commande"; then
    # Exception, le diagnostic que ce hook recommande lui-même : une commande
    # qui REMPLACE la valeur pour n'afficher que les noms ne fuite rien.
    # Elle doit rester possible, sans quoi le message de refus conseillerait
    # une commande que le hook refuse à son tour.
    #
    # Le motif exige la substitution du signe égal jusqu'à la fin de ligne,
    # `s/=.*//` sous ses formes usuelles. `sed -n 1p .env` ne la porte pas et
    # reste donc bloqué, ce qui est le cas qui a révélé ce trou : `cat .env`
    # était refusé quand `sed -n 1p .env` passait, mesuré le 14 août 2026 en
    # élargissant les permissions à `Bash(sed:*)`.
    if ! grep -qE 's[/|#]=\.\*[/|#]|cut[[:space:]]+-d.?=.?[[:space:]]+-f[[:space:]]*1' <<<"$commande"; then
      refuser "lecture directe d'un fichier d'environnement"
    fi
  fi
fi

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
