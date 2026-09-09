#!/usr/bin/env bash
# Preuve par mutation de verifier-base-e2e.sh, LS-189.
#
# CLAUDE.md l'exige : un controle qui n'a jamais echoue sur le defaut qu'il
# pretend attraper n'est pas un controle.
#
# ---------------------------------------------------------------------------
# LES MUTATIONS VISENT LES FORMES REELLEMENT PRESENTES, ET NON CELLES QUI
# S'ECRIVENT COMMODEMENT DANS UN `sed`.
#
# Lecon du 8 septembre 2026, LS-193 : `verifier-graphie-marque.sh` a ete prouve
# par quatre mutations reussies pendant qu'il laissait passer quatre defauts
# REELS du depot. Les quatre injectaient la meme forme litterale, quand les
# defauts existants portaient deux autres formes. Une mutation ne prouve que ce
# qu'elle fabrique.
#
# CHAQUE MUTATION CI-DESSOUS REPRODUIT DONC UN ETAT QUI A EXISTE ou qui est le
# chemin naturel vers le defaut :
#   1. l'etat d'AVANT cette story, la surcharge absente
#   2. l'elargissement de la clause, la « correction » qu'il fallait ecarter
#   3. la variable recopiee sans changer le port, le piege des deux bases
#      jumelles
#   4. le controle contre LUI-MEME : ancrage casse, il doit ECHOUER et non
#      rendre un OK silencieux. C'est le mode de defaillance rencontre sur
#      `verifier-seo.sh`, devenu aveugle EN RESTANT VERT.
# ---------------------------------------------------------------------------
#
# GARDE-FOU : ce script restaure par `git checkout`, qui EFFACE tout travail non
# commite sur les fichiers vises. Il refuse donc de tourner sur un depot
# modifie. Motif « travail non commite perdu », rencontre deux fois ici.
set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE"

CONFIG="playwright.config.ts"
SETUP="tests/e2e/session-administration.setup.ts"
PREPARATION="scripts/preparer-base-e2e.sh"
MUTABLES=("$CONFIG" "$SETUP" "$PREPARATION")

sales=$(git status --porcelain -- "${MUTABLES[@]}")
if [ -n "$sales" ]; then
  echo "ECHEC : des fichiers vises par les mutations ont des modifications non commitees."
  echo "$sales"
  echo
  echo "La restauration par git checkout les effacerait. Commiter d'abord."
  exit 1
fi

restaurer() {
  # `git checkout` en UNE commande sur tous les chemins : il est atomique, un
  # chemin non suivi ferait echouer la restauration entiere. Motif en fiche.
  git checkout -- "${MUTABLES[@]}" 2>/dev/null || true
}
trap restaurer EXIT

reussies=0
total=0

# $1 libelle, $2 fichier, $3 commande de mutation
eprouver() {
  local libelle="$1" fichier="$2" mutation="$3"
  total=$((total + 1))

  echo "-- Mutation $total : $libelle"
  eval "$mutation" || { echo "   ECHEC : la mutation elle-meme n'a pas pu s'appliquer"; restaurer; return; }

  # LA MUTATION A-T-ELLE REELLEMENT CHANGE LE FICHIER ? Une substitution qui
  # rate sa cible apres un reformatage laisse le controle vert et ACCUSE le
  # controle au lieu de la mutation. Motif « correction echouee en silence ».
  if git diff --quiet -- "$fichier"; then
    echo "   ECHEC : la mutation n'a rien modifie dans $fichier, cible manquee"
    restaurer
    return
  fi

  if ./scripts/verifier-base-e2e.sh >/dev/null 2>&1; then
    echo "   ECHEC : le controle est reste VERT sur ce defaut"
  else
    echo "   OK : le controle a rougi"
    reussies=$((reussies + 1))
  fi
  restaurer
}

echo "== Preuve par mutation de verifier-base-e2e.sh =="
echo

# 1. L'ETAT D'AVANT LA STORY : la surcharge n'existe pas. C'est litteralement le
#    depot du 8 septembre au matin, et le defaut que le ticket decrit.
#
#    LE MOTIF VISE LA FORME REELLEMENT PRESENTE, l'affectation conditionnelle.
#    Une premiere version visait `DATABASE_URL: process.env.DATABASE_URL_E2E`,
#    forme abandonnee en cours de story : la mutation ne modifiait plus rien et
#    la garde ci-dessus l'a signalee, au lieu de rendre un vert trompeur.
eprouver "surcharge DATABASE_URL retiree (etat d'avant LS-189)" "$CONFIG" \
  "perl -0777 -pi -e 's/^\s*\.\.\.\(BASE_E2E \?.*\n//m' '$CONFIG'"

# 2. LA « CORRECTION » QU'IL FALLAIT ECARTER : elargir la clause pour que la
#    preparation passe sur la base de developpement. Elle retire son role au
#    compte reel, en silence.
eprouver "clause de retrogradation elargie a tous les comptes" "$SETUP" \
  "perl -0777 -pi -e \"s/AND email LIKE 'e2e-%'//\" '$SETUP'"

# 3. LES DEUX BASES JUMELLES : la variable existe mais designe le meme port. Les
#    sens 1 et 2 restent verts, seul le sens 3 voit ce defaut.
eprouver "preparer-base-e2e.sh ne compare plus les deux URL" "$PREPARATION" \
  "perl -0777 -pi -e 's/IDENTIQUES/COMPARAISON_RETIREE/g' '$PREPARATION'"

# 5. L'ISOLEMENT QUI NE TIENT QU'AVEC UN FICHIER. La lecture retombe sur `.env`
#    seul, etat du depot jusqu'au 9 septembre 2026 : en CI, ou ce fichier
#    n'existe jamais, la cle est OMISE du bloc `env` et la suite herite de la
#    base de developpement.
#
#    LE SENS 1 RESTE VERT SUR CETTE MUTATION, la surcharge etant toujours
#    ecrite : c'est tout l'interet du sens 1 bis. Le defaut ne s'est jamais
#    exprime parce que la suite ne tournait pas en CI, l'autre manque
#    l'empechant, et corriger celui-la seul aurait rendu un vert trompeur.
eprouver "la valeur ne se lit plus que dans .env, l'isolement tombe en CI" "$CONFIG" \
  "perl -0777 -pi -e 's/\s*process\.env\.DATABASE_URL_E2E \|\|//g' '$CONFIG'"

# 4. LE CONTROLE CONTRE LUI-MEME. Si la retrogradation disparait du fichier,
#    l'ancrage du sens 2 ne trouve plus rien : il doit ECHOUER, jamais rendre un
#    OK silencieux. C'est le mode de defaillance de `verifier-seo.sh`, devenu
#    aveugle en restant vert.
eprouver "ancrage casse, plus aucune retrogradation a examiner" "$SETUP" \
  "perl -0777 -pi -e \"s/UPDATE utilisateur SET role = 'CLIENT'/UPDATE utilisateur SET statut = 'INACTIF'/\" '$SETUP'"

echo
echo "-----------------------------------------"
echo "  $reussies mutation(s) detectee(s) sur $total"
echo "-----------------------------------------"
[ "$reussies" -eq "$total" ] || exit 1
