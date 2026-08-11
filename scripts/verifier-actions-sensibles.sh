#!/bin/bash
# Vérifie qu'aucune action déclarée sensible n'échappe à la réauthentification,
# LS-81, ADR-027 décision 3.
#
# Motif. La liste des actions sensibles est écrite à la main, et c'est
# exactement la forme du défaut rencontré trois fois sur ce projet : un drapeau
# ajouté sans être porté dans toutes les conditions d'accès. Si une action
# sensible est oubliée, rien n'échoue, aucun test ne rougit, et le trou reste
# invisible jusqu'à ce qu'il serve.
#
# Ce que ce contrôle confronte, dans LES DEUX SENS :
#
#   1. toute action marquée `@sensible` dans `src/` appelle bien
#      `exigerReauthentificationRecente`
#   2. la famille qu'elle déclare existe dans le type `FamilleActionSensible`
#   3. toute famille du type est effectivement citée par au moins une action,
#      ou explicitement déclarée en attente d'implémentation
#
# LE SENS 3 EXISTE PARCE QU'UN CONTRÔLE À SENS UNIQUE MENT PAR OMISSION. Sans
# lui, supprimer la dernière action d'une famille laisserait le contrôle vert :
# zéro action à vérifier, zéro échec. La protection aurait disparu sans bruit.
#
# Usage : ./scripts/verifier-actions-sensibles.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$RACINE/src"
SERVICE="$RACINE/src/services/reauthentification.ts"
ATTENTE="$RACINE/.claude/familles-sans-action.txt"
ko=0
verifiees=0

[ -r "$SERVICE" ] || { echo "ECHEC service de réauthentification illisible : $SERVICE"; exit 1; }
[ -d "$SOURCE" ] || { echo "ECHEC dossier source introuvable : $SOURCE"; exit 1; }

# ---------------------------------------------------------------------------
# Les familles déclarées, relevées dans le type et jamais recopiées ici.
#
# UNE LISTE ÉCRITE DANS CE SCRIPT SERAIT UNE OPINION. Elle resterait verte le
# jour où quelqu'un ajoute une cinquième famille au type sans lui donner de
# garde, ce qui est précisément le trou que ce contrôle ferme.
# ---------------------------------------------------------------------------
familles_declarees=$(
  sed -n '/^export type FamilleActionSensible =/,/;$/p' "$SERVICE" \
    | grep -oE '"[A-Z_]+"' \
    | tr -d '"' \
    | sort -u
)

nombre_familles=$(printf '%s\n' "$familles_declarees" | grep -c . || true)

if [ "$nombre_familles" -eq 0 ]; then
  echo "ECHEC aucune famille relevée dans FamilleActionSensible : l'ancrage du contrôle est cassé"
  echo "      (le type a été renommé ou sa forme a changé, le contrôle ne vérifie plus rien)"
  exit 1
fi

echo "Familles déclarées dans FamilleActionSensible : $nombre_familles"

# ---------------------------------------------------------------------------
# Sens 1 et 2 : chaque action marquée `@sensible` porte sa garde.
#
# La marque est un commentaire `@sensible FAMILLE` posé sur la fonction. Le
# contrôle relève le fichier et la famille, puis exige l'appel dans ce fichier.
# ---------------------------------------------------------------------------
familles_couvertes=""

while IFS= read -r occurrence; do
  [ -n "$occurrence" ] || continue

  fichier="${occurrence%%:*}"
  famille=$(printf '%s' "$occurrence" | grep -oE '@sensible[[:space:]]+[A-Z_]+' | awk '{print $2}')
  verifiees=$((verifiees + 1))

  if [ -z "$famille" ]; then
    echo "ECHEC $fichier : marque @sensible sans famille"
    echo "      forme attendue : @sensible NOM_DE_FAMILLE"
    ko=$((ko + 1))
    continue
  fi

  # La famille citée doit exister dans le type. Une faute de frappe créerait
  # sinon une famille fantôme, protégée par personne.
  if ! printf '%s\n' "$familles_declarees" | grep -qx "$famille"; then
    echo "ECHEC $fichier : famille inconnue « $famille »"
    echo "      familles déclarées : $(printf '%s' "$familles_declarees" | tr '\n' ' ')"
    ko=$((ko + 1))
    continue
  fi

  # Le point décisif : la garde est-elle APPELÉE dans ce fichier.
  #
  # LE MOTIF EXIGE LA PARENTHÈSE OUVRANTE, et ce détail est le fruit d'un vrai
  # faux négatif rencontré en écrivant la preuve par mutation. Un simple
  # `grep exigerReauthentificationRecente` était satisfait par un commentaire
  # disant « aucun appel à exigerReauthentificationRecente ici » : le contrôle
  # trouvait le nom dans la phrase qui affirme son absence, et déclarait
  # l'action gardée. Même motif que le hook de secrets qui bloquait sa propre
  # explication.
  #
  # Les lignes de commentaire sont écartées d'abord, pour qu'une mention en
  # prose ne puisse jamais valoir preuve d'appel.
  if ! grep -v '^\s*\(//\|\*\|/\*\)' "$fichier" \
       | grep -qE 'exigerReauthentificationRecente[[:space:]]*\('; then
    echo "ECHEC $fichier : action @sensible $famille sans appel à exigerReauthentificationRecente"
    echo "      une action sensible non gardée s'exécute sur simple session ouverte"
    ko=$((ko + 1))
    continue
  fi

  familles_couvertes="$familles_couvertes$famille"$'\n'
done <<EOF
$(grep -rn "@sensible" "$SOURCE" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "reauthentification.ts" || true)
EOF

# ---------------------------------------------------------------------------
# Sens 3 : toute famille déclarée est couverte, ou explicitement en attente.
#
# LE FICHIER D'ATTENTE EST LA PARTIE QUI DEMANDE DE LA RIGUEUR. Il existe parce
# que LS-81 pose le mécanisme avant que les écrans existent : les quatre
# familles sont vraies et aucune n'a encore d'action à garder. Sans lui, le
# contrôle échouerait dès sa création, donc serait désactivé, donc ne
# protégerait rien.
#
# Il porte son propre risque, et c'est pourquoi il est nommé et daté : une
# famille qu'on y laisse est une famille non protégée. Le retrait d'une ligne
# est le geste qui accompagne l'écriture de la première action de sa famille.
# ---------------------------------------------------------------------------
familles_en_attente=""
if [ -r "$ATTENTE" ]; then
  familles_en_attente=$(grep -oE '^[A-Z_]+' "$ATTENTE" | sort -u || true)
fi

for famille in $familles_declarees; do
  if printf '%s\n' "$familles_couvertes" | grep -qx "$famille"; then
    continue
  fi

  if printf '%s\n' "$familles_en_attente" | grep -qx "$famille"; then
    echo "EN ATTENTE $famille : aucune action de cette famille n'existe encore"
    continue
  fi

  echo "ECHEC famille $famille déclarée mais couverte par aucune action"
  echo "      soit une action a perdu sa marque @sensible, soit la famille est à retirer,"
  echo "      soit elle est à déclarer dans .claude/familles-sans-action.txt avec sa raison"
  ko=$((ko + 1))
done

# Une famille listée en attente alors qu'elle EST couverte : la ligne est
# périmée et doit partir, sinon le fichier d'attente se transforme en décharge
# qui exempte à vie.
for famille in $familles_en_attente; do
  if printf '%s\n' "$familles_couvertes" | grep -qx "$famille"; then
    echo "ECHEC famille $famille déclarée en attente alors qu'une action la couvre"
    echo "      retirer sa ligne de .claude/familles-sans-action.txt"
    ko=$((ko + 1))
  fi
done

echo "Actions @sensible vérifiées : $verifiees"

if [ "$ko" -gt 0 ]; then
  echo "ECHEC $ko problème(s)"
  exit 1
fi

echo "OK actions sensibles cohérentes avec FamilleActionSensible"
