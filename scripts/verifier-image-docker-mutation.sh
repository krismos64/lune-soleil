#!/usr/bin/env bash
#
# Preuve par mutation de verifier-image-docker.sh, LS-74.
#
# Chaque cas construit une image PORTANT LE DEFAUT et exige que le controle le
# signale. Un controle qui n'a jamais echoue sur le defaut qu'il pretend
# attraper n'est pas un controle.
#
# LES IMAGES DE MUTATION SONT MINIMALES ET NON DES COPIES DE LA VRAIE.
# Reconstruire l'application sept fois prendrait des minutes pour ne rien
# prouver de plus : ce qui est teste ici est le CONTROLE, pas l'application.
# Chaque image reproduit la forme exacte du defaut, rien d'autre.
#
# PIEGE DEJA PAYE SUR CE DEPOT, et la raison pour laquelle la sortie est
# capturee avant d'etre examinee : `"$CONTROLE" | grep -qi` sous `pipefail`
# renvoie toujours faux, `grep -q` fermant le tuyau des la premiere
# correspondance. Sept mutations avaient ete annoncees non detectees a tort.
#
# Usage : ./scripts/verifier-image-docker-mutation.sh

set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROLE="$RACINE/scripts/verifier-image-docker.sh"
PREFIXE="lune-soleil-mutation"

total=0
detectees=0

TMP=$(mktemp -d)
nettoyer() {
  rm -rf "$TMP"
  for t in $(docker images "$PREFIXE" --format '{{.Repository}}:{{.Tag}}' 2>/dev/null); do
    docker rmi -f "$t" >/dev/null 2>&1
  done
}
trap nettoyer EXIT

command -v docker >/dev/null 2>&1 || {
  echo "ABANDON : docker est introuvable."
  exit 2
}

# Verifie que le controle signale bien le motif attendu sur l'image mutee.
mutation() {
  local nom="$1" tag="$2" motif="$3" sortie
  total=$((total + 1))
  sortie=$("$CONTROLE" "$PREFIXE:$tag" 2>&1 || true)
  if echo "$sortie" | grep -qi "$motif"; then
    echo "  OK    $nom"
    detectees=$((detectees + 1))
  else
    echo "  ECHEC $nom : le controle n'a rien signale"
    echo "$sortie" | sed 's/^/          /' | head -12
  fi
}

echo "Preuve par mutation de verifier-image-docker.sh"
echo

# ---------------------------------------------------------------------------
# 1. Un fichier d'environnement copie puis SUPPRIME dans une couche ulterieure.
# ---------------------------------------------------------------------------
#
# LE CAS QUI JUSTIFIE TOUT LE SCRIPT. Le fichier est absent du systeme de
# fichiers final : `ls`, `find` et une inspection du conteneur en marche le
# declarent propre. Il reste extractible de la couche par quiconque tire
# l'image. Seule l'ouverture des couches le voit.
mkdir -p "$TMP/env"
printf 'SECRET_DE_MUTATION=valeur\n' > "$TMP/env/.env"
cat > "$TMP/env/Dockerfile" <<'EOF'
FROM busybox:1.36
USER nobody
COPY .env /app/.env
USER root
RUN rm -f /app/.env
USER nobody
EOF
docker build -q -t "$PREFIXE:env-supprime" "$TMP/env" >/dev/null 2>&1
mutation "fichier d'environnement dans une couche, supprime ensuite" \
  "env-supprime" "fichier d'environnement"

# ---------------------------------------------------------------------------
# 2. L'image s'execute en root.
# ---------------------------------------------------------------------------
mkdir -p "$TMP/root"
cat > "$TMP/root/Dockerfile" <<'EOF'
FROM busybox:1.36
EOF
docker build -q -t "$PREFIXE:root" "$TMP/root" >/dev/null 2>&1
mutation "image executee en root" "root" "s'execute en root"

# ---------------------------------------------------------------------------
# 3. Aucun controle de sante declare.
# ---------------------------------------------------------------------------
mutation "controle de sante absent" "root" "aucun controle de sante"

# ---------------------------------------------------------------------------
# 4. Un controle de sante qui ne vise pas la sonde applicative.
# ---------------------------------------------------------------------------
#
# Le defaut est plus fin que l'absence : une sonde qui verifie qu'un processus
# ecoute, sans interroger la base, declare saine une application dont la base
# est morte. C'est ce que `/api/sante` existe pour eviter, LS-73.
mkdir -p "$TMP/sonde"
cat > "$TMP/sonde/Dockerfile" <<'EOF'
FROM busybox:1.36
USER nobody
HEALTHCHECK CMD true
EOF
docker build -q -t "$PREFIXE:sonde-faible" "$TMP/sonde" >/dev/null 2>&1
mutation "controle de sante qui ne vise pas /api/sante" \
  "sonde-faible" "ne vise pas /api/sante"

# ---------------------------------------------------------------------------
# 5. Un secret passe en ARG, donc restitue par `docker history`.
# ---------------------------------------------------------------------------
mkdir -p "$TMP/arg"
cat > "$TMP/arg/Dockerfile" <<'EOF'
FROM busybox:1.36
USER nobody
ENV STRIPE_API_KEY=valeur_de_mutation_non_reelle
EOF
docker build -q -t "$PREFIXE:secret-arg" "$TMP/arg" >/dev/null 2>&1
mutation "valeur sensible dans l'historique de construction" \
  "secret-arg" "valeur sensible"

# ---------------------------------------------------------------------------
# 6. Les dependances de construction ont fuite dans l'image finale.
# ---------------------------------------------------------------------------
#
# 200 dossiers, au-dela du seuil de 150. Le seuil vise le `node_modules` complet
# et non dix paquets de trop.
mkdir -p "$TMP/deps"
cat > "$TMP/deps/Dockerfile" <<'EOF'
FROM busybox:1.36
USER root
RUN mkdir -p /app/node_modules && for i in $(seq 1 200); do mkdir -p /app/node_modules/paquet$i; done
USER nobody
EOF
docker build -q -t "$PREFIXE:deps-fuite" "$TMP/deps" >/dev/null 2>&1
mutation "dependances de construction dans l'image finale" \
  "deps-fuite" "l'etape de construction a fuite"

# ---------------------------------------------------------------------------
# 7 et 8. Les deux dossiers que la sortie autonome ne trace pas.
# ---------------------------------------------------------------------------
#
# Le defaut le plus discret de cette image : elle demarre, repond 200 et passe
# son controle de sante en servant des pages sans styles.
mkdir -p "$TMP/statiques"
cat > "$TMP/statiques/Dockerfile" <<'EOF'
FROM busybox:1.36
USER root
RUN mkdir -p /app/public
USER nobody
EOF
docker build -q -t "$PREFIXE:sans-static" "$TMP/statiques" >/dev/null 2>&1
mutation ".next/static oublie dans l'image" "sans-static" "sans styles"

mkdir -p "$TMP/public"
cat > "$TMP/public/Dockerfile" <<'EOF'
FROM busybox:1.36
USER root
RUN mkdir -p /app/.next/static
USER nobody
EOF
docker build -q -t "$PREFIXE:sans-public" "$TMP/public" >/dev/null 2>&1
mutation "public/ oublie dans l'image" "sans-public" "public/ absent"

# ---------------------------------------------------------------------------
# 9. Le controle refuse de conclure sur une image inexistante.
# ---------------------------------------------------------------------------
#
# Un controle qui rend 0 sur une image absente ferait passer pour verte une
# construction qui n'a jamais eu lieu. Il doit sortir en 2, pas en 0.
#
# Ce cas passe par `mutation_code` et non par `mutation` : il n'examine pas un
# message mais un code de sortie. Il incremente les memes compteurs, pour que
# `grep -cE '^mutation'` sur ce fichier rende le nombre reel de cas. Un compte
# annonce par le README qui ne correspondrait pas a l'execution serait le
# defaut que ce projet a deja rencontre deux fois.
mutation_code() {
  local nom="$1" tag="$2" attendu="$3" code
  total=$((total + 1))
  "$CONTROLE" "$PREFIXE:$tag" >/dev/null 2>&1
  code=$?
  if [ "$code" -eq "$attendu" ]; then
    echo "  OK    $nom"
    detectees=$((detectees + 1))
  else
    echo "  ECHEC $nom : code $code au lieu de $attendu"
  fi
}

mutation_code "refus de conclure sur une image inexistante" \
  "cette-image-nexiste-pas" 2

echo
echo "-----------------------------------------"
echo "  $total mutations, $detectees detectees"
echo "-----------------------------------------"

[ "$total" -eq "$detectees" ]
