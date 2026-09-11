#!/bin/bash
# Confronte les routes de la boutique aux liens qui les désignent, LS-165.
#
# LE DÉFAUT, RENCONTRÉ DEUX FOIS ET QU'AUCUN TEST N'A SIGNALÉ. Un écran
# qu'aucun lien ne désigne est inatteignable autrement qu'en saisissant son URL.
#
#   LS-162, côté administration : huit stories avaient ajouté un écran sans le
#   relier, l'exploitante devait connaître sept URL par cœur
#   `/compte/verification`, trouvé par la revue frontend de LS-54 : une fois
#   quitté, on ne pouvait plus y revenir, alors que le scénario même de cet
#   écran est « le message n'arrive pas », donc le retour
#
# LA RAISON POUR LAQUELLE RIEN NE LE VOYAIT EST LA MÊME DANS LES DEUX CAS : les
# tests de bout en bout appellent `page.goto()` avec l'URL en dur. Ils
# n'exercent jamais une navigation réelle, donc l'absence totale de chemin ne
# fait rougir aucune assertion.
#
# LA DIFFICULTÉ PROPRE À LA BOUTIQUE. Le contrôle de l'administration s'appuie
# sur une barre PERMANENTE, source unique des rubriques. La boutique n'en a pas
# et ne doit pas en avoir : ses chemins d'accès sont contextuels, un lien depuis
# l'en-tête, un depuis le panier, un depuis un email.
#
# Ce contrôle cherche donc, pour chaque route servie, AU MOINS UN `href` qui la
# désigne dans `src/`. C'est une condition plus faible que celle de
# l'administration, et elle est la bonne ici : ce qui compte est qu'un chemin
# EXISTE, pas qu'il parte d'un endroit précis.
#
# UN SEUL LIEN SUFFIT, Y COMPRIS DEPUIS UNE PAGE D'ERREUR, et c'est une limite
# assumée mesurée à l'écriture : `/catalogue` est désigné sept fois, dont deux
# depuis `not-found.tsx` et `error.tsx`. Retirer les liens de l'en-tête et du
# pied laisserait ce contrôle vert sur une boutique dont la vitrine ne
# s'atteindrait plus que par une page d'erreur.
#
# LE RESSERRER SERAIT PIRE. Exiger un lien depuis un composant de navigation
# ferait échouer le contrôle sur `/compte/adresses`, légitimement atteint depuis
# l'écran de compte, et pousserait à inventer une barre que la boutique ne doit
# pas avoir. La condition faible est la bonne ici ; ce qui manque est couvert
# par les tests qui naviguent au clic.
#
# CE QU'IL NE FAIT PAS, ET QUI RESTE AUX TESTS DE BOUT EN BOUT. Il voit un
# `href`, il ne dit pas qu'il est cliquable, visible, ni atteint par une
# navigation réelle. Un lien rendu sous une condition toujours fausse le
# satisfait. Les tests qui naviguent AU CLIC restent la seule preuve qu'un
# chemin fonctionne, motif « contrôle textuel et test d'exécution ».
#
# Usage : ./scripts/verifier-atteignabilite-boutique.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
BOUTIQUE="$RACINE/src/app/(boutique)"
SOURCES="$RACINE/src"
ko=0

[ -d "$BOUTIQUE" ] || {
  echo "ECHEC dossier de la boutique introuvable : $BOUTIQUE"
  echo "      l'ancrage du contrôle est cassé, le groupe de routes a été"
  echo "      déplacé ou renommé."
  exit 1
}

# ---------------------------------------------------------------------------
# Les routes délibérément sans lien entrant, chacune avec sa raison.
#
# CETTE LISTE EST LA SEULE PARTIE MANUSCRITE, et y ajouter une ligne demande
# d'écrire pourquoi un écran ne se navigue pas : c'est précisément la décision
# qu'on veut rendre consciente.
#
#   /                        la racine, tout en part
#   /compte/nouveau-mot-de-passe   atteint depuis un EMAIL, jamais depuis le
#                            site : le lien porte un jeton que seule la personne
#                            destinataire détient
#   /compte/reauthentification     on y arrive par une ACTION sensible, jamais
#                            par choix, même motif que son jumeau
#                            d'administration
#   /commande/confirmation   atteinte par une REDIRECTION après paiement, et
#                            elle ne doit surtout pas être navigable : un lien
#                            afficherait une confirmation sans commande
#
# LES ÉCRANS À SEGMENT DYNAMIQUE SONT EXCLUS PAR LEUR FORME et non par leur
# nom : leur lien porte une valeur interpolée, `href={`/produit/${slug}`}`, que
# ce contrôle ne résout pas. Les nommer un par un ferait grossir cette liste à
# chaque détail ajouté, et le jugement se perdrait dans l'énumération.
# ---------------------------------------------------------------------------
EXCLUSIONS="
/
/compte/nouveau-mot-de-passe
/compte/reauthentification
/commande/confirmation
"

est_exclue() {
  local route="$1"

  # Un segment dynamique quelque part dans le chemin.
  case "$route" in
    *"["*) return 0 ;;
  esac

  printf '%s\n' "$EXCLUSIONS" | grep -qxF "$route"
}

# Les routes réelles, dérivées des `page.tsx` ET des `route.ts` du groupe.
#
# LES DEUX FORMES COMPTENT, et ne prendre que les pages était mon premier
# défaut : `/compte/donnees/export` est un gestionnaire de route, `route.ts`, qui
# sert un fichier plutôt qu'un écran. Le lien qui le désigne est parfaitement
# valide, et le sens 2 l'accusait d'être mort.
#
# ELLES NE SE JUGENT PAS PAREIL POUR AUTANT. Une page doit être ATTEIGNABLE,
# donc désignée par un lien ; un gestionnaire de route sert une ressource, il
# n'a pas à l'être. Le sens 1 ne porte donc que sur les pages, le sens 2 sur les
# deux.
routes=$(find "$BOUTIQUE" -name "page.tsx" 2>/dev/null \
  | sed "s|$BOUTIQUE||; s|/page.tsx||" \
  | sed 's|^$|/|' | sort)

routes_servies=$(
  {
    printf '%s\n' "$routes"
    find "$BOUTIQUE" -name "route.ts" 2>/dev/null \
      | sed "s|$BOUTIQUE||; s|/route.ts||"
  } | grep -v '^$' | sort -u
)

if [ -z "$routes" ]; then
  echo "ECHEC aucune route de boutique trouvée"
  echo "      l'ancrage du contrôle est cassé : le dossier a été déplacé."
  exit 1
fi

nb_routes=$(printf '%s\n' "$routes" | grep -c .)
nb_examinees=0

# ---------------------------------------------------------------------------
# Sens 1 : une route sans aucun lien entrant est un écran inatteignable.
#
# C'EST LE SENS QUI ATTRAPE LE DÉFAUT D'ORIGINE. Une story future ajoutera un
# écran public, et ce contrôle échouera tant qu'elle ne l'aura pas soit relié,
# soit exclu en écrivant pourquoi.
#
# LA RECHERCHE PORTE SUR `src/` ENTIER et non sur les seuls composants de
# navigation : un chemin d'accès légitime peut partir d'une fiche produit, d'un
# email ou d'un pied de page. Restreindre la source ferait échouer le contrôle
# sur des liens parfaitement valides.
#
# LE MOTIF EXIGE LA FIN DE LA CHAÎNE, `"` ou `?` ou `#` : sans cela,
# `/compte` serait satisfait par n'importe quel `href="/compte/profil"`, et
# chaque sous-route rendrait sa racine verte sans qu'aucun lien ne la désigne.
# ---------------------------------------------------------------------------
while IFS= read -r route; do
  [ -n "$route" ] || continue
  est_exclue "$route" && continue

  nb_examinees=$((nb_examinees + 1))

  # TROIS FORMES DE LIEN EXISTENT DANS CE DÉPÔT, et n'en chercher qu'une était
  # mon second défaut : le contrôle accusait `/aide` et `/avis/signaler`, tous
  # deux parfaitement reliés.
  #
  #   href="/aide"                                    attribut JSX
  #   { href: "/aide", libelle: "…" }                 table de liens du pied
  #   href={{ pathname: "/avis/signaler", query: … }} objet de route Next.js
  #
  # LE MOTIF PORTE DONC SUR LA VALEUR, `"/route"` suivie d'une fin de chaîne,
  # d'un `?` ou d'un `#`, quelle que soit la clé qui la précède. C'est plus
  # large, et c'est juste : ce qui compte est qu'un chemin vers cet écran
  # EXISTE, pas la syntaxe qui le porte.
  #
  # `pathname:` EST TRAITÉ COMME `href`, un objet de route désignant la même
  # chose. Ne pas le couvrir ferait exclure un écran parce qu'il porte une
  # chaîne de requête.
  if ! grep -rqE "(href|pathname)(=|: )\"${route}(\"|\?|#)" "$SOURCES" 2>/dev/null; then
    echo "ECHEC $route n'est désignée par aucun lien"
    echo "      l'écran est alors inatteignable sans saisir son URL, ce qui est"
    echo "      exactement le défaut rencontré sur /compte/verification et sur"
    echo "      huit écrans d'administration. Le relier depuis l'écran qui y"
    echo "      mène, ou l'exclure dans ce script en disant pourquoi."
    ko=$((ko + 1))
  fi
done <<EOF
$routes
EOF

# ---------------------------------------------------------------------------
# Sens 2 : un lien vers une route qui n'existe pas est un lien mort.
#
# IL COMPLÈTE LE PREMIER ET NE LE DOUBLE PAS. Le sens 1 reste vert sur une
# boutique dont tous les liens pointent vers des 404 ; celui-ci reste vert sur
# une boutique dont aucun écran n'est relié. Les deux ensemble tiennent la
# propriété.
#
# LES LIENS EXTERNES, LES ANCRES ET LES PROTOCOLES SONT ÉCARTÉS : `mailto:`,
# `#ancre` et `https://` ne désignent aucune route de ce dépôt.
#
# LES CHEMINS D'ADMINISTRATION SONT ÉCARTÉS AUSSI : ils ont leur propre
# contrôle, qui les vérifie dans les deux sens depuis LS-162. Les juger ici
# ferait exister deux sources de vérité pour la même propriété.
# ---------------------------------------------------------------------------
liens=$(grep -rhoE '(href|pathname)(=|: )"/[^"?#]*' "$SOURCES" 2>/dev/null \
  | sed -E 's|(href\|pathname)(=\|: )"||' \
  | grep -v '^/administration' \
  | grep -v '^/api/' \
  | sort -u)

nb_liens=$(printf '%s\n' "$liens" | grep -c .)
nb_liens_juges=0
nb_morts_connus=0

while IFS= read -r lien; do
  [ -n "$lien" ] || continue

  # Un lien construit à l'exécution n'est pas jugé, le script ne résolvant
  # aucune expression : `href={`/produit/${slug}`}` n'entre pas dans ce motif,
  # mais un `href="/produit/"` tronqué y entrerait.
  case "$lien" in
    *'${'*) continue ;;
  esac

  # Les routes servies hors du groupe `(boutique)`, qui existent réellement.
  case "$lien" in
    /facture|/facture/*|/avis/*|/retractation/*) continue ;;
  esac

  # ---------------------------------------------------------------------------
  # LES LIENS MORTS CONNUS ET TRACÉS, avec le ticket qui les fermera.
  #
  # ILS NE SONT PAS EXCUSÉS, ILS SONT COMPTÉS. Le contrôle les annonce à chaque
  # exécution plutôt que de les taire : un lien mort reste un lien mort, et
  # `/notre-univers` est désigné SEPT fois, dont une depuis l'en-tête de TOUTES
  # les pages publiques. Le journal du 3 septembre 2026 en annonçait trois.
  #
  # LA LISTE EST FERMÉE ET LE CONTRÔLE ÉCHOUE SI ELLE GROSSIT : un lien mort
  # neuf n'entre pas ici sans décision. C'est la différence entre une dette
  # tracée et une exemption, motif « dette annoncée hors outil » de ce dépôt.
  #
  # `/notre-univers` attend LS-25 : elle porte l'histoire de la marque et les
  # matières, que seule l'exploitante détient. Aucune ligne de code ne la
  # débloque.
  # ---------------------------------------------------------------------------
  case "$lien" in
    /notre-univers)
      # LE COMPTE PORTE SUR LES OCCURRENCES, jamais sur les URL distinctes.
      # `liens` est dédoublonné par `sort -u`, donc l'incrémenter ici aurait
      # annoncé « 1 lien mort » là où le dépôt en porte sept. Un contrôle qui
      # sous-estime ce qu'il trouve est pire qu'une absence de contrôle.
      nb_morts_connus=$(grep -rcE '(href|pathname)(=|: )"/notre-univers' \
        "$SOURCES" 2>/dev/null | awk -F: '{ total += $2 } END { print total+0 }')
      continue
      ;;
  esac

  nb_liens_juges=$((nb_liens_juges + 1))

  if ! printf '%s\n' "$routes_servies" | grep -qxF "$lien"; then
    echo "ECHEC un lien désigne $lien, qui n'est servie par aucune route"
    echo "      un lien vers un écran non livré est pire que son absence : il"
    echo "      promet une fonction et rend un 404 au visiteur."
    ko=$((ko + 1))
  fi
done <<EOF
$liens
EOF

echo "Routes de boutique servies      : $nb_routes"
echo "Routes examinées, exclusions ôtées : $nb_examinees"
echo "Liens internes jugés            : $nb_liens_juges sur $nb_liens relevés"

# LE LIEN MORT CONNU EST ANNONCÉ, JAMAIS TU. Le compte se mesure à chaque
# exécution : le journal du 3 septembre 2026 en annonçait trois, le contrôle en
# a trouvé sept. Un nombre écrit à la main se périme, celui-ci non.
if [ "$nb_morts_connus" -gt 0 ]; then
  echo
  echo "ATTENTION $nb_morts_connus occurrence(s) de lien vers /notre-univers,"
  echo "          page non livrée"
  echo "          elle attend LS-25, l'histoire de la marque et les matières"
  echo "          que seule l'exploitante détient. Ces liens rendent 404"
  echo "          aujourd'hui, dont un depuis l'en-tête de TOUTES les pages."
fi

# ---------------------------------------------------------------------------
# Garde-fou : le contrôle doit avoir examiné quelque chose.
#
# SANS LUI, UN ANCRAGE CASSÉ RENDRAIT UN OK SILENCIEUX. Le motif du sens 1
# pourrait cesser de trouver le moindre lien sans que rien ne le dise, et le
# script conclurait « toutes les routes sont atteignables » sur zéro examen.
# C'est le défaut qu'un contrôle de ce dépôt a déjà porté, et la garde qu'il a
# fallu lui ajouter.
# ---------------------------------------------------------------------------
if [ "$nb_examinees" -eq 0 ] || [ "$nb_liens_juges" -eq 0 ]; then
  echo "ECHEC le contrôle n'a examiné aucune route ou aucun lien"
  echo "      son ancrage est cassé : il rendrait un OK sans rien vérifier."
  ko=$((ko + 1))
fi

echo
echo "-----------------------------------------"
if [ "$ko" -eq 0 ]; then
  echo "  OK tout écran de la boutique est atteignable, et réciproquement"
else
  echo "  $ko anomalie(s) d'atteignabilité"
fi
echo "-----------------------------------------"

exit "$ko"
