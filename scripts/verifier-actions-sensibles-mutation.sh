#!/bin/bash
# Preuve par mutation de `verifier-actions-sensibles.sh`, LS-81 critère 5.
#
# Motif. Un contrôle qui n'a jamais échoué sur le défaut qu'il prétend attraper
# n'est pas un contrôle. Celui-ci sort « OK » sur un dépôt où AUCUNE action
# sensible n'existe encore : son vert ne prouve donc rien par lui-même, et sans
# ce script il serait indistinguable d'un contrôle qui ne regarde rien.
#
# Chaque cas injecte un défaut réel, exige que le contrôle rougisse, puis
# restaure. Un cas qui ne fait pas rougir est un trou dans le contrôle.
#
# Usage : ./scripts/verifier-actions-sensibles-mutation.sh
# Aucun prérequis, ni Docker ni base.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-actions-sensibles.sh"
SERVICE="src/services/reauthentification.ts"
ATTENTE=".claude/familles-sans-action.txt"
TEMOIN="src/services/action-de-test-mutation.ts"
ACTIONS="src/app/administration/categories/actions.ts"

detectes=0
total=0

# Restaure tout ce que les cas touchent. Appelé après chaque cas ET par le
# piège de sortie : une interruption au milieu laisserait sinon le dépôt muté,
# et une modification jamais indexée n'est récupérable nulle part.
restaurer() {
  # `$ACTIONS` EST DANS LA LISTE, et son oubli serait un défaut connu de ce
  # dépôt : un fichier muté hors de la restauration laisse le défaut en place
  # après la fin du script, et une modification jamais indexée n'est
  # récupérable nulle part.
  git checkout "$SERVICE" "$ATTENTE" "$ACTIONS" 2>/dev/null
  rm -f "$TEMOIN"
}
trap restaurer EXIT

# Joue un cas : applique la mutation déjà faite par l'appelant, lance le
# contrôle, exige un échec.
#
# `$CONTROLE` est appelé SANS pipe vers grep. Le pipe vers `grep -q` renvoie
# toujours le code de grep, ce qui avait fait passer sept mutations pour « non
# détectées » à tort sur ce projet.
attendre_echec() {
  local libelle="$1"
  total=$((total + 1))

  if "$CONTROLE" >/dev/null 2>&1; then
    echo "NON DETECTE  $libelle"
  else
    echo "detecte      $libelle"
    detectes=$((detectes + 1))
  fi

  restaurer
}

# Exige que le contrôle ACCEPTE un code correct.
#
# UN FAUX POSITIF EST AUSSI GRAVE QU'UN FAUX NÉGATIF, et il est plus insidieux :
# un contrôle qui refuse une action correctement gardée pousse à retirer la
# marque `@sensible` plutôt qu'à comprendre. La protection disparaît alors par
# la porte que le contrôle a lui-même ouverte.
attendre_succes() {
  local libelle="$1"
  total=$((total + 1))

  if "$CONTROLE" >/dev/null 2>&1; then
    echo "detecte      $libelle"
    detectes=$((detectes + 1))
  else
    echo "NON DETECTE  $libelle"
  fi

  restaurer
}

echo "=== Preuve par mutation du contrôle des actions sensibles ==="
echo

# --- Cas 1 : une action sensible sans garde -------------------------------
# LE CAS QUE LE TICKET DEMANDE EXPLICITEMENT, critère 5 : « prouvé en ajoutant
# une action de test ». C'est le défaut réel, une action marquée sensible qui
# s'exécute sur simple session ouverte.
cat > "$TEMOIN" <<'TS'
/** @sensible REMBOURSEMENT */
export async function rembourserPourMutation(): Promise<void> {
  // Aucun appel a exigerReauthentificationRecente : c'est le defaut.
}
TS
sed -i '' 's/^REMBOURSEMENT/# REMBOURSEMENT/' "$ATTENTE"
attendre_echec "action @sensible sans appel à la garde"

# --- Cas 2 : la famille citée n'existe pas dans le type -------------------
# Une faute de frappe créerait une famille fantôme, protégée par personne.
cat > "$TEMOIN" <<'TS'
/** @sensible REMBOURSEMENTS */
export async function familleFautivePourMutation(): Promise<void> {
  await exigerReauthentificationRecente(new Headers(), "REMBOURSEMENT");
}
TS
attendre_echec "famille inconnue, faute de frappe"

# --- Cas 3 : marque sans famille ------------------------------------------
cat > "$TEMOIN" <<'TS'
/** @sensible */
export async function sansFamillePourMutation(): Promise<void> {
  await exigerReauthentificationRecente(new Headers(), "REMBOURSEMENT");
}
TS
attendre_echec "marque @sensible sans famille"

# --- Cas 4 : une famille perd sa couverture sans passer en attente --------
# Le sens 3 du contrôle. Sans lui, supprimer la dernière action d'une famille
# laisserait le contrôle vert : zéro action à vérifier, zéro échec.
#
# ------------------------------------------------------------------
# LA CIBLE EST POSEE PAR CE SCRIPT DEPUIS LE 11 SEPTEMBRE 2026, LS-98, et c'est
# la TROISIEME fois que ce cas change de cible.
#
#   1er septembre 2026, LS-160   `REMBOURSEMENT` -> `PARAMETRES_BOUTIQUE`
#   11 septembre 2026, LS-98     `PARAMETRES_BOUTIQUE` -> famille POSEE ICI
#
# Le commentaire precedent avertissait : « la cible doit rester une famille SANS
# action, sans quoi ce cas se redesarmera silencieusement a la prochaine story
# qui en couvre une ». C'est arrive, et `.claude/familles-sans-action.txt` est
# desormais VIDE : les quatre familles declarees sont couvertes.
#
# EMPRUNTER UNE FAMILLE DU DEPOT EST DONC UNE IMPASSE, et pas seulement faute de
# candidate : toute famille libre finit par etre couverte, c'est meme le but du
# fichier d'attente. Un cas de mutation qui depend d'une DETTE s'eteint le jour
# ou la dette est payee.
#
# CE CAS POSE DONC SA PROPRE FAMILLE, `FAMILLE_TEMOIN_MUTATION`, ajoutee au type
# et jamais declaree en attente : l'etat vise, « declaree, ni couverte ni en
# attente », est fabrique de bout en bout et ne depend plus de rien.
# ------------------------------------------------------------------
perl -0pi -e 's/  \| "PARAMETRES_BOUTIQUE";/  | "PARAMETRES_BOUTIQUE"\n  | "FAMILLE_TEMOIN_MUTATION";/' "$SERVICE"
attendre_echec "famille déclarée, ni couverte ni en attente"

# --- Cas 5 : ligne d'attente périmée --------------------------------------
# Une famille couverte par une action ET listée en attente : la ligne doit
# partir, sinon le fichier d'attente devient une décharge qui exempte à vie.
#
# MEME CHANGEMENT DE CIBLE QUE LE CAS 4, et pour la meme raison. Ce cas
# s'appuyait sur la ligne `PARAMETRES_BOUTIQUE` du fichier d'attente pour creer
# l'etat « couverte ET listee » ; cette ligne est partie avec LS-98, et le cas
# ne creait donc plus l'etat qu'il vise.
#
# LES DEUX MOITIES SONT POSEES ICI : la ligne d'attente ET l'action qui la
# couvre. L'etat est complet sans emprunter quoi que ce soit au depot.
echo "FAMILLE_TEMOIN_MUTATION posee par le script de mutation, jamais commitee" >> "$ATTENTE"
perl -0pi -e 's/  \| "PARAMETRES_BOUTIQUE";/  | "PARAMETRES_BOUTIQUE"\n  | "FAMILLE_TEMOIN_MUTATION";/' "$SERVICE"
cat > "$TEMOIN" <<'TS'
/** @sensible FAMILLE_TEMOIN_MUTATION */
export async function temoinGardePourMutation(): Promise<void> {
  await exigerReauthentificationRecente(
    new Headers(),
    "FAMILLE_TEMOIN_MUTATION",
  );
}
TS
attendre_echec "ligne d'attente périmée alors que la famille est couverte"

# --- Cas 6 : deux fonctions, une seule gardée -----------------------------
# LE CAS QUI A MANQUÉ À LA PREMIÈRE VERSION, trouvé par la relecture critique.
# Chercher l'appel dans tout le fichier laissait la seconde fonction emprunter
# la preuve de la première : le contrôle sortait « OK » sur un fichier portant
# une action non gardée. Scénario banal, une fonction ajoutée par mimétisme
# quelques semaines plus tard.
cat > "$TEMOIN" <<'TS'
/** @sensible REMBOURSEMENT */
export async function rembourserGarde(): Promise<void> {
  await exigerReauthentificationRecente(new Headers(), "REMBOURSEMENT");
}

/** @sensible REMBOURSEMENT */
export async function rembourserPartiellement(): Promise<void> {
  // Ajoutee par mimetisme, marquee mais jamais gardee.
}
TS
sed -i '' 's/^REMBOURSEMENT/# REMBOURSEMENT/' "$ATTENTE"
attendre_echec "deux fonctions dans un fichier, une seule gardée"

# --- Cas 7 : l'ancrage du contrôle lui-même -------------------------------
# LE CAS QUI PROTÈGE LE CONTRÔLE DE SA PROPRE OBSOLESCENCE. Renommer le type
# ferait relever zéro famille : le contrôle continuerait de sortir « OK » en ne
# vérifiant plus rien, motif du garde-fou jamais exercé.
perl -0pi -e 's/export type FamilleActionSensible =/export type FamilleActionSensibleRenommee =/' "$SERVICE"
attendre_echec "type renommé, l'ancrage ne relève plus aucune famille"

# --- Cas 8 : une famille ajoutée au type sans rien derrière ---------------
# Le trou que ce contrôle ferme en priorité : une cinquième famille déclarée,
# aucune action, aucune ligne d'attente.
perl -0pi -e 's/  \| "PARAMETRES_BOUTIQUE";/  | "PARAMETRES_BOUTIQUE"\n  | "SUPPRESSION_COMPTE";/' "$SERVICE"
attendre_echec "famille ajoutée au type sans action ni déclaration d'attente"

# --- Cas 9 : une signature étalée par Prettier, action GARDÉE ------------
# CE CAS EXIGE UN SUCCÈS, pas un échec, et il verrouille une régression réelle
# trouvée en LS-95, la première action sensible du dépôt.
#
# L'extraction du corps s'arrêtait à la première ligne en colonne zéro après la
# marque. Sur une signature que Prettier étale sur trois lignes, forme normale
# dès que le type de retour est long, elle s'arrêtait donc AVANT la première
# instruction : le contrôle refusait une action parfaitement gardée.
#
# Le piège tenait à ce que la seule façon de le contenter était d'écrire la
# signature d'un seul tenant, que `npm run format` re-découpait aussitôt. Le
# contrôle et le formateur se contredisaient.
cat > "$TEMOIN" <<'TS'
/** @sensible REMBOURSEMENT */
export async function rembourserAvecSignatureEtalee(
  enTetes: Headers,
  montantCentimes: number,
): Promise<{ etat: "REMBOURSE" }> {
  await exigerReauthentificationRecente(enTetes, "REMBOURSEMENT");
  return { etat: "REMBOURSE" };
}
TS
# LE `sed` QUI VIVAIT ICI EST RETIRE, LS-98. Il commentait la ligne
# `REMBOURSEMENT` du fichier d'attente, partie depuis LS-160 : il ne mordait
# plus, et sa presence laissait croire que ce cas preparait quelque chose.
#
# CE CAS N'A BESOIN D'AUCUNE PREPARATION. La famille `REMBOURSEMENT` est
# couverte par `demanderRemboursement` et absente du fichier d'attente : l'etat
# attendu est celui du depot au repos, et le temoin seul suffit.
attendre_succes "signature étalée par Prettier, action gardée acceptée"

# --- Cas 10 : une Server Action d'administration sans garde de rôle ------
# LE SENS 6, AJOUTÉ EN LS-99, et ce cas est la raison pour laquelle il vérifie
# fonction par fonction plutôt que fichier par fichier.
#
# La première version du sens 6 cherchait la garde N'IMPORTE OÙ dans le fichier.
# Cette mutation la laissait VERTE : les quatre autres actions du même fichier
# satisfaisaient le motif à la place de celle qu'on venait de dénuder. C'est le
# défaut « mutation satisfaite ailleurs », déjà rencontré sur ce dépôt, et le
# même que le sens 1 avait dû corriger pour la même raison.
#
# Une Server Action est un point d'entrée HTTP : elle s'invoque sans jamais
# charger la page qui la porte, donc la garde de la page ne la couvre pas.
# LA SUBSTITUTION ETAIT MORTE, constate le 1er septembre 2026 en LS-160.
#
# Elle cherchait `exigerRole()` sans argument quand le code porte
# `exigerRole(await headers())` : elle ne modifiait AUCUN caractere, le controle
# restait vert a juste titre, et ce cas rapportait « NON DETECTE » en accusant
# un controle sain. Mesure aussi sur `main`, il ne vient pas de cette story.
#
# C'est le motif « controle de mutation mort » : une cible qui cesse de
# correspondre desarme le cas en silence, et le rapport devient un chiffre
# qu'on cesse de lire. La garde-fou `cksum` ci-dessous le rend impossible :
# une substitution qui ne change rien est desormais un ECHEC franc, jamais un
# « non detecte » ambigu.
avant_cas10=$(cksum <"$ACTIONS")
perl -0pi -e 's/  if \(!\(await exigerRole\(await headers\(\)\)\)\) \{\n    return \{ statut: "SESSION_ABSENTE" \};\n  \}\n\n  try \{\n    await creerCategorie/  try {\n    await creerCategorie/' "$ACTIONS"

if [ "$(cksum <"$ACTIONS")" = "$avant_cas10" ]; then
  echo "ECHEC cas 10 : la mutation n'a modifié aucun caractère"
  echo "      La garde a changé de forme dans $ACTIONS."
  echo "      Corriger CE script, jamais le contrôle : un cas qui ne mute rien"
  echo "      rapporte « non détecté » en accusant un contrôle sain."
  restaurer
  exit 1
fi

attendre_echec "Server Action d'administration sans garde de rôle"

echo
echo "=== $detectes / $total cas détectés ==="

if [ "$detectes" -ne "$total" ]; then
  echo "ECHEC des mutations passent inaperçues : le contrôle a un trou"
  exit 1
fi

echo "OK toutes les mutations sont détectées"
