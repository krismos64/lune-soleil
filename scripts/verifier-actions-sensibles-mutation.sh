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

detectes=0
total=0

# Restaure tout ce que les cas touchent. Appelé après chaque cas ET par le
# piège de sortie : une interruption au milieu laisserait sinon le dépôt muté,
# et une modification jamais indexée n'est récupérable nulle part.
restaurer() {
  git checkout "$SERVICE" "$ATTENTE" 2>/dev/null
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
sed -i '' 's/^REMBOURSEMENT/# REMBOURSEMENT/' "$ATTENTE"
attendre_echec "famille déclarée, ni couverte ni en attente"

# --- Cas 5 : ligne d'attente périmée --------------------------------------
# Une famille couverte par une action ET listée en attente : la ligne doit
# partir, sinon le fichier d'attente devient une décharge qui exempte à vie.
cat > "$TEMOIN" <<'TS'
/** @sensible REMBOURSEMENT */
export async function rembourserGardePourMutation(): Promise<void> {
  await exigerReauthentificationRecente(new Headers(), "REMBOURSEMENT");
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
sed -i '' 's/^REMBOURSEMENT/# REMBOURSEMENT/' "$ATTENTE"
attendre_succes "signature étalée par Prettier, action gardée acceptée"

echo
echo "=== $detectes / $total cas détectés ==="

if [ "$detectes" -ne "$total" ]; then
  echo "ECHEC des mutations passent inaperçues : le contrôle a un trou"
  exit 1
fi

echo "OK toutes les mutations sont détectées"
