#!/bin/bash
# Vérifie que toute navigation interne passe par `Link` de Next.js et non par
# une balise `<a>` native, LS-110, point 1.
#
# CE QUE LE DÉFAUT COÛTE. Une balise native provoque un rechargement complet du
# document : le client perd l'état de la page, le cache de route de Next.js est
# jeté, et l'écran repart d'un rendu serveur entier là où une navigation client
# aurait suffi. Sur l'éditeur de fiche produit, le fil d'Ariane rechargeait
# l'application complète à chaque retour au catalogue.
#
# CE CONTRÔLE EXISTE PARCE QU'ESLINT NE VOIT PAS CE DÉFAUT, ce qui est le point
# le moins évident de cette story. La règle `@next/next/no-html-link-for-pages`
# est bien active en ERREUR par `core-web-vitals`, et elle reste muette.
#
# MESURÉ le 9 septembre 2026 sur Next.js 16.2.12, en posant trois liens dans un
# fichier d'essai sous `src/app/administration/` :
#
#   <a href="/">                          -> ERREUR, la règle le voit
#   <a href="/panier">                    -> RIEN
#   <a href="/administration/categories"> -> RIEN
#
# La règle construit sa liste d'URL depuis l'arborescence, mais ne reconnaît
# ici que la racine : une route rangée sous un groupe `(boutique)` ou sous un
# segment lui échappe. Elle ne rougit donc que sur le seul lien que personne
# n'écrit par erreur. Compter sur elle, c'est croire la règle posée alors que
# le défaut passe : un garde-fou muet, pire qu'absent puisqu'il rassure.
#
# IL EST GÉNÉRIQUE, jamais une liste de fichiers écrite à la main. Il part des
# balises `<a>` réellement présentes dans `src/`, une liste manuscrite étant une
# opinion sur ce qui existe, qui se périme au premier écran ajouté.
#
# CE QUI N'EST PAS UN DÉFAUT, et qu'il ne doit pas signaler :
#
#   - une ancre interne, `href="#contenu"`, qui ne navigue pas
#   - un protocole, `mailto:` ou `tel:`
#   - une URL absolue, `https://`, qui sort du site
#   - un href construit à l'exécution, `href={...}`, que ce contrôle textuel ne
#     peut pas résoudre : ils sont comptés et annoncés, jamais jugés
#   - un rechargement DÉLIBÉRÉ, qui se déclare par le marqueur ci-dessous
#
# LE MARQUEUR EST LA PIÈCE QUI REND LE CONTRÔLE TENABLE. Quatre liens du dépôt
# rechargent la page À DESSEIN : après une invalidation de session, une
# navigation client conserverait le cache de route, donc un en-tête rendu avec
# « Mon compte » pour une session qui n'existe plus. Les interdire ferait
# supprimer la ligne qui protège. Ils portent donc une raison écrite, et le
# contrôle exige cette raison plutôt que de les ignorer en silence.
#
# Usage : ./scripts/verifier-navigation-client.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$RACINE/src"
ko=0

[ -d "$SRC" ] || { echo "ECHEC dossier src introuvable : $SRC"; exit 1; }

# Le marqueur qui déclare un rechargement voulu. Il se pose sur une ligne de
# commentaire au-dessus du lien, avec sa raison.
MARQUEUR="@rechargement-delibere"

# ---------------------------------------------------------------------------
# L'inventaire : toute balise `<a>` ouvrante de `src/`, hors code fabriqué.
#
# `src/generated/` est produit par `prisma generate`, il n'est ni écrit ni
# relu à la main. Les lignes de COMMENTAIRE sont exclues, sinon le contrôle
# s'accuserait lui-même sur sa propre documentation. Motif « contrôle satisfait
# par un commentaire », déjà en fiche sur ce dépôt.
#
# LE MOTIF EST ÉTENDU, `-E`, ET CE N'EST PAS UN DÉTAIL DE STYLE. La première
# version employait l'alternance de GNU, `"<a$\|<a \|<a>"`, qui ne veut rien
# dire pour le grep BSD de macOS : celui-ci la lit littéralement et manquait
# DIX des trente et une balises du dépôt, dont toutes celles enveloppées sur
# plusieurs lignes. Le contrôle rendait un OK sur un dépôt examiné au tiers.
#
# LA PREUVE PAR MUTATION EST CE QUI L'A TROUVÉ, pas la relecture : le contrôle
# était vert sur le dépôt sain ET vert sur le dépôt muté, ce qui ne se voit
# qu'en posant le défaut. Une session interactive ne pouvait pas le voir non
# plus, `grep` y étant aliasé sur ugrep, qui accepte les deux formes.
# ---------------------------------------------------------------------------
balises=$(grep -rnE "<a$|<a |<a>" "$SRC" --include="*.tsx" \
  | grep -v "/generated/" \
  | grep -v '^\([^:]*\):\([0-9]*\):\s*\*' \
  | grep -v '^\([^:]*\):\([0-9]*\):\s*//' \
  | grep -v '^\([^:]*\):\([0-9]*\):\s*/\*' \
  | sed "s|$RACINE/||")

# LA GARDE D'ANCRAGE, et elle vaut pour ce contrôle plus que pour d'autres.
# Ce dépôt emploie légitimement des balises `<a>` pour ses liens d'évitement et
# ses adresses e-mail : n'en trouver AUCUNE ne signifie pas que tout est propre,
# mais que la recherche ne trouve plus ce qu'elle vise. Sans cette garde, un
# ancrage cassé rendrait un OK silencieux sur un dépôt non examiné.
if [ -z "$balises" ]; then
  echo "ECHEC aucune balise <a> trouvée dans src/"
  echo "      l'ancrage de ce contrôle est cassé : ce dépôt en porte pour ses"
  echo "      liens d'évitement et ses adresses e-mail. Un OK ici signifierait"
  echo "      que la recherche ne trouve plus rien, pas que le code est sain."
  exit 1
fi

nb=0
nb_internes=0
nb_derogations=0
nb_dynamiques=0

while IFS= read -r ligne; do
  [ -n "$ligne" ] || continue
  nb=$((nb + 1))

  fichier=$(printf '%s' "$ligne" | sed 's|^\([^:]*\):.*|\1|')
  numero=$(printf '%s' "$ligne" | sed 's|^[^:]*:\([0-9]*\):.*|\1|')
  texte=$(printf '%s' "$ligne" | sed 's|^[^:]*:[0-9]*:||')
  ou="$fichier:$numero"

  # L'attribut `href` peut vivre sur la ligne suivante quand le JSX est
  # enveloppé. On lit donc les trois lignes qui suivent l'ouverture pour
  # retrouver le href, et non la seule ligne trouvée.
  bloc=$(sed -n "${numero},$((numero + 3))p" "$RACINE/$fichier")
  href=$(printf '%s' "$bloc" | grep -oE 'href=("[^"]*"|\{)' | head -1)

  # Aucun href : ce n'est pas une navigation.
  [ -n "$href" ] || continue

  # HREF CONSTRUIT À L'EXÉCUTION, `href={...}`. Un contrôle textuel ne peut pas
  # savoir où il mène : le compter et le dire vaut mieux que le juger à tort.
  #
  # LA TENTATION EST D'EN LIRE LE LITTÉRAL DE TÊTE, et elle a été essayée le
  # 9 septembre 2026 : elle trouve bien le vrai défaut des filtres de factures,
  # mais accuse aussi les liens vers les PDF de facture et d'avoir, qui pointent
  # vers un `route.ts` répondant en `application/pdf`. Distinguer les deux
  # demande de résoudre une expression, ce qu'un script textuel ne fait pas
  # honnêtement : le faire à moitié produit des accusations fausses, et une
  # personne qui corrige un faux défaut casse un téléchargement.
  #
  # CE QUI COMBLE LE TROU N'EST DONC PAS CE CONTRÔLE mais la relecture, qui a eu
  # lieu et a corrigé les filtres de factures. Le nombre est ANNONCÉ pour qu'une
  # hausse se voie et appelle cette relecture.
  if [ "$href" = "href={" ]; then
    nb_dynamiques=$((nb_dynamiques + 1))
    continue
  fi

  cible=$(printf '%s' "$href" | sed 's|^href="||; s|"$||')

  # UN TÉLÉCHARGEMENT N'EST PAS UNE NAVIGATION. L'attribut `download` demande
  # au navigateur d'enregistrer la ressource au lieu d'y aller : `Link` ne le
  # porte pas et casserait le comportement. L'export des données personnelles
  # du compte est dans ce cas.
  if printf '%s' "$bloc" | grep -qE '^\s*download\s*$|<a[^>]*\sdownload[\s>]'; then
    continue
  fi

  # Ce qui ne navigue pas dans le site : ancre, protocole, URL absolue.
  case "$cible" in
    "#"*|"mailto:"*|"tel:"*|"http://"*|"https://"*|"//"*) continue ;;
  esac

  # Reste une navigation interne, celle que `Link` doit porter.
  case "$cible" in
    "/"*) ;;
    *) continue ;;
  esac

  nb_internes=$((nb_internes + 1))

  # LA DÉROGATION SE CHERCHE AU-DESSUS DU LIEN, dans les douze lignes qui le
  # précèdent : le commentaire qui l'explique est souvent long, et le marqueur
  # se pose en tête de ce commentaire plutôt que collé à la balise.
  debut=$((numero - 12))
  [ "$debut" -lt 1 ] && debut=1
  amont=$(sed -n "${debut},${numero}p" "$RACINE/$fichier")

  if printf '%s' "$amont" | grep -q "$MARQUEUR"; then
    nb_derogations=$((nb_derogations + 1))
    continue
  fi

  echo "ECHEC $ou navigue vers $cible par une balise <a> native"
  echo "      une navigation interne passe par Link de next/link : la balise"
  echo "      native recharge le document entier, jette le cache de route et"
  echo "      repart d'un rendu serveur complet."
  echo "      Si le rechargement est VOULU, poser le marqueur $MARQUEUR"
  echo "      dans un commentaire au-dessus, avec sa raison."
  ko=$((ko + 1))

done <<EOF
$balises
EOF

# ---------------------------------------------------------------------------
# Le dénominateur, et c'est lui qui empêche le contrôle de se vider.
#
# Vérifier la forme des liens TROUVÉS ne dit rien de ce qui a disparu. Ce dépôt
# porte des dérogations légitimes : si toutes s'évaporaient, le contrôle
# resterait vert en n'ayant plus rien à examiner. Exiger qu'il en reste au moins
# une donne un plancher, comme `verifier-ponctuation-chargement.sh` inventorie
# ses `loading.tsx` plutôt que de se fier aux textes trouvés.
# ---------------------------------------------------------------------------
if [ "$nb_internes" -eq 0 ]; then
  echo "ECHEC aucune navigation interne examinée"
  echo "      le contrôle n'a rien à vérifier : soit le motif de recherche ne"
  echo "      correspond plus au code, soit les liens internes ont disparu."
  ko=$((ko + 1))
fi

echo "Balises <a> examinées         : $nb"
echo "Navigations internes          : $nb_internes"
echo "Dont rechargements délibérés  : $nb_derogations"
echo "Href construits à l'exécution : $nb_dynamiques"

echo
if [ "$ko" -eq 0 ]; then
  echo "OK toute navigation interne passe par Link, LS-110"
else
  echo "$ko problème(s) détecté(s)"
fi

exit "$ko"
