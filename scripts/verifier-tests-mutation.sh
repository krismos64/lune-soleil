#!/usr/bin/env bash
# Preuve par mutation de la suite de tests, LS-68.
#
# MOTIF. Huit tests verts ne prouvent rien tant qu'ils n'ont pas echoue sur le
# defaut qu'ils pretendent attraper. Ce projet en a deja fait l'experience :
# huit assertions ne testaient rien, et un garde-fou de cardinalite restait vert
# sur un predicat fausse.
#
# CE SCRIPT A TROUVE UN DEFAUT REEL PENDANT L'ECRITURE DE LS-68. La premiere
# version du test de concurrence comptait les reservations creees et verifiait
# que le stock ne devenait pas negatif. En retirant la condition de
# disponibilite de l'UPDATE, elle restait ENTIEREMENT VERTE : la contrainte
# chk_variante_pas_de_survente rattrapait a la place de l'UPDATE, et l'etat final
# etait rigoureusement identique. Une reservation, quantite reservee a 1, stock
# positif. Seule la NATURE du refus changeait, dix-neuf violations de contrainte
# au lieu de dix-neuf refus metier.
#
# C'est ce qui a impose la distinction SERVIE / REFUSEE / VIOLATION dans le test.
# Sans ce script, le defaut serait passe.
#
# CE QU'IL NE FAIT PAS. Il ne mute que la primitive SQL et l'interface, pas le
# schema ni les migrations : verifier-schema.sh couvre les contraintes de base,
# et les deux controles ne sont pas redondants. L'un dit que la base refuse une
# survente, l'autre que l'application ne l'atteint jamais.
#
# Usage : ./scripts/verifier-tests-mutation.sh
# Prerequis : Docker lance, base locale preparee. Sans base, le script echoue
# franchement plutot que d'annoncer un vert qui ne veut rien dire.
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

SQL="tests/aide/reservation-sql.ts"
PAGE="src/app/page.tsx"
LAYOUT="src/app/layout.tsx"

for f in "$SQL" "$PAGE" "$LAYOUT"; do
  [ -r "$f" ] || { echo "ECHEC fichier illisible : $f"; exit 1; }
done

TMP="$(mktemp -d)"
cp "$SQL" "$TMP/sql.orig"
cp "$PAGE" "$TMP/page.orig"
cp "$LAYOUT" "$TMP/layout.orig"

restaurer() {
  cp "$TMP/sql.orig" "$SQL"
  cp "$TMP/page.orig" "$PAGE"
  cp "$TMP/layout.orig" "$LAYOUT"
}
nettoyer() { restaurer; rm -rf "$TMP"; }
trap nettoyer EXIT

echecs=0
mutations=0

# ---------------------------------------------------------------------------
# Controle prealable : la suite doit etre VERTE avant toute mutation.
#
# Sans cette verification, un script qui echoue pour une autre raison, base
# arretee ou dependance manquante, afficherait « toutes les mutations
# detectees » alors qu'aucune n'a rien prouve. C'est le defaut exact corrige par
# LS-42 sur le script de migration, un mode fail-open qui concluait au vert.
# ---------------------------------------------------------------------------
echo "Etat de reference, avant toute mutation"
if ! npm run test:integration >"$TMP/reference.txt" 2>&1; then
  echo "  ECHEC la suite n'est pas verte AVANT mutation."
  echo "        Aucune mutation ne peut rien prouver dans cet etat."
  echo
  tail -20 "$TMP/reference.txt" | sed 's/^/        /'
  exit 1
fi
echo "  OK    suite verte, les mutations peuvent commencer"
echo

# ---------------------------------------------------------------------------
# `cas` exige que la commande ECHOUE, ET que ce soit LE TEST ATTENDU qui rougit.
#
# POURQUOI LE TROISIEME ARGUMENT EXISTE. Une premiere version se contentait
# d'exiger un echec, n'importe lequel. Mesure pendant l'ecriture de LS-68 : en
# neutralisant les assertions des trois tests de concurrence, cette version
# annoncait toujours « 7 mutations, 7 detectees ». La mutation etait bien vue,
# mais par deux tests INDIRECTS, liberation et conversion, pendant que les tests
# censes couvrir la concurrence etaient devenus aveugles.
#
# Un script de mutation qui mesure « au moins un test rougit » laisse donc
# passer exactement le defaut qu'il pretend attraper. Il doit exiger que le test
# QUI PORTE LA GARANTIE echoue.
# ---------------------------------------------------------------------------
cas() {
  local nom="$1" commande="$2" motif_attendu="$3"
  mutations=$((mutations + 1))

  if $commande >"$TMP/sortie.txt" 2>&1; then
    echo "  RATE  $nom -> NON detecte, le test est aveugle"
    echecs=$((echecs + 1))
    restaurer
    return
  fi

  # Les lignes en echec seulement, marquees × par Vitest et ✘ par Playwright.
  # Chercher le motif dans toute la sortie confondrait un test en echec avec le
  # meme test passe au vert quelques lignes plus haut.
  local lignes_echec
  lignes_echec=$(grep -E '(×|✘)' "$TMP/sortie.txt")

  if printf '%s' "$lignes_echec" | grep -qF "$motif_attendu"; then
    echo "  OK    $nom -> detecte par le test attendu"
    printf '%s\n' "$lignes_echec" | head -3 | sed 's/^ *//' | sed 's/^/          /'
  else
    echo "  RATE  $nom -> echec constate, mais PAS sur le test attendu"
    echo "          attendu : $motif_attendu"
    echo "          echecs reels :"
    printf '%s\n' "$lignes_echec" | head -3 | sed 's/^ *//' | sed 's/^/            /'
    echecs=$((echecs + 1))
  fi
  restaurer
}

integration() { npm run test:integration; }
e2e() { npm run test:e2e; }

echo "Primitive SQL de reservation, tests d'integration"
echo

# Cas 1 : LA mutation exigee par le critere d'acceptation de LS-68. Sans la
# condition de disponibilite, l'UPDATE laisse passer tout le monde et seule la
# contrainte CHECK arrete la survente.
perl -0pi -e 's/\n      AND quantite_physique - quantite_reservee >= \$3//' "$SQL"
cas "condition de disponibilite retiree de l'UPDATE" integration \
  "sert exactement un acheteur sur vingt simultanes"

# Cas 2 : la variante archivee redevient reservable. Absent du prototype, la
# colonne n'existait pas alors.
perl -0pi -e 's/\n      AND archivee_a IS NULL//' "$SQL"
cas "condition archivee_a retiree" integration \
  "refuse la reservation d'une variante archivee"

# Cas 3 : le cas du marche disparait, une piece retiree de la vente web
# redevient achetable en ligne.
perl -0pi -e 's/\n      AND vente_web_activee = true//' "$SQL"
cas "condition vente_web_activee retiree" integration \
  "refuse la reservation quand la vente web est desactivee"

# Cas 4 : la tache de liberation supprime les lignes expirees sans rendre le
# stock. La piece resterait bloquee pour toujours.
perl -0pi -e 's/SET quantite_reservee = v\.quantite_reservee - e\.q/SET quantite_reservee = v.quantite_reservee/' "$SQL"
cas "liberation qui ne decremente plus la quantite reservee" integration \
  "libere une reservation expiree"

# Cas 5 : la vente ne sort pas la piece du stock physique. Elle resterait
# achetable apres avoir ete vendue et expediee.
perl -0pi -e 's/SET quantite_physique = v\.quantite_physique - c\.q,/SET quantite_physique = v.quantite_physique,/' "$SQL"
cas "conversion en vente qui ne decremente plus le stock physique" integration \
  "rend la piece definitivement indisponible apres conversion"

echo
echo "Interface, tests de bout en bout"
echo

# Cas 6 : debordement horizontal. Invisible a 1280 px, visible a 320 et 390 px,
# ce qui justifie les trois largeurs de playwright.config.ts.
perl -0pi -e 's/<h1 className=\{styles\.titre\}>/<h1 className={styles.titre} style={{ width: "800px" }}>/' "$PAGE"
cas "debordement horizontal introduit dans la page" e2e \
  "la page ne deborde pas horizontalement"

# Cas 7 : violation d'accessibilite. Un document sans langue declaree est lu
# avec la prononciation par defaut du lecteur d'ecran.
perl -pi -e 's/<html lang="fr">/<html>/' "$LAYOUT"
cas "attribut lang retire du document" e2e \
  "aucune violation d'accessibilite serieuse"

echo
echo "-----------------------------------------"
if [ "$echecs" -eq 0 ]; then
  echo "  $mutations mutations, $mutations detectees"
else
  echo "  $mutations mutations, $echecs NON detectees"
fi
echo "-----------------------------------------"

exit "$echecs"
