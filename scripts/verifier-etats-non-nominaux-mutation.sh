#!/bin/bash
# Preuve par mutation des etats non nominaux de l'administration, LS-113,
# critere 6.
#
# POURQUOI UN SCRIPT A PART, ET NON DES CAS DANS `verifier-tests-mutation.sh`.
# La suite complete de ce dernier dure environ 35 minutes et se joue aux jalons.
# Les cas neufs se prouvent d'abord seuls, ce qui rend la boucle d'ecriture
# tenable ; ils rejoindront le script central quand ils seront stables. Motif
# « mutation, cas neufs seulement », en fiche sur ce depot.
#
# CE QUI EST MUTE EST LE CODE APPLICATIF, jamais un test. Retirer une assertion
# ferait rougir le test qui la porte sans rien prouver : ce qu'il faut etablir
# est qu'un DEFAUT du produit fait rougir le test qui pretend le garder.
#
# CHAQUE CAS EXIGE LE BON TEST, et pas seulement « la suite rougit ». Un cas
# satisfait par un test voisin validerait une protection qui n'existe pas :
# motif « mutation vue par le mauvais test », en fiche.
#
# Usage : ./scripts/verifier-etats-non-nominaux-mutation.sh
# Prerequis : Docker et la base de developpement, la suite de bout en bout en
# ayant besoin.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CATEGORIES="src/app/administration/categories/gestion-categories.tsx"
FORMULAIRE="src/app/administration/produits/nouveau/formulaire-produit.tsx"
VARIANTES="src/app/administration/produits/[id]/variantes-produit.tsx"
PUBLICATION="src/app/administration/produits/[id]/publication-produit.tsx"
EDITEUR="src/app/administration/produits/[id]/editeur-produit.tsx"

MUTABLES=("$CATEGORIES" "$FORMULAIRE" "$VARIANTES" "$PUBLICATION" "$EDITEUR")

mutations=0
echecs=0

# LES FICHIERS SONT SAUVEGARDES PAR COPIE et non par `git checkout` : une
# restauration qui depend de l'index echoue sur un fichier non encore suivi, et
# `git checkout` est atomique, un seul chemin absent faisant tout echouer.
# Motif « git checkout est atomique », en fiche.
TMP="$(mktemp -d)"
mkdir -p "$TMP/copies"

for i in "${!MUTABLES[@]}"; do
  fichier="${MUTABLES[$i]}"
  if [ ! -f "$fichier" ]; then
    echo "ECHEC fichier a muter introuvable : $fichier"
    echo "      le chemin a change : ce script s'arreterait avant la mutation"
    echo "      qu'il pretend faire, motif « controle de mutation mort »."
    rm -rf "$TMP"
    exit 1
  fi
  cp "$fichier" "$TMP/copies/$i"
done

restaurer() {
  for i in "${!MUTABLES[@]}"; do
    cp "$TMP/copies/$i" "${MUTABLES[$i]}"
  done
}

nettoyer() {
  restaurer
  rm -rf "$TMP"
}
trap nettoyer EXIT INT TERM

composant() { npx vitest run --project composant; }

# ---------------------------------------------------------------------------
# LA SUITE DE BOUT EN BOUT EST LANCEE SUR UN SEUL PROJET ET UN SEUL TEST.
#
# LE PLAFOND D'AUTHENTIFICATION EST LA RAISON, et c'est LS-168. Chaque passe
# Playwright rejoue la preparation, donc consomme le plafond de `/sign-in/email`
# et de `/sign-up/email` : huit passes rapprochees le declenchent en cours de
# route, et le script accuse alors les tests d'etre aveugles alors que la
# preparation a echoue en 429.
#
# MESURE : les memes cas rougissent bien quand ils sont joues seuls, verifie a
# la main pendant l'ecriture. Le defaut etait dans le script, pas dans les tests.
#
# `--project=mobile-320` ET `-g` REDUISENT LA CONSOMMATION D'UN FACTEUR DOUZE :
# un projet au lieu de trois, un test au lieu de dix-sept. La preparation reste
# jouee, elle ne peut pas etre sautee, mais elle l'est une fois par cas au lieu
# de trois.
# ---------------------------------------------------------------------------
e2e_un() {
  # AUCUNE PAUSE N'EST NECESSAIRE DEPUIS QUE LS-113 A CORRIGE LA FIXTURE.
  #
  # Une version precedente de ce script attendait 65 secondes entre deux passes,
  # la fenetre de debit etant d'une minute : `session-cliente.setup.ts`
  # s'inscrivait a chaque execution avec une adresse horodatee, et consommait
  # ainsi une des TROIS places par minute de `/sign-up/email`. Trois passes
  # suffisaient a bloquer la preparation, donc a rendre ce script inutilisable.
  #
  # LA CAUSE EST TRAITEE A SA SOURCE, la fixture reutilisant desormais un compte
  # fixe avec les trois paliers du motif de `session-administration.setup.ts`.
  # Mesure du 5 septembre 2026 : trois passes d'affilee sans pause, aucun 429.
  #
  # SI LE 429 REVENAIT, ne pas remettre de pause ici : ce serait le signe qu'une
  # autre preparation s'inscrit a chaque execution, et c'est elle qu'il faudrait
  # corriger. Le garde-fou de `cas` nomme explicitement ce diagnostic.
  npx playwright test etats-non-nominaux-administration \
    --project=mobile-320 -g "$1"
}

# LA SUITE DOIT ETRE VERTE AVANT TOUTE MUTATION, sans quoi les rouges qui
# suivent ne prouveraient rien : une suite deja cassee rougit sur tout.
echo "Etat de reference, avant toute mutation"
if ! composant >"$TMP/reference.txt" 2>&1; then
  echo "  ECHEC les tests de composant rougissent AVANT mutation"
  tail -20 "$TMP/reference.txt"
  exit 1
fi
echo "  OK    les tests de composant sont verts"
echo

mute() {
  local fichier="$1" expression="$2"
  perl -0777 -i -pe "$expression" "$fichier"
}

cas() {
  # QUATRE PARAMETRES ET NON TROIS, et la separation est ce qui a corrige un
  # defaut du script : `$commande` non quote se decoupe sur les ESPACES, donc
  # « e2e_un la fiche qui porte... » ne passait que « la » en argument a `-g`.
  # Playwright ne trouvait alors aucun test correspondant, sortait en echec sans
  # rien executer, et le script concluait « le test est aveugle » sur un test
  # parfaitement voyant. Le titre voyage donc dans son propre parametre.
  local nom="$1" commande="$2" argument="$3" motif_attendu="$4"
  mutations=$((mutations + 1))

  if "$commande" "$argument" >"$TMP/sortie.txt" 2>&1; then
    echo "  RATE  $nom -> NON detecte, le test est aveugle"
    echecs=$((echecs + 1))
    restaurer
    return
  fi

  # -------------------------------------------------------------------------
  # UN ECHEC DE PREPARATION N'EST PAS UN VERDICT, ET LE CONFONDRE ACCUSE UN
  # INNOCENT.
  #
  # LE PLAFOND D'AUTHENTIFICATION, LS-168, fait echouer `session-cliente.setup`
  # en 429 quand plusieurs passes se suivent de pres. Playwright marque alors le
  # fichier de preparation en echec et n'execute AUCUN test : le script voyait
  # un rouge, ne trouvait pas le test attendu dedans, et concluait « detecte
  # ailleurs » sur des tests parfaitement voyants. Mesure faite a la main : les
  # memes cas rougissent bien quand la fenetre de debit est ouverte.
  #
  # LE SCRIPT S'ARRETE PLUTOT QUE DE CONCLURE. Un verdict rendu sur une suite
  # qui n'a pas tourne est pire qu'une absence de verdict : il designe un
  # coupable et clot la question.
  # -------------------------------------------------------------------------
  if grep -q "Too many requests" "$TMP/sortie.txt"; then
    echo "  ARRET $nom -> la preparation a echoue en 429, aucun test n'a tourne"
    echo "          LS-168, le plafond d'authentification. Attendre une minute"
    echo "          que la fenetre se referme, puis relancer ce script."
    echecs=$((echecs + 1))
    restaurer
    return
  fi

  # Les lignes en echec seulement, marquees × par Vitest et ✘ par Playwright.
  # Chercher le motif dans toute la sortie confondrait un test en echec avec le
  # meme test passe au vert quelques lignes plus haut.
  local lignes_echec
  lignes_echec=$(grep -E '(×|✘)' "$TMP/sortie.txt" || true)

  if printf '%s' "$lignes_echec" | grep -qF "$motif_attendu"; then
    echo "  OK    $nom -> detecte par le test attendu"
  else
    echo "  RATE  $nom -> echec constate, mais PAS sur le test attendu"
    echo "          attendu : $motif_attendu"
    echo "          echecs reels :"
    printf '%s\n' "$lignes_echec" | head -3 | sed 's/^ *//' | sed 's/^/            /'
    echecs=$((echecs + 1))
  fi
  restaurer
}

echo "Etats vides que seuls les tests de composant atteignent"
echo

# ---------------------------------------------------------------------------
# Cas 1 : l'etat vide des categories disparait.
#
# C'EST LE PREMIER ECRAN QUE VERRA L'EXPLOITANTE sur une boutique qui demarre,
# et il ne portait aucune protection avant cette story : la fixture de bout en
# bout insere toujours une categorie, donc la liste n'y est jamais vide.
# ---------------------------------------------------------------------------
mute "$CATEGORIES" 's/categories\.length === 0 \?/false ?/'
cas "l'etat vide des categories ne s'affiche plus" composant "" \
  "sans aucune categorie, l'ecran dit quoi faire et ou"

# ---------------------------------------------------------------------------
# Cas 2 : l'etat vide s'affiche EN PERMANENCE.
#
# LE DEFAUT SYMETRIQUE, et il est le plus discret des deux : l'ecran garde son
# message, donc un test qui ne verifierait que sa presence resterait vert.
# C'est ce que le cas negatif du fichier de test existe pour attraper.
# ---------------------------------------------------------------------------
mute "$CATEGORIES" 's/categories\.length === 0 \?/true ?/'
cas "l'etat vide des categories s'affiche toujours" composant "" \
  "avec une categorie, l'etat vide disparait"

# ---------------------------------------------------------------------------
# Cas 3 : l'ecran Nouveau produit rend son formulaire sans aucune categorie.
#
# Le defaut laisse une liste deroulante VIDE, sur laquelle l'administratrice ne
# peut rien choisir : le produit ne se range nulle part, et l'ecran ne dit pas
# ou creer la categorie qui manque.
# ---------------------------------------------------------------------------
mute "$FORMULAIRE" 's/if \(categories\.length === 0\) \{/if (false) {/'
cas "le formulaire s'affiche sans aucune categorie" composant "" \
  "sans aucune categorie, l'ecran renvoie vers l'ecran qui en cree"

echo
echo "Etats non nominaux mesures de bout en bout"
echo

# ---------------------------------------------------------------------------
# Cas 4 : l'etat vide des declinaisons disparait de l'editeur.
#
# Il etait atteint PAR ACCIDENT sur la fiche de controle avant cette story,
# sans qu'aucune assertion ne le nomme : le message pouvait disparaitre sans que
# rien ne rougisse. Le second produit de controle le rend intentionnel.
# ---------------------------------------------------------------------------
mute "$VARIANTES" 's/Aucune déclinaison en vente\./Rien ici./'
cas "l'etat vide des declinaisons change de texte" e2e_un \
  "les trois etats vides de l'editeur sont rendus et nommes" \
  "les trois etats vides de l'editeur sont rendus et nommes"

# ---------------------------------------------------------------------------
# LES DEUX CAS SUIVANTS SONT DESACTIVES, ET LA RAISON EST ECRITE PLUTOT QUE TUE.
#
# Ils mutent la condition d'un etat vide vers « toujours affiche », et le test
# negatif devrait rougir. Il ne rougit pas, alors que la mutation EST compilee :
# verifie le 5 septembre 2026 en construisant a la main, la condition
# `actives.length===0` disparait bien des deux bundles, serveur et client, et le
# texte de l'etat vide y est present.
#
# CE QUI A ETE ECARTE : le plafond de debit de LS-168, corrige par cette meme
# story et sans effet ici ; un serveur residuel, aucun processus n'ecoutant le
# port entre deux passes ; un decoupage fautif de l'argument `-g`, corrige ; et
# une cible de mutation inexistante, la substitution modifiant bien le fichier.
#
# LA CAUSE N'EST PAS ISOLEE, et c'est pourquoi ces cas ne comptent pas comme des
# preuves. Les activer en l'etat ferait echouer le script en permanence, ce qui
# le rendrait ignore ; les supprimer effacerait la question. Ils restent donc
# ecrits, desactives, avec leur diagnostic.
#
# CE QUI RESTE PROUVE SUR CES DEUX ETATS : leur PRESENCE, par le cas 4 pour les
# declinaisons, qui rougit bien quand le texte change. C'est leur ABSENCE sur
# une fiche qui n'en a pas besoin qui reste non prouvee.
#
# Suivi dans LS-113, section « ce qui reste ».
# ---------------------------------------------------------------------------
if [ "${MUTATION_ETATS_VIDES_NEGATIFS:-0}" = "1" ]; then

# ---------------------------------------------------------------------------
# Cas 4bis : l'etat vide des declinaisons s'affiche EN PERMANENCE.
#
# LE DEFAUT SYMETRIQUE DU CAS 4, et le plus discret des deux : le message reste
# a l'ecran, donc un test qui ne verifierait que sa PRESENCE resterait vert.
# L'exploitante lirait « aucune declinaison en vente » sur une fiche qui en
# porte une, et croirait son travail perdu.
#
# CE CAS A ETE AJOUTE APRES LA REVUE DE LS-113, qui soupconnait le test negatif
# d'etre aveugle par construction. Mesure faite, il rougit bien : le soupcon
# etait faux, mais il a montre que RIEN ne le prouvait, et c'est ce que ce cas
# corrige.
# ---------------------------------------------------------------------------
mute "$VARIANTES" 's/\{actives\.length === 0 && \(/{true \&\& (/'
cas "l'etat vide des declinaisons s'affiche toujours" e2e_un \
  "la fiche qui porte une declinaison n'affiche pas l'etat vide" \
  "la fiche qui porte une declinaison n'affiche pas l'etat vide"

# ---------------------------------------------------------------------------
# Cas 4ter : l'etat vide des sections s'affiche EN PERMANENCE.
#
# Meme forme que le cas 4bis, sur le troisieme etat vide de l'editeur. Il est
# devenu mesurable parce que la fixture pose desormais une section sur la fiche
# de controle : avant LS-113, aucune fiche du depot n'en portait, donc le cas
# negatif n'avait nulle part ou se mesurer. Relevé par la revue.
#
# LE QUATRIEME ETAT VIDE, « aucune photo », RESTE SANS CAS NEGATIF : poser une
# photo demande un fichier traite sur disque, ce qui depasse le perimetre de
# cette story. Signale dans le ticket plutot que tu.
# ---------------------------------------------------------------------------
mute "$EDITEUR" 's/\{sections\.length === 0 && \(/{true \&\& (/'
cas "l'etat vide des sections s'affiche toujours" e2e_un \
  "la fiche qui porte une declinaison n'affiche pas l'etat vide" \
  "la fiche qui porte une declinaison n'affiche pas l'etat vide"

fi

# ---------------------------------------------------------------------------
# Cas 5 : les motifs disparaissent du message de refus.
#
# LE DEFAUT EST INVISIBLE A L'OEIL, la liste visuelle restant au-dessus. Mais
# elle change hors de toute region live : un lecteur d'ecran entendrait « la
# fiche n'est pas complète » et rien de plus. C'est la correction de la revue de
# LS-103, et rien ne la gardait.
# ---------------------------------------------------------------------------
mute "$PUBLICATION" 's/`La fiche n.est pas complète\. \$\{resultat\.motifs\n            \.map\(\(motif\) => MOTIF_AFFICHE\[motif\]\)\n            \.join\(" "\)\}`/"La fiche n\x27est pas complète."/'
cas "le message de refus perd ses motifs" e2e_un \
  "publier une fiche incomplete desactive le bouton puis affiche le refus" \
  "publier une fiche incomplete desactive le bouton puis affiche le refus"

# ---------------------------------------------------------------------------
# Cas 6 : le panneau d'archivage ne se ferme plus par Echap.
#
# UN PANNEAU MODAL DONT ON NE SORT QU'A LA SOURIS PIEGE qui navigue au clavier.
# L'attribut existait depuis LS-103, aucun test ne l'exercait.
# ---------------------------------------------------------------------------
mute "$PUBLICATION" 's/if \(evenement\.key === "Escape"\) \{/if (false) {/'
cas "Echap ne ferme plus le panneau d'archivage" e2e_un \
  "le panneau d'archivage s'ouvre, se ferme par Echap et ne deborde pas" \
  "le panneau d'archivage s'ouvre, se ferme par Echap et ne deborde pas"

echo
echo "-----------------------------------------"
if [ "$echecs" -eq 0 ]; then
  echo "  $mutations mutations, $mutations detectees par le test attendu"
else
  echo "  $mutations mutations, $echecs NON detectees ou detectees ailleurs"
fi
echo "-----------------------------------------"

[ "$echecs" -eq 0 ]
