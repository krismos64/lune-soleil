#!/bin/bash
# Vérifie que toute Server Action d'administration porte sa garde de rôle,
# LS-121 critère 6, motif de LS-89 retrouvé en LS-106.
#
# Motif. Une Server Action est un point d'entrée HTTP : elle s'invoque sans
# jamais charger la page qui la porte. Protéger la page seule laisse ce chemin
# ouvert, et c'est le défaut exact trouvé en relecture de LS-89.
#
# POURQUOI UN CONTRÔLE TEXTUEL ICI, ALORS QUE LE PROJET PRÉFÈRE LES TESTS. La
# garde appelle `headers()` de Next.js, qui exige un contexte de requête : hors
# du serveur elle lève avant d'atteindre la moindre vérification, donc un test
# d'intégration mesurerait cette limite de l'outil plutôt que la garde. Et le
# test e2e d'appel direct ne l'atteint pas non plus : un POST sans en-tête
# `Next-Action` est traité par Next.js comme une navigation, l'action n'est
# jamais exécutée. Mesuré le 27 août 2026, la mutation qui retire la garde
# laissait les 54 tests de `catalogue-administration` verts.
#
# CE CONTRÔLE NE REMPLACE PAS UN TEST D'EXÉCUTION, et il ne prétend pas le
# faire : il prouve une propriété du FICHIER, pas du comportement. Un appel
# placé après l'effet, ou dont l'exception serait rattrapée sur place, le
# satisferait en laissant le trou entier. C'est la meilleure garantie
# atteignable pour ce chemin, et sa limite est écrite ici plutôt que supposée.
#
# CE QU'IL VÉRIFIE, PAR FONCTION ET NON PAR FICHIER. Compter les occurrences
# dans le fichier laisserait passer une action non gardée voisine de trois
# actions gardées : c'est le piège « contrôle par fichier ou par fonction »,
# rencontré sur ce dépôt. Chaque fonction exportée est donc isolée et vérifiée
# séparément.
#
# Usage : ./scripts/verifier-gardes-administration.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

# La garde attendue. `exigerAdministratrice` rend l'identité ou lève ; les
# adaptateurs l'enveloppent souvent dans un `exigerRole` local, qui est donc
# accepté au même titre.
MOTIFS_GARDE="exigerAdministratrice|exigerRole"

ko=0
verifiees=0

# L'ANCRAGE EST LE MARQUEUR `"use server"`, JAMAIS LE NOM DU FICHIER, LS-159.
#
# La première version relevait `-name "actions.ts"`. Trois fichiers de Server
# Actions s'appellent autrement, `actions-variantes.ts`, `actions-medias.ts` et
# `actions-publication.ts` : NEUF actions exportées vivaient hors de la boucle,
# et le contrôle annonçait « 20 actions, toutes gardées » sans les avoir vues.
# Une dixième ajoutée sans garde y serait passée au vert.
#
# Le trou était dans le filet, pas dans le code : les neuf étaient gardées,
# vérifié à la main pendant LS-158. C'est le motif « cible de test inexistante »
# dans sa variante la plus discrète, la liste INCOMPLÈTE plutôt que vide, contre
# laquelle le garde-fou ci-dessous ne protégeait pas.
#
# Le marqueur est ce qui fait d'un fichier un point d'entrée HTTP, et c'est
# l'ancrage retenu par le sens 6 de `verifier-actions-sensibles.sh` : un
# renommage ne le contourne pas, un fichier neuf est vu dès sa première ligne.
fichiers=$(grep -rl '"use server"' src/app/administration | sort)

if [ -z "$fichiers" ]; then
  echo "ECHEC aucun fichier d'actions d'administration trouvé."
  echo "      Le contrôle serait vert sans rien vérifier : chemin périmé ?"
  exit 1
fi

# LE COMPTE ATTENDU EST ÉCRIT, ET C'EST CE QUI REND LA COMPLÉTUDE MESURABLE.
#
# Un contrôle qui relève ce qu'il trouve ne peut pas dire qu'il a trop peu
# trouvé : c'est exactement ainsi que neuf actions ont disparu de sa boucle
# pendant des semaines. Le plancher échoue si le dépôt en porte MOINS, ce qui
# attrape un motif redevenu trop étroit ou un dossier déplacé.
#
# Il ne borne pas par le haut : ajouter une action gardée est le cas normal et
# ne doit rien casser. Relever ce nombre quand il augmente, jamais le baisser
# sans avoir compris quelles actions ont disparu.
ACTIONS_ATTENDUES_MINIMUM=31

for fichier in $fichiers; do
  # Les noms des fonctions exportées, seules invocables depuis l'extérieur.
  # `export async function nom(` est la seule forme employée sur ce dépôt.
  fonctions=$(grep -oE '^export async function [a-zA-Z0-9_]+' "$fichier" |
    sed 's/^export async function //')

  if [ -z "$fonctions" ]; then
    echo "ECHEC $fichier ne déclare aucune action exportée."
    echo "      Un fichier d'actions vide est suspect : renommage oublié ?"
    ko=$((ko + 1))
    continue
  fi

  for fonction in $fonctions; do
    # Le CORPS de la fonction seule, isolé en COMPTANT LES ACCOLADES et non en
    # cherchant une accolade fermante en colonne 1.
    #
    # DEUX PIÈGES MESURÉS LE 27 AOÛT 2026, chacun donnant un FAUX POSITIF, donc
    # le pire sens d'erreur : accuser un code correct de ne pas être gardé.
    #
    #   1. la signature s'étend sur plusieurs lignes quand les paramètres sont
    #      un objet, et exiger la parenthèse ouvrante sur la ligne de
    #      déclaration ratait les trois actions de LS-106 ;
    #   2. la ligne `}): Promise<...> {` qui referme cet objet commence par `}`
    #      en colonne 1, donc arrêtait l'extraction AVANT le corps. C'est le
    #      jumeau du piège « marque @sensible et Prettier » déjà rencontré.
    #
    # Le comptage d'accolades ne dépend d'aucune convention de mise en forme,
    # et traverse les deux cas sans les connaître.
    corps=$(awk -v f="$fonction" '
      index($0, "export async function " f) == 1 { dedans = 1; profondeur = 0 }
      dedans {
        print
        n = gsub(/\{/, "{")
        m = gsub(/\}/, "}")
        profondeur += n - m
        if (profondeur <= 0 && corps_commence) { exit }
        if (n > 0) { corps_commence = 1 }
      }
    ' "$fichier")

    verifiees=$((verifiees + 1))

    if printf '%s' "$corps" | grep -qE "$MOTIFS_GARDE"; then
      continue
    fi

    echo "ECHEC $fichier : l'action \`$fonction\` n'appelle aucune garde de rôle."
    echo "      Une Server Action est invocable directement, sans passer par"
    echo "      l'écran : protéger la page seule laisse ce chemin ouvert."
    ko=$((ko + 1))
  done
done

# LE PLANCHER SE VÉRIFIE APRÈS LA BOUCLE, LS-159. Un contrôle qui a examiné
# moins d'actions que le dépôt n'en porte est un contrôle dont la cible s'est
# dérobée : il resterait vert en ne prouvant rien, ce qui est pire qu'un échec.
if [ "$verifiees" -lt "$ACTIONS_ATTENDUES_MINIMUM" ]; then
  echo
  echo "ECHEC $verifiees action(s) examinée(s), au moins $ACTIONS_ATTENDUES_MINIMUM attendue(s)."
  echo "      Des Server Actions échappent à ce contrôle : motif de relevé trop"
  echo "      étroit, fichier déplacé, ou marqueur \`use server\` absent."
  echo "      NE PAS baisser le plancher sans avoir trouvé où elles sont passées."
  ko=$((ko + 1))
fi

echo
echo "-----------------------------------------"

if [ "$ko" -eq 0 ]; then
  echo "  $verifiees action(s) d'administration, toutes gardées"
else
  echo "  $verifiees action(s) vérifiées, $ko anomalie(s)"
fi

echo "-----------------------------------------"

exit "$ko"
