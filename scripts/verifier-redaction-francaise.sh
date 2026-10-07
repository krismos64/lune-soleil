#!/bin/bash
# Garde les deux règles de rédaction française du projet, LS-32.
#
# `CLAUDE.md` les énonce comme valant PARTOUT, code, commentaires, Jira,
# documentation, interface et réponses de conversation. Aucune ne disposait d'un
# contrôle, et les deux se sont franchies :
#
#   un TIRET CADRATIN dans le pied de page de CHAQUE facture remise à un
#   client, `gabarit-document.tsx`, trouvé le 11 septembre 2026
#   des accords au FÉMININ que Christophe a dû signaler deux fois, les 27 et
#   28 juillet 2026, la règle ayant été comprise comme portant sur l'interface
#   seule
#
# CE QU'IL GARDE, ET SUR QUELLE PORTÉE.
#
# LE CADRATIN EST TRAQUÉ DANS `src/` ENTIER, commentaires compris : la règle
# vaut pour tout contenu rédigé, et un commentaire recopié dans une interface
# emporte son cadratin avec lui.
#
# L'ACCORD AU FÉMININ N'EST TRAQUÉ QUE SUR LES TEXTES VISIBLES, et c'est une
# limite assumée. Un contrôle textuel ne distingue pas « la route cliente », qui
# est un adjectif technique légitime, de « chère cliente », qui ne l'est pas :
# viser tout le dépôt produirait des faux positifs sur du code sain, ce qui est
# pire qu'une absence de contrôle. Le motif porte donc sur les FORMES qui ne
# peuvent désigner qu'une personne.
#
# CE QU'IL NE FAIT PAS. Il ne lit pas le sens : « Bonjour Madame » lui échappe,
# et c'est la relecture humaine qui l'attrape. Il ferme les formes MÉCANIQUES,
# celles qu'une session recopie sans y penser.
#
# Usage : ./scripts/verifier-redaction-francaise.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
ko=0

# ---------------------------------------------------------------------------
# Sens 1 : aucun tiret cadratin ni demi-cadratin dans le code.
#
# LES DEUX CARACTÈRES SONT VISÉS, `—` U+2014 et `–` U+2013. Ne chercher que le
# premier laisserait passer le second, qui est tout aussi révélateur et plus
# difficile à distinguer d'un trait d'union à l'œil.
#
# `docs/journal/` EST EXCLU : ces pages sont datées et closes, et la règle est
# PROSPECTIVE. Les réécrire rétroactivement effacerait la trace de ce qui a été
# écrit ce jour-là, ce que `CLAUDE.md` interdit nommément.
#
# LES ADR SONT EXCLUS pour la même raison, renforcée : un ADR accepté ne se
# réécrit pas, il s'annote.
# ---------------------------------------------------------------------------
cadratins=$(grep -rn "—\|–" "$RACINE/src" 2>/dev/null || true)

if [ -n "$cadratins" ]; then
  echo "ECHEC tiret cadratin ou demi-cadratin dans src/"
  printf '%s\n' "$cadratins" | sed 's|'"$RACINE"'/||' | head -10 | sed 's/^/      /'
  echo "      Le cadratin est un marqueur de texte généré : employer"
  echo "      deux-points, virgule, parenthèses ou point selon le contexte."
  ko=$((ko + 1))
fi

# ---------------------------------------------------------------------------
# Sens 2 : aucun accord au féminin désignant un client.
#
# LES MOTIFS VISENT DES FORMES QUI NE PEUVENT DÉSIGNER QU'UNE PERSONNE, jamais
# un adjectif technique. « la route cliente » et « une API cliente » sont
# légitimes et ne doivent pas rougir : c'est pourquoi le motif exige un
# déterminant ou un verbe qui personnalise.
#
# L'EXCEPTION EST NOMMÉE : « l'administratrice » et « l'exploitante » désignent
# une personne réelle et identifiée, l'accord y est correct, `CLAUDE.md` le dit.
#
# LA PORTÉE S'ARRÊTE AUX TEXTES VISIBLES, `src/app` et `src/components`. Les
# services et les repositories ne rendent aucun texte à l'écran, et leurs
# commentaires emploient légitimement « la commande cliente ».
# ---------------------------------------------------------------------------
MOTIFS_FEMININ=(
  # « chère cliente », « la cliente », « une cliente », au singulier ou pluriel
  "([Cc]hères? |[Ll]a |[Uu]ne |[Ll]es |[Dd]es )client(e|es)\b"
  # « acheteuse », « visiteuse », qui n'ont aucun usage technique
  "[Aa]cheteuses?\b"
  "[Vv]isiteuses?\b"
  # « vous êtes connectée », « vous serez livrée » : accord sur le lecteur
  "[Vv]ous (êtes|serez|seriez|avez été|étiez) [a-zà-ÿ]+ée?s?\b"
  # « vous êtes inscrite », « soyez connectée » : l'accord porte sur le LECTEUR
  #
  # LE SUJET EST EXIGÉ, ET C'EST CE QUI ÉVITE LE FAUX POSITIF. Ma première
  # version cherchait « est informée » nu, et elle a accusé « La personne qui
  # l'a déposé en est informée », où l'accord porte sur « personne » et est
  # parfaitement correct. Un contrôle qui accuse du texte sain est pire qu'une
  # absence de contrôle : la correction évidente aurait été de dégrader une
  # phrase juste.
  "[Vv]ous (êtes|serez|seriez|soyez) (inscrite|connectée|livrée|informée)s?\b"
)

nb_fichiers=0

while IFS= read -r fichier; do
  [ -n "$fichier" ] || continue
  nb_fichiers=$((nb_fichiers + 1))

  for motif in "${MOTIFS_FEMININ[@]}"; do
    # Les lignes de commentaire sont RETIRÉES avant la recherche : elles
    # emploient légitimement « la cliente » pour parler d'une personne dans une
    # explication, et ce qui compte est ce qui s'affiche.
    # LES COMMENTAIRES SONT RETIRÉS PAR `perl` ET NON PAR `sed`, ce dernier
    # refusant les alternances en syntaxe GNU sur BSD : `sed -E 's|(a|b)||'`
    # échoue en « parentheses not balanced » sur macOS. Ma première version
    # laissait ces erreurs s'imprimer et rendait un OK malgré tout, le `|| true`
    # avalant l'échec. Un contrôle qui conclut sur un filtre en panne ne vaut
    # rien : `perl` se comporte identiquement sur les deux systèmes.
    trouve=$(perl -pe 's{^\s*(?://|\*|/\*).*$}{}' "$fichier" \
      | grep -nE "$motif" 2>/dev/null || true)

    if [ -n "$trouve" ]; then
      court=${fichier#"$RACINE"/}
      echo "ECHEC accord au féminin dans $court"
      printf '%s\n' "$trouve" | head -3 | sed 's/^/      /'
      echo "      Une part notable des acheteurs est masculine, un homme qui"
      echo "      offre un bijou : tourner SANS accord de genre, jamais"
      echo "      « client(e) ». Exception, « l'administratrice » et"
      echo "      « l'exploitante » désignent une personne réelle."
      ko=$((ko + 1))
    fi
  done
done <<EOF
$(find "$RACINE/src/app" "$RACINE/src/components" \
    -name "*.tsx" -o -name "*.ts" 2>/dev/null | sort)
EOF

echo "Fichiers d'interface examinés : $nb_fichiers"

# ---------------------------------------------------------------------------
# Sens 3 : aucun « nous » de marque dans un texte public, LS-286.
#
# L'EXPLOITANTE EXERCE SEULE, et un « nous » décrit une entreprise qui n'existe
# pas. Arbitrage de Christophe du 7 octobre 2026 : les textes publics parlent
# de « l'atelier », à la troisième personne. Le défaut s'était glissé sur une
# cinquantaine de phrases, pages légales et emails compris, faute de contrôle.
#
# LA PORTÉE EST CE QUE LIT UN CLIENT : les écrans de la boutique, les
# composants, les pages d'erreur de la racine et les emails. L'administration
# est exclue, ses textes s'adressent à l'exploitante.
#
# LES COMMENTAIRES SONT RETIRÉS AVANT LA RECHERCHE, comme au sens 2 : ils
# emploient légitimement « nous » pour parler de l'équipe de développement.
# ---------------------------------------------------------------------------
nb_publics=0

while IFS= read -r fichier; do
  [ -n "$fichier" ] || continue
  nb_publics=$((nb_publics + 1))

  trouve=$(perl -pe 's{^\s*(?://|\*|/\*|\{/\*).*$}{}' "$fichier" \
    | grep -nwE "[Nn]ous|[Nn]otre|[Nn]os" 2>/dev/null || true)

  if [ -n "$trouve" ]; then
    court=${fichier#"$RACINE"/}
    echo "ECHEC « nous » de marque dans $court"
    printf '%s\n' "$trouve" | head -3 | sed 's/^/      /'
    echo "      L'exploitante exerce seule : écrire « l'atelier », à la"
    echo "      troisième personne, arbitrage du 7 octobre 2026, LS-286."
    ko=$((ko + 1))
  fi
done <<EOF
$(find "$RACINE/src/app/(boutique)" "$RACINE/src/components" \
    "$RACINE/src/integrations/email" \
    "$RACINE/src/app/global-error.tsx" "$RACINE/src/app/not-found.tsx" \
    \( -name "*.tsx" -o -name "*.ts" \) ! -name "*.test.*" 2>/dev/null | sort)
EOF

echo "Fichiers publics examinés pour le « nous » : $nb_publics"

if [ "$nb_publics" -eq 0 ]; then
  echo "ECHEC aucun fichier public trouvé pour le « nous » de marque"
  echo "      l'ancrage du sens 3 est cassé."
  ko=$((ko + 1))
fi

# ---------------------------------------------------------------------------
# Garde-fou : le contrôle doit avoir examiné quelque chose.
#
# SANS LUI, UN ANCRAGE CASSÉ RENDRAIT UN OK SILENCIEUX. Le `find` pourrait
# cesser de trouver le moindre fichier sans que rien ne le dise, et le script
# conclurait « rédaction conforme » sur zéro examen.
# ---------------------------------------------------------------------------
if [ "$nb_fichiers" -eq 0 ]; then
  echo "ECHEC aucun fichier d'interface trouvé"
  echo "      l'ancrage du contrôle est cassé : il rendrait un OK sans rien"
  echo "      vérifier."
  ko=$((ko + 1))
fi

echo
echo "-----------------------------------------"
if [ "$ko" -eq 0 ]; then
  echo "  OK aucun cadratin, aucun accord au féminin, aucun « nous » de marque"
else
  echo "  $ko anomalie(s) de rédaction"
fi
echo "-----------------------------------------"

exit "$ko"
