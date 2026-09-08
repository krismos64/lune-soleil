#!/usr/bin/env bash
# Prouve `verifier-graphie-marque.sh` par mutation, LS-193.
#
# UN CONTRÔLE QUI N'A JAMAIS ÉCHOUÉ SUR LE DÉFAUT QU'IL PRÉTEND ATTRAPER N'EST
# PAS UN CONTRÔLE. Ce script pose des défauts réels, vérifie que le contrôle les
# voit, et restaure le dépôt dans tous les cas.
#
# SIX SENS : les deux du contrôle, deux qui le gardent contre lui-même, et deux
# ajoutés APRÈS COUP sur des défauts qu'il ne voyait pas.
#
# LES DEUX DERNIERS SONT LA LEÇON DE CETTE STORY. Les quatre premiers étaient
# verts pendant que le contrôle laissait passer QUATRE défauts réels, dont
# l'en-tête de toutes les pages publiques : chaque mutation injectait la forme
# littérale `Lune & Soleil`, donc elles prouvaient que le contrôle voit ce
# qu'elles fabriquent, jamais ce qui existait déjà dans le dépôt. Motif
# « mutation satisfaite ailleurs », relevé par `ls-frontend-revue`.
#
# UNE MUTATION SE CHOISIT SUR LES FORMES RÉELLES du dépôt, pas sur la forme la
# plus commode à écrire.
#
# Usage : ./scripts/verifier-graphie-marque-mutation.sh
# Aucun prérequis, ni Docker ni base.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

CONTROLE="./scripts/verifier-graphie-marque.sh"
ko=0

MUTABLES=(
  "src/lib/seo.ts"
  "src/components/pied-boutique.tsx"
  "src/components/en-tete-boutique.tsx"
  "src/integrations/email/modeles.ts"
)

for fichier in "${MUTABLES[@]}"; do
  if ! git ls-files --error-unmatch "$fichier" >/dev/null 2>&1; then
    echo "ÉCHEC : $fichier n'est pas suivi par git, la restauration serait impossible."
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# LES FICHIERS À MUTER NE DOIVENT PORTER AUCUNE MODIFICATION NON COMMITÉE.
#
# La restauration passe par `git checkout`, qui écraserait un travail en cours.
# Le cas s'est produit sur ce dépôt, et il s'est reproduit pendant LS-193 même :
# une preuve voisine a effacé deux fichiers que je venais de corriger.
# ---------------------------------------------------------------------------
if ! git diff --quiet -- "${MUTABLES[@]}" "$CONTROLE"; then
  echo "ÉCHEC : des modifications non commitées portent sur les fichiers à muter."
  echo "        Les commiter ou les remiser avant de lancer cette preuve."
  exit 1
fi

restaurer() {
  git checkout -- "${MUTABLES[@]}" "$CONTROLE" 2>/dev/null
}
trap restaurer EXIT

if ! $CONTROLE >/dev/null 2>&1; then
  echo "ÉCHEC : le contrôle est déjà rouge avant toute mutation."
  $CONTROLE
  exit 1
fi

essayer() {
  local intitule="$1"
  local attendu="$2"

  if $CONTROLE >/dev/null 2>&1; then
    obtenu="vert"
  else
    obtenu="rouge"
  fi

  if [ "$obtenu" = "$attendu" ]; then
    echo "  OK    $intitule : $obtenu, comme attendu"
  else
    echo "  ÉCHEC $intitule : $obtenu, attendu $attendu"
    ko=1
  fi

  restaurer
}

echo "Mutations de verifier-graphie-marque.sh"
echo

# --- 1. L'ancienne graphie revient dans du code ----------------------------
#
# `sed` ET NON `perl` ICI, ET C'EST UNE MESURE : Perl interprète `${...}` DANS LE
# REMPLACEMENT, donc `${new Date()...}` de la ligne visée le fait échouer sur
# « Can't locate object method "new" via package "Date" ». Motif « substitution
# mal formée » déjà en fiche sur ce dépôt, rencontré à nouveau ici.
#
# LA SUBSTITUTION EST DONC MINIMALE : seule l'expression du nom devient une
# chaîne, le reste de la ligne n'est pas touché.
sed -i '' 's/\${NOM_BOUTIQUE}`}/Lune \& Soleil`}/' \
  "src/components/pied-boutique.tsx"

# ---------------------------------------------------------------------------
# LA VÉRIFICATION NE PEUT PAS ÉCRIRE LA CHAÎNE QU'ELLE CHERCHE, LS-193.
#
# L'écrire ici la ferait détecter par le contrôle lui-même, qui inspecte
# `scripts/` : ce script deviendrait rouge en permanence, et le sens 1 ne
# prouverait plus rien. Motif « le hook bloque son explication », déjà en fiche.
#
# LA CHAÎNE EST DONC COMPOSÉE À L'EXÉCUTION, jamais écrite en clair.
# ---------------------------------------------------------------------------
if ! grep -q "Lune $(printf '\046') Soleil" "src/components/pied-boutique.tsx"; then
  echo "  ÉCHEC ancienne graphie : la substitution n'a pas trouvé sa cible,"
  echo "        le sens 1 ne prouve donc rien. Corriger le motif de ce script."
  ko=1
  restaurer
else
  essayer "ancienne graphie réintroduite dans le pied de page" "rouge"
fi

# --- 2. Le nom est recopié en dur au lieu d'être dérivé --------------------
# Le défaut le plus insidieux : la graphie est JUSTE, mais la valeur est
# dupliquée. Le prochain changement rouvrirait alors le même écart.
perl -0pi -e 's/\$\{NOM_BOUTIQUE\}`\}/Lune-soleil`}/' \
  "src/components/pied-boutique.tsx"
essayer "nom recopié en dur au lieu d'être dérivé" "rouge"

# --- 3. La constante disparaît ---------------------------------------------
# Le contrôle lit la graphie DANS le code : si la constante est renommée ou
# supprimée, il ne doit pas conclure « tout va bien » sur une lecture vide.
perl -0pi -e 's/export const NOM_BOUTIQUE = "Lune-soleil";/export const NOM_MARQUE = "Lune-soleil";/' \
  "src/lib/seo.ts"
essayer "constante renommée, le contrôle ne peut plus lire la référence" "rouge"

# --- 4. Le contrôle cesse de voir, en restant vert -------------------------
# C'EST LE MODE DE DÉFAILLANCE QUE LA STORY A RENCONTRÉ. `verifier-seo.sh`
# cherchait l'ancienne graphie en dur : au changement de graphie il est devenu
# aveugle EN RESTANT VERT, ce que rien n'annonce.
#
# Ici, vider la liste des fichiers examinés doit faire échouer le garde-fou de
# cardinalité, jamais rendre un OK silencieux.
perl -0pi -e "s{usages=\\\$\\(grep -rl 'NOM_BOUTIQUE' src/}{usages=\\\$(grep -rl 'NOM_INEXISTANT' src/}" \
  "$CONTROLE"

if grep -q "NOM_INEXISTANT" "$CONTROLE"; then
  essayer "le contrôle ne trouve plus aucun usage" "rouge"
else
  echo "  ÉCHEC garde de cardinalité : la substitution n'a pas trouvé sa cible,"
  echo "        le sens 4 ne prouve donc rien. Corriger le motif de ce script."
  ko=1
  restaurer
fi

# --- 5. La forme JSX, `&amp;` ----------------------------------------------
# C'EST LA FORME QUI A ÉCHAPPÉ AU CONTRÔLE sur trois composants visibles, dont
# l'en-tête de toutes les pages publiques. L'esperluette s'écrit `&amp;` en JSX,
# ce que le commentaire de `seo.ts` disait déjà sans que le motif le porte.
sed -i '' "s|<span className={styles.nom}>{NOM_BOUTIQUE}</span>|<span className={styles.nom}>Lune $(printf '\046')amp; Soleil</span>|" \
  "src/components/en-tete-boutique.tsx"

if grep -q 'amp; Soleil' "src/components/en-tete-boutique.tsx"; then
  essayer "ancienne graphie sous sa forme JSX échappée" "rouge"
else
  echo "  ÉCHEC forme JSX : la substitution n'a pas trouvé sa cible,"
  echo "        le sens 5 ne prouve donc rien."
  ko=1
  restaurer
fi

# --- 6. La forme coupée par l'enveloppement à 80 colonnes -------------------
# ELLE ÉCHAPPE À TOUTE RECHERCHE MONO-LIGNE, et c'est ainsi que les deux emails
# du même parcours ont divergé : le jumeau avait été corrigé, celui-ci non.
perl -0pi -e 's/`Vous avez demandé à utiliser cette adresse pour votre compte \$\{NOM_BOUTIQUE\}\.`,\n      "Confirmez-la en ouvrant ce lien :",/"Vous avez demandé à utiliser cette adresse pour votre compte Lune &",\n      "Soleil. Confirmez-la en ouvrant ce lien :",/' \
  "src/integrations/email/modeles.ts"

if grep -q '"Soleil\. Confirmez-la' "src/integrations/email/modeles.ts"; then
  essayer "ancienne graphie coupée sur deux lignes" "rouge"
else
  echo "  ÉCHEC forme coupée : la substitution n'a pas trouvé sa cible,"
  echo "        le sens 6 ne prouve donc rien."
  ko=1
  restaurer
fi

echo
if [ "$ko" -eq 0 ]; then
  echo "OK : les six mutations sont détectées."
else
  echo "ÉCHEC : au moins une mutation passe inaperçue."
fi

exit "$ko"
