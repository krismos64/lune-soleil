#!/bin/bash
# Garde le nommage des régions live du parcours d'achat, LS-85.
#
# CE QU'IL EMPÊCHE, ET QUI EST DÉJÀ ARRIVÉ. Une région live sans nom n'est
# **pas** une violation d'accessibilité : `axe-core` la laisse passer, et quatre
# mois de tests verts ne l'avaient pas vue. Un lecteur d'écran annonce le
# changement sans dire de quoi il parle, et deux régions anonymes sur une même
# page s'annoncent identiquement.
#
# LS-85 A NOMMÉ SEPT RÉGIONS le 1er septembre 2026, après avoir capturé l'arbre
# d'accessibilité du parcours réel. **Rien ne les gardait** : retirer un
# `aria-label` laissait passer deux tests de bout en bout, eux-mêmes écrits
# d'après cette capture, mais aucun contrôle ne disait qu'une région NEUVE devait
# en porter un.
#
# CE QUE LE NOM SERT, ET CE QU'IL NE SERT PAS. Il ne change pas l'annonce d'une
# mise à jour, seul le contenu est vocalisé, et la règle C39 le dit. Il sert la
# **navigation par régions** et la lecture de l'arbre d'accessibilité, où une
# région anonyme s'annonce « status » sans rien de plus. Les deux règles ne se
# contredisent pas, elles portent sur deux choses différentes, et la formulation
# trop large de C39 a été corrigée le 11 septembre 2026.
#
# LA PORTÉE S'ARRÊTE AU PARCOURS D'ACHAT, et ce n'est pas une approximation. Le
# dépôt porte quatre-vingts régions live, dont une majorité sans nom : les nommer
# toutes serait un chantier dont le gain est incertain, la spécification
# WAI-ARIA 1.2 restant ambiguë sur ce que les lecteurs d'écran en font. Ce qui
# est MESURÉ est le parcours critique, celui dont `frontend-design.md` exige
# WCAG 2.2 AA, et c'est lui que ce contrôle garde.
#
# Usage : ./scripts/verifier-regions-live-parcours.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
ko=0

# ---------------------------------------------------------------------------
# Les dossiers du parcours critique, et eux seuls.
#
# ILS SONT NOMMÉS PLUTÔT QUE DÉCOUVERTS, contrairement au contrôle
# d'atteignabilité : « parcours d'achat » est une notion métier qu'aucune
# convention de nom ne porte. Une story qui ajoute un écran au parcours ajoute
# son dossier ici, ce qui est la décision qu'on veut rendre consciente.
# ---------------------------------------------------------------------------
DOSSIERS="
src/app/(boutique)/panier
src/app/(boutique)/commande
src/app/(boutique)/produit
"

nb_regions=0
nb_nommees=0

for dossier in $DOSSIERS; do
  [ -n "$dossier" ] || continue
  chemin="$RACINE/$dossier"

  if [ ! -d "$chemin" ]; then
    echo "ECHEC $dossier a disparu"
    echo "      l'ancrage du contrôle est cassé : un dossier du parcours a été"
    echo "      déplacé, et ce contrôle ne garde plus ce qu'il annonce."
    ko=$((ko + 1))
    continue
  fi

  # Chaque balise portant `role="status"` ou `role="alert"`, avec sa ligne.
  #
  # L'ANALYSE VIT DANS UN FICHIER PYTHON SÉPARÉ, jamais en ligne. Ma première
  # version l'imbriquait dans une substitution de commande : une APOSTROPHE
  # dans un commentaire Python y fermait la chaîne shell, le script trouvait
  # zéro région et son garde-fou l'a dit franchement plutôt que de conclure
  # « toutes nommées » sur zéro examen. C'est exactement ce pour quoi ce
  # garde-fou existe.
  #
  # LA RECHERCHE PORTE SUR LA BALISE ENTIÈRE et non sur la ligne : JSX étale
  # volontiers ses attributs sur plusieurs lignes, et un motif de ligne ne
  # verrait jamais l'`aria-label` posé deux lignes plus bas. Le même piège a
  # coûté une correction sur `verifier-actions-sensibles.sh`, où une signature
  # étalée arrêtait le contrôle avant le corps.
  while IFS= read -r trouve; do
    [ -n "$trouve" ] || continue
    nb_regions=$((nb_regions + 1))

    case "$trouve" in
      *NOMMEE*) nb_nommees=$((nb_nommees + 1)) ;;
      # ---------------------------------------------------------------------
      # UNE RÉGION QUI ENVELOPPE SON PROPRE TITRE N'A PAS BESOIN DE NOM, et lui
      # en donner un serait nuisible : le `h1` qu'elle contient EST déjà ce
      # qu'elle annonce, « Pièce momentanément indisponible », et un
      # `aria-label` par-dessus ferait redire deux fois la même chose.
      #
      # LE CAS SE RECONNAÎT À SA FORME et non à son chemin : la balise
      # `role="alert"` d'une page d'erreur enveloppe le titre et les deux
      # sorties, elle n'est pas une zone d'annonce ponctuelle. L'exclure par son
      # nom de fichier ferait passer une future région ponctuelle du même
      # fichier.
      # ---------------------------------------------------------------------
      *ENVELOPPE_TITRE*) nb_nommees=$((nb_nommees + 1)) ;;
      *)
        echo "ECHEC ${trouve#ANONYME }"
        echo "      une région live du parcours d'achat sans nom accessible :"
        echo "      elle s'annonce « status » sans dire de quoi elle parle, et"
        echo "      deux régions anonymes de la même page sont indiscernables."
        echo "      Poser un aria-label, motif de LS-85."
        ko=$((ko + 1))
        ;;
    esac
  done <<EOF
$(find "$chemin" -name "*.tsx" -print0 2>/dev/null \
  | xargs -0 python3 "$RACINE/scripts/lister-regions-live.py" "$RACINE")
EOF
done

echo "Régions live du parcours d'achat : $nb_regions"
echo "Dont nommées ou enveloppant un titre : $nb_nommees"

# ---------------------------------------------------------------------------
# Garde-fou : le contrôle doit avoir examiné quelque chose.
#
# SANS LUI, UN ANCRAGE CASSÉ RENDRAIT UN OK SILENCIEUX. Le motif pourrait cesser
# de trouver la moindre région sans que rien ne le dise, et le script conclurait
# « toutes nommées » sur zéro examen. C'est le défaut qu'un contrôle de ce dépôt
# a déjà porté, et la garde qu'il a fallu lui ajouter.
# ---------------------------------------------------------------------------
if [ "$nb_regions" -eq 0 ]; then
  echo "ECHEC aucune région live trouvée dans le parcours d'achat"
  echo "      son ancrage est cassé : il rendrait un OK sans rien vérifier."
  ko=$((ko + 1))
fi

echo
echo "-----------------------------------------"
if [ "$ko" -eq 0 ]; then
  echo "  OK chaque région live du parcours d'achat porte son nom"
else
  echo "  $ko région(s) live anonyme(s) sur le parcours d'achat"
fi
echo "-----------------------------------------"

exit "$ko"
