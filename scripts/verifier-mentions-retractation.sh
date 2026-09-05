#!/bin/bash
# Les trois emplacements de la mention de rétractation, LS-136, critère 5.
#
# CE QU'IL EMPÊCHE. Qu'un des trois emplacements imposés par l'article L221-23
# disparaisse à la faveur d'une refonte de gabarit. Le défaut ne casse aucun
# test de rendu et ne se voit sur aucun écran : la page reste correcte, elle est
# simplement devenue illégale.
#
# L'ENJEU N'EST PAS PROPORTIONNEL À LA TAILLE DU TEXTE. L'article L221-20 porte
# le délai de rétractation à DOUZE MOIS quand l'information est absente ou
# incorrecte, sur toutes les commandes concernées. Une mention retirée coûte un
# an de rétractation ouverte, pas quelques euros de port.
#
# CE QU'IL VÉRIFIE, DANS LES DEUX SENS :
#
#   1. chacun des trois emplacements porte sa mention
#   2. la source unique existe toujours et porte les deux notions
#
# LE SENS 2 EXISTE PARCE QU'UN CONTRÔLE À SENS UNIQUE MENT PAR OMISSION. Sans
# lui, le contrôle resterait vert sur un dépôt d'où `mentions-retractation.ts`
# aurait disparu : il ne distingue pas « les trois emplacements sont servis » de
# « il n'y a plus rien à servir ».
#
# CE QU'IL NE VÉRIFIE PAS, et c'est assumé : que la mention soit VISIBLE à
# l'écran. Un contrôle textuel voit un import et un appel, pas un rendu. C'est
# `tests/e2e/mentions-retractation.spec.ts` qui lit le HTML servi, et
# `tests/unitaire/mentions-retractation.test.ts` qui vérifie le contenu des
# textes. Un contrôle textuel ne remplace pas un test d'exécution.
#
# Usage : ./scripts/verifier-mentions-retractation.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$RACINE/src/lib/mentions-retractation.ts"
REGLE="$RACINE/.claude/rules/legal.md"
ko=0

# ---------------------------------------------------------------------------
# Retire les commentaires avant toute recherche.
#
# POURQUOI. Chacun des fichiers ci-dessous EXPLIQUE la mention qu'il porte, en
# nommant l'article et la constante. Une recherche naïve trouverait
# `MENTION_TUNNEL` dans le commentaire qui dit de ne pas l'oublier, et resterait
# verte sur un fichier d'où l'appel réel aurait disparu.
#
# Motif « contrôle satisfait par un commentaire », payé deux fois sur ce dépôt,
# dont une la veille sur `verifier-seo.sh` : j'y avais écarté le risque par
# écrit avant que la mutation ne le démontre.
# ---------------------------------------------------------------------------
sans_commentaires() {
  perl -0777 -pe 's{/\*.*?\*/}{}gs; s{^\s*//.*$}{}gm' "$1"
}

# ---------------------------------------------------------------------------
# Sens 1 : les trois emplacements de l'article L221-23.
#
# LES CHEMINS SONT ÉCRITS EN DUR, ET C'EST LE BON CHOIX ICI. Un contrôle
# générique partant de `find` ne saurait pas dire QUEL fichier doit porter la
# mention : la liste des trois emplacements est une obligation légale, pas une
# propriété du dépôt. Elle ne bouge que si la loi bouge.
#
# LE RISQUE DE CE CHOIX EST LE CHEMIN PÉRIMÉ : un fichier déplacé rendrait le
# contrôle muet. C'est pourquoi l'absence du fichier est un ÉCHEC et non un
# saut, motif « contrôle de mutation mort », en fiche.
# ---------------------------------------------------------------------------
verifier_emplacement() {
  local libelle="$1" fichier="$2" motif="$3" explication="$4"
  local chemin="$RACINE/$fichier"

  if [ ! -f "$chemin" ]; then
    echo "ECHEC $libelle : fichier introuvable, $fichier"
    echo "      Le chemin de ce contrôle est périmé. Le corriger : un contrôle"
    echo "      qui ne trouve plus sa cible ne protège plus rien."
    ko=$((ko + 1))
    return
  fi

  # L'IMPORT NE COMPTE PAS, SEUL L'USAGE COMPTE.
  #
  # Les lignes `import` sont retirées avant la recherche, et cette ligne a été
  # écrite APRÈS que la cinquième mutation l'a imposée : retirer les deux usages
  # de `MENTION_TUNNEL` du rendu laissait le contrôle VERT, l'import subsistant
  # et satisfaisant le motif à lui seul.
  #
  # C'est le motif « nom nu hors ancrage », déjà en fiche : un contrôle qui
  # cherche un identifiant n'importe où dans un fichier confond « la mention est
  # affichée » et « le module est importé ». Un import orphelin est d'ailleurs
  # exactement ce que produit un retrait de balise fait à la main.
  #
  # Le lint rattraperait l'import inutilisé, mais il ne rattraperait PAS un
  # import encore utilisé ailleurs dans le fichier pour autre chose.
  if ! sans_commentaires "$chemin" | grep -v "^import " | grep -q "$motif"; then
    echo "ECHEC $libelle : la mention est absente de $fichier"
    echo "      $explication"
    echo "      Article L221-23. Sans elle, l'article L221-20 porte le délai de"
    echo "      rétractation à douze mois sur toutes les commandes concernées."
    ko=$((ko + 1))
  fi
}

# Emplacement 1, le seul qui manquait entièrement au 5 septembre 2026 : zéro
# occurrence du mot « rétractation » dans tout le tunnel.
#
# LES DEUX PROPRIÉTÉS SONT CHERCHÉES SÉPARÉMENT, et cette séparation a été
# imposée par une revue critique : chercher `MENTION_TUNNEL` seul laissait le
# contrôle VERT quand le paragraphe du droit disparaissait, `fraisRetour`
# satisfaisant le motif à lui seul. L'écran annonçait alors qui paie le retour
# sans jamais dire qu'un droit de rétractation existe, ce que l'article L221-20
# sanctionne pleinement.
#
# C'est le motif « nom nu hors ancrage » une seconde fois dans ce fichier : je
# l'avais fermé pour l'import, pas pour le second usage. Les deux notions se
# retirent indépendamment, elles se vérifient donc indépendamment, comme les
# conditions générales le font déjà plus bas.
verifier_emplacement \
  "emplacement 1, le droit lui-même" \
  "src/app/(boutique)/commande/etapes-tunnel.tsx" \
  "MENTION_TUNNEL.droit" \
  "C'est l'emplacement que legal.md désigne comme « le premier qu'on oublie »."

verifier_emplacement \
  "emplacement 1, les frais de retour" \
  "src/app/(boutique)/commande/etapes-tunnel.tsx" \
  "MENTION_TUNNEL.fraisRetour" \
  "Sans elle, les frais de retour reviennent au vendeur, article L221-23."

# Emplacement 2, les conditions générales. Elles portent leur propre rédaction,
# plus détaillée : le contrôle cherche les deux notions et non une constante.
verifier_emplacement \
  "emplacement 2, conditions générales, le droit" \
  "src/app/(boutique)/informations-legales/page.tsx" \
  "rétractation" \
  "Les conditions générales doivent énoncer le droit et son délai."

verifier_emplacement \
  "emplacement 2, conditions générales, les frais de retour" \
  "src/app/(boutique)/informations-legales/page.tsx" \
  "frais de retour" \
  "Les frais de retour à la charge du client s'y annoncent aussi."

# Emplacement 3, le formulaire type. DEUX COMPOSANTS, UN PAR CHEMIN, et le
# second manquait à ce contrôle jusqu'à la revue critique du 5 septembre 2026 :
# il portait sa propre copie du texte, identique par coïncidence et libre de
# diverger. Le chemin sans compte est le plus exposé, `legal.md` : l'email de
# confirmation est le seul par lequel un acheteur sans compte reçoit son droit.
verifier_emplacement \
  "emplacement 3, formulaire type, espace client" \
  "src/app/(boutique)/compte/commandes/[id]/retractation/formulaire-retractation.tsx" \
  "MENTION_FORMULAIRE" \
  "Ce composant sert les clients disposant d'un compte."

verifier_emplacement \
  "emplacement 3, formulaire type, lien signé sans compte" \
  "src/app/(boutique)/retractation/[jeton]/formulaire-jeton.tsx" \
  "MENTION_FORMULAIRE" \
  "Ce composant sert les acheteurs SANS compte, le chemin le plus exposé."

# ---------------------------------------------------------------------------
# Sens 2 : la source unique existe et porte les deux notions.
# ---------------------------------------------------------------------------
if [ ! -f "$SOURCE" ]; then
  echo "ECHEC la source unique a disparu : src/lib/mentions-retractation.ts"
  echo "      Sans elle, les trois emplacements portent trois textes qui"
  echo "      divergeront, et une information contradictoire est sanctionnée"
  echo "      comme une information absente."
  ko=$((ko + 1))
else
  corps="$(sans_commentaires "$SOURCE")"

  for attendu in "MENTION_TUNNEL" "MENTION_FORMULAIRE" "fraisRetour" "droit"; do
    if ! printf '%s' "$corps" | grep -q "$attendu"; then
      echo "ECHEC la source unique ne porte plus « $attendu »"
      ko=$((ko + 1))
    fi
  done

  # LE DÉLAI VIENT DU CALCUL, JAMAIS D'UNE SECONDE CONSTANTE. Annoncer un délai
  # que le service n'applique pas est exactement l'information incorrecte que
  # l'article L221-20 sanctionne, et c'est l'affichage qui engage.
  #
  # C'EST L'IMPORT QUI EST VÉRIFIÉ, PAS LE NOM, et cette ligne a été corrigée
  # après la mutation 4 : chercher `DUREE_RETRACTATION_JOURS` restait VERT sur
  # un `const DUREE_RETRACTATION_JOURS = 14;` déclaré localement, c'est-à-dire
  # sur exactement le défaut visé, un second nombre écrit à côté du calcul.
  #
  # Troisième occurrence de « nom nu hors ancrage » dans ce seul contrôle :
  # d'abord l'import qui suffisait, puis la propriété non distinguée, et ici le
  # nom qui ne dit pas d'où il vient. Le motif se répète parce qu'une recherche
  # textuelle ne connaît que des chaînes, jamais leur provenance.
  if ! printf '%s' "$corps" | grep -qE 'import \{[^}]*DUREE_RETRACTATION_JOURS[^}]*\} from "@/lib/retractation"'; then
    echo "ECHEC la source unique ne reprend plus DUREE_RETRACTATION_JOURS"
    echo "      Le délai annoncé au client doit venir du calcul de LS-133,"
    echo "      jamais d'un second nombre écrit à côté."
    ko=$((ko + 1))
  fi
fi

# ---------------------------------------------------------------------------
# Sens 3 : aucun texte visible n'annonce un délai que le calcul n'applique pas.
#
# LE DÉLAI EST ÉCRIT EN DUR DANS TREIZE TEXTES, hors source unique : accueil,
# fiche produit, aide, conditions générales, écrans d'expiration, détail de
# commande, formulaires et deux modèles d'email. C'est délibéré et ce n'est pas
# une dette : « quatorze jours » se lit mieux qu'une interpolation au milieu
# d'une phrase rédigée, et une mention légale doit d'abord être LUE.
#
# LE RISQUE EST LA DIVERGENCE. Si `DUREE_RETRACTATION_JOURS` changeait, par la
# loi ou par décision, le calcul suivrait, `MENTION_TUNNEL` rougirait, et ces
# treize textes continueraient d'annoncer quatorze jours. Un délai annoncé plus
# COURT que le délai réel éteint un droit trop tôt, ce que l'article L221-20
# sanctionne par douze mois.
#
# CE SENS NE RÉÉCRIT RIEN, IL REFUSE LE SILENCE. Il échoue si la constante ne
# vaut plus 14 en nommant les fichiers à reprendre à la main. Relevé en revue
# critique, qui a mesuré que la garde par table de nombres ne couvrait que
# `MENTION_TUNNEL.droit`.
# ---------------------------------------------------------------------------
DELAI_ATTENDU=14
delai_reel="$(grep -oE 'DUREE_RETRACTATION_JOURS = [0-9]+' "$RACINE/src/lib/retractation.ts" | grep -oE '[0-9]+$' || true)"

if [ -z "$delai_reel" ]; then
  echo "ECHEC DUREE_RETRACTATION_JOURS est introuvable dans src/lib/retractation.ts"
  echo "      L'ancrage de ce sens est cassé : le corriger avant de conclure."
  ko=$((ko + 1))
elif [ "$delai_reel" != "$DELAI_ATTENDU" ]; then
  echo "ECHEC le délai de rétractation vaut $delai_reel jours, ce contrôle attend $DELAI_ATTENDU"
  echo
  echo "      Treize textes visibles écrivent le délai en toutes lettres ou en"
  echo "      chiffres, hors source unique. Ils ne suivent PAS automatiquement,"
  echo "      et un délai annoncé plus court que le délai réel éteint un droit"
  echo "      trop tôt, article L221-20, douze mois."
  echo
  echo "      Reprendre chacun, puis porter DELAI_ATTENDU à $delai_reel ici :"
  grep -rln "14 jours\|quatorze jours" "$RACINE/src/app" "$RACINE/src/integrations" \
    --include="*.tsx" --include="*.ts" 2>/dev/null | sed "s|$RACINE/|        |"
  ko=$((ko + 1))
fi

# ---------------------------------------------------------------------------
# Sens 4 : la règle est toujours écrite.
#
# Un contrôle qui applique une obligation qu'aucun document ne porte laisse la
# session suivante la retirer de bonne foi, faute de savoir pourquoi elle est
# là. Même sens que `verifier-rendu-texte-simple.sh`.
# ---------------------------------------------------------------------------
if [ ! -r "$REGLE" ]; then
  echo "ECHEC règle légale illisible : .claude/rules/legal.md"
  ko=$((ko + 1))
elif ! grep -q "Trois emplacements obligatoires" "$REGLE"; then
  echo "ECHEC legal.md n'énonce plus les trois emplacements obligatoires"
  echo "      Ce contrôle appliquerait alors une règle que plus rien ne porte."
  ko=$((ko + 1))
fi

echo
if [ "$ko" -eq 0 ]; then
  echo "OK les trois emplacements de la mention de rétractation sont servis"
else
  echo "$ko problème(s) détecté(s)"
fi

exit "$ko"
