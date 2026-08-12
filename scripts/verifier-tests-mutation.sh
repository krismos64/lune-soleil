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
REAUTH="src/services/reauthentification.ts"
AUTORISATION="src/services/autorisation.ts"
PROFIL="src/services/utilisateur.ts"
VALIDATION="src/lib/validation.ts"
JOURNAL="src/lib/journal.ts"
SANTE="src/services/sante.ts"
HOOK_JOURNAL="src/lib/issue-connexion.ts"
HOOK_JOURNAL_HOOK="src/lib/hook-journal-connexion.ts"
ROUTE_AUTH="src/app/api/auth/[...all]/route.ts"
JOURNAL_CONNEXION="src/services/journal-connexion.ts"
VERROU="src/repositories/verrou.ts"
TACHE_PLANIFIEE="src/services/tache-planifiee.ts"
ROUTE_TACHE="src/app/api/interne/taches/[nom]/route.ts"
PREUVE="src/services/preuve-identite.ts"
ACTION_REAUTH="src/app/administration/reauthentification/actions.ts"
PURGE_JOURNAUX="src/services/purge-journaux.ts"

# TOUT FICHIER MUTE DOIT FIGURER ICI, sans quoi il n'est ni sauvegarde ni
# restaure et la mutation RESTE SUR LE DISQUE apres l'execution.
#
# Ce n'est pas theorique : `$REAUTH` a ete mute par le cas 22 depuis LS-81 sans
# etre dans cette liste. Chaque execution du script laissait donc
# `preuveEncoreValable(null)` rendre `true`, c'est-a-dire le defaut de securite
# que LS-81 avait justement corrige avant sa fusion, reintroduit en silence sur
# le disque. Trouve pendant LS-80, parce que la suite complete rougissait apres
# un script annoncant « 27 mutations, 27 detectees ».
#
# Le garde-fou plus bas confronte cette liste aux fichiers reellement mutes.
MUTABLES=("$SQL" "$STOCK" "$PAGE" "$LAYOUT" "$AUTH" "$REAUTH" "$AUTORISATION" "$PROFIL" "$VALIDATION" "$JOURNAL" "$SANTE" "$HOOK_JOURNAL" "$HOOK_JOURNAL_HOOK" "$ROUTE_AUTH" "$JOURNAL_CONNEXION" "$VERROU" "$TACHE_PLANIFIEE" "$ROUTE_TACHE" "$PREUVE" "$ACTION_REAUTH" "$PURGE_JOURNAUX")

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

  # UN FICHIER MUTE HORS DE `MUTABLES` NE SERAIT JAMAIS RESTAURE : la mutation
  # survivrait a l'execution, et un defaut de securite volontairement injecte
  # resterait dans l'arbre de travail. Le cas s'est produit avec `$REAUTH`.
  local connu=0
  local candidat
  for candidat in "${MUTABLES[@]}"; do
    [ "$candidat" = "$fichier" ] && connu=1
  done
  if [ "$connu" -eq 0 ]; then
    echo "  ECHEC $fichier est mute mais absent de MUTABLES."
    echo "        Il ne serait ni sauvegarde ni restaure : la mutation resterait"
    echo "        sur le disque apres l'execution. L'ajouter a MUTABLES."
    exit 1
  fi

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

# LES DEUX PROJETS SONT VERIFIES, pas seulement l'integration. Depuis LS-71 des
# cas mutent contre `test:unitaire` : n'etablir que la verdeur de l'integration
# laisserait ces cas conclure sur une suite unitaire deja rouge, et un « RATE,
# le test est aveugle » ne distinguerait pas un test defaillant d'un test
# absent. C'est le mode fail-open que ce controle prealable existe pour eviter.
for suite in test:integration test:unitaire; do
  if ! npm run "$suite" >"$TMP/reference.txt" 2>&1; then
    echo "  ECHEC la suite $suite n'est pas verte AVANT mutation."
    echo "        Aucune mutation ne peut rien prouver dans cet etat."
    echo
    tail -20 "$TMP/reference.txt" | sed 's/^/        /'
    exit 1
  fi
  echo "  OK    $suite verte"
done
echo "  OK    les mutations peuvent commencer"
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
unitaire() { npm run test:unitaire; }

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
echo "Socle de validation, tests unitaires et d'integration"
echo

# ---------------------------------------------------------------------------
# LS-71. Ces quatre cas visent le socle Zod, et chacun mute une BORNE, jamais un
# message : un libelle reecrit ne change aucun comportement, et une mutation
# sans effet observable accuserait les tests a tort.
# ---------------------------------------------------------------------------

# Cas 13 : LE CAS CENTRAL DE L'INVARIANT 1. `z.number()` accepte les decimaux
# la ou `z.int()` les refuse. Sans ce refus, `19.99` traverserait le socle,
# c'est-a-dire un prix en euros pris pour des centimes.
mute "$VALIDATION" 's/export const schemaMontantCentimes = z\n  \.int\("Un montant en centimes entiers est attendu\."\)/export const schemaMontantCentimes = z\n  .number("Un montant en centimes entiers est attendu.")/'
cas "montant decimal accepte, z.int devient z.number" unitaire \
  "refuse un montant decimal"

# Cas 14 : la borne des quantites glisse de 1 a 0. C'est la dette de LS-50 :
# une ligne de panier a zero article partirait jusqu'a PostgreSQL.
mute "$VALIDATION" 's/  \.min\(1, "Une quantite doit etre strictement positive\."\)/  .min(0, "Une quantite doit etre strictement positive.")/'
cas "quantite nulle acceptee, borne passee de 1 a 0" unitaire \
  "refuse une quantite invalide"

# ---------------------------------------------------------------------------
# Cas 15 : INVARIANT 9, ET LE SEUL VECTEUR DE FUITE REEL.
#
# DEUX MUTATIONS ONT ETE ECARTEES AVANT CELLE-CI, toutes deux restees vertes, et
# elles avaient raison de l'etre. Elles ajoutaient `probleme.input` au message,
# en supposant que Zod y met la valeur refusee. Mesure sur Zod 4 dans ce depot :
# les `issues` serialisees ne portent PAS `input`, la mutation n'ajoutait donc
# que « (recu : undefined) » et ne faisait rien fuiter.
#
# Le vrai vecteur est `unrecognized_keys`, dont le message porte les NOMS des
# cles rejetees. Ces noms viennent de l'entree et sont choisis par l'appelant.
# Reprendre le message de Zod tel quel les ecrit dans le journal.
#
# La mutation retire donc la branche qui remplace ce message.
# ---------------------------------------------------------------------------
mute "$VALIDATION" 's/      if \(probleme\.code === "unrecognized_keys"\) \{\n.*\n.*\n        return `\$\{chemin\} : \$\{probleme\.keys\.length\} champ\(s\) non reconnu\(s\)\.`;\n      \}\n\n//'
cas "noms des cles inconnues recopies dans le message" unitaire \
  "ne recopie pas le nom d'une cle inconnue"

# ---------------------------------------------------------------------------
# Cas 16 a 19, LS-73 : la journalisation et le controle de sante.
#
# CE QUE CES QUATRE CAS PROTEGENT. Le critere 3 de LS-73 est une exigence
# d'ABSENCE : rien de sensible ne sort. Une exigence d'absence est exactement ce
# qu'une suite verte ne prouve jamais toute seule, puisqu'un module qui
# n'ecrirait rien du tout la satisferait aussi. Chaque cas ouvre donc un vecteur
# de fuite reel et verifie que le test attendu le voit.
# ---------------------------------------------------------------------------

# Cas 16 : LE MASQUAGE NEUTRALISE. C'est la garantie centrale de la story : sans
# elle, une adresse email ou un secret passe en contexte est ecrit en clair dans
# un journal, sur un depot public.
mute "$JOURNAL" 's/return resultat;/return contexte;/'
cas "masquage neutralise, le contexte sort tel quel" unitaire \
  "masque la valeur de"

# Cas 17 : LA COMPARAISON REDEVIENT EXACTE. Defaut plus insidieux que le
# precedent : `email` seul resterait masque, et la suite garderait l'air de
# proteger. Les noms REELS sont composes, `emailClient`, `adresseLivraison` : ce
# sont eux qui fuiraient.
mute "$JOURNAL" 's/normalisee\.includes\(interdite\)/normalisee === interdite/'
cas "comparaison de cle exacte au lieu d'inclusion" unitaire \
  "masque la valeur de"

# Cas 18 : LE MESSAGE D'ERREUR REMIS DANS LE JOURNAL. Le vecteur que la story
# designe comme le plus probable. PostgreSQL recopie la valeur en conflit dans
# le message d'une violation d'unicite : « Key (email)=(...) already exists ».
#
# LA SUBSTITUTION N'EMPLOIE PAS D'INTERPOLATION JAVASCRIPT, et ce detail a fait
# echouer la premiere ecriture de ce cas. Perl interprete `${erreur.name}` dans
# sa chaine de remplacement comme une de SES variables, vide ici : le code mute
# devenait `return ": ";`, qui vide le nom au lieu d'ajouter le message. La
# mutation testait donc autre chose que ce qu'elle annoncait, et le test
# attendu restait vert a juste titre. Une concatenation ordinaire ne contient
# aucune sequence que Perl reclame.
mute "$JOURNAL" 's/    return erreur\.name;/    return erreur.name + ": " + erreur.message;/'
cas "message d'erreur recopie dans le journal" unitaire \
  "n'ecrit pas le message d'une erreur"

# Cas 19 : LA BASE MORTE PASSE POUR SAINE. Le critere 2. Une sante qui repond
# toujours « operationnel » satisfait le test nominal sans difficulte, et un
# orchestrateur ne redemarrerait jamais un conteneur dont la base est tombee.
mute "$SANTE" 's/return \{ operationnel: false, base: "indisponible" \};/return { operationnel: true, base: "disponible" };/'
cas "base injoignable declaree disponible" integration \
  "declare le service non operationnel"

echo
echo "Limitation de debit, LS-79, ADR-027, tests d'integration"
echo

# Cas 20 : LA LIMITATION DESACTIVEE HORS PRODUCTION. Better Auth desactive ce
# mecanisme par defaut hors production ; le forcer est le point non negociable
# de l'ADR. Sans lui, aucune des quatre requetes de trop n'est jamais refusee.
mute "$AUTH" 's/    rateLimit: \{\n      enabled: true,/    rateLimit: {\n      enabled: false,/'
cas "rateLimit.enabled remis a false" integration \
  "refuse la requete de trop sur la connexion, cinq admises"

# Cas 21 : LE STOCKAGE EN MEMOIRE. Le compteur ne survivrait pas a un
# redemarrage du processus serveur, deuxieme point non negociable de l'ADR.
mute "$AUTH" 's/      storage: "database",/      storage: "memory",/'
cas "rateLimit.storage remis a memory" integration \
  "le compteur est en base et survit a une nouvelle instance, critere 1"

# Cas 22 : LE DEFAUT FERME DE LA PREUVE D'IDENTITE, LS-81. Une session qui n'a
# jamais prouve d'identite deviendrait fraiche : toutes les sessions ouvertes,
# dont celle d'un appareil vole, ouvriraient les actions sensibles. Ce sens
# n'est visible par AUCUN parcours nominal, seule une valeur absente le revele.
mute "$REAUTH" 's/  if \(reauthentifieeLe === null\) \{\n    return false;/  if (reauthentifieeLe === null) {\n    return true;/'
cas "preuve absente consideree comme fraiche" integration \
  "ne considere jamais fraiche une preuve absente"

# Cas 23 : LA DUREE DE SESSION REVENUE A SEPT JOURS, LS-81. Un appareil vole
# garderait une semaine d'acces aux donnees personnelles de tous les clients.
mute "$AUTH" 's/export const DUREE_SESSION_SECONDES = 60 \* 60 \* 24;/export const DUREE_SESSION_SECONDES = 60 * 60 * 24 * 7;/'
cas "duree de session revenue a sept jours" integration \
  "configure une session d'un jour"

echo
echo "Journal des connexions, LS-80, ADR-027, tests d'integration"
echo

# Cas 24 : L'ECHEC N'EST PLUS JOURNALISE, critere 9 de LS-80. C'est la mutation
# que le ticket exige nommement, « retirer l'ecriture d'une des deux issues ».
#
# Elle est SILENCIEUSE en exploitation : les connexions reussies continuent de
# s'inscrire, l'ecran se remplit, rien n'a l'air casse. Seul manquerait ce que
# le journal existe pour montrer, dix echecs suivis d'une reussite. Un journal
# ampute de ses echecs ne raconte que la fin de l'histoire.
mute "$HOOK_JOURNAL" 's/    return \{ issue: "ECHEC", utilisateurId: null, emailConfirme: null \};\n  \}\n\n  const utilisateur/    return { issue: "REUSSITE", utilisateurId: null, emailConfirme: null };\n  }\n\n  const utilisateur/'
cas "un echec de connexion enregistre comme reussite" integration \
  "une connexion echouee d'administration produit une ligne ECHEC"

# Cas 25 : LA PURGE NE SUPPRIME PLUS RIEN, seconde mutation exigee par le
# critere 9. Le `lt` devient `gt` : la fonction rend un nombre, ne leve pas, et
# supprime les lignes RECENTES en gardant les anciennes. Une purge inversee est
# pire qu'une purge absente, elle detruit ce qu'on voulait garder tout en
# conservant au-dela de la duree annoncee au registre des traitements.
mute "$JOURNAL_CONNEXION" 's/where: \{ creeA: \{ lt: limiteDeConservation\(maintenant\) \} \},/where: { creeA: { gt: limiteDeConservation(maintenant) } },/'
cas "purge inversee, les vieilles lignes survivent" integration \
  "supprime les lignes au-dela de six mois et conserve les autres"

# Cas 26 : LA DUREE DE CONSERVATION PASSEE A DOUZE MOIS. Douze reste dans la
# fourchette de la deliberation CNIL n 2021-122, donc rien ne casse et aucune
# erreur n'apparait : la boutique conserverait simplement deux fois plus
# longtemps que ce que son registre des traitements annonce.
#
# CE CAS EXISTE PARCE QUE LE TEST DE PURGE NE SUFFIT PAS : il antidate a partir
# de la limite calculee, donc il suit la constante quelle qu'elle soit et reste
# vert sur cette mutation. C'est le test qui ancre la valeur qui doit rougir.
mute "$JOURNAL_CONNEXION" 's/export const CONSERVATION_JOURNAL_MOIS = 6;/export const CONSERVATION_JOURNAL_MOIS = 12;/'
cas "duree de conservation portee a douze mois" integration \
  "la duree de conservation retenue est de six mois"

# Cas 27 : L'ECRITURE DU JOURNAL REDEVIENT BLOQUANTE, regle E15 et critere 5.
# Le `catch` disparait : une base en souffrance ferme alors la porte a
# l'exploitante au pire moment, celui ou elle a besoin d'entrer. Le defaut est
# invisible tant que la base va bien, donc invisible en developpement.
mute "$JOURNAL_CONNEXION" 's/  \} catch \(erreur\) \{/  } catch (erreur) {\n    throw erreur;/'
cas "echec d'ecriture du journal rendu bloquant" integration \
  "une connexion aboutit meme si le journal ne peut pas s'ecrire"

# Cas 28 : LE CHEMIN DE LA PASSKEY REMIS SUR LE NOM QUI N'EXISTE PAS.
#
# C'est le defaut REEL trouve en relecture de LS-80 : `/sign-in/passkey` semble
# evident et n'existe pas, le plugin exposant `/passkey/verify-authentication`.
# Le hook sortait alors sans rien ecrire sur TOUTES les connexions par passkey,
# moyen principal de l'administration, ADR-021, et l'enum `PASSKEY` n'etait
# ecrite par aucun chemin reel. Rien ne rougissait, la suite n'exercant que le
# mot de passe.
mute "$HOOK_JOURNAL_HOOK" 's|\["/passkey/verify-authentication", "PASSKEY"\]|["/sign-in/passkey", "PASSKEY"]|'
cas "chemin de passkey remis sur une route inexistante" integration \
  "une tentative par passkey est journalisee avec le moyen PASSKEY"

# Cas 29 : LES REFUS DE CADENCE NE SONT PLUS JOURNALISES, second defaut de la
# relecture. Better Auth rend le 429 avant tout hook : sans l'enveloppe de
# l'adaptateur de route, une attaque de trois cents tentatives en cinq minutes
# ne laisse que vingt-cinq lignes, et la relecture y voit une saisie maladroite
# au lieu d'un balayage.
mute "$ROUTE_AUTH" 's/    if \(reponse.status === CODE_TROP_DE_REQUETES\) \{/    if (false) {/'
cas "refus de cadence non journalise" integration \
  "un refus de cadence produit une ligne REFUSEE_LIMITATION"

# Cas 30 : L'ADRESSE TENTEE N'EST PLUS BORNEE. Le champ vient du meme corps de
# requete que l'agent utilisateur, qui est tronque : sans cette borne, une
# adresse de 200 011 caracteres entre telle quelle, et un mot de passe colle
# dans le champ email est persiste en clair, contournant le critere 2 par
# l'autre champ.
mute "$JOURNAL_CONNEXION" 's/        emailTente: normaliserEmailTente\(tentative.emailTente\),/        emailTente: tentative.emailTente,/'
cas "adresse tentee ecrite sans borne ni filtre" integration \
  "une saisie qui n'est pas une adresse n'est jamais ecrite telle quelle"

# Cas 31 : LE FILTRE D'ADRESSE REVENU A LA SEULE PRESENCE D'UNE AROBASE.
#
# C'est la version qui a passe la premiere relecture et qui laissait fuiter :
# `@` est l'un des caracteres speciaux les plus choisis quand une politique de
# mot de passe en exige un, donc `P@ssw0rd!2026` traversait intact et
# finissait en clair en base, sur un depot public. Le test du critere 2 etait
# vert parce que sa constante n'avait pas d'arobase, donc tombait du bon cote
# du filtre : il validait un filtre qu'il ne traversait pas.
mute "$JOURNAL_CONNEXION" 's/  if \(!RESSEMBLE_A_UNE_ADRESSE.test\(brut\)\) \{/  if (!brut.includes("@")) {/'
cas "filtre d'adresse revenu a la seule arobase" integration \
  "un mot de passe contenant une arobase est ecarte lui aussi"

echo
echo "Verrou de tache planifiee, LS-72, tests d'integration"
echo

# Cas 32 : LA CONDITION D'EXPIRATION RETIREE DU `ON CONFLICT DO UPDATE`.
#
# C'est LA mutation qui compte sur cette story. Sans ce `WHERE`, toute prise de
# verrou ecrase celui du detenteur en place : la reprise d'un verrou expire
# continue de marcher, donc ce test-la reste vert, mais le verrou ne protege
# plus rien. Deux instances liberent alors les reservations expirees en meme
# temps, et `quantiteReservee` est decrementee deux fois : du stock disparait
# sans qu'aucune vente ne l'explique.
mute "$VERROU" 's/    WHERE verrou_tache\.expire_a < now\(\)\n//'
cas "condition d'expiration retiree de la prise de verrou" integration \
  "vingt executions simultanees, une seule obtient le verrou"

# Cas 33 : LE RELACHEMENT NE VERIFIE PLUS QUI DETIENT LE VERROU. Une instance
# en retard, dont le verrou a expire et a ete repris, supprimerait alors le
# verrou de sa remplacante : celle-ci continuerait a travailler en croyant
# l'avoir, pendant qu'une troisieme instance le prendrait.
#
# LA CONDITION EST NEUTRALISEE PAR UNE COMPARAISON TOUJOURS VRAIE QUI CONSOMME
# TOUJOURS `$2`, et deux formulations plus simples ont ete essayees et rejetees,
# chacune pour une raison mesuree pendant LS-72 :
#
#   - retirer `AND id = $2` laisse DEUX parametres pour un seul emplacement,
#     que PostgreSQL refuse en « wrong number of parameters ». Le relachement
#     leve, l'erreur est avalee par le `catch` du `finally`, et le verrou de la
#     remplacante survit PAR ACCIDENT : le test visant ce defaut passe au vert
#     sous mutation, pour une raison etrangere a ce qu'il verifie
#   - `($2 IS NULL OR true)` echoue en « could not determine data type of
#     parameter $2 », PostgreSQL ne pouvant pas typer un parametre qui
#     n'apparait dans aucune comparaison typante
#
# `$2::text IS NOT NULL` type le parametre, le consomme, et vaut toujours vrai.
mute "$VERROU" 's/  WHERE nom = \$1 AND id = \$2/  WHERE nom = \$1 AND \$2::text IS NOT NULL/'
cas "relachement sans verification du detenteur" integration \
  "le relachement ne touche pas le verrou d'une autre instance"

# Cas 34 : LE RELACHEMENT DEVIENT CONDITIONNEL AU SUCCES. Le corps du `finally`
# ne relache plus que si aucune erreur n'est survenue : une tache qui leve
# garde alors son verrou jusqu'a expiration, et une exception recurrente bloque
# la tache pour toujours, chaque cycle reprenant le verrou pour re-echouer.
#
# La mutation reste du TypeScript valide, sans quoi elle testerait le
# compilateur et non les tests.
mute "$TACHE_PLANIFIEE" 's/      const relachees = await relacherVerrou\(prisma, nom, jeton\);/      const relachees = echoue ? 0 : await relacherVerrou(prisma, nom, jeton);/'
mute "$TACHE_PLANIFIEE" 's/  const jeton = crypto.randomUUID\(\);/  const jeton = crypto.randomUUID();\n  let echoue = false;/'
mute "$TACHE_PLANIFIEE" 's/    journaliserErreur\("Tache planifiee en echec", erreur, \{ tache: nom \}\);/    echoue = true;\n    journaliserErreur("Tache planifiee en echec", erreur, { tache: nom });/'
cas "relachement rendu conditionnel au succes" integration \
  "une tache qui leve relache quand meme son verrou"

# Cas 35 : LA GARDE DE SECRET RETIREE DE LA ROUTE. La fonction gardee reste
# correcte et ses tests unitaires restent verts : c'est l'APPEL qui disparait,
# et deux routes internes deviennent publiques. Motif de LS-70.
mute "$ROUTE_TACHE" 's/  if \(!secretCronValide\(requete.headers\)\) \{/  if (false) {/'
cas "garde de secret retiree de la route interne" integration \
  "refuse un appel sans secret, et n'execute rien"

# Cas 36 : LE NOM DE TACHE N'EST PLUS VALIDE CONTRE LA LISTE CONNUE. Un
# appelant muni du secret creerait un verrou portant le nom de son choix, que
# rien ne relacherait jamais.
mute "$ROUTE_TACHE" 's/  if \(!NOMS_TACHES.includes\(nom as NomTache\)\) \{/  if (false) {/'
cas "nom de tache accepte sans validation" integration \
  "refuse un nom de tache absent de la table connue"

echo
echo "Preuve d'identite, LS-89, ADR-027, tests d'integration"
echo

# Cas 37 : LA PREUVE S'ECRIT SANS QUE LE MOT DE PASSE SOIT VERIFIE.
#
# C'est LE defaut que le ticket LS-89 signale comme indetectable par un
# controle automatique : `enregistrerPreuveIdentite` ne verifie rien, et un
# appelant qui l'invoque sans avoir valide se declare reauthentifie tout seul.
# La mutation retire le `throw` du chemin de refus : la fonction continue alors
# jusqu'a l'enregistrement, et un mot de passe faux ouvre la garde.
mute "$PREUVE" 's/      return \{ etat: "REFUSEE" \};\n    \}\n\n    throw erreur;/      \/\/ mutation\n    }\n\n    throw erreur;/'
cas "mot de passe faux n'empeche plus l'ecriture de la preuve" integration \
  "un mot de passe faux n'ecrit aucune preuve"

# Cas 38 : LA CONDITION DE SESSION NEUVE RETIREE DU CHEMIN PASSKEY. Un appel a
# ce point d'entree depuis n'importe quelle session ouverte suffirait alors a
# se declarer reauthentifie sans avoir rien prouve : la negociation WebAuthn se
# terminant chez Better Auth, la fraicheur de la session est le seul signal
# verifiable cote serveur.
mute "$PREUVE" 's/  if \(age > FENETRE_SESSION_NEUVE_MS \|\| age < 0\) \{/  if (false) {/'
cas "condition de session neuve retiree du chemin passkey" integration \
  "une session ancienne est refusee, aucune preuve n'est ecrite"

# Cas 39 : LA BORNE SUR L'ENTREE RETIREE DE L'ADAPTATEUR. Une valeur qui n'est
# pas une chaine, ou une chaine demesuree, partirait alors au hachage.
mute "$ACTION_REAUTH" 's/    typeof motDePasse !== "string" \|\|\n    motDePasse.length === 0 \|\|\n    motDePasse.length > LONGUEUR_MAXIMALE/    false/'
cas "borne d'entree retiree de l'adaptateur" integration \
  "une entree qui n'est pas une chaine est refusee sans rien ecrire"

# Cas 40 : LA GARDE DE ROLE RETIREE D'UNE DES DEUX SERVER ACTIONS.
#
# Defaut REEL trouve en relecture, puis une seconde fois dans sa propre
# correction : la premiere substitution avait echoue en silence, et seule
# `etablirPreuveParPasskey` portait la garde. Un client inscrit sur la boutique
# fabriquait alors une preuve d'identite avec SON mot de passe, `verifyPassword`
# verifiant contre `session.user.id`.
#
# PROTEGER LA PAGE NE SUFFIT PAS : une Server Action est invocable directement.
mute "$ACTION_REAUTH" 's/    await exigerAdministratrice\(enTetes\);\n  \} catch \(erreur\) \{\n    if \(erreur instanceof AutorisationRefuseeError\) \{\n      return \{ statut: "SESSION_ABSENTE" \};\n    \}\n    throw erreur;\n  \}\n\n  try \{\n    return traduire\(await prouverIdentiteParMotDePasse/    \/\/ garde retiree\n  } catch (erreur) {\n    if (erreur instanceof AutorisationRefuseeError) {\n      return { statut: "SESSION_ABSENTE" };\n    }\n    throw erreur;\n  }\n\n  try {\n    return traduire(await prouverIdentiteParMotDePasse/'
cas "garde de role retiree d'une Server Action" integration \
  "les deux Server Actions appellent exigerAdministratrice"

echo
echo "Purge des journaux, LS-94"
echo

# Cas 41 : LA MUTATION QUI COMPTE POUR UNE PURGE. Sans clause `where`, le
# `deleteMany` vide la table entiere. C'est la pire version possible de la
# fonction, et c'est aussi celle qu'un test naif laisse passer : « la ligne
# ancienne a disparu » reste vrai quand TOUTES les lignes ont disparu.
#
# Le test attendu est celui qui verifie la SURVIE de la ligne recente, critere
# 6 du ticket : « une purge trop large est pire qu'une purge absente ».
mute "$PURGE_JOURNAUX" 's/where: \{ creeA: \{ lt: limiteDeConservation\(maintenant\) \} \},\n  \}\);\n\n  return count;\n\}\n\n\/\*\*\n \* Supprime les lignes de `RateLimit`/where: {},\n  });\n\n  return count;\n}\n\n\/**\n * Supprime les lignes de `RateLimit`/'
cas "clause de conservation retiree, la purge vide la table" integration \
  "supprime une ligne trop ancienne ET conserve une ligne dans la fenetre"

# Cas 42 : la frontiere, `lt` devient `lte`. Une ligne posee exactement a la
# limite est alors supprimee, contre la position tenue depuis LS-80.
#
# CE CAS A TROUVE UN DEFAUT DANS SON PROPRE TEST. La premiere version du test
# calculait la limite a la main, par `setUTCMonth(mois - 6)`, ce qui parait
# equivalent et ne l'est pas : sur le 31 aout le calcul naif rend le 3 mars
# quand `limiteDeConservation` rend le 28 fevrier. La ligne se trouvait trois
# jours APRES la limite, ou elle survit dans les deux cas, et la mutation
# restait verte. Une frontiere ne se teste qu'avec la valeur exacte rendue par
# le code qui la calcule.
mute "$PURGE_JOURNAUX" 's/where: \{ creeA: \{ lt: limiteDeConservation\(maintenant\) \} \}/where: { creeA: { lte: limiteDeConservation(maintenant) } }/'
cas "comparaison de frontiere rendue non stricte" integration \
  "conserve une ligne posee exactement a la limite"

# Cas 43 : l'unite de `RateLimit.lastRequest`. La colonne porte des
# MILLISECONDES, `Date.now()` cote Better Auth. Comparer a une valeur en
# secondes donne une limite mille fois trop petite, donc anterieure a 1970 :
# plus aucune ligne n'est jamais supprimee et la table grossit indefiniment,
# sans qu'aucune erreur n'apparaisse. Defaut parfaitement silencieux.
mute "$PURGE_JOURNAUX" 's/maintenant\.getTime\(\) - CONSERVATION_RATE_LIMIT_HEURES \* 60 \* 60 \* 1000/Math.floor(maintenant.getTime() \/ 1000) - CONSERVATION_RATE_LIMIT_HEURES * 60 * 60/'
cas "purge de RateLimit comparee en secondes et non en millisecondes" integration \
  "compare des millisecondes et non des secondes"

# Cas 44 : l'echec d'une purge interrompt les suivantes, critere 4. Un incident
# sur `JournalConnexion` empecherait alors la purge de `RateLimit`, qui
# grossirait sans que rien ne le dise. Le `throw` transforme un incident sur
# une table en incident sur trois.
mute "$PURGE_JOURNAUX" 's/      journaliserErreur\("Purge de journal en echec", erreur, \{ table \}\);\n\n      resultats\.push\(\{ table, supprimees: 0, echec: true \}\);/      journaliserErreur("Purge de journal en echec", erreur, { table });\n\n      throw erreur;/'
cas "un echec de purge interrompt les purges suivantes" integration \
  "une purge en echec n'empeche pas les suivantes"

# Cas 45 : une table disparait de la liste des purges. C'est l'oubli le plus
# probable dans la vraie vie, celui d'une table ajoutee au schema sans etre
# ajoutee ici : la duree annoncee au registre des traitements reste alors
# fictive pour cette table, exactement l'etat que LS-94 corrige.
mute "$PURGE_JOURNAUX" 's/  \{ table: "RateLimit", executer: purgerRateLimit \},\n//'
cas "table retiree de la liste des purges" integration \
  "purge les trois tables en une passe"

echo
echo "-----------------------------------------"
if [ "$echecs" -eq 0 ]; then
  echo "  $mutations mutations, $mutations detectees"
else
  echo "  $mutations mutations, $echecs NON detectees"
fi
echo "-----------------------------------------"

exit "$echecs"
