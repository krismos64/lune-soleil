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
# IL A TROUVE UN SECOND DEFAUT EN LS-70, par une mutation restee VERTE. Inverser
# le sens du defaut de `normaliserRole` vers ADMINISTRATRICE ne changeait rien
# aux quinze tests d'alors : les deux versions donnent le meme resultat sur
# toute valeur attendue, seule une valeur inconnue separe un defaut ferme d'un
# defaut ouvert. Le cas 7 existe pour que cette regression ne repasse pas.
#
# CE QU'IL NE FAIT PAS. Il mute la primitive SQL, l'autorisation et l'interface,
# pas le schema ni les migrations : verifier-schema.sh couvre les contraintes de
# base, et les deux controles ne sont pas redondants. L'un dit que la base
# refuse une survente, l'autre que l'application ne l'atteint jamais.
#
# Usage : ./scripts/verifier-tests-mutation.sh
# Prerequis : Docker lance, base locale preparee. Sans base, le script echoue
# franchement plutot que d'annoncer un vert qui ne veut rien dire.
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

SQL="tests/aide/reservation-sql.ts"
STOCK="src/repositories/stock.ts"
PAGE="src/app/page.tsx"
LAYOUT="src/app/layout.tsx"
AUTH="src/lib/auth.ts"
AUTORISATION="src/services/autorisation.ts"
PROFIL="src/services/utilisateur.ts"

MUTABLES=("$SQL" "$STOCK" "$PAGE" "$LAYOUT" "$AUTH" "$AUTORISATION" "$PROFIL")

for f in "${MUTABLES[@]}"; do
  [ -r "$f" ] || { echo "ECHEC fichier illisible : $f"; exit 1; }
done

TMP="$(mktemp -d)"
ORIGINE="$TMP/origine"
mkdir -p "$ORIGINE"

# Sauvegarde par chemin aplati : deux fichiers peuvent porter le meme nom de
# base, `stock.ts` et un futur `stock.ts` ailleurs.
cle() { printf '%s' "$1" | tr '/' '_'; }

for f in "${MUTABLES[@]}"; do
  cp "$f" "$ORIGINE/$(cle "$f")"
done

restaurer() {
  for f in "${MUTABLES[@]}"; do
    cp "$ORIGINE/$(cle "$f")" "$f"
  done
}

# ---------------------------------------------------------------------------
# Une mutation qui ne modifie AUCUN fichier doit echouer bruyamment.
#
# POURQUOI CE GARDE-FOU EXISTE. Trois cas visaient `tests/aide/reservation-sql.ts`
# alors que LS-50 avait deplace la requete dans le repository : les substitutions
# ne trouvaient plus rien, ne mutaient rien, et le script concluait « NON
# detecte, le test est aveugle » sur des tests parfaitement voyants.
#
# Le sens de l'echec etait INVERSE, ce qui est pire qu'une absence de controle :
# il accusait les tests a la place du script, et la correction evidente aurait
# ete de reecrire des tests qui n'avaient rien. Trouve a la relecture de LS-70.
#
# `mute` compare l'etat du fichier avant et apres la substitution. Un fichier
# inchange arrete tout : la mutation n'a rien prouve, ni dans un sens ni dans
# l'autre.
# ---------------------------------------------------------------------------
mute() {
  local fichier="$1" expression="$2"
  local avant
  avant=$(cksum <"$fichier")

  perl -0pi -e "$expression" "$fichier"

  if [ "$(cksum <"$fichier")" = "$avant" ]; then
    echo "  ECHEC la mutation n'a modifie aucun caractere de $fichier"
    echo "        L'expression ne correspond plus au code. La cible a sans doute"
    echo "        ete deplacee ou reecrite : corriger le script, pas les tests."
    echo "        expression : $expression"
    exit 1
  fi
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

# LES TROIS PREMIERS CAS MUTENT LE REPOSITORY, ET NON L'AIDE DE TEST.
#
# Ils visaient `tests/aide/reservation-sql.ts` jusqu'a la relecture de LS-70.
# Or LS-50 a deplace `SQL_RESERVER` dans `src/repositories/stock.ts`, l'aide
# n'en faisant plus qu'une REEXPORTATION : le fichier ne contient plus la
# requete, les substitutions ne trouvaient plus rien et ne mutaient donc RIEN.
# Le script annoncait « NON detecte, le test est aveugle » sur trois cas dont
# les tests etaient parfaitement voyants, mesure faite en mutant la vraie cible.
#
# Une mutation qui ne modifie aucun fichier accuse les tests a la place du
# script. Le sens de l'echec etait inverse, ce qui est pire qu'une absence de
# controle : il designait un coupable innocent.
#
# Cas 1 : LA mutation exigee par le critere d'acceptation de LS-68. Sans la
# condition de disponibilite, l'UPDATE laisse passer tout le monde et seule la
# contrainte CHECK arrete la survente.
mute "$STOCK" 's/\n      AND quantite_physique - quantite_reservee >= \$3//'
cas "condition de disponibilite retiree de l'UPDATE" integration \
  "sert exactement un acheteur sur vingt simultanes"

# Cas 2 : la variante archivee redevient reservable. Absent du prototype, la
# colonne n'existait pas alors.
mute "$STOCK" 's/\n      AND archivee_a IS NULL//'
cas "condition archivee_a retiree" integration \
  "refuse la reservation d'une variante archivee"

# Cas 3 : le cas du marche disparait, une piece retiree de la vente web
# redevient achetable en ligne.
mute "$STOCK" 's/\n      AND vente_web_activee = true//'
cas "condition vente_web_activee retiree" integration \
  "refuse la reservation quand la vente web est desactivee"

# Cas 4 : la tache de liberation supprime les lignes expirees sans rendre le
# stock. La piece resterait bloquee pour toujours.
mute "$SQL" 's/SET quantite_reservee = v\.quantite_reservee - e\.q/SET quantite_reservee = v.quantite_reservee/'
cas "liberation qui ne decremente plus la quantite reservee" integration \
  "libere une reservation expiree"

# Cas 5 : la vente ne sort pas la piece du stock physique. Elle resterait
# achetable apres avoir ete vendue et expediee.
mute "$SQL" 's/SET quantite_physique = v\.quantite_physique - c\.q,/SET quantite_physique = v.quantite_physique,/'
cas "conversion en vente qui ne decremente plus le stock physique" integration \
  "rend la piece definitivement indisponible apres conversion"

echo
echo "Autorisation, LS-70, tests d'integration"
echo

# Cas 6 : ELEVATION DE PRIVILEGE PAR L'INSCRIPTION. Sans `input: false`, un
# role poste dans le corps du formulaire est ecrit en base tel quel. Ce n'est
# pas une mutation theorique : le compte devient reellement ADMINISTRATRICE.
mute "$AUTH" 's/\n          input: false,//'
cas "input: false retire du champ role" integration \
  "ignore un role force dans le corps de l'inscription"

# Cas 7 : LE SENS DU DEFAUT DE `normaliserRole`. Cette mutation est celle qui
# est passee au vert pendant l'ecriture de LS-70, et c'est pour elle que ce cas
# existe. Les deux versions donnent le MEME resultat sur toute valeur attendue :
# seule une valeur inconnue, absente ou composee separe un defaut ferme d'un
# defaut ouvert, regle E10.
mute "$AUTORISATION" 's/  return valeur === "ADMINISTRATRICE" \? "ADMINISTRATRICE" : "CLIENT";/  return valeur === "CLIENT" ? "CLIENT" : "ADMINISTRATRICE";/'
cas "defaut de normaliserRole ouvert au lieu de ferme" integration \
  "ne donne aucun droit quand la session ne porte pas de role"

# Cas 8 : L'ADMINISTRATION OUVERTE A TOUT COMPTE CONNECTE. Ne verifier que la
# presence d'une session laisse entrer n'importe quel client authentifie. Les
# tests de refus sans session restent verts, seul celui de la session valide au
# role insuffisant rougit.
mute "$AUTORISATION" 's/  if \(!identite \|\| identite\.role !== "ADMINISTRATRICE"\) \{/  if (!identite) {/'
cas "verification du role retiree d'exigerAdministratrice" integration \
  "refuse l'administration a une session de client authentifie"

# Cas 9 : LE CHEMIN QUI ECHAPPE A BETTER AUTH. Sans `.strict()`, Zod ignore les
# cles inconnues en silence : la tentative d'ecrire `role` ne leve plus rien.
mute "$PROFIL" 's/  \.strict\(\);/  ;/'
cas ".strict() retire du schema de mise a jour de profil" integration \
  "rejette un role force dans une mise a jour de profil"

# Cas 10 : LE COOKIE DE SESSION SANS `Secure`, defaut REEL trouve par la revue
# critique de LS-70. Le repli `?? "http://localhost:3000"` rendait la branche
# `isProduction` de Better Auth inatteignable, et une production servie sans
# BETTER_AUTH_URL emettait un cookie en clair, sept jours de validite.
#
# LA MUTATION RETIRE `useSecureCookies`, qui est ce qui protege desormais, et
# NON `baseURL`. Une premiere version mutait `baseURL` : elle restait verte,
# le test d'alors passant une URL en `https`, cas ou Better Auth deduit
# correctement tout seul. Le test qui compte est celui de la production servie
# en `http`, seul cas ou la deduction donne faux.
mute "$AUTH" 's/      useSecureCookies: productionSimulee \|\| urlSite\.startsWith\("https:\/\/"\),\n//'
cas "useSecureCookies retire, le cookie perd Secure en production" integration \
  "porte Secure en production meme si l'URL est en http"

echo
echo "Interface, tests de bout en bout"
echo

# Cas 11 : debordement horizontal. Invisible a 1280 px, visible a 320 et 390 px,
# ce qui justifie les trois largeurs de playwright.config.ts.
mute "$PAGE" 's/<h1 className=\{styles\.titre\}>/<h1 className={styles.titre} style={{ width: "800px" }}>/'
cas "debordement horizontal introduit dans la page" e2e \
  "la page ne deborde pas horizontalement"

# Cas 12 : violation d'accessibilite. Un document sans langue declaree est lu
# avec la prononciation par defaut du lecteur d'ecran.
mute "$LAYOUT" 's/<html lang="fr">/<html>/'
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
