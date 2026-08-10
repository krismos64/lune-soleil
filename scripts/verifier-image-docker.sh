#!/usr/bin/env bash
#
# Controles de l'image de l'application, LS-74.
#
# CE QU'IL REPOND : « l'image que l'on s'apprete a publier est-elle sure et
# conforme ». Il s'execute apres `docker build`, en local comme en integration
# continue, avant toute publication sur GHCR.
#
# LE CONTROLE QUI COMPTE EST LE TROISIEME, l'absence de fichier d'environnement.
# Il ne relit pas le Dockerfile, il OUVRE LES COUCHES. La difference n'est pas
# theorique : une image qui copie un `.env` puis le supprime dans une couche
# ulterieure ne le montre plus dans son systeme de fichiers, et le fichier reste
# extractible par quiconque tire l'image. Mesure sur ce depot le 10 aout 2026,
# une image de mutation l'a confirme. Le depot etant public et l'image partant
# sur un registre, c'est le seul controle qui protege reellement l'invariant 9.
#
# CODE DE SORTIE : 0 si tout passe, 1 sinon. Ne pas enchainer de pipe pour le
# lire, `./verifier-image-docker.sh | tail` rend le code de `tail`. Meme piege
# que `controle-fumee.sh` et que `pipefail` avec `grep -q`, deja rencontre ici.
#
# Usage : ./scripts/verifier-image-docker.sh [image]
#   image : reference a controler, par defaut lune-soleil:verification

set -uo pipefail

IMAGE="${1:-lune-soleil:verification}"

reussites=0
echecs=0

ok() {
  echo "  OK    $1"
  reussites=$((reussites + 1))
}

echouer() {
  echo "  ECHEC $1"
  echecs=$((echecs + 1))
}

# Un controle qui ne peut pas conclure ECHOUE, il ne se saute pas en silence.
# Le projet a deja livre un script qui affichait « migration additive » devant
# un DROP TABLE parce qu'une etape absorbait son erreur.
abandonner() {
  echo "ABANDON : $1"
  echo "Ce script ne peut pas conclure, il refuse de rendre un vert trompeur."
  exit 2
}

command -v docker >/dev/null 2>&1 || abandonner "docker est introuvable."
docker image inspect "$IMAGE" >/dev/null 2>&1 \
  || abandonner "l'image '$IMAGE' n'existe pas. La construire d'abord."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Controles de l'image $IMAGE"
echo

# ---------------------------------------------------------------------------
# 1. L'utilisateur d'execution n'est pas privilegie.
# ---------------------------------------------------------------------------
#
# Lu dans la configuration de l'image et non par `docker run id` : un conteneur
# lance avec `--user` renverrait l'identite passee en ligne de commande, pas
# celle que l'image impose par defaut.
utilisateur=$(docker image inspect "$IMAGE" --format '{{.Config.User}}' 2>/dev/null)
if [ -z "$utilisateur" ] || [ "$utilisateur" = "root" ] || [ "$utilisateur" = "0" ]; then
  echouer "l'image s'execute en root (User='$utilisateur')"
else
  ok "utilisateur non privilegie : $utilisateur"
fi

# ---------------------------------------------------------------------------
# 2. Le controle de sante est declare.
# ---------------------------------------------------------------------------
#
# Sa presence seulement. Qu'il FONCTIONNE se prouve en demarrant l'image contre
# une vraie base, ce que fait `controle-fumee.sh` et non ce script.
if docker image inspect "$IMAGE" --format '{{.Config.Healthcheck}}' 2>/dev/null | grep -q "api/sante"; then
  ok "controle de sante declare, et il vise /api/sante"
else
  echouer "aucun controle de sante declare, ou il ne vise pas /api/sante"
fi

# ---------------------------------------------------------------------------
# 3. Aucun fichier d'environnement dans AUCUNE couche.
# ---------------------------------------------------------------------------
#
# `docker save` rend une archive OCI dont les couches sont des tar compresses
# dans blobs/sha256/. Toutes ne sont pas des couches, l'archive porte aussi des
# manifestes JSON : `tar -tzf` sert de filtre, ce qui ne se lit pas comme un tar
# n'en est pas un.
#
# LE COMPTE DE COUCHES LUES EST VERIFIE. Sans lui, une archive dont le format
# changerait ferait boucler sur zero couche et afficher un vert parfait. Le
# projet a deja vu un controle passer parce qu'il ne regardait rien, et cette
# boucle exacte a rendu « 0 couche » a son premier essai.
docker save "$IMAGE" -o "$TMP/image.tar" 2>/dev/null \
  || abandonner "docker save a echoue sur $IMAGE"
mkdir -p "$TMP/extrait"
tar -xf "$TMP/image.tar" -C "$TMP/extrait" \
  || abandonner "l'archive de l'image est illisible"

# `tar -tf` ET NON `tar -tzf`. La compression des couches n'est pas garantie :
# sur macOS ce depot les voit gzippees, sur le runner Ubuntu elles ne le sont
# pas. `-tzf` echoue alors sur chaque couche, la boucle en compte zero, et le
# garde-fou ci-dessous arrete tout. C'est exactement ce qui est arrive a la
# premiere execution en integration continue : le controle a refuse de conclure
# plutot que d'afficher un vert. `-tf` detecte la compression tout seul.
#
# Le nom des couches est aussi cherche a l'ancien emplacement `layer.tar`, pour
# survivre a un changement de format de `docker save`.
couches_lues=0
couches_fautives=0
while IFS= read -r blob; do
  [ -f "$blob" ] || continue
  listing=$(tar -tf "$blob" 2>/dev/null || true)
  [ -n "$listing" ] || continue
  couches_lues=$((couches_lues + 1))
  # `|| true` obligatoire : `grep` rend 1 sans correspondance, ce qui sous
  # `pipefail` ferait passer la couche pour illisible.
  fautifs=$(printf '%s\n' "$listing" | grep -E '(^|/)\.env' || true)
  if [ -n "$fautifs" ]; then
    echo "        fichier d'environnement dans la couche $(basename "$(dirname "$blob")")/$(basename "$blob" | cut -c1-12)"
    couches_fautives=$((couches_fautives + 1))
  fi
done < <(find "$TMP/extrait" -type f \( -path '*/blobs/*' -o -name 'layer.tar' \))

if [ "$couches_lues" -eq 0 ]; then
  abandonner "aucune couche n'a pu etre lue. Le controle des secrets n'a rien verifie."
elif [ "$couches_fautives" -gt 0 ]; then
  echouer "$couches_fautives couche(s) sur $couches_lues portent un fichier d'environnement"
else
  ok "aucun fichier d'environnement, $couches_lues couches ouvertes et inspectees"
fi

# ---------------------------------------------------------------------------
# 4. Aucun secret dans l'historique de construction.
# ---------------------------------------------------------------------------
#
# Un `ARG` ou un `ENV` portant un secret est restitue par `docker history
# --no-trunc`, meme absent du systeme de fichiers. Le motif exclut la ligne du
# controle de sante, qui cite legitimement une URL interne.
historique=$(docker history --no-trunc --format '{{.CreatedBy}}' "$IMAGE" 2>/dev/null \
  | grep -v "HEALTHCHECK" || true)
if echo "$historique" | grep -qiE "(SECRET|PASSWORD|TOKEN|API_KEY)=[^\"' ]"; then
  echouer "une valeur sensible apparait dans l'historique de construction"
else
  ok "aucune valeur sensible dans l'historique de construction"
fi

# ---------------------------------------------------------------------------
# 5. Les dependances de construction ne sont pas dans l'image finale.
# ---------------------------------------------------------------------------
#
# Mesure sur le nombre de paquets et non sur la taille en octets : la taille
# depend de l'image de base et bougerait a chaque mise a jour de Debian, ce qui
# rendrait le seuil faux sans qu'aucune dependance de trop soit entree.
#
# Le seuil est large a dessein. Il n'attrape pas dix paquets de trop, il attrape
# le cas ou l'etape finale recevrait le `node_modules` complet du poste, qui en
# porte plusieurs centaines.
paquets=$(docker run --rm --entrypoint sh "$IMAGE" -c 'ls /app/node_modules 2>/dev/null | wc -l' 2>/dev/null | tr -d ' ')
if [ -z "$paquets" ]; then
  abandonner "impossible de compter les paquets de l'image"
elif [ "$paquets" -gt 150 ]; then
  echouer "$paquets paquets dans l'image finale, l'etape de construction a fuite"
else
  ok "$paquets paquets dans l'image finale, sans les dependances de construction"
fi

# ---------------------------------------------------------------------------
# 6. Les deux dossiers que la sortie autonome ne trace pas.
# ---------------------------------------------------------------------------
#
# `.next/static` et `public/` ne sont PAS dans `.next/standalone`. Les oublier
# ne fait echouer ni la construction, ni le demarrage, ni le controle de sante :
# l'application sert alors toutes ses pages sans styles ni images. C'est le
# defaut le plus discret de cette image, d'ou un controle dedie.
if docker run --rm --entrypoint sh "$IMAGE" -c 'test -d /app/.next/static' 2>/dev/null; then
  ok ".next/static present, les pages seront servies avec leurs styles"
else
  echouer ".next/static absent : le site se servira sans styles, sans rien casser d'autre"
fi

if docker run --rm --entrypoint sh "$IMAGE" -c 'test -d /app/public' 2>/dev/null; then
  ok "public/ present"
else
  echouer "public/ absent : les fichiers statiques ne seront pas servis"
fi

# ---------------------------------------------------------------------------
# Rapport
# ---------------------------------------------------------------------------

echo
echo "-----------------------------------------"
echo "  $reussites reussite(s), $echecs echec(s)"
echo "-----------------------------------------"

[ "$echecs" -eq 0 ]
