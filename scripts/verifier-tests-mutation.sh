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
PROXIES="src/lib/proxies-de-confiance.ts"
LIMITATION_REPO="src/repositories/limitation.ts"
LIMITATION="src/services/limitation-action.ts"
SUPPRESSION="src/services/suppression-compte.ts"
SECTIONS="src/services/sections-produit.ts"
CATALOGUE="src/services/catalogue.ts"
DEPOT_SECTIONS="src/repositories/sections-produit.ts"
VARIANTE="src/services/variante.ts"
VARIANTE_VALIDATION="src/services/variante-validation.ts"
DEPOT_VARIANTE="src/repositories/variante.ts"
MEDIA="src/services/media.ts"
TRAITEMENT="src/integrations/medias/traitement.ts"
STOCKAGE="src/integrations/medias/stockage.ts"
PAGE_EDITEUR="src/app/administration/produits/[id]/page.tsx"
PUBLICATION="src/app/administration/produits/[id]/publication-produit.tsx"
DEPOT_CATALOGUE="src/repositories/catalogue.ts"
SERVICE_CATALOGUE="src/services/catalogue.ts"
CARTE_PRODUIT="src/app/catalogue/carte-produit.tsx"

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
MUTABLES=("$SQL" "$STOCK" "$PAGE" "$LAYOUT" "$AUTH" "$REAUTH" "$AUTORISATION" "$PROFIL" "$VALIDATION" "$JOURNAL" "$SANTE" "$HOOK_JOURNAL" "$HOOK_JOURNAL_HOOK" "$ROUTE_AUTH" "$JOURNAL_CONNEXION" "$VERROU" "$TACHE_PLANIFIEE" "$ROUTE_TACHE" "$PREUVE" "$ACTION_REAUTH" "$PURGE_JOURNAUX" "$PROXIES" "$LIMITATION_REPO" "$LIMITATION" "$SUPPRESSION" "$SECTIONS" "$CATALOGUE" "$DEPOT_SECTIONS" "$VARIANTE" "$VARIANTE_VALIDATION" "$DEPOT_VARIANTE" "$MEDIA" "$TRAITEMENT" "$STOCKAGE" "$PAGE_EDITEUR" "$PUBLICATION" "$DEPOT_CATALOGUE" "$SERVICE_CATALOGUE" "$CARTE_PRODUIT")

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

# Cas 11 : debordement horizontal a DROITE. Invisible a 1280 px, visible a 320 et
# 390 px, ce qui justifie les trois largeurs de playwright.config.ts.
mute "$PAGE" 's/<h1 className=\{styles\.titre\}>/<h1 className={styles.titre} style={{ width: "800px" }}>/'
cas "debordement horizontal introduit dans la page" e2e \
  "la page ne deborde pas horizontalement"

# ---------------------------------------------------------------------------
# Cas 11 bis : debordement a GAUCHE, LS-112.
#
# CE CAS COUVRE LE VERSANT QUE PERSONNE NE MESURAIT. La mesure d'avant LS-112
# comparait scrollWidth a clientWidth, aveugle aux deux bords ; celle de LS-111
# ne retenait que `getBoundingClientRect().right`, donc aveugle a celui-ci. Un
# element tire vers les abscisses negatives, marge negative ou `left: -Npx`,
# produit pourtant la MEME barre de defilement et le meme geste lateral pour
# lire.
#
# IL EST DETECTE AUX TROIS LARGEURS, contrairement au cas 11 : un depassement a
# gauche ne depend pas de la largeur de la fenetre, il sort par zero.
mute "$PAGE" 's/<h1 className=\{styles\.titre\}>/<h1 className={styles.titre} style={{ position: "relative", left: "-200px" }}>/'
cas "debordement vers la gauche introduit dans la page" e2e \
  "la page ne deborde pas horizontalement"

# ---------------------------------------------------------------------------
# Cas 11 ter : debordement PAR LE TEXTE, LS-112.
#
# CE CAS EXISTE PARCE QUE LA REVUE A TROUVE UNE REGRESSION. Passer de
# `documentElement.scrollWidth` a `getBoundingClientRect` mesure la boite de
# l'ELEMENT, jamais celle de son CONTENU : un texte en `white-space: nowrap`
# plus long que son bloc laisse la boite a 320 px pendant que le texte sort a
# 365. La premiere version de LS-112 passait au VERT sur cette mutation, quand
# la mesure d'AVANT LS-111 la voyait. Corriger un defaut en rouvrant un autre.
#
# `frontend-design.md` cite nommement `white-space: nowrap` sur texte variable
# parmi les motifs a chercher a 320 px : la mesure censee les attraper leur etait
# aveugle.
#
# DETECTE A 320 PX SEULEMENT, et c'est correct : a 390 px l'accroche tient sur
# une ligne, donc elle ne deborde pas. Une mutation detectee aux trois largeurs
# signalerait ici une mesure trop grossiere.
mute "$PAGE" 's/<p className=\{styles\.accroche\}>/<p className={styles.accroche} style={{ whiteSpace: "nowrap" }}>/'
cas "debordement par le texte, white-space nowrap" e2e \
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
echo "Resolution de l'adresse client, LS-91"
echo

# Cas 46 : la liste vide devient un tableau vide au lieu de `undefined`.
#
# Les deux se comportent pareil AUJOURD'HUI, Better Auth testant
# `trustedProxies.length > 0`. Le cas existe parce que la distinction porte une
# intention, « non configure » plutot que « configure a rien », et parce que
# `exactOptionalPropertyTypes` la rend visible au type. Une bibliotheque qui
# traiterait un jour `[]` comme « aucun saut fiable » ferait rendre `null` a
# `getIp` sans qu'aucun autre test ne bouge.
mute "$PROXIES" 's/return entrees\.length > 0 \? entrees : undefined;/return entrees;/'
cas "liste de proxies vide rendue en tableau plutot qu'undefined" unitaire \
  "rend undefined quand la variable est absente ou vide"

# Cas 47 : les espaces ne sont plus retires autour des entrees.
#
# `BETTER_AUTH_TRUSTED_PROXIES=" 192.0.2.10 , 10.0.0.0/24 "` produirait alors
# des entrees avec espaces, que `parseCIDR` refuse. Better Auth les IGNORE en
# silence avec un simple `logger.warn` : la liste se vide, la branche « un seul
# saut » reprend la main, et rien ne rougit. Defaut parfaitement muet.
mute "$PROXIES" 's/\.map\(\(entree\) => entree\.trim\(\)\)\n    \.filter\(Boolean\)/.filter(Boolean)/'
cas "espaces non retires autour des proxies declares" unitaire \
  "la valeur lue est effectivement celle que Better Auth appliquerait"
echo "Limitation de debit des Server Actions, LS-92"
echo

# Cas 48 : la limitation disparait du chemin de verification. C'est l'etat
# d'avant LS-92 : `auth.api.verifyPassword` n'etant soumis a aucun plafond, une
# Server Action appelee en boucle testait des mots de passe sans compteur.
mute "$PREUVE" 's/  if \(limitation\.etat === "REFUSEE"\) \{/  if (false as boolean) {/'
cas "plafond retire du chemin de verification de mot de passe" integration \
  "refuse au-dela du seuil, en exer"

# Cas 49 : l'echec n'entre plus au journal des connexions.
#
# LE VRAI MOTIF DE LA STORY, et le defaut le plus silencieux : le plafond
# continuerait de fonctionner, seule la TRACE disparaitrait. Une attaque par
# cette voie redeviendrait invisible, y compris apres coup.
mute "$PREUVE" 's/      await journaliserTentativeAction\(\{ \.\.\.traceCommune, issue: "ECHEC" \}\);\n//'
cas "echec de mot de passe non journalise" integration \
  "journalise chaque tentative, echec, reussite et refus de cadence"

# Cas 50 : le refus de cadence n'est plus journalise. Le VOLUME refuse est
# precisement ce qui distingue un balayage d'une saisie maladroite, lecon deja
# tiree en relecture de LS-80.
mute "$PREUVE" 's/    await journaliserTentativeAction\(\{\n      \.\.\.traceCommune,\n      issue: "REFUSEE_LIMITATION",\n    \}\);\n//'
cas "refus de cadence non journalise sur Server Action" integration \
  "journalise chaque tentative, echec, reussite et refus de cadence"

# Cas 51 : le compteur perd son increment et repart a un a chaque tentative.
#
# Le plafond ne serait alors JAMAIS atteint, quel que soit le nombre de
# tentatives, et la table `rate_limit` continuerait de se remplir normalement :
# rien dans l'etat de la base ne trahirait le defaut.
mute "$LIMITATION_REPO" 's/            ELSE rate_limit\.count \+ 1/            ELSE 1/'
cas "compteur remis a un a chaque tentative" integration \
  "refuse au-dela du seuil, en exer"

# Cas 52 : la cle perd son prefixe et heurte l'espace de Better Auth.
#
# `<action>|<session>` sans prefixe entre en collision avec `<ip>|<chemin>` :
# les deux mecanismes consommeraient le quota l'un de l'autre, et le plafond
# observe deviendrait imprevisible.
mute "$LIMITATION" 's/return `action:\$\{action\}\|\$\{sessionId\}`;/return `${action}|${sessionId}`;/'
cas "cle de compteur sans prefixe, collision avec Better Auth" integration \
  "n'ecrit pas sous une cle qui heurterait celles de Better Auth"

echo
echo "Droits des personnes, LS-95"
echo

# Cas 53 : le marquage `dissocieA` disparait.
#
# LE DEFAUT LE PLUS GRAVE DE CETTE STORY, et il est SILENCIEUX : la suppression
# « fonctionne », le compte part, les commandes survivent. Seul `dissocieA`
# reste nul, ce qui rend la commande RATTACHABLE a quiconque controle ensuite la
# meme adresse email, regle V15. L'historique et les factures d'un client parti
# rouvriraient a un inconnu.
mute "$SUPPRESSION" 's/      const \{ count \} = await tx\.commande\.updateMany\(\{\n        where: \{ utilisateurId, dissocieA: null \},\n        data: \{ dissocieA: maintenant \},\n      \}\);/      const count = 0;/'
cas "marquage dissocieA retire de la suppression" integration \
  "dissocie la commande et ne la supprime pas"

# Cas 54 : le filtre sur l'utilisateur disparait du `updateMany`.
#
# TOUTES les commandes de la boutique seraient dissociees, donc rendues non
# rattachables a vie, par la suppression d'un seul compte.
mute "$SUPPRESSION" 's/where: \{ utilisateurId, dissocieA: null \}/where: { dissocieA: null }/'
cas "suppression dissociant les commandes de tout le monde" integration \
  "ne touche pas aux commandes d'un AUTRE compte"

# Cas 55 : le filtre `dissocieA: null` disparait, l'horodatage est ecrase.
#
# La date doit dire QUAND le compte a ete supprime. Un rejeu la remplacerait par
# une date posterieure, ce qui fausserait toute reconstitution.
mute "$SUPPRESSION" 's/where: \{ utilisateurId, dissocieA: null \}/where: { utilisateurId }/'
cas "horodatage de dissociation ecrase au rejeu" integration \
  "n'horodate pas deux fois une commande deja dissociee"

# Cas 56 : l'export charge les comptes ET recopie l'objet tel quel.
#
# L'EMPREINTE DU MOT DE PASSE SORTIRAIT dans une reponse a demande d'acces,
# invariant 9. Le defaut est banal : quelqu'un ajoute `comptes: true` au `select`
# pour enrichir l'export, et un `...utilisateur` qui parait economiser six lignes.
#
# LES DEUX MOITIES SONT NECESSAIRES, et la premiere version de ce cas ne portait
# que la seconde : elle restait VERTE, a juste titre. Sans `comptes: true` dans
# le `select`, l'objet ne contient aucune empreinte, donc `...utilisateur` ne
# peut rien faire fuiter. La mutation n'exprimait aucun defaut realisable et
# accusait le test.
#
# C'est le motif deja rencontre ici : une mutation qui ne mute pas le chemin de
# sortie designe un coupable innocent.
mute "$SUPPRESSION" 's/      _count: \{ select: \{ comptes: true, passkeys: true \} \},/      comptes: true,\n      _count: { select: { comptes: true, passkeys: true } },/'
mute "$SUPPRESSION" 's/    compte: \{\n      email: utilisateur\.email,/    compte: {\n      ...utilisateur,\n      email: utilisateur.email,/'
cas "export chargeant les comptes et recopiant l'objet, empreinte comprise" integration \
  "ne fait sortir aucun secret"

# Cas 57 : la garde de reauthentification retiree de l'action sensible.
#
# LE CAS QUI MANQUAIT, et son absence a ete mesuree le 13 aout 2026 : avec cette
# mutation en place, les neuf tests de `suppression-compte` restaient VERTS.
# La seule action sensible du depot pouvait perdre sa protection sans qu'aucun
# test ne rougisse, alors meme que `verifier-actions-sensibles.sh` etait vert.
#
# LES DEUX CONTROLES NE SE REMPLACENT PAS, et c'est le point a retenir. Le
# controle textuel prouve que l'appel FIGURE dans le corps de la fonction,
# propriete du fichier. Il ne dit rien de ce qui se passe A L'EXECUTION. Seul un
# test qui appelle vraiment `supprimerMonCompte` sans preuve fraiche le dit.
mute "$SUPPRESSION" 's/  await exigerReauthentificationRecente\(enTetes, "IDENTIFIANTS"\);/  \/\/ garde retiree/'
cas "action sensible privee de sa garde de reauthentification" integration \
  "refuse la suppression sans preuve d'identite recente"

# Cas 58 : la garde s'execute APRES la suppression, et non avant.
#
# LE DEFAUT QUE LE CONTROLE TEXTUEL NE PEUT PAS VOIR, et c'est sa raison d'etre
# distincte du cas 57. L'appel est toujours la, dans le corps de la fonction
# marquee : `verifier-actions-sensibles.sh` reste donc VERT mot pour mot. Mais
# le compte est deja parti quand la garde leve.
#
# Le scenario est banal : quelqu'un deplace la garde en pensant « verifier au
# plus pres de l'effet ». L'exception levee est la meme, le message d'erreur
# affiche est le meme, et seul l'etat de la base distingue les deux mondes.
#
# C'EST POURQUOI CHAQUE TEST DU FICHIER REGARDE LA BASE et pas seulement
# l'exception : un test qui se contenterait de `rejects.toBeInstanceOf` resterait
# vert ici, sur un compte pourtant supprime.
mute "$SUPPRESSION" 's/  await exigerReauthentificationRecente\(enTetes, "IDENTIFIANTS"\);\n\n  return supprimerCompte\(identite\.utilisateurId\);/  const resultatAvantGarde = await supprimerCompte(identite.utilisateurId);\n  await exigerReauthentificationRecente(enTetes, "IDENTIFIANTS");\n\n  return resultatAvantGarde;/'
cas "garde de reauthentification executee apres la suppression" integration \
  "refuse la suppression sans preuve d'identite recente"

# ---------------------------------------------------------------------------
# Cas 59 : le reordonnancement des sections sort de sa transaction. LS-100.
#
# LE DEFAUT QUE LA STORY DEMANDE D'ATTRAPER. `section_produit_ordre_unique` est
# DEFERRABLE INITIALLY DEFERRED : la coherence n'est vraie qu'au COMMIT, ce qui
# est exactement ce qui rend l'echange de deux rangs possible. Hors transaction,
# chaque `UPDATE` est son propre COMMIT et le premier viole l'unicite.
#
# La mutation remplace le client transactionnel par le client principal, ce qui
# est la forme que prendrait le defaut en vrai : quelqu'un simplifie la fonction
# en retirant un `$transaction` qui « ne sert a rien », les tests unitaires ne
# voient rien, et la fiche produit devient impossible a reordonner en production.
mute "$SECTIONS" 's/  await prisma\.\$transaction\(async \(tx\) => \{\n    const existantes = await depot\.listerSections\(tx, produitId\);/  await (async (tx: typeof prisma) => {\n    const existantes = await depot.listerSections(tx, produitId);/'
cas "reordonnancement des sections hors transaction" integration \
  "echange deux sections voisines"

# ---------------------------------------------------------------------------
# Cas 60 : les sections par defaut sont recreees a chaque enregistrement.
#
# LE DEFAUT NOMME PAR ADR-026 DECISION 5, et le plus probable de tous : une
# initialisation ecrite de bonne foi, du type « garantir que les quatre sections
# existent », posee la ou elle semble utile. Elle fait revenir vide une section
# que l'administratrice a delibermment supprimee.
#
# AUCUN PARCOURS NOMINAL NE LE REVELE. Sur une fiche dont les quatre sections
# sont intactes, la mutation ne change rien du tout : `createMany` avec
# `skipDuplicates` n'ecrit aucune ligne, et tous les autres tests restent verts.
# Seul un test qui SUPPRIME une section puis reenregistre le produit la voit.
mute "$CATALOGUE" 's/  try \{\n    await depot\.ecrireInformationsProduit\(prisma, id, \{/  try {\n    await depotSections.creerSections(\n      prisma,\n      lignesDesSectionsParDefaut(id),\n    );\n    await depot.ecrireInformationsProduit(prisma, id, {/'
cas "sections par defaut recreees a l'enregistrement" integration \
  "ne recree pas une section supprimee lors d'un enregistrement ulterieur"

# ---------------------------------------------------------------------------
# Cas 61 : le rang d'une nouvelle section est calcule sur le NOMBRE.
#
# Defaut deja rencontre sur ce projet pour les categories, LS-99. Les deux
# calculs coincident tant qu'aucune section n'a ete supprimee : ils divergent des
# qu'un trou existe dans la suite des rangs, et le rang demande est alors deja
# pris. `chk_section_ordre_positif` ne le voit pas, c'est l'unicite qui leve, au
# COMMIT, avec un message que rien ne relie au formulaire.
mute "$DEPOT_SECTIONS" 's/  return resultat\._max\.ordre \?\? 0;/  return client.sectionProduit.count({ where: { produitId } });/'
cas "rang de section calcule sur le nombre et non le maximum" integration \
  "ajoute au rang suivant, calcule sur le maximum"

# ---------------------------------------------------------------------------
# Cas 62 : l'appartenance d'une section a son produit n'est plus verifiee.
#
# INVARIANT 2 APPLIQUE A UN IDENTIFIANT DE RESSOURCE : il DESIGNE, il n'autorise
# pas. Sans ce controle, une liste de reordonnancement de la BONNE LONGUEUR
# portant l'identifiant d'une section d'un autre produit la deplacerait chez le
# voisin, et le controle d'exhaustivite ne verrait rien : il compte, il ne
# verifie pas l'appartenance.
#
# Le compte seul reste vert, c'est le defaut « compter ne verifie pas le
# contenu » deja rencontre ici.
mute "$SECTIONS" 's/      if \(!connues\.has\(id\)\) \{\n        throw new SectionIntrouvableError\(\);\n      \}/      \/\/ verification retiree/'
cas "appartenance d'une section a son produit non verifiee" integration \
  "refuse une section appartenant a un autre produit"

# ---------------------------------------------------------------------------
# Cas 63 : le filtre du prix accepte trois decimales. LS-101.
#
# CE CAS A REMPLACE UN CAS FAUX, ET LE MOTIF MERITE D'ETRE LU. La premiere
# version remplacait le decoupage de chaine par `Math.round(x * 100)` et exigeait
# que les tests rougissent. Ils sont restes VERTS, et l'enquete a montre que la
# mutation avait tort, pas les tests : sur des montants a DEUX decimales au plus,
# `Math.round(x * 100)` rend le bon resultat, verifie exhaustivement de 0 a 2000
# euros. L'erreur du flottant y reste sous le demi-centime.
#
# LA PROTECTION N'EST DONC PAS LA METHODE DE CONVERSION, C'EST LE FILTRE qui
# borne l'entree a deux decimales. C'est lui que ce cas mute, et le defaut est
# reel : elargir le filtre pour accepter une remise au millieme, geste plausible,
# fait entrer des montants que la multiplication arrondirait faux, et que le
# decoupage continue de rendre exacts.
#
# Le test qui rougit est celui du refus au-dela de deux decimales, `1,005` en
# etant l'exemple canonique.
#
# L'EXPRESSION S'ECRIT `d\{1,2\}` ET NON `\\d\{1,2\}`. En Perl, `\\d` designe un
# backslash litteral suivi d'un `d`, forme que le fichier ne contient pas : la
# substitution ne mordait pas, et `mute` echouait franchement plutot que de
# laisser croire a un test aveugle. Le garde-fou qui exige une modification
# effective a fait exactement son travail.
mute "$VARIANTE_VALIDATION" 's/d\{1,2\}/d{1,3}/'
cas "filtre du prix elargi a trois decimales" unitaire \
  "rend null au-dela de deux decimales"

# ---------------------------------------------------------------------------
# Cas 64 : la partie decimale est completee a GAUCHE et non a droite.
#
# UNE SEULE LETTRE SEPARE `padEnd` DE `padStart`, et le prix est divise par dix
# sur toute saisie a une decimale : « 5,5 » devient 55 centimes au lieu de 550.
#
# AUCUN TEST A DEUX DECIMALES NE LE VOIT, ce qui rend le defaut invisible a une
# suite qui n'exercerait que des prix « bien formes ».
mute "$VARIANTE_VALIDATION" 's/\.padEnd\(2, "0"\)/.padStart(2, "0")/'
cas "partie decimale completee a gauche, prix divise par dix" unitaire \
  "complete a droite une decimale unique"

# ---------------------------------------------------------------------------
# Cas 65 : l'archivage remet la quantite physique a zero.
#
# LE GESTE QUI SEMBLE PROPRE ET QUI FAIT DISPARAITRE DU STOCK. Retirer une piece
# de la vente en ligne n'a jamais retire la piece du tiroir : l'invariant 6
# separe la disponibilite web de la quantite physique, et l'arbitrage du 14 aout
# 2026 a confirme que le stock reste vendable en main propre.
#
# Aucune contrainte ne s'y oppose, `chk_variante_physique_positif` acceptant
# zero. Seul un test qui relit la colonne apres archivage le voit.
#
# LA CIBLE A ETE DEPLACEE PAR LS-103, et le garde-fou du script l'a signale au
# lieu d'accuser les tests. C19 a mis cet archivage DANS une transaction, donc
# l'appel recoit `tx` et non `prisma` : l'expression d'origine ne mordait plus,
# et la mutation « ne modifiait aucun caractere ». C'est le motif deja rencontre
# apres LS-50, et c'est pourquoi ce garde-fou existe.
mute "$VARIANTE" 's/      await depot\.archiverVariante\(tx, id, new Date\(\)\);/      await depot.archiverVariante(tx, id, new Date());\n      await tx.variante.update({ where: { id }, data: { quantitePhysique: 0 } });/'
cas "archivage remettant le stock physique a zero" integration \
  "laisse le stock physique intact et ne cree aucun mouvement"

# ---------------------------------------------------------------------------
# Cas 66 : la reference n'est plus normalisee en majuscules.
#
# `bo-essai-01` ET `BO-ESSAI-01` DEVIENNENT DEUX REFERENCES DISTINCTES pour
# l'unicite en base, alors qu'aucun humain ne les distingue sur une etiquette.
# La seconde saisie passe, et deux pieces portent la meme reference imprimee.
#
# Le defaut ne casse rien immediatement : il produit un doublon qui ne se voit
# qu'a l'inventaire, ou quand un avis remonte sur la mauvaise piece.
mute "$VARIANTE_VALIDATION" 's/  \.transform\(\(valeur\) => valeur\.toUpperCase\(\)\)/  .transform((valeur) => valeur)/'
cas "reference non normalisee en majuscules" integration \
  "refuse la meme reference saisie en minuscules"

# ---------------------------------------------------------------------------
# Cas 67 : modifier une variante archivee redevient possible.
#
# LE REFUS PROTEGE CONTRE UNE FAUSSE IMPRESSION : editer le prix d'une piece
# sortie du catalogue n'a aucun effet visible, et laisse croire a une remise en
# vente. La mutation retire la garde, et rien d'autre ne l'arrete : aucune
# contrainte de base ne connait la notion de variante archivee.
mute "$VARIANTE" 's/  if \(existante\.archiveeA !== null\) \{\n    throw new VarianteDejaArchiveeError\(\);\n  \}\n\n  try \{\n    return await depot\.ecrireVariante/  \/\/ garde retiree\n\n  try {\n    return await depot.ecrireVariante/'
cas "modification d'une variante archivee" integration \
  "refuse de modifier une variante archivee"

# ---------------------------------------------------------------------------
# Cas 68 : l'archivage ne verifie plus les reservations actives. LS-101.
#
# LA REGLE VIENT DE `database.md` : « l'archivage est refuse tant qu'une
# reservation active existe, meme regle que pour la vente externe ». Elle avait
# ete OUBLIEE dans la premiere version du service, et c'est `ls-frontend-revue`
# qui l'a signalee en relisant l'ecran.
#
# LE SCENARIO QUE LA GARDE FERME : un client paie, sa reservation tient la
# piece, l'exploitante archive. La commande se confirme sur une piece sortie du
# catalogue, et la conversion de la reservation en vente porte sur une variante
# que plus rien ne vend.
#
# AUCUNE CONTRAINTE DE BASE NE L'EXPRIME, `archivee_a` et `reservation` vivant
# dans deux tables : ce test est la seule ligne de defense.
mute "$VARIANTE" 's/  const reservations = await depot\.compterReservationsActives\(prisma, id\);\n  if \(reservations > 0\) \{\n    throw new ReservationActiveError\(reservations\);\n  \}/  \/\/ garde retiree/'
cas "archivage sans verifier les reservations actives" integration \
  "refuse d'archiver tant qu'une reservation active existe"

# ---------------------------------------------------------------------------
# Cas 69 : la garde compte TOUTES les reservations, expirees comprises.
#
# LE DEFAUT SYMETRIQUE DU PRECEDENT, et celui qu'une garde ecrite trop vite
# produit : retirer `expire_a > now()` rend la variante inarchivable pendant les
# cinq minutes qui separent l'expiration du passage de la tache de liberation,
# pour une reservation que plus rien ne protege.
#
# UN CONTROLE QUI N'AURAIT QUE LE CAS 68 SERAIT SATISFAIT PAR CETTE VERSION
# FAUSSE : elle refuse bien l'archivage sur une reservation active. Seul un test
# qui archive MALGRE une reservation expiree separe la garde juste de la garde
# trop large.
mute "$DEPOT_VARIANTE" 's/       AND expire_a > now\(\)//'
cas "garde comptant aussi les reservations expirees" integration \
  "archive malgre une reservation expiree"

# ---------------------------------------------------------------------------
# Cas 70 : la suppression de l'EXIF est desactivee. LS-102, ADR-007.
#
# LA MUTATION QUE L'ADR DESIGNE NOMMEMENT, et le defaut le plus grave que ce
# projet puisse produire : la position GPS du domicile de l'exploitante servie
# publiquement.
#
# CE CAS EXISTE PARCE QUE LA PROTECTION EST INVISIBLE. sharp retire l'EXIF PAR
# DEFAUT : aucune ligne de code ne l'affirme, donc aucune relecture ne peut
# constater qu'elle est en place. Un `keepExif()` ajoute de bonne foi, pour
# conserver un profil colorimetrique ou une orientation, rouvrirait la fuite en
# silence, et tous les tests fonctionnels resteraient verts.
mute "$TRAITEMENT" 's/      const contenu = await pipeline\[format\]\(\{/      const contenu = await pipeline.keepExif()[format]({/'
cas "suppression de l'EXIF desactivee sur le traitement" unitaire \
  "ne laisse aucun EXIF sur aucune declinaison"

# ---------------------------------------------------------------------------
# Cas 71 : l'EXIF survit dans les fichiers ECRITS SUR LE DISQUE.
#
# LE MEME DEFAUT, VU D'UN AUTRE ETAGE, et les deux cas ne font pas double
# emploi. Le cas 70 verifie les octets rendus EN MEMOIRE par le traitement ;
# celui-ci verifie les octets REELLEMENT ECRITS sous `public/`, apres la
# publication. Une etape de copie qui reintroduirait des metadonnees ne serait
# vue que par le second.
mute "$TRAITEMENT" 's/      const contenu = await pipeline\[format\]\(\{/      const contenu = await pipeline.keepExif()[format]({/'
cas "EXIF survivant dans les fichiers publies" integration \
  "n'ecrit aucun EXIF dans les fichiers publies"

# ---------------------------------------------------------------------------
# Cas 72 : un traitement en echec passe quand meme a TRAITE.
#
# `PARCOURS.md` : « Aucune image n'est jamais servie publiquement sans
# traitement. C'est un blocage, pas un avertissement. » Un media marque TRAITE
# alors que son traitement a echoue serait publiable par LS-103, et la fiche
# produit pointerait vers des fichiers qui n'existent pas.
mute "$MEDIA" 's/    await depot\.ecrireStatut\(prisma, media\.id, StatutTraitementMedia\.ECHOUE\);/    await depot.ecrireStatut(prisma, media.id, StatutTraitementMedia.TRAITE);/'
cas "media en echec marque TRAITE" integration \
  "laisse ECHOUE en base et ne publie aucun fichier"

# ---------------------------------------------------------------------------
# Cas 73 : le reordonnancement des medias perd son ordre d'ecriture. C9.
#
# LE PIEGE MESURE LE 14 AOUT 2026, et il DIFFERE de celui des sections.
# `media_principal_unique` est un INDEX partiel filtre sur `ordre = 1`, pas une
# contrainte : il n'est donc pas differable, et il est verifie LIGNE A LIGNE.
#
#   VERT   liberer le rang 1 puis le prendre
#   ROUGE  prendre le rang 1 avant de l'avoir libere
#          duplicate key value violates unique constraint
#
# LA TRANSACTION NE SAUVE PAS. La mutation remplace le tri par un parcours naif
# de la liste, ce qui est exactement ce qu'une relecture ecrirait en trouvant le
# tri inutilement complique.
mute "$MEDIA" 's/    const ordonnees = \[\n      \.\.\.ecritures\.filter\(\(e\) => e\.id === ancienPremier && e\.ordre !== 1\),\n      \.\.\.ecritures\.filter\(\(e\) => e\.id !== ancienPremier && e\.ordre !== 1\),\n      \.\.\.ecritures\.filter\(\(e\) => e\.ordre === 1\),\n    \];/    const ordonnees = ecritures;/'
cas "reordonnancement de medias sans ordre d'ecriture" integration \
  "echange le media principal avec le second"

# ---------------------------------------------------------------------------
# Cas 74 : SVG et PDF ne sont plus refuses avant decodage.
#
# CE QUE CELA ROUVRE : libvips analyse un document au lieu d'une photographie,
# sur ses deux formats d'entree les plus complexes. L'override de `package.json`
# corrige quatre CVE de cette bibliotheque, ce qui dit assez que sa surface
# d'attaque n'est pas theorique.
#
# Le refus porte sur la SIGNATURE du fichier, jamais sur l'extension ni sur le
# type annonce par le navigateur, que l'appelant peut mentir.
mute "$TRAITEMENT" 's/  const refuse = formatRefuseParSignature\(octets\);\n  if \(refuse\) \{\n    throw new FormatRefuseError\(refuse\);\n  \}/  \/\/ refus retire/'
#
# LE TEST ATTENDU EST CELUI DU PDF, ET NON CELUI DU SVG. L'asymetrie a ete
# mesuree en ecrivant ce cas, et elle n'est pas evidente :
#
#   sharp LIT le SVG        format "svg", 10 x 10  -> le second filet, qui teste
#                                                     `metadonnees.format`, le
#                                                     rattrape meme sans le refus
#                                                     par signature
#   sharp LEVE sur le PDF   -> sans le refus par signature, il devient un
#                              FichierNonImageError et non un FormatRefuseError
#
# Le test du SVG reste donc VERT sous cette mutation, a juste titre : la
# protection tient toujours, par un autre chemin. Seul le PDF distingue les deux
# versions du code. Nommer le SVG ici ferait echouer le controle en accusant un
# test qui fait exactement son travail.
cas "SVG et PDF acceptes au traitement" unitaire \
  "refuse un PDF"

# ---------------------------------------------------------------------------
# Cas 75 : le SECOND filet de refus est retire, celui qui lit le format analyse.
#
# POURQUOI DEUX FILETS ET DEUX CAS. Le refus par signature n'inspecte que les
# 1024 premiers octets, pour ne pas balayer un fichier de 25 Mo a chaque
# televersement. Un SVG precede d'un commentaire XML long pousse sa balise hors
# de cette fenetre et le traverse : mesure le 14 aout 2026, sharp le lit malgre
# tout.
#
# LE PREMIER FILET SEUL SUFFISAIT A GARDER LA SUITE VERTE avant ce cas, ce qui
# faisait du second du code non eprouve sur un chemin de securite. Le test ajoute
# est le seul qui les distingue.
mute "$TRAITEMENT" 's/  if \(metadonnees\.format && FORMATS_REFUSES\.has\(metadonnees\.format\)\) \{\n    throw new FormatRefuseError\(metadonnees\.format\);\n  \}/  \/\/ second filet retire/'
cas "second filet de refus de format retire" unitaire \
  "refuse un SVG dont la balise est hors de la fenetre de signature"

# ---------------------------------------------------------------------------
# Cas 76 : la garde de traversee de chemin est retiree du stockage.
#
# UN IDENTIFIANT PORTANT `..` FERAIT ECRIRE HORS DU VOLUME. Les identifiants
# sont engendres par le module, donc le cas ne devrait pas se produire : la
# garde existe parce qu'une valeur venue de la base ou d'un parametre finit
# toujours par atteindre ce chemin.
mute "$STOCKAGE" 's/  if \(!\/\^\[A-Za-z0-9\]\[A-Za-z0-9\._-\]\*\$\/\.test\(valeur\) \|\| valeur\.includes\("\.\."\)\) \{/  if (false) {/'
cas "garde de traversee de chemin retiree" unitaire \
  "refuse un identifiant qui remonte hors du volume"

# ---------------------------------------------------------------------------
# Cas 77 : la tache planifiee n'appelle plus la purge de quarantaine. LS-102.
#
# CE QUE CE CAS FERME, ET QU'AUCUN GREP NE FERME. `purgerQuarantaine` etait
# testee isolement depuis le 14 aout, et le depot ne l'appelait NULLE PART :
# les tests seraient restes identiques si la fonction n'avait jamais ete
# branchee. C'est le point 3 du reste a faire de LS-102.
#
# Trouver `purgerQuarantaine(` dans le fichier de la route ne prouve rien de
# l'execution : un appel place dans une branche jamais atteinte, ou apres un
# `return`, satisfait le motif en laissant le trou entier. Meme lecon que les
# cas 57 et 58 sur la marque `@sensible`.
#
# LA MUTATION NEUTRALISE L'APPEL SANS TOUCHER AU RESTE : la route repond
# toujours 200 et « EXECUTEE », et seul le test qui regarde LE DISQUE le voit.
# Un orphelin vieilli de deux heures survit alors a la tache.
mute "$ROUTE_TACHE" 's/      const supprimes = await purgerQuarantaine\(\);/      const supprimes = 0;/'
cas "tache de purge de quarantaine debranchee" integration \
  "la tache supprime reellement un orphelin de quarantaine"

# ---------------------------------------------------------------------------
# Cas 78 : C1, la variante cesse d'etre exigee a la publication. LS-103.
#
# C1, C7 ET C8 SONT DES CONTROLES APPLICATIFS DE NIVEAU 3, et c'est ce qui rend
# ces cas necessaires. Aucune contrainte de base ne peut les porter : elles
# comptent des lignes d'AUTRES tables, variantes et medias. Le service est donc
# la seule ligne de defense, et une condition retiree ne fait rougir aucun
# controle de schema.
#
# CHAQUE MUTATION RETIRE UNE SEULE CONDITION, jamais le bloc entier : retirer
# les quatre d'un coup ferait rougir tous les tests et ne dirait pas lequel
# porte quoi.
mute "$CATALOGUE" 's/  if \(conditions\.variantesVivantes === 0\) \{\n    motifs\.push\("AUCUNE_VARIANTE"\);\n  \}/  \/\/ C1 retiree/'
cas "condition C1 retiree, produit sans variante publiable" integration \
  "refuse un produit sans variante, et le nomme"

# ---------------------------------------------------------------------------
# Cas 79 : C7, le texte alternatif cesse d'etre exige.
#
# EXIGENCE WCAG 2.2 AA, pas un confort : une photo sans description est
# inaccessible a qui ne la voit pas, et la fiche produit est un parcours
# critique.
mute "$CATALOGUE" 's/  if \(conditions\.mediasSansTexte > 0\) \{\n    motifs\.push\("TEXTE_ALTERNATIF_MANQUANT"\);\n  \}/  \/\/ C7 retiree/'
cas "condition C7 retiree, photo sans description publiable" integration \
  "refuse un produit dont une photo n'a pas de texte alternatif, C7"

# ---------------------------------------------------------------------------
# Cas 80 : C8, une photo en echec ne bloque plus la publication.
#
# LE PLUS GRAVE DES TROIS. `PARCOURS.md` : « aucune image n'est jamais servie
# publiquement sans traitement, c'est un blocage et pas un avertissement ». Une
# photo non traitee porte encore ses metadonnees EXIF, donc la position GPS du
# domicile de l'exploitante.
mute "$CATALOGUE" 's/  if \(conditions\.mediasNonTraites > 0\) \{\n    motifs\.push\("MEDIA_NON_TRAITE"\);\n  \}/  \/\/ C8 retiree/'
cas "condition C8 retiree, photo en echec publiable" integration \
  "refuse un produit dont une photo est en echec de traitement"

# ---------------------------------------------------------------------------
# Cas 81 : l'archivage « met a jour » les lignes de commande. C11, invariant 3.
#
# LA MUTATION QU'UNE RELECTURE ECRIRAIT DE BONNE FOI, en voulant garder le
# catalogue et l'historique coherents. C'est exactement l'inverse qu'il faut :
# une ligne de commande porte une COPIE FIGEE, et c'est ce qui rend une facture
# opposable. La toucher reecrirait l'histoire.
mute "$CATALOGUE" 's/  await depot\.ecrireStatutProduit\(prisma, produitId, \{\n    statut: "ARCHIVE",/  await prisma.ligneCommande.updateMany({\n    where: { variante: { produitId } },\n    data: { libelleProduitFige: "Produit archive" },\n  });\n  await depot.ecrireStatutProduit(prisma, produitId, {\n    statut: "ARCHIVE",/'
cas "archivage qui reecrit les lignes de commande" integration \
  "archiver un produit ne modifie aucune ligne de commande"

# ---------------------------------------------------------------------------
# Cas 82 et 83 : C19 rate dans ses DEUX sens. LS-103.
#
# POURQUOI DEUX CAS ET NON UN. Une regle d'archivage en cascade se trompe de
# deux facons opposees, et un seul test ne distingue pas les deux :
#
#   trop tot   le produit est archive des la PREMIERE variante archivee, ce qui
#              retire du catalogue une piece encore vendable dans une autre
#              declinaison
#   jamais     le produit reste `ACTIF` sans rien de vendable, le trou que C19
#              existe pour fermer
#
# Le second est le defaut qui existait reellement avant LS-103.
mute "$VARIANTE" 's/      if \(restantes > 0\) \{\n        return;\n      \}/      if (restantes < 0) {\n        return;\n      }/'
cas "C19 archive des la premiere variante archivee" integration \
  "laisse le produit actif s'il reste une variante vivante"

mute "$VARIANTE" 's/      if \(restantes > 0\) \{\n        return;\n      \}/      if (restantes >= 0) {\n        return;\n      }/'
cas "C19 n'archive jamais le produit" integration \
  "archive le produit quand sa derniere variante vivante part"

echo
echo "Ecrans d'administration rendus avec session, tests de bout en bout"
echo

# ---------------------------------------------------------------------------
# Cas 84 a 86 : LS-111. Ces trois cas prouvent que les tests de rendu AVEC
# session voient reellement quelque chose.
#
# POURQUOI ILS ETAIENT IMPOSSIBLES AVANT. La suite ne rendait aucun ecran
# d'administration, faute de session : muter la mise en page de l'editeur
# laissait les 128 tests d'alors entierement verts, parce qu'aucun n'allait plus
# loin que la redirection vers la connexion. Les criteres de rendu de LS-102 et
# LS-103 ont ete reportes deux fois pour cette raison.
#
# LE PREMIER CAS EST CELUI QUI COMPTE. Un debordement horizontal a 320 px etait
# jusqu'ici CALCULE par une revue, jamais mesure, et c'est exactement le defaut
# que LS-103 avait trouve a la lecture, un `<ul>` dont le padding par defaut
# mangeait 40 px. La mutation le reintroduit en tete de l'editeur.
mute "$PAGE_EDITEUR" 's/      <PublicationProduit/      <div style={{ width: "800px" }} \/>\n      <PublicationProduit/'
cas "debordement horizontal introduit dans l'editeur de fiche" e2e \
  "ne deborde pas horizontalement"

# Cas 85 : l'ORDRE des blocs. La publication passe SOUS les informations
# generales, ce que le rendu accepte sans broncher et qu'aucun type ne signale.
# L'arbitrage de LS-103 la veut en tete, l'etat de la fiche etant la premiere
# chose a lire en ouvrant l'ecran.
#
# LE BLOC EST DEPLACE ET NON SUPPRIME, et la nuance a ete mesuree. Le retirer
# rendait `motifs` inutilise, la construction Next.js echouait avant la suite, et
# la mutation aurait ete comptee « detectee » pour une raison etrangere au test
# d'ordre. Une mutation qui casse la compilation ne prouve rien des tests.
mute "$PAGE_EDITEUR" 's/      <PublicationProduit\n        produitId=\{produit\.id\}\n        statut=\{produit\.statut\}\n        motifs=\{motifs\}\n      \/>\n\n      <EditeurProduit/      <EditeurProduit/'
mute "$PAGE_EDITEUR" 's/      <VariantesProduit/      <PublicationProduit\n        produitId={produit.id}\n        statut={produit.statut}\n        motifs={motifs}\n      \/>\n      <VariantesProduit/'
cas "bloc de publication descendu sous les informations generales" e2e \
  "les cinq blocs de l'editeur sont rendus dans l'ordre decide"

# Cas 86 : LA GARDE DE ROLE, vue par le refus ANONYME.
#
# CE CAS SE DISTINGUE DU CAS 11 DEJA PRESENT, qui retire la verification DANS
# `exigerAdministratrice`. Celui-ci laisse la fonction intacte et change son
# APPEL : une page qui appelle la mauvaise garde passe tous les tests du service.
#
# IL EST EXERCE PAR UN TEST ANTERIEUR A LS-111, `catalogue-administration`, et
# non par les tests que ce ticket ajoute : c'est assume. Le cas 88 plus bas
# couvre le versant que SEULE la session permet, un client connecte sans le
# role. Les deux sont necessaires, et le second est celui qui manquait.
#
# DEUX SUBSTITUTIONS ET NON UNE : `exigerSession` doit aussi etre IMPORTE, sans
# quoi la construction Next.js echoue et la mutation serait comptee « detectee »
# sur une erreur de compilation, sans avoir rien prouve des tests.
mute "$PAGE_EDITEUR" 's/  exigerAdministratrice,\n\} from "@\/services\/autorisation";/  exigerAdministratrice,\n  exigerSession,\n} from "@\/services\/autorisation";/'
mute "$PAGE_EDITEUR" 's/    await exigerAdministratrice\(enTetes\);/    await exigerSession(enTetes);/'
cas "editeur garde par exigerSession au lieu du role" e2e \
  "refuse un visiteur sans session"


# ---------------------------------------------------------------------------
# Cas 87 : LES MOTIFS DE NON-PUBLICATION, vides. LS-111.
#
# CE CAS EXISTE PARCE QUE LA REVUE A TROUVE LE TEST AVEUGLE. Sa premiere version
# comptait `page.getByRole("listitem")` sur toute la page, or l'editeur rend
# QUATRE listes : les manques, mais aussi une entree par variante, par photo et
# par section. La fixture posant une declinaison, le compte valait au moins 1
# meme quand le bloc de publication ne rendait plus rien.
#
# Mesure faite : en vidant `manquants`, le test restait VERT aux trois largeurs
# alors que son commentaire affirmait qu'il verrait ce cas. L'assertion est
# desormais ancree dans la region « Publication ».
mute "$PUBLICATION" 's/  const manquants = refuses \?\? motifs;/  const manquants: typeof motifs = [];/'
cas "motifs de non-publication vides" e2e \
  "les motifs de non-publication sont lisibles sans debordement"

# ---------------------------------------------------------------------------
# Cas 88 : UN CLIENT CONNECTE ATTEINT L'EDITEUR. LS-111, invariant 2.
#
# CE CAS EST CELUI QUE SEULE LA SESSION PERMET, et il se distingue du cas 86.
# Une page qui appelle `exigerSession` au lieu d'`exigerAdministratrice`
# redirige toujours le visiteur ANONYME : tous les tests de refus anterieurs
# restent verts. Seul un compte connecte SANS le role separe les deux gardes, et
# aucun test ne le faisait avant ce ticket.
#
# Le defaut est silencieux et se corrige d'un mot : la page s'affiche
# normalement pour qui possede une session, et livre le catalogue en preparation
# a n'importe quel compte de la boutique.
mute "$PAGE_EDITEUR" 's/  exigerAdministratrice,\n\} from "@\/services\/autorisation";/  exigerAdministratrice,\n  exigerSession,\n} from "@\/services\/autorisation";/'
mute "$PAGE_EDITEUR" 's/    await exigerAdministratrice\(enTetes\);/    await exigerSession(enTetes);/'
cas "editeur atteint par un client connecte sans le role" e2e \
  "refuse un client connecte"


echo
echo "Catalogue public, tests d'integration et de bout en bout"
echo

# ---------------------------------------------------------------------------
# Cas 91 a 94 : LS-104, le premier ecran PUBLIC du projet.
#
# Cas 91 : LE FILTRE DE STATUT RETIRE. Sans lui, brouillons et produits archives
# sortent au catalogue : du travail en cours et des prix non arretes exposes
# publiquement. Le defaut est SILENCIEUX, la page s'affiche normalement et
# montre simplement plus de pieces.
mute "$DEPOT_CATALOGUE" "s/    WHERE p.statut = 'ACTIF'/    WHERE p.statut IS NOT NULL/"
cas "filtre de statut retire du catalogue public" integration \
  "ne rend jamais un produit BROUILLON ni ARCHIVE"

# Cas 92 : LA RESERVATION IGNOREE dans le calcul de disponibilite. Le catalogue
# annonce alors « en stock » une piece deja engagee dans un paiement en cours,
# et deux clients se voient promettre le meme bijou.
mute "$DEPOT_CATALOGUE" 's/sum\(greatest\(v.quantite_physique - v.quantite_reservee, 0\)\)/sum(greatest(v.quantite_physique, 0))/'
cas "reservations ignorees dans la disponibilite" integration \
  "deduit les reservations actives"

# Cas 93 : LE SEUIL DE « DERNIERE PIECE » DEPLACE. Une piece unique s'annonce
# alors « en stock » : l'information d'urgence disparait, et c'est le cas
# ORDINAIRE de cette boutique, chaque bijou etant fait main.
mute "$SERVICE_CATALOGUE" 's/  return quantiteDisponible === 1 \? "DERNIERE_PIECE" : "EN_STOCK";/  return quantiteDisponible === 0 ? "DERNIERE_PIECE" : "EN_STOCK";/'
cas "seuil de derniere piece deplace" integration \
  "annonce DERNIERE_PIECE a exactement une"

# ---------------------------------------------------------------------------
# Cas 94 : L'EXTENSION DE LA VIGNETTE, `.jpg` POUR `.jpeg`.
#
# CE CAS REJOUE UN DEFAUT REEL DU PROJET. En LS-102 une URL de vignette portait
# `640.jpg` quand le traitement ecrit `640.jpeg` : ni les types, ni les tests, ni
# la construction ne bougeaient, et toutes les vignettes auraient ete cassees en
# production.
#
# LE TEST QUI L'ATTRAPE CONFRONTE LES URL A `declinaisonsAttendues()`, la source
# de verite du traitement, plutot que de les relire. Il n'existait pas avant la
# revue de LS-104 : la preparation ne posait aucun media, donc le `<picture>`
# n'etait execute par AUCUN des 188 tests.
mute "$CARTE_PRODUIT" 's/640\.jpeg`\}/640.jpg`}/'
cas "extension de vignette .jpg au lieu de .jpeg" e2e \
  "chaque URL servie correspond a une declinaison produite"

# ---------------------------------------------------------------------------
# Cas 95 : LA VENTE WEB DESACTIVEE FAIT DISPARAITRE au lieu d'afficher
# « Epuise ». LS-104, releve par la revue.
#
# LA TABLE DES ETATS de `frontend-design.md` donne « vente web desactivee » comme
# condition de l'etat `Epuise`, au meme titre que la quantite nulle, jamais comme
# cause de disparition. La premiere version du depot ajoutait la condition au
# JOIN : une piece partie sur un marche sortait du catalogue, perdait son adresse
# publique et son referencement, et revenait plus tard sous une URL que plus
# personne n'avait en favori.
#
# C'est aussi l'invariant 6 : suspendre la vente web et retirer du catalogue sont
# deux gestes distincts.
mute "$DEPOT_CATALOGUE" 's/    JOIN variante v ON v.produit_id = p.id\n      AND v.archivee_a IS NULL/    JOIN variante v ON v.produit_id = p.id\n      AND v.archivee_a IS NULL\n      AND v.vente_web_activee = true/'
cas "vente web desactivee fait disparaitre du catalogue" integration \
  "annonce EPUISE pour un produit dont la vente web est desactivee"
echo
echo "-----------------------------------------"
if [ "$echecs" -eq 0 ]; then
  echo "  $mutations mutations, $mutations detectees"
else
  echo "  $mutations mutations, $echecs NON detectees"
fi
echo "-----------------------------------------"

exit "$echecs"
