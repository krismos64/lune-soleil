#!/usr/bin/env bash
# Sauvegarde quotidienne de la base de production. LS-152, ADR-037.
#
# CE QU'IL FERME. `scripts/migrate-production.sh` EXIGE une sauvegarde verifiee
# avant toute migration, et la produit lui-meme. Mais rien ne sauvegardait
# PERIODIQUEMENT : une perte de disque un jour sans migration aurait tout
# emporte. La mesure du 8 septembre 2026 sur la machine a montre pire, aucune
# base n'y etait sauvegardee, celle de SmartPlanning comprise.
#
# OU IL TOURNE : sur l'HOTE, par `lune-soleil-sauvegarde.timer`, et non dans la
# composition. ADR-037 en donne la raison : les moments ou la sauvegarde compte
# le plus sont ceux ou la composition est arretee, un `down` avant
# manipulation ou un retour arriere en cours. Un conteneur de sauvegarde
# s'arreterait avec elle.
#
# POURQUOI `docker exec` ET NON UN `pg_dump` DE L'HOTE. `pg_dump` est ABSENT de
# cette machine et le candidat des depots Ubuntu 24.04 est la version 16,
# verifie le 8 septembre 2026. Un `pg_dump` plus ancien que le serveur REFUSE
# de s'executer contre lui. Le client vit donc dans le conteneur, ou il est par
# construction a la meme version que le serveur.
#
# FORMAT `custom` ET NON DU SQL BRUT, et ce n'est pas un gout : c'est le format
# que `scripts/migrate-production.sh` attend et valide par `pg_restore --list`.
# Un dump en SQL brut passerait le controle de taille et echouerait au controle
# d'integrite, donc bloquerait toute migration.
#
# Usage : ./sauvegarder-base.sh
# Variables lues dans /etc/lune-soleil/production.env

set -euo pipefail

FICHIER_ENV="${FICHIER_ENV:-/etc/lune-soleil/production.env}"
REP_SAUVEGARDE="${BACKUP_DIR:-/var/backups/lune-soleil}"
CONTENEUR="${CONTENEUR_DB:-lune-soleil-db}"

# NOMBRE DE COPIES CONSERVEES, ADR-037.
#
# 14 et non « toutes ». Le disque est PARTAGE avec un produit payant depuis
# ADR-036 et porte deja les medias d'ADR-007, qui croissent sans annonce. Une
# sauvegarde qui s'accumule sans limite est un mecanisme de saturation a
# retardement, et elle arreterait LES DEUX projets un jour ou personne ne
# regarde.
#
# Quatorze jours couvrent le delai de retractation de quatorze jours : toute
# commande encore retractable est presente dans au moins une sauvegarde.
RETENTION="${RETENTION_JOURS:-14}"

echo "Sauvegarde de la base de production, $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ---------------------------------------------------------------------------
# Garde-fous d'entree
#
# CHAQUE ETAPE QUI NE PEUT PAS CONCLURE ARRETE LE SCRIPT. Le projet a deja
# livre un garde-fou qui annoncait « migration additive » devant un DROP TABLE
# parce qu'une etape absorbait son erreur, LS-42. Une sauvegarde qui echoue en
# silence est le meme defaut : le systeme parait protege et ne l'est pas.
# ---------------------------------------------------------------------------

if [ ! -r "$FICHIER_ENV" ]; then
  echo "Arret : $FICHIER_ENV illisible, les identifiants sont introuvables." >&2
  exit 1
fi

# `set -a` exporte automatiquement tout ce qui est defini par le `source`.
# Le fichier n'est JAMAIS affiche : invariant 9, et les journaux de systemd
# sont lisibles par plus de monde que le fichier lui-meme, qui est en 0600.
set -a
# shellcheck disable=SC1090
. "$FICHIER_ENV"
set +a

: "${POSTGRES_USER:?POSTGRES_USER absente de $FICHIER_ENV}"
: "${POSTGRES_DB:?POSTGRES_DB absente de $FICHIER_ENV}"

if ! docker inspect "$CONTENEUR" >/dev/null 2>&1; then
  echo "Arret : le conteneur $CONTENEUR n'existe pas." >&2
  exit 1
fi

# UN CONTENEUR ARRETE NE SE SAUVEGARDE PAS, et le dire est le but. Sans ce
# controle, le `docker exec` echouerait avec un message de Docker plutot
# qu'avec la cause, et un `restart: unless-stopped` peut laisser un conteneur
# arrete apres un `down` manuel.
ETAT=$(docker inspect --format '{{.State.Status}}' "$CONTENEUR")
if [ "$ETAT" != "running" ]; then
  echo "Arret : le conteneur $CONTENEUR est '$ETAT' et non 'running'." >&2
  exit 1
fi

mkdir -p "$REP_SAUVEGARDE"
# 0700 : les dumps contiennent les donnees personnelles des clients, adresses
# et emails compris. Le repertoire est sur une machine PARTAGEE.
chmod 700 "$REP_SAUVEGARDE"

HORODATAGE=$(date -u +%Y%m%d-%H%M%S)
SAUVEGARDE="$REP_SAUVEGARDE/quotidienne-$HORODATAGE.dump"

# ---------------------------------------------------------------------------
# Le dump
#
# ECRIT SUR LA SORTIE STANDARD PUIS REDIRIGE, et non `--file` dans le
# conteneur : le fichier resterait alors DANS le conteneur, donc perdu au
# premier remplacement d'image, ce qui est exactement le contraire du but.
#
# `-i` sans `-t` : pas de pseudo-terminal, qui corromprait un flux binaire en
# y injectant des retours chariot.
# ---------------------------------------------------------------------------

echo "  Dump depuis $CONTENEUR"

# La sortie d'erreur est capturee pour etre affichee en cas d'echec, sans quoi
# `set -e` arreterait le script sans dire pourquoi.
if ! docker exec -i \
  -e PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD absente}" \
  "$CONTENEUR" \
  pg_dump --format=custom --username "$POSTGRES_USER" "$POSTGRES_DB" \
  > "$SAUVEGARDE" 2>"$SAUVEGARDE.err"; then
  echo "Arret : pg_dump a echoue." >&2
  # Le mot de passe voyage par l'environnement du `docker exec` et n'apparait
  # dans aucun message de pg_dump. Cette sortie est donc affichable.
  sed 's/^/  /' "$SAUVEGARDE.err" >&2 || true
  rm -f "$SAUVEGARDE" "$SAUVEGARDE.err"
  exit 1
fi
rm -f "$SAUVEGARDE.err"

# ---------------------------------------------------------------------------
# Verification, TROIS controles et non un seul
#
# LES MEMES QUE `scripts/migrate-production.sh`, deliberement : une sauvegarde
# que ce script accepte doit etre acceptee par lui, sans quoi la routine
# produirait des fichiers que la migration refuserait, et le garde-fou de
# migration bloquerait sans que personne comprenne pourquoi.
# ---------------------------------------------------------------------------

if [ ! -f "$SAUVEGARDE" ]; then
  echo "Arret : la sauvegarde n'a pas ete creee." >&2
  exit 1
fi

TAILLE=$(wc -c < "$SAUVEGARDE" | tr -d ' ')
if [ "$TAILLE" -lt 1024 ]; then
  echo "Arret : sauvegarde suspecte, $TAILLE octets seulement." >&2
  rm -f "$SAUVEGARDE"
  exit 1
fi

# CONTROLE D'INTEGRITE. Une taille non nulle ne prouve rien : un dump
# interrompu a mi-chemin fait plusieurs mega-octets et n'est pas restaurable.
# `pg_restore --list` lit l'en-tete et la table des matieres de l'archive.
#
# IL TOURNE DANS LE CONTENEUR, meme motif que pg_dump : pas de client
# PostgreSQL 18 sur l'hote.
#
# LE FICHIER EST COPIE DANS LE CONTENEUR, ET CE DETOUR EST OBLIGATOIRE.
# `pg_restore --list -` NE LIT PAS l'entree standard, contrairement a la
# convention Unix : il cherche un fichier litteralement nomme « - » et rend
# « could not open input file "-" ». `/dev/stdin` echoue autrement, par
# « did not find magic string in file header », l'archive au format custom
# devant etre NAVIGABLE et non lue en flux.
#
# Mesure du 8 septembre 2026 sur la premiere execution reelle : la version
# precedente de ce script rejetait une sauvegarde PARFAITEMENT VALIDE de
# 92 785 octets. Le defaut ne se voyait pas a la lecture, seule l'execution
# l'a montre, et il aurait fait echouer toutes les sauvegardes en annoncant
# « integrite non verifiee » sur des archives saines.
COPIE_INTERNE="/tmp/verification-$HORODATAGE.dump"
if ! docker cp "$SAUVEGARDE" "$CONTENEUR:$COPIE_INTERNE" >/dev/null 2>&1; then
  echo "Arret : copie de la sauvegarde dans le conteneur impossible." >&2
  rm -f "$SAUVEGARDE"
  exit 1
fi

# La copie interne part dans TOUS les cas, y compris sur les sorties en erreur
# ci-dessous : un conteneur qui accumule des dumps dans /tmp remplit sa couche
# ecrivable, donc le disque PARTAGE.
nettoyer_copie() {
  docker exec "$CONTENEUR" rm -f "$COPIE_INTERNE" >/dev/null 2>&1 || true
}

if ! docker exec "$CONTENEUR" pg_restore --list "$COPIE_INTERNE" >/dev/null 2>&1; then
  echo "Arret : la sauvegarde est illisible, integrite non verifiee." >&2
  nettoyer_copie
  rm -f "$SAUVEGARDE"
  exit 1
fi

NB_OBJETS=$(docker exec "$CONTENEUR" pg_restore --list "$COPIE_INTERNE" 2>/dev/null | grep -c '^[0-9]' || true)
nettoyer_copie

# UNE BASE VIDE N'EST PAS UNE SAUVEGARDE VALIDE. Le jour ou la composition
# pointerait par erreur sur un volume neuf, le dump reussirait, ferait quelques
# kilo-octets et passerait les controles ci-dessus. Le projet a deja rencontre
# ce motif : un controle de cardinalite reste vert sur un contenu faux.
if [ "$NB_OBJETS" -lt 10 ]; then
  echo "Arret : $NB_OBJETS objets seulement, la base semble vide." >&2
  echo "Une sauvegarde d'une base vide effacerait les precedentes par rotation." >&2
  rm -f "$SAUVEGARDE"
  exit 1
fi

chmod 600 "$SAUVEGARDE"

echo "  $SAUVEGARDE"
echo "  $TAILLE octets, $NB_OBJETS objets, integrite verifiee."

# ---------------------------------------------------------------------------
# Les fichiers, ET C'EST ADR-007 QUI L'EXIGE
#
# « Une sauvegarde qui ne prendrait que PostgreSQL restaurerait un catalogue
# dont chaque fiche pointe vers un fichier absent. » Le dump ci-dessus porte
# les lignes `Media`, dont `Media.chemin` ; les fichiers vivent sur le disque.
# Restaurer l'un sans l'autre rend un catalogue de fiches sans photographie.
#
# LES ORIGINAUX SONT SUPPRIMES APRES TRAITEMENT, ADR-007 : une perte du volume
# des medias ne se repare pas en reengendrant les declinaisons, elle impose de
# redemander toutes les photographies a l'exploitante.
#
# LES DOCUMENTS COMPTABLES SONT DANS LA MEME ARCHIVE et pesent bien moins.
# Une facture ne se refabrique PAS, invariant 4 : elle est immuable, et sa
# perte n'a aucune reparation possible.
#
# `tar` LIT LES MONTAGES D'HOTE DIRECTEMENT, sans passer par un conteneur : ce
# sont des repertoires de l'hote, contrairement au volume de la base qui est
# un volume Docker. Une lecture seule, aucun conteneur a lancer.
# ---------------------------------------------------------------------------

MEDIA_RACINE="${MEDIA_RACINE:-/var/lib/lune-soleil/medias}"
DOCUMENTS_RACINE="${DOCUMENTS_RACINE:-/var/lib/lune-soleil/documents}"
ARCHIVE="$REP_SAUVEGARDE/fichiers-$HORODATAGE.tar.gz"

echo "  Archive des fichiers"

for RACINE in "$MEDIA_RACINE" "$DOCUMENTS_RACINE"; do
  if [ ! -d "$RACINE" ]; then
    echo "Arret : $RACINE n'existe pas, les fichiers ne sont pas sauvegardes." >&2
    echo "Le dump de la base seul restaurerait un catalogue sans fichier, ADR-007." >&2
    rm -f "$SAUVEGARDE"
    exit 1
  fi
done

# `-C /` puis des chemins relatifs : tar refuse les chemins absolus et les
# rendrait relatifs avec un avertissement, ce qui ferait diverger l'archive de
# ce que la restauration attend.
if ! tar czf "$ARCHIVE" \
  -C / \
  "${MEDIA_RACINE#/}" \
  "${DOCUMENTS_RACINE#/}" 2>/dev/null; then
  echo "Arret : l'archive des fichiers a echoue." >&2
  rm -f "$SAUVEGARDE" "$ARCHIVE"
  exit 1
fi

# UNE ARCHIVE VIDE EST VALIDE POUR `tar`, et c'est le piege : un `tar` sur des
# repertoires vides produit une archive lisible d'une cinquantaine d'octets.
# Compter les entrees est le seul controle qui distingue « sauvegarde » de
# « fichier ». Meme motif que le compte d'objets du dump ci-dessus.
NB_ENTREES=$(tar tzf "$ARCHIVE" 2>/dev/null | wc -l | tr -d ' ')
TAILLE_ARCHIVE=$(wc -c < "$ARCHIVE" | tr -d ' ')

chmod 600 "$ARCHIVE"

echo "  $ARCHIVE"
echo "  $TAILLE_ARCHIVE octets, $NB_ENTREES entrees."

# Pas d'arret sur un compte faible ici, contrairement au dump : avant la
# premiere photographie de l'exploitante, ces deux arborescences SONT
# legitimement vides. Le compte est affiche pour etre lu, et la bascule en
# echec appartiendra a la supervision de LS-107 quand le catalogue existera.
if [ "$NB_ENTREES" -lt 3 ]; then
  echo "  Note : arborescences quasi vides, normal avant le premier televersement."
fi

# ---------------------------------------------------------------------------
# Rotation
#
# APRES la verification et jamais avant : une sauvegarde ratee ne doit pas
# faire disparaitre une sauvegarde valide de la veille. Les `exit 1` ci-dessus
# sortent tous AVANT ce point.
# ---------------------------------------------------------------------------

# `ls -t` trie par date de modification, le plus recent d'abord ; `tail -n +N`
# saute les N-1 premiers.
#
# LES `pre-migration-*.dump` NE SONT PAS TOUCHES, et c'est delibere :
# `migrate-production.sh` les depose dans le meme repertoire, et ce sont les
# points de retour d'une migration. Une rotation calendaire supprimerait la
# derniere sauvegarde d'avant migration si aucune migration n'a eu lieu depuis
# quatorze jours, donc exactement quand elle est le seul retour possible. Leur
# accumulation est un manque connu, signale a LS-107 qui porte la politique.
#
# LES DEUX FAMILLES TOURNENT ENSEMBLE, dump et archive du meme horodatage :
# les separer ferait diverger leurs profondeurs, et une base restaurable sans
# ses medias ne restaure rien d'utilisable, ADR-007.
rotation() {
  local motif="$1"
  local supprimes=0
  local ancien
  while IFS= read -r ancien; do
    [ -n "$ancien" ] || continue
    rm -f "$REP_SAUVEGARDE/$ancien"
    supprimes=$((supprimes + 1))
  done < <(cd "$REP_SAUVEGARDE" && ls -t $motif 2>/dev/null | tail -n +$((RETENTION + 1)))
  echo "$supprimes"
}

NB_SUPPRIMES_DUMP=$(rotation 'quotidienne-*.dump')
NB_SUPPRIMES_ARCH=$(rotation 'fichiers-*.tar.gz')

NB_CONSERVEES=$(cd "$REP_SAUVEGARDE" && ls quotidienne-*.dump 2>/dev/null | wc -l | tr -d ' ')
echo "  Rotation : $NB_SUPPRIMES_DUMP dump(s) et $NB_SUPPRIMES_ARCH archive(s) supprimes."
echo "  $NB_CONSERVEES jeu(x) conserve(s) sur $RETENTION."

echo "Sauvegarde terminee."
