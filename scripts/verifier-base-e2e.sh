#!/usr/bin/env bash
# Garde de l'ISOLEMENT de la base de bout en bout, LS-189.
#
# ---------------------------------------------------------------------------
# CE QUE CE CONTROLE EMPECHE
#
# La suite Playwright promeut son compte d'administration, et l'index partiel
# `utilisateur_administratrice_unique` n'admet QU'UNE administratrice, regle E1.
# Si la suite tourne sur la base de DEVELOPPEMENT, deux issues, toutes deux
# mauvaises :
#
#   - le compte reel occupe la place : la preparation echoue avant tout test et
#     Playwright marque la suite « did not run », defaut d'origine de LS-189
#   - la clause de retrogradation est elargie pour passer outre : le compte reel
#     perd son role en silence, et le critere 2 du ticket est perdu
#
# L'isolement par une base distincte ferme les deux. Ce script verifie qu'il
# n'est pas defait, et il a deux sens INDEPENDANTS, chacun visant une facon
# differente de le perdre.
#
# CE QU'IL NE VERIFIE PAS : que la suite passe. C'est un controle TEXTUEL, il ne
# lance ni Docker ni PostgreSQL. Un controle textuel ne remplace pas un test
# d'execution, motif deja en fiche sur ce depot.
#
# Usage : ./scripts/verifier-base-e2e.sh
set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
ko=0

CONFIG="$RACINE/playwright.config.ts"
SETUP="$RACINE/tests/e2e/session-administration.setup.ts"

for fichier in "$CONFIG" "$SETUP"; do
  if [ ! -f "$fichier" ]; then
    echo "ECHEC : $fichier est introuvable, le controle ne peut pas conclure."
    exit 1
  fi
done

echo "== Isolement de la base de bout en bout, LS-189 =="
echo

# ---------------------------------------------------------------------------
# SENS 1 : Playwright surcharge DATABASE_URL avec DATABASE_URL_E2E.
#
# ANCRE SUR LE BLOC `env` ET NON SUR TOUT LE FICHIER. Le nom
# `DATABASE_URL_E2E` apparait aussi dans les commentaires qui expliquent le
# dispositif : les chercher n'importe ou rendrait le controle satisfait par sa
# propre explication, motif « controle satisfait par un commentaire » deja
# rencontre sur ce depot.
#
# La ligne cherchee est l'AFFECTATION conditionnelle, qui pose `DATABASE_URL`
# depuis la valeur lue dans `.env`. Aucun commentaire ne porte cette forme.
#
# LE MOTIF A DEJA CHANGE UNE FOIS, le 8 septembre 2026 : la premiere ecriture
# posait `DATABASE_URL: process.env.DATABASE_URL_E2E ?? ...`, remplacee parce
# qu'un repli en chaine vide ECRASAIT la variable heritee en CI. Un controle
# ancre sur la forme abandonnee serait reste ROUGE sur un code correct, ce qui
# est le symetrique du defaut habituel et se remarque au moins tout de suite.
# ---------------------------------------------------------------------------
surcharge=$(grep -nE 'DATABASE_URL:\s*BASE_E2E' "$CONFIG" || true)

if [ -n "$surcharge" ]; then
  echo "  OK    playwright.config.ts surcharge DATABASE_URL par DATABASE_URL_E2E"
else
  echo "  ECHEC playwright.config.ts ne surcharge PAS DATABASE_URL."
  echo "        La suite tournerait sur la base de developpement, ou le compte"
  echo "        reel de l'exploitante occupe la place unique de l'index E1."
  ko=1
fi

# ---------------------------------------------------------------------------
# SENS 1 bis : la valeur surchargee se lit AUSSI dans l'environnement.
#
# LE SENS 1 SEUL RESTE VERT SUR UN ISOLEMENT QUI NE TIENT PAS EN CI, et c'est
# mesure plutot que craint. `baseDeBoutEnBout()` n'a longtemps lu que `.env` :
# sans fichier elle rendait `undefined`, la cle etait OMISE du bloc `env`, et la
# suite heritait de `DATABASE_URL`, c'est-a-dire de la base de developpement. La
# surcharge du sens 1 etait pourtant bien la, ecrite noir sur blanc.
#
# CE DEFAUT NE S'EST JAMAIS EXPRIME parce que la suite ne tournait pas en CI :
# `preparer-base-e2e.sh` exigeait ce meme `.env` et echouait avant. Deux manques
# qui se masquaient l'un l'autre, et corriger le premier seul aurait produit un
# vert trompeur, la CI partant d'une base vierge ou l'isolement ne se voit pas.
#
# CE SENS EXISTE POUR QUE LE RETOUR EN ARRIERE SE VOIE.
#
# IL A ETE AVEUGLE A SA PREMIERE ECRITURE, et sa propre mutation l'a montre : le
# motif cherchait `process.env.DATABASE_URL_E2E` n'importe ou dans le fichier, et
# un COMMENTAIRE de la ligne 30 le porte, « PAS `process.env.DATABASE_URL_E2E` :
# ce fichier de configuration est evalue... ». Le controle restait donc vert sur
# un code d'ou la lecture avait disparu. Motif « controle satisfait par un
# commentaire », que le sens 1 documente deux blocs plus haut et que j'ai
# reproduit en l'ayant sous les yeux.
#
# L'ANCRAGE PORTE DESORMAIS SUR LA FORME EXECUTABLE, le repli `||` suivi de
# `undefined` ou la ligne de retour, qu'aucune prose ne porte. Les lignes de
# commentaire sont exclues explicitement, ce qui rend le motif lisible plutot
# que subtil.
# ---------------------------------------------------------------------------
repli=$(grep -nE 'process\.env\.DATABASE_URL_E2E\s*\|\|' "$CONFIG" \
  | grep -vE '^\s*[0-9]+:\s*\*' \
  | grep -vE '^\s*[0-9]+:\s*//' || true)

if [ -n "$repli" ]; then
  echo "  OK    la valeur se lit aussi dans l'environnement, cas de la CI"
else
  echo "  ECHEC playwright.config.ts ne lit DATABASE_URL_E2E que dans .env."
  echo "        Sans ce fichier, en integration continue, la cle est omise du"
  echo "        bloc env et la suite retombe sur la base de developpement :"
  echo "        l'isolement de LS-189 est rouvert sans qu'une ligne le dise."
  ko=1
fi

# ---------------------------------------------------------------------------
# SENS 2 : la retrogradation reste BORNEE au prefixe de test.
#
# C'est le critere 2 de LS-189, et il se perd autrement que le premier : la
# base peut etre correctement isolee pendant qu'une clause elargie attend le
# jour ou quelqu'un relancera la suite sur la base de developpement.
#
# Les deux sens sont donc INDEPENDANTS : ni l'un ni l'autre n'implique le
# second, et un seul des deux laisserait un chemin ouvert vers le compte reel.
#
# CE QUI EST CHERCHE : un `UPDATE utilisateur SET role` qui pose CLIENT sans
# etre borne par le prefixe. Le motif tolere les retours a la ligne, ces
# requetes etant enveloppees sur plusieurs lignes.
# ---------------------------------------------------------------------------
retrogradations=$(perl -0777 -ne '
  while (/UPDATE\s+utilisateur\s+SET\s+role\s*=\s*.CLIENT./gis) {
    my $debut = pos($_);
    my $bloc = substr($_, $debut, 260);
    # La clause se termine au point-virgule fermant ou au backtick de fin.
    $bloc =~ s/`.*$//s;
    print "BLOC\n" . $bloc . "\nFINBLOC\n";
  }
' "$SETUP" || true)

nb_retro=$(printf "%s" "$retrogradations" | grep -c "^BLOC$" || true)
nb_bornees=$(printf "%s" "$retrogradations" | grep -cE "e2e-%" || true)

if [ "$nb_retro" -eq 0 ]; then
  echo "  ECHEC aucune retrogradation trouvee dans session-administration.setup.ts."
  echo "        L'ancrage de ce controle est casse : il ne verifie plus rien."
  ko=1
elif [ "$nb_retro" = "$nb_bornees" ]; then
  echo "  OK    les $nb_retro retrogradation(s) sont bornees au prefixe e2e-"
else
  echo "  ECHEC $nb_retro retrogradation(s) trouvee(s), $nb_bornees bornee(s) au prefixe e2e-."
  echo "        Une clause non bornee retirerait son role au compte REEL de"
  echo "        l'exploitante, en silence. Critere 2 de LS-189."
  ko=1
fi

# ---------------------------------------------------------------------------
# SENS 3 : le script de preparation compare les deux URL.
#
# Les deux bases partagent identifiants et nom : seul le PORT les distingue.
# Une DATABASE_URL_E2E recopiee sans changer le port ramenerait le defaut
# entier, et les deux sens ci-dessus resteraient VERTS. C'est le trou que ce
# troisieme sens ferme.
# ---------------------------------------------------------------------------
PREPARATION="$RACINE/scripts/preparer-base-e2e.sh"
if [ ! -f "$PREPARATION" ]; then
  echo "  ECHEC scripts/preparer-base-e2e.sh est absent."
  ko=1
elif grep -q "IDENTIQUES" "$PREPARATION" && grep -q "MEME_PORT" "$PREPARATION"; then
  echo "  OK    preparer-base-e2e.sh refuse une URL identique ou de meme port"
else
  echo "  ECHEC preparer-base-e2e.sh ne compare plus les deux URL."
  echo "        Une variable recopiee sans changer le port ferait tourner la"
  echo "        suite sur la base de developpement, sans que rien ne le signale."
  ko=1
fi

echo
if [ "$ko" -eq 0 ]; then
  echo "-----------------------------------------"
  echo "  isolement de la base e2e verifie"
  echo "-----------------------------------------"
  exit 0
fi
echo "-----------------------------------------"
echo "  ECHEC : l'isolement de la base e2e n'est pas garanti"
echo "-----------------------------------------"
exit 1
