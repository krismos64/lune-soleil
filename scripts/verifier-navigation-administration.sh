#!/bin/bash
# Confronte les rubriques de la navigation aux routes réelles de
# l'administration, LS-162, critère 2.
#
# LE CRITÈRE EXIGE QUE LA LISTE SOIT DÉRIVÉE DE CE QUI EXISTE, et non écrite à
# la main. Next.js ne permet pas d'énumérer les routes à l'exécution : la liste
# vit donc dans le code, et c'est ce contrôle qui la tient. Sans lui, elle se
# périmerait exactement comme le reste s'est périmé, en silence.
#
# C'EST LA FORME MÊME DU DÉFAUT QUE LS-162 FERME. Chaque story a ajouté un écran
# sans le relier aux autres, personne n'ayant rien pour le signaler. Une liste
# manuscrite reproduirait le motif d'un cran plus loin : l'écran suivant
# n'entrerait pas dans la barre, et rien ne le dirait.
#
# IL VÉRIFIE DANS PLUSIEURS SENS, et aucun ne suffit seul. Le nombre ne s'écrit
# pas ici, les sens étant numérotés plus bas : il valait « deux » quand le
# script en portait quatre, et la phrase se périmait au premier sens ajouté.
#
#   1. toute rubrique de la barre correspond à une route qui existe
#      -> sinon la barre promet un écran inexistant et rend un 404
#   2. toute route d'administration est SOIT dans la barre, SOIT dans la liste
#      des exclusions justifiées de ce script
#      -> sinon un écran neuf reste inatteignable, le défaut d'origine
#   3. le nom accessible de la barre est stable
#   4. une rubrique « à venir » ne porte aucun chemin, LS-181
#   5. toute rubrique de la barre est EXERCÉE par le test de navigation
#      -> sinon la barre est juste et personne ne clique dessus, LS-140
#
# LE SENS 1 SEUL SERAIT UN DEMI-CONTRÔLE. Il resterait vert sur une barre qui
# n'affiche que deux rubriques sur douze, c'est-à-dire sur l'état d'avant cette
# story, où elle en affichait zéro.
#
# LE SENS 5 VIENT DU 11 SEPTEMBRE 2026, LS-140, et il ferme un angle mort que
# les quatre autres laissaient entier. Les sens 1 et 2 gardent le COMPOSANT
# contre les routes ; `navigation-administration.spec.ts` porte une SECONDE
# liste, écrite à la main, que rien ne confrontait à la première. Cinq rubriques
# sur quatorze y manquaient, dont Avis, Factures et Clients, pendant que ce
# script annonçait « chaque écran d'administration est navigable ».
#
# LES DEUX COMPTES ÉTAIENT JUSTES PRIS SÉPARÉMENT, 14 rubriques déclarées et 9
# exercées, et c'est ce qui rendait l'écart invisible. Motif « numérateur et
# dénominateur appariés », déjà en fiche sur ce dépôt.
#
# Usage : ./scripts/verifier-navigation-administration.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN="$RACINE/src/app/administration"
NAVIGATION="$RACINE/src/components/navigation-administration.tsx"
ko=0

[ -d "$ADMIN" ] || { echo "ECHEC dossier d'administration introuvable : $ADMIN"; exit 1; }
[ -r "$NAVIGATION" ] || { echo "ECHEC navigation illisible : $NAVIGATION"; exit 1; }

# ---------------------------------------------------------------------------
# Les routes délibérément absentes de la barre, chacune avec sa raison.
#
# CETTE LISTE EST LA SEULE PARTIE MANUSCRITE, et elle est courte par
# construction : y ajouter une ligne demande d'écrire pourquoi un écran ne se
# navigue pas, ce qui est précisément la décision qu'on veut rendre consciente.
#
#   /administration                     la barre y mène, c'est le point d'entrée
#   /administration/connexion           on n'y est pas encore connecté
#   /administration/reauthentification  on y arrive par une action, jamais par choix
#   /administration/produits/nouveau    bouton d'action de l'écran Catalogue, LS-183
#   /administration/echec-rendu         page qui lève à dessein, LS-191, jamais
#                                       navigable : elle n'existe que pour que la
#                                       suite de bout en bout traverse la frontière
#                                       d'erreur, et rend 404 hors des tests
#
# LES ÉCRANS DE DÉTAIL SONT EXCLUS PAR LEUR FORME et non par leur nom : un
# segment dynamique, `[id]`, porte un identifiant dans son URL et s'atteint
# depuis sa liste. Les nommer un par un ferait grossir cette liste à chaque
# détail ajouté, et le jugement se perdrait dans l'énumération.
# ---------------------------------------------------------------------------
EXCLUSIONS="
/administration
/administration/connexion
/administration/reauthentification
/administration/produits/nouveau
/administration/echec-rendu
"

est_exclue() {
  local route="$1"

  # Un segment dynamique quelque part dans le chemin : écran de détail.
  case "$route" in
    *"["*) return 0 ;;
  esac

  printf '%s\n' "$EXCLUSIONS" | grep -qxF "$route"
}

# Les rubriques déclarées, lues dans le tableau `RUBRIQUES`.
#
# L'EXTRACTION S'ANCRE SUR LE TABLEAU et non sur le fichier entier : les
# commentaires de ce composant CITENT quatre routes exclues pour expliquer
# pourquoi elles n'y sont pas. Les lire comme des rubriques ferait échouer le
# sens 1 sur du code exemplaire. Motif « contrôle satisfait par un commentaire »,
# déjà en fiche sur ce dépôt.
#
# LE MOTIF ACCEPTE UNE ANNOTATION DE TYPE, `RUBRIQUES: readonly Rubrique[] = [`.
# LS-181 en a ajouté une, et l'ancrage d'origine, qui exigeait `RUBRIQUES = [`,
# a cessé de trouver le tableau : le script est sorti en ECHEC plutôt qu'en
# faux vert, ce qui est le bon défaut mais reste une panne du contrôle. Le
# `[^=]*` couvre toute annotation future sans rouvrir le motif à autre chose.
rubriques=$(awk '/^export const RUBRIQUES[^=]*= \[/,/^\] as const;/' "$NAVIGATION" \
  | grep -oE 'chemin: "[^"]+"' | sed 's/chemin: "//; s/"//' | sort)

if [ -z "$rubriques" ]; then
  echo "ECHEC aucune rubrique lue dans le tableau RUBRIQUES"
  echo "      l'ancrage du contrôle est cassé : le tableau a été renommé ou sa"
  echo "      forme a changé, et le script ne vérifie plus rien."
  exit 1
fi

# Les routes réelles, dérivées des `page.tsx` du dossier d'administration.
routes=$(find "$ADMIN" -name "page.tsx" 2>/dev/null \
  | sed "s|$RACINE/src/app||; s|/page.tsx||" | sort)

if [ -z "$routes" ]; then
  echo "ECHEC aucune route d'administration trouvée"
  echo "      l'ancrage du contrôle est cassé : le dossier a été déplacé."
  exit 1
fi

nb_rubriques=$(printf '%s\n' "$rubriques" | grep -c .)
nb_routes=$(printf '%s\n' "$routes" | grep -c .)

# ---------------------------------------------------------------------------
# Sens 1 : une rubrique sans route est un lien mort.
# ---------------------------------------------------------------------------
while IFS= read -r rubrique; do
  [ -n "$rubrique" ] || continue

  if ! printf '%s\n' "$routes" | grep -qxF "$rubrique"; then
    echo "ECHEC la barre renvoie vers $rubrique, qui n'existe pas"
    echo "      un lien vers un écran non livré est pire que son absence : il"
    echo "      promet une fonction et rend un 404 à l'exploitante."
    ko=$((ko + 1))
  fi
done <<EOF
$rubriques
EOF

# ---------------------------------------------------------------------------
# Sens 2 : une route ni navigable ni exclue est un écran inatteignable.
#
# C'EST LE SENS QUI ATTRAPE LE DÉFAUT D'ORIGINE. Une story future ajoutera un
# écran d'administration, et ce contrôle échouera tant qu'elle ne l'aura pas
# soit mis dans la barre, soit exclu en écrivant pourquoi.
# ---------------------------------------------------------------------------
while IFS= read -r route; do
  [ -n "$route" ] || continue
  est_exclue "$route" && continue

  if ! printf '%s\n' "$rubriques" | grep -qxF "$route"; then
    echo "ECHEC $route n'est dans la barre ni dans les exclusions"
    echo "      l'écran est alors inatteignable sans saisir son URL, ce qui est"
    echo "      exactement le défaut que LS-162 a fermé. L'ajouter aux"
    echo "      RUBRIQUES, ou l'exclure dans ce script en disant pourquoi."
    ko=$((ko + 1))
  fi
done <<EOF
$routes
EOF

echo "Routes d'administration examinées : $nb_routes"
echo "Rubriques déclarées dans la barre : $nb_rubriques"

# ---------------------------------------------------------------------------
# Sens 3 : la barre est effectivement posée, et l'écran courant est annoncé.
#
# SANS CE SENS, LE CONTRÔLE RESTERAIT VERT SUR UNE BARRE QUE PLUS RIEN
# N'AFFICHE. Les deux premiers sens comparent deux listes, ils ne disent rien du
# fait que le composant soit rendu : retirer la ligne du layout laisserait les
# listes parfaitement cohérentes et l'administration sans navigation, c'est-à-
# dire dans l'état d'avant cette story.
# ---------------------------------------------------------------------------
LAYOUT="$ADMIN/layout.tsx"

if [ ! -r "$LAYOUT" ]; then
  echo "ECHEC src/app/administration/layout.tsx a disparu"
  echo "      c'est lui qui pose la barre sur tous les écrans."
  ko=$((ko + 1))
elif ! grep -q '<NavigationAdministration' "$LAYOUT"; then
  echo "ECHEC le layout d'administration ne rend plus la barre"
  echo "      les listes de ce contrôle resteraient cohérentes pendant que"
  echo "      l'administration redeviendrait un ensemble d'écrans sans liens."
  ko=$((ko + 1))
fi

# ---------------------------------------------------------------------------
# Sens 4 : une rubrique « à venir » ne porte aucun chemin, LS-181.
#
# CES ENTRÉES SONT DES `<span>`, PAS DES LIENS. Elles annoncent la structure
# complète de l'outil, arbitrage du 4 septembre 2026, et six des onze rubriques
# du prototype ne sont pas livrées. Leur donner un `chemin` en ferait des liens
# vers des écrans inexistants, c'est-à-dire des 404 promis à l'exploitante,
# exactement ce que le sens 1 empêche pour les autres.
#
# LE SENS 1 NE LES VOIT PAS, et c'est pour cela que ce sens existe : il lit le
# tableau `RUBRIQUES`, pas celui-ci. Une entrée déplacée d'un tableau à l'autre
# serait attrapée par le sens 1 ; une entrée à qui l'on ajoute un `chemin` sur
# place ne le serait par rien.
# ---------------------------------------------------------------------------
if awk '/^export const RUBRIQUES_A_VENIR[^=]*= \[/,/^\] as const;/' "$NAVIGATION" \
  | grep -q 'chemin:'; then
  echo "ECHEC une rubrique « à venir » porte un chemin"
  echo "      ces entrées désignent des écrans NON LIVRÉS : un chemin en"
  echo "      ferait des liens vers des routes inexistantes. Livrer l'écran"
  echo "      et déplacer l'entrée dans RUBRIQUES, ou retirer le chemin."
  ko=$((ko + 1))
fi

# ---------------------------------------------------------------------------
# Sens 5 : toute rubrique de la barre est EXERCÉE par le test de navigation,
# LS-140.
#
# CE QUE LES QUATRE SENS PRÉCÉDENTS NE VOIENT PAS. Ils confrontent le COMPOSANT
# aux routes du dépôt. `navigation-administration.spec.ts` porte une SECONDE
# liste, `RUBRIQUES`, écrite à la main en face de la première : une rubrique
# ajoutée au composant et oubliée dans le test n'est cliquée par personne, et
# rien ne le disait.
#
# MESURÉ LE 11 SEPTEMBRE 2026 : 14 rubriques déclarées, 9 exercées. Avis,
# Factures et avoirs, Clients, Statistiques et Vos passkeys manquaient, pendant
# que ce script annonçait « chaque écran d'administration est navigable ».
#
# LA COMPARAISON PORTE SUR LES LIBELLÉS ET NON SUR LES CHEMINS, le test ne
# connaissant que les premiers : c'est par le nom accessible qu'il clique.
# ---------------------------------------------------------------------------
SPEC_NAVIGATION="$RACINE/tests/e2e/navigation-administration.spec.ts"

if [ ! -r "$SPEC_NAVIGATION" ]; then
  echo "ECHEC test de navigation introuvable : $SPEC_NAVIGATION"
  echo "      le sens 5 ne vérifie plus rien, et une rubrique non cliquée"
  echo "      redeviendrait invisible."
  ko=$((ko + 1))
else
  # L'ANCRAGE EXIGE LES DEUX-POINTS, `RUBRIQUES:` ET NON `RUBRIQUES`, et la
  # nuance a été mesurée plutôt que supposée. `RUBRIQUES` est un PRÉFIXE de
  # `RUBRIQUES_A_VENIR` : l'ancrage des sens 1 et 4 absorbait donc les deux
  # tableaux, et l'extraction rendait quinze libellés au lieu de quatorze,
  # « Paramètres » étant une rubrique NON LIVRÉE rendue inerte.
  #
  # LE SENS 1 Y ÉCHAPPE PAR ACCIDENT, et il faut le dire : il extrait des
  # `chemin:`, qu'une entrée « à venir » ne porte jamais, le sens 4 l'interdisant
  # précisément. Son ancrage est donc aussi large, sa moisson ne l'est pas.
  # Motif « nom nu hors ancrage », déjà en fiche sur ce dépôt.
  #
  # LE MOTIF EXCLUT LE SUFFIXE PLUTÔT QUE D'EXIGER UNE FORME PRÉCISE.
  # `RUBRIQUES[^_A-Z]` refuse `RUBRIQUES_A_VENIR` tout en acceptant aussi bien
  # `RUBRIQUES: readonly Rubrique[] = [` que `RUBRIQUES = [` : exiger les
  # deux-points aurait cassé l'ancrage au premier retrait de l'annotation, ce
  # qui est déjà arrivé une fois à ce script en sens inverse, LS-181.
  libelles_barre=$(awk '/^export const RUBRIQUES[^_A-Z][^=]*= \[/,/^\] as const;/' "$NAVIGATION" \
    | grep -oE 'libelle: "[^"]+"' | sed 's/libelle: "//; s/"//' | sort -u)

  if [ -z "$libelles_barre" ]; then
    echo "ECHEC aucun libellé lu dans le tableau RUBRIQUES du composant"
    echo "      l'ancrage du sens 5 est cassé : sans libellé, la comparaison"
    echo "      serait vide et le contrôle vert sans rien examiner."
    ko=$((ko + 1))
  fi

  libelles_test=$(awk '/^const RUBRIQUES[^=]*= \[/,/^\] as const;/' "$SPEC_NAVIGATION" \
    | grep -oE 'libelle: "[^"]+"' | sed 's/libelle: "//; s/"//' | sort -u)

  # L'ANCRAGE SE GARDE CONTRE LUI-MÊME. Un tableau renommé rendrait les deux
  # listes vides, donc leur différence vide, donc le contrôle vert sur un
  # contrôle qui n'examine plus rien.
  if [ -z "$libelles_test" ]; then
    echo "ECHEC aucune rubrique lue dans le tableau RUBRIQUES du test"
    echo "      l'ancrage du sens 5 est cassé : le tableau a été renommé."
    ko=$((ko + 1))
  else
    manquantes=$(comm -23 <(echo "$libelles_barre") <(echo "$libelles_test"))

    if [ -n "$manquantes" ]; then
      echo "ECHEC des rubriques de la barre ne sont cliquées par aucun test :"
      echo "$manquantes" | sed 's/^/        /'
      echo "      la barre peut être juste et l'écran inatteignable au clic."
      echo "      Les ajouter au tableau RUBRIQUES de"
      echo "      tests/e2e/navigation-administration.spec.ts, avec le titre"
      echo "      exact du <h1> de l'écran visé."
      ko=$((ko + 1))
    fi

    # LE SENS INVERSE COMPTE AUSSI : un libellé exercé par le test et absent de
    # la barre signale un test qui cherche un lien qui n'existe plus, donc un
    # échec différé au lieu d'un diagnostic immédiat.
    fantomes=$(comm -13 <(echo "$libelles_barre") <(echo "$libelles_test"))

    if [ -n "$fantomes" ]; then
      echo "ECHEC le test navigue vers des rubriques absentes de la barre :"
      echo "$fantomes" | sed 's/^/        /'
      echo "      le test échouerait par expiration plutôt que par diagnostic."
      ko=$((ko + 1))
    fi
  fi
fi

# `aria-current` porte l'information de l'écran courant. Sans lui, elle ne
# passerait que par la couleur, ce que `frontend-design.md` interdit, et le
# critère 3 de la story ne serait pas tenu.
#
# LE MOTIF EXIGE L'ATTRIBUT JSX, `aria-current={`, ET NON LE NOM SEUL. Cherché
# seul, il se trouve dans le commentaire qui explique pourquoi il est là : le
# contrôle restait vert sur un composant dont l'attribut avait été remplacé par
# un `data-` quelconque. Mesuré, la mutation du cas 4 passait au vert. Motif
# « contrôle satisfait par un commentaire », rencontré deux fois le même jour.
if ! grep -q 'aria-current={' "$NAVIGATION"; then
  echo "ECHEC la barre n'annonce plus l'écran courant par aria-current"
  echo "      l'information passerait par la seule couleur, interdit par"
  echo "      frontend-design.md et contraire au critère 3 de LS-162."
  ko=$((ko + 1))
fi

# LE STYLE S'ANCRE SUR L'ATTRIBUT, jamais sur une classe séparée. C'est ce qui
# rend impossible la divergence entre ce qu'un lecteur d'écran annonce et ce que
# la couleur montre : deux sources distinctes finiraient par ne plus désigner la
# même rubrique, et l'écart serait invisible dans les deux sens.
STYLES="$RACINE/src/components/navigation-administration.module.css"

if [ ! -r "$STYLES" ]; then
  echo "ECHEC styles de la navigation illisibles : $STYLES"
  ko=$((ko + 1))
elif ! grep -q 'aria-current="page"' "$STYLES"; then
  echo "ECHEC le style de l'écran courant ne s'ancre plus sur aria-current"
  echo "      une classe séparée peut désigner une autre rubrique que celle"
  echo "      annoncée, et rien ne rendrait l'écart visible."
  ko=$((ko + 1))
fi

echo
if [ "$ko" -eq 0 ]; then
  echo "OK chaque écran d'administration est navigable, la barre est posée"
else
  echo "$ko problème(s) détecté(s)"
fi

exit "$ko"
