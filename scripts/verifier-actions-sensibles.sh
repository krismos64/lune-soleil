#!/bin/bash
# Vérifie qu'aucune action déclarée sensible n'échappe à la réauthentification,
# LS-81, ADR-027 décision 3.
#
# Motif. La liste des actions sensibles est écrite à la main, et c'est
# exactement la forme du défaut rencontré trois fois sur ce projet : un drapeau
# ajouté sans être porté dans toutes les conditions d'accès. Si une action
# sensible est oubliée, rien n'échoue, aucun test ne rougit, et le trou reste
# invisible jusqu'à ce qu'il serve.
#
# Ce que ce contrôle confronte, dans LES DEUX SENS :
#
#   1. toute action marquée `@sensible` dans `src/` appelle bien
#      `exigerReauthentificationRecente`
#   2. la famille qu'elle déclare existe dans le type `FamilleActionSensible`
#   3. toute famille du type est effectivement citée par au moins une action,
#      ou explicitement déclarée en attente d'implémentation
#
# LE SENS 3 EXISTE PARCE QU'UN CONTRÔLE À SENS UNIQUE MENT PAR OMISSION. Sans
# lui, supprimer la dernière action d'une famille laisserait le contrôle vert :
# zéro action à vérifier, zéro échec. La protection aurait disparu sans bruit.
#
# Usage : ./scripts/verifier-actions-sensibles.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$RACINE/src"
SERVICE="$RACINE/src/services/reauthentification.ts"
ATTENTE="$RACINE/.claude/familles-sans-action.txt"
ko=0
verifiees=0

[ -r "$SERVICE" ] || { echo "ECHEC service de réauthentification illisible : $SERVICE"; exit 1; }
[ -d "$SOURCE" ] || { echo "ECHEC dossier source introuvable : $SOURCE"; exit 1; }

# ---------------------------------------------------------------------------
# Les familles déclarées, relevées dans le type et jamais recopiées ici.
#
# UNE LISTE ÉCRITE DANS CE SCRIPT SERAIT UNE OPINION. Elle resterait verte le
# jour où quelqu'un ajoute une cinquième famille au type sans lui donner de
# garde, ce qui est précisément le trou que ce contrôle ferme.
# ---------------------------------------------------------------------------
familles_declarees=$(
  sed -n '/^export type FamilleActionSensible =/,/;$/p' "$SERVICE" \
    | grep -oE '"[A-Z_]+"' \
    | tr -d '"' \
    | sort -u
)

nombre_familles=$(printf '%s\n' "$familles_declarees" | grep -c . || true)

if [ "$nombre_familles" -eq 0 ]; then
  echo "ECHEC aucune famille relevée dans FamilleActionSensible : l'ancrage du contrôle est cassé"
  echo "      (le type a été renommé ou sa forme a changé, le contrôle ne vérifie plus rien)"
  exit 1
fi

echo "Familles déclarées dans FamilleActionSensible : $nombre_familles"

# ---------------------------------------------------------------------------
# Sens 1 et 2 : chaque action marquée `@sensible` porte sa garde.
#
# La marque est un commentaire `@sensible FAMILLE` posé sur la fonction. Le
# contrôle relève le fichier et la famille, puis exige l'appel dans ce fichier.
# ---------------------------------------------------------------------------
familles_couvertes=""

while IFS= read -r occurrence; do
  [ -n "$occurrence" ] || continue

  fichier="${occurrence%%:*}"
  reste="${occurrence#*:}"
  ligne="${reste%%:*}"
  famille=$(printf '%s' "$occurrence" | grep -oE '@sensible[[:space:]]+[A-Z_]+' | awk '{print $2}')
  verifiees=$((verifiees + 1))

  if [ -z "$famille" ]; then
    echo "ECHEC $fichier : marque @sensible sans famille"
    echo "      forme attendue : @sensible NOM_DE_FAMILLE"
    ko=$((ko + 1))
    continue
  fi

  # La famille citée doit exister dans le type. Une faute de frappe créerait
  # sinon une famille fantôme, protégée par personne.
  if ! printf '%s\n' "$familles_declarees" | grep -qx "$famille"; then
    echo "ECHEC $fichier : famille inconnue « $famille »"
    echo "      familles déclarées : $(printf '%s' "$familles_declarees" | tr '\n' ' ')"
    ko=$((ko + 1))
    continue
  fi

  # Le point décisif : la garde est-elle appelée DANS LA FONCTION MARQUÉE.
  #
  # DEUX FAUX NÉGATIFS CORRIGÉS ICI, tous deux trouvés en exerçant le contrôle
  # plutôt qu'en le relisant.
  #
  # Le premier : un simple `grep exigerReauthentificationRecente` était
  # satisfait par un commentaire disant « aucun appel à
  # exigerReauthentificationRecente ici ». Le contrôle trouvait le nom dans la
  # phrase qui affirme son absence. D'où l'exclusion des commentaires et
  # l'exigence de la parenthèse ouvrante.
  #
  # Le second, plus grave : chercher dans TOUT LE FICHIER laissait passer un
  # fichier portant une action gardée et une action non gardée. La seconde
  # empruntait la preuve de la première. C'est le défaut exact que ce script
  # existe pour attraper, et le scénario est banal : une fonction ajoutée par
  # mimétisme trois semaines plus tard, marquée mais non gardée.
  #
  # L'extraction part de la ligne de la marque et s'arrête à la première ligne
  # qui recommence en colonne zéro APRÈS le début du corps, ce qui borne la
  # fonction sans avoir à analyser la syntaxe.
  #
  # LE CORPS NE COMMENCE QU'À L'ACCOLADE OUVRANTE, et cette précision a coûté
  # trois essais en LS-95, la première action sensible réelle du dépôt.
  #
  # La version précédente considérait le corps commencé dès la première ligne
  # non vide après la marque. Sur une signature que Prettier étale sur trois
  # lignes, forme normale dès que le type de retour est un peu long :
  #
  #     export async function supprimerMonCompte(      <- « corps commencé »
  #       enTetes: Headers,
  #     ): Promise<ResultatSuppressionGardee> {        <- colonne zéro, ARRÊT
  #
  # l'extraction s'arrêtait AVANT la première instruction. Le contrôle refusait
  # donc une action parfaitement gardée, et le refus était indiscernable d'un
  # vrai défaut : « action @sensible sans appel à exigerReauthentificationRecente ».
  #
  # Pire, la seule façon de le contenter était d'écrire une signature d'un seul
  # tenant, que `npm run format` re-découpait aussitôt. Le contrôle et le
  # formateur se contredisaient, et la victime aurait été le contrôle : on
  # finit par retirer la marque plutôt que par comprendre.
  #
  # `vu` ne passe donc à vrai qu'après une ligne portant `{`, l'ouverture du
  # corps. Une signature sur une ou dix lignes est traitée pareil.
  corps=$(awk -v debut="$ligne" '
    NR < debut { next }
    NR == debut { dans = 1; next }
    dans && /^[^[:space:]}]/ && vu { exit }
    dans && /\{/ { vu = 1 }
    dans { print }
  ' "$fichier")

  if ! printf '%s\n' "$corps" \
       | grep -v '^\s*\(//\|\*\|/\*\)' \
       | grep -qE 'exigerReauthentificationRecente[[:space:]]*\('; then
    echo "ECHEC $fichier:$ligne : action @sensible $famille sans appel à exigerReauthentificationRecente"
    echo "      une action sensible non gardée s'exécute sur simple session ouverte"
    echo "      (l'appel est cherché dans le corps de CETTE fonction, pas ailleurs dans le fichier)"
    ko=$((ko + 1))
    continue
  fi

  familles_couvertes="$familles_couvertes$famille"$'\n'
done <<EOF
$(grep -rn "@sensible" "$SOURCE" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "reauthentification.ts" || true)
EOF

# ---------------------------------------------------------------------------
# Sens 3 : toute famille déclarée est couverte, ou explicitement en attente.
#
# LE FICHIER D'ATTENTE EST LA PARTIE QUI DEMANDE DE LA RIGUEUR. Il existe parce
# que LS-81 pose le mécanisme avant que les écrans existent : les quatre
# familles sont vraies et aucune n'a encore d'action à garder. Sans lui, le
# contrôle échouerait dès sa création, donc serait désactivé, donc ne
# protégerait rien.
#
# Il porte son propre risque, et c'est pourquoi il est nommé et daté : une
# famille qu'on y laisse est une famille non protégée. Le retrait d'une ligne
# est le geste qui accompagne l'écriture de la première action de sa famille.
# ---------------------------------------------------------------------------
familles_en_attente=""
if [ -r "$ATTENTE" ]; then
  familles_en_attente=$(grep -oE '^[A-Z_]+' "$ATTENTE" | sort -u || true)
fi

for famille in $familles_declarees; do
  if printf '%s\n' "$familles_couvertes" | grep -qx "$famille"; then
    continue
  fi

  if printf '%s\n' "$familles_en_attente" | grep -qx "$famille"; then
    echo "EN ATTENTE $famille : aucune action de cette famille n'existe encore"
    continue
  fi

  echo "ECHEC famille $famille déclarée mais couverte par aucune action"
  echo "      soit une action a perdu sa marque @sensible, soit la famille est à retirer,"
  echo "      soit elle est à déclarer dans .claude/familles-sans-action.txt avec sa raison"
  ko=$((ko + 1))
done

# Une famille listée en attente alors qu'elle EST couverte : la ligne est
# périmée et doit partir, sinon le fichier d'attente se transforme en décharge
# qui exempte à vie.
for famille in $familles_en_attente; do
  if printf '%s\n' "$familles_couvertes" | grep -qx "$famille"; then
    echo "ECHEC famille $famille déclarée en attente alors qu'une action la couvre"
    echo "      retirer sa ligne de .claude/familles-sans-action.txt"
    ko=$((ko + 1))
  fi
done

echo "Actions @sensible vérifiées : $verifiees"

# ---------------------------------------------------------------------------
# Sens 4 : sous `administration/`, la garde de rôle accompagne celle de
# fraîcheur. LS-89 tranche ici la question que LS-81 lui avait laissée.
#
# LE DÉFAUT VISÉ EST RÉEL, IL S'EST PRODUIT. L'écran de réauthentification de
# LS-89 ne filtrait d'abord que la PRÉSENCE d'une session, jamais le rôle. Un
# client inscrit sur la boutique, rôle `CLIENT` par défaut, ouvrait l'écran,
# saisissait SON mot de passe et repartait avec une preuve fraîche :
# `verifyPassword` vérifie contre `session.user.id`, donc il réussissait.
#
# Les deux gardes répondent à deux questions distinctes, et l'une ne dit rien de
# l'autre : `exigerReauthentificationRecente` répond à « cette identité est-elle
# récente », `exigerAdministratrice` à « qui agit ». Une action d'administration
# qui n'appelle que la première laisse un client authentifié franchir la garde
# de fraîcheur avec son propre mot de passe.
#
# POURQUOI LA PORTÉE S'ARRÊTE À `administration/`, et c'est le point qui a
# demandé le plus d'attention. Exiger le couple PARTOUT serait faux et le
# contrôle deviendrait nuisible : `supprimerMonCompte` est une action sensible
# de l'ESPACE CLIENT, famille `IDENTIFIANTS`, et elle doit précisément NE PAS
# exiger le rôle administratrice. Une personne supprime son propre compte,
# article 17. Un contrôle qui la refuserait pousserait à lui ajouter une garde
# de rôle qui interdirait le droit à l'effacement à tous les clients, c'est-à-
# dire à créer un vrai défaut pour satisfaire une règle mal cadrée.
#
# La règle exacte est donc : sous `src/app/administration/`, tout fichier qui
# appelle une garde de fraîcheur ou qui écrit une preuve appelle aussi
# `exigerAdministratrice`. Ailleurs, le couple ne s'impose pas.
# ---------------------------------------------------------------------------
ADMINISTRATION="$SOURCE/app/administration"
couples_verifies=0

# L'ABSENCE DU DOSSIER EST UN ÉCHEC, ET NON UN CAS SANS OBJET. Ce garde-fou a
# été ajouté après avoir exercé le contrôle : la première version conditionnait
# tout le sens 4 à `[ -d "$ADMINISTRATION" ]`, si bien qu'un dossier renommé
# rendait la condition fausse, sautait la boucle, et le script concluait « OK »
# sans avoir rien examiné. La mutation qui renomme le dossier passait au vert.
#
# C'est le motif du garde-fou jamais exercé, déjà rencontré ici : un contrôle
# qui traite sa propre cible manquante comme « rien à faire » se désarme
# silencieusement le jour où l'arborescence bouge.
if [ ! -d "$ADMINISTRATION" ]; then
  echo "ECHEC dossier d'administration introuvable : $ADMINISTRATION"
  echo "      le sens 4 ne vérifie plus rien. Si le dossier a été renommé,"
  echo "      corriger ce chemin plutôt que de laisser le contrôle muet."
  ko=$((ko + 1))
else
  while IFS= read -r fichier; do
    [ -n "$fichier" ] || continue

    # Le fichier touche-t-il à la réauthentification, appel de la garde ou
    # écriture d'une preuve. Les commentaires sont exclus : sans cela, la phrase
    # qui EXPLIQUE la règle la satisferait, défaut déjà rencontré ici.
    code=$(grep -v '^\s*\(//\|\*\|/\*\)' "$fichier")

    if ! printf '%s\n' "$code" \
         | grep -qE '(exigerReauthentificationRecente|enregistrerPreuveIdentite|prouverIdentiteMotDePasse|prouverIdentiteParMotDePasse|prouverIdentiteParPasskey)[[:space:]]*\('; then
      continue
    fi

    couples_verifies=$((couples_verifies + 1))

    if ! printf '%s\n' "$code" \
         | grep -qE 'exigerAdministratrice[[:space:]]*\('; then
      relatif="${fichier#"$RACINE"/}"
      echo "ECHEC $relatif : touche à la réauthentification sans appeler exigerAdministratrice"
      echo "      sous administration/, les deux gardes vont ensemble : la fraîcheur"
      echo "      de l'identité ne dit rien du rôle. Un client authentifié franchirait"
      echo "      cette garde avec son propre mot de passe (défaut réel de LS-89)."
      ko=$((ko + 1))
    fi
  done <<EOF
$(find "$ADMINISTRATION" \( -name "*.ts" -o -name "*.tsx" \) 2>/dev/null | sort || true)
EOF
fi

echo "Couples de gardes vérifiés sous administration/ : $couples_verifies"

# ---------------------------------------------------------------------------
# Sens 6 : toute Server Action sous administration/ exige le rôle. LS-99.
#
# CE QUE LE SENS 4 NE COUVRE PAS, et le trou est réel. Il n'examine que les
# fichiers touchant à la RÉAUTHENTIFICATION : un fichier d'administration qui ne
# l'appelle pas sort de sa boucle par le `continue`, garde ou pas. Une Server
# Action d'administration sans `exigerAdministratrice` était donc invisible.
#
# POURQUOI CELA COMPTE. Une Server Action est un point d'entrée HTTP, invocable
# directement sans jamais charger la page qui la porte. Protéger la seule page
# laisse ce chemin ouvert : c'est le défaut trouvé en relecture de LS-89, où un
# client inscrit sur la boutique atteignait une action réservée.
#
# L'ANCRAGE EST `"use server"` ET NON LE NOM DU FICHIER. Un ancrage sur
# `actions.ts` raterait toute Server Action logée ailleurs, et le jour où
# quelqu'un nomme son fichier autrement le contrôle se tairait.
#
# CE QUE CE CONTRÔLE NE PROUVE PAS, et il faut le dire : il constate que l'appel
# figure dans le fichier, pas qu'il s'exécute avant l'effet. Une garde placée
# après l'écriture le satisferait mot pour mot. Les tests e2e de LS-99 couvrent
# ce second aspect pour les écrans livrés.
actions_serveur_verifiees=0

if [ -d "$ADMINISTRATION" ]; then
  while IFS= read -r fichier; do
    [ -n "$fichier" ] || continue

    code=$(grep -v '^\s*\(//\|\*\|/\*\)' "$fichier")

    # Seuls les fichiers de Server Actions sont concernés : une page qui ne
    # déclare rien passe par le sens 4 pour ce qui la regarde.
    if ! printf '%s\n' "$code" | grep -qE '^[[:space:]]*"use server"'; then
      continue
    fi

    # LA VÉRIFICATION PORTE SUR CHAQUE FONCTION EXPORTÉE, PAS SUR LE FICHIER.
    #
    # LA PREMIÈRE VERSION CHERCHAIT DANS TOUT LE FICHIER, et elle ne prouvait
    # rien : la mutation qui retire la garde de `creerCategorieAction` la
    # laissait VERTE, les quatre autres actions du même fichier satisfaisant le
    # motif à sa place. C'est le défaut « mutation satisfaite ailleurs », déjà
    # rencontré ici, et c'est aussi celui que le sens 1 avait corrigé pour la
    # même raison.
    #
    # L'extraction du corps reprend la mécanique éprouvée du sens 1, y compris
    # le `vu` qui n'ouvre le corps qu'à l'accolade : une signature étalée par
    # Prettier sur trois lignes ne doit pas tronquer l'extraction.
    while IFS= read -r declaration; do
      [ -n "$declaration" ] || continue

      ligne_fn="${declaration%%:*}"
      nom_fn=$(printf '%s' "$declaration" | grep -oE 'function[[:space:]]+[A-Za-z0-9_]+' | awk '{print $2}')
      [ -n "$nom_fn" ] || continue

      actions_serveur_verifiees=$((actions_serveur_verifiees + 1))

      corps_fn=$(awk -v debut="$ligne_fn" '
        NR < debut { next }
        NR == debut { dans = 1; next }
        dans && /^[^[:space:]}]/ && vu { exit }
        dans && /\{/ { vu = 1 }
        dans { print }
      ' "$fichier")

      # LA PARENTHÈSE EST EXIGÉE, `exigerAdministratrice(`. Chercher le seul nom
      # trouverait un import, ou un commentaire qui NIE l'appel : motif déjà
      # rencontré sur ce dépôt.
      #
      # L'APPEL PEUT ÊTRE INDIRECT, par une fonction locale du fichier qui porte
      # la garde. Le motif accepte donc aussi `exigerRole(`, forme employée par
      # les actions du catalogue : sans cela le contrôle refuserait une
      # factorisation légitime et pousserait à recopier la garde cinq fois.
      if ! printf '%s\n' "$corps_fn" \
           | grep -v '^\s*\(//\|\*\|/\*\)' \
           | grep -qE '(exigerAdministratrice|exigerRole)[[:space:]]*\('; then
        relatif="${fichier#"$RACINE"/}"
        echo "ECHEC $relatif:$ligne_fn : $nom_fn est une Server Action sans garde de rôle"
        echo "      une Server Action est invocable directement, sans passer par le"
        echo "      rendu de l'écran. Protéger la page seule laisse ce chemin ouvert."
        echo "      (la garde est cherchée dans le corps de CETTE fonction)"
        ko=$((ko + 1))
      fi
    done <<INTERNE
$(grep -nE '^export async function [A-Za-z0-9_]+' "$fichier" || true)
INTERNE
  done <<EOF
$(find "$ADMINISTRATION" \( -name "*.ts" -o -name "*.tsx" \) 2>/dev/null | sort || true)
EOF
fi

echo "Fichiers de Server Actions vérifiés sous administration/ : $actions_serveur_verifiees"

# L'ANCRAGE SE PROUVE, même raison qu'au sens 4 : zéro fichier examiné signifie
# que le contrôle ne regarde plus rien, et un contrôle muet qui rend « OK » est
# pire que son absence.
if [ -d "$ADMINISTRATION" ] && [ "$actions_serveur_verifiees" -eq 0 ]; then
  echo "ECHEC aucune Server Action trouvée sous administration/"
  echo "      l'ancrage du sens 6 est cassé : le marqueur \"use server\" a changé"
  echo "      de forme, ou les Server Actions ont quitté administration/"
  ko=$((ko + 1))
fi

# L'ANCRAGE SE PROUVE : zéro fichier vérifié signifie que le contrôle ne
# regarde plus rien, parce que le dossier a été renommé ou les noms de gardes
# ont changé. Un contrôle qui n'examine aucun cas doit le dire, sinon il rend
# « OK » en ne vérifiant rien, ce qui est pire que son absence.
if [ -d "$ADMINISTRATION" ] && [ "$couples_verifies" -eq 0 ]; then
  echo "ECHEC aucun fichier d'administration ne touche à la réauthentification"
  echo "      l'ancrage du sens 4 est cassé : les gardes ont été renommées, ou"
  echo "      l'écran de réauthentification a quitté administration/"
  ko=$((ko + 1))
fi

# ---------------------------------------------------------------------------
# Sens 5 : la liste reste courte. LS-81 critère 6, LS-89 critère 4.
#
# « AUCUNE ACTION FRÉQUENTE N'EXIGE DE RÉAUTHENTIFICATION », dit le critère, et
# c'est une exigence d'ergonomie qui protège la sécurité. Chaque action gardée
# se paie en saisies du mot de passe de seize caractères ; une protection qu'on
# subit finit contournée, et le mot de passe finit raccourci ou écrit.
#
# CE CONTRÔLE MESURE LA PROPORTION plutôt qu'un nombre absolu : il compte les
# fonctions marquées `@sensible` et les compare aux fonctions exportées de
# `services/` et des Server Actions, la population où une action peut naître. Un
# plafond en valeur absolue vieillirait mal, le nombre d'écrans devant croître
# de plusieurs phases.
#
# LE DÉNOMINATEUR COUVRE LA MÊME POPULATION QUE LE NUMÉRATEUR, et cette
# précision a coûté une régression : une première version comptait les FICHIERS
# portant `"use server"`, alors que les marques vivent dans `services/`. Le
# fichier témoin du cas 9 de la preuve par mutation, qui exige un SUCCÈS sur une
# action correctement gardée, faisait alors échouer le contrôle : sa marque
# entrait au numérateur, son fichier jamais au dénominateur. Un contrôle dont le
# numérateur et le dénominateur ne comptent pas la même chose finit par accuser
# du code juste.
#
# LE SEUIL EST LARGE, LA MOITIÉ, et c'est volontaire. Ce contrôle n'arbitre pas
# à la place de quelqu'un : il attrape la dérive franche, le jour où marquer
# `@sensible` devient un réflexe de prudence appliqué partout. Un dépassement
# n'est pas la preuve d'une faute, c'est la demande d'un arbitrage explicite,
# exactement ce que dit le type : « une cinquième famille demande un arbitrage,
# pas une ligne de plus ».
# ---------------------------------------------------------------------------
fonctions_exportees=$(
  grep -rhE '^export (async )?function ' "$SOURCE/services" "$SOURCE/app" \
    --include="*.ts" --include="*.tsx" 2>/dev/null \
    | wc -l | tr -d ' '
)

echo "Fonctions exportées de services/ et app/ : $fonctions_exportees, dont marquées sensibles : $verifiees"

# L'ANCRAGE SE PROUVE ICI AUSSI : zéro fonction relevée signifie que le motif ne
# correspond plus, et le rapport ne voudrait rien dire.
if [ "$fonctions_exportees" -eq 0 ]; then
  echo "ECHEC aucune fonction exportée relevée dans services/ ni app/"
  echo "      l'ancrage du sens 5 est cassé, le rapport ne mesure plus rien"
  ko=$((ko + 1))
elif [ $((verifiees * 2)) -gt "$fonctions_exportees" ]; then
  echo "ECHEC plus de la moitié des fonctions exigent une réauthentification"
  echo "      $verifiees sur $fonctions_exportees. Le critère 6 de LS-81 demande une liste"
  echo "      volontairement courte : chaque action gardée se paie en saisies du mot de"
  echo "      passe, et une protection subie finit contournée. Arbitrer explicitement"
  echo "      plutôt que d'ajouter une marque de plus."
  ko=$((ko + 1))
fi

if [ "$ko" -gt 0 ]; then
  echo "ECHEC $ko problème(s)"
  exit 1
fi

echo "OK actions sensibles cohérentes avec FamilleActionSensible"
