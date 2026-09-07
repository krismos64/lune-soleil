#!/bin/bash
# Vérifie que tout champ de mot de passe côté CLIENT passe par le composant de
# bascule, LS-179, et qu'aucun `type="password"` nu ne réapparaît.
#
# Il applique la règle **C38** de `.claude/rules/frontend-design.md`, qui porte
# le raisonnement complet et les cinq propriétés garanties par le composant.
#
# POURQUOI UN CONTRÔLE TEXTUEL ALORS QUE LA SUITE MESURE DÉJÀ LE RENDU. Les
# tests de bout en bout exercent DEUX écrans, connexion et inscription, et les
# tests en jsdom exercent le composant lui-même. Aucun des deux ne dit rien du
# sixième champ, ni surtout du septième que personne n'a encore écrit.
#
# C'EST LE DÉFAUT QUE LS-179 FERME, sous sa forme reproductible. Le champ a
# manqué de bascule sur quatre écrans parce que chaque story écrivait son
# formulaire sans rien pour signaler l'absence. Le ticket lui-même n'en listait
# que quatre alors que le dépôt en portait SIX : les deux champs du profil
# avaient été oubliés, et c'est une lecture à la main qui les a trouvés. Un
# contrôle qui relit le dépôt ne fait pas cette erreur.
#
# CE QU'IL VÉRIFIE, DANS LES DEUX SENS.
#
#   1. aucun `type="password"` nu ne subsiste dans un composant client, hors
#      l'administration qui est explicitement hors périmètre
#      -> sinon un écran neuf redevient une saisie de seize caractères à
#         l'aveugle, ADR-023
#   2. le composant partagé porte toujours ce qui fait sa raison d'être : la
#      bascule du `type`, le nom accessible qui dit l'état, et la repose de la
#      position du curseur
#      -> sinon il reste importé partout en ayant cessé de rendre le service
#
# LE SENS 1 SEUL SERAIT UN DEMI-CONTRÔLE. Un dépôt sans aucun `type="password"`
# nu peut très bien avoir un composant vidé de sa substance : les six écrans
# l'importeraient sans qu'aucun ne bascule quoi que ce soit. C'est le motif
# « règle à deux versants » déjà en fiche sur ce dépôt.
#
# L'ADMINISTRATION EST HORS PÉRIMÈTRE, et par exclusion nommée plutôt que par un
# ancrage étroit. ADR-021 fait de son mot de passe un chemin de repli derrière
# la passkey, et LS-175 le porte. L'exclure en n'inspectant que `(boutique)`
# rendrait le contrôle muet le jour où un champ de mot de passe apparaît
# ailleurs, dans un futur espace ou un formulaire de contact : motif « ancrage
# trop étroit », qui a déjà coûté trois écrans à LS-196.
#
# Usage : ./scripts/verifier-bascule-mot-de-passe.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$RACINE/src"
COMPOSANT="$SRC/components/champ-mot-de-passe.tsx"
ko=0

[ -d "$SRC" ] || {
  echo "ECHEC dossier source introuvable : $SRC"
  exit 1
}
[ -r "$COMPOSANT" ] || {
  echo "ECHEC composant de bascule illisible : $COMPOSANT"
  echo "      les six champs de mot de passe l'importent, son absence casse"
  echo "      la construction entière."
  exit 1
}

# ---------------------------------------------------------------------------
# Les fichiers délibérément sans bascule, chacun avec sa raison.
#
# CETTE LISTE EST LA SEULE PARTIE MANUSCRITE, et y ajouter une ligne demande
# d'écrire pourquoi un champ de mot de passe se saisit à l'aveugle. C'est
# précisément la décision qu'on veut rendre consciente.
#
#   administration/connexion            ADR-021 : mot de passe de SECOURS
#                                       derrière la passkey, hors périmètre de
#                                       LS-179, porté par LS-175
#   administration/reauthentification   même chose, même chemin de repli
# ---------------------------------------------------------------------------
EXCLUSIONS="
src/app/administration/connexion/formulaire-connexion.tsx
src/app/administration/reauthentification/formulaire-reauthentification.tsx
"

est_exclu() {
  printf '%s\n' "$EXCLUSIONS" | grep -qxF "$1"
}

# ---------------------------------------------------------------------------
# Sens 1 : aucun `type="password"` nu hors des exclusions.
#
# LA RECHERCHE PORTE SUR TOUT `src/`, jamais sur les seuls dossiers connus. Un
# écran futur n'est dans aucune liste écrite aujourd'hui, et c'est justement
# celui que ce contrôle doit attraper.
# ---------------------------------------------------------------------------
trouves=0
while IFS=: read -r fichier _; do
  [ -n "$fichier" ] || continue
  relatif="${fichier#"$RACINE"/}"

  if est_exclu "$relatif"; then
    continue
  fi

  echo "ECHEC champ de mot de passe sans bascule : $relatif"
  echo "      ADR-023 impose seize caractères minimum ; les saisir sans"
  echo "      pouvoir les relire fait raccourcir le mot de passe ou renoncer."
  echo "      Employer <ChampMotDePasse> de src/components/champ-mot-de-passe."
  echo "      Si ce champ doit rester masqué, l'ajouter aux EXCLUSIONS de ce"
  echo "      script AVEC sa raison."
  trouves=$((trouves + 1))
done < <(grep -rln 'type="password"' "$SRC" 2>/dev/null | sed 's/$/:/')

if [ "$trouves" -gt 0 ]; then
  ko=$((ko + trouves))
fi

# ---------------------------------------------------------------------------
# Sens 2 : le composant rend toujours le service qu'il promet.
#
# TROIS PROPRIÉTÉS, une par critère d'acceptation que seul le composant porte.
# Un renommage interne ne doit PAS les faire échouer : chacune est cherchée par
# ce qu'elle produit, jamais par un nom de variable.
# ---------------------------------------------------------------------------

# Critère 1, la bascule elle-même : le `type` dépend d'un état.
if ! grep -qE 'type=\{[^}]*\?[^}]*"text"[^}]*:[^}]*"password"' "$COMPOSANT" &&
  ! grep -qE 'type=\{[^}]*\?[^}]*"password"[^}]*:[^}]*"text"' "$COMPOSANT"; then
  echo "ECHEC le composant ne fait plus basculer le type du champ"
  echo "      il reste importé par les six champs en ayant cessé de servir :"
  echo "      la bascule est sa seule raison d'être."
  ko=$((ko + 1))
fi

# Critère 2, le nom accessible DIT l'état, donc les deux libellés existent.
#
# HORS COMMENTAIRES, et la nuance a été mesurée : le composant CITE « Afficher
# le mot de passe » dans un commentaire qui explique `aria-controls`. Un `grep`
# nu restait donc vert sur un code ayant perdu le libellé, le commentaire seul
# le satisfaisant. Motif « contrôle satisfait par un commentaire », déjà en
# fiche sur ce dépôt, et retrouvé ici en éprouvant ce script par mutation.
#
# Le filtre retire les lignes de commentaire, `//` comme `*` de bloc, avant de
# chercher : ce qui reste est du code.
CODE_SEUL="$(grep -vE '^\s*(//|\*|/\*)' "$COMPOSANT")"

for libelle in "Afficher le mot de passe" "Masquer le mot de passe"; do
  if ! printf '%s\n' "$CODE_SEUL" | grep -qF "$libelle"; then
    echo "ECHEC le nom accessible ne dit plus l'état : « $libelle » a disparu"
    echo "      un bouton nommé d'une seule façon laisse un lecteur d'écran"
    echo "      sans savoir si le mot de passe est visible, critère 2."
    ko=$((ko + 1))
  fi
done

# Critère 4, la position du curseur est reposée après la bascule.
if ! grep -q 'setSelectionRange' "$COMPOSANT"; then
  echo "ECHEC la position du curseur n'est plus reposée après la bascule"
  echo "      changer le type d'un input monté remet le curseur à la fin sur"
  echo "      WebKit : au milieu d'une phrase de seize caractères, la frappe"
  echo "      suivante atterrit ailleurs qu'attendu, critère 4."
  ko=$((ko + 1))
fi

# ---------------------------------------------------------------------------
# Verdict
# ---------------------------------------------------------------------------
if [ "$ko" -gt 0 ]; then
  echo ""
  echo "ECHEC $ko défaut(s) sur la bascule de mot de passe, LS-179."
  exit 1
fi

echo "OK bascule de mot de passe : aucun champ nu hors administration, et le"
echo "   composant porte la bascule, les deux libellés et la repose du curseur."
