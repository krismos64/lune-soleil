#!/usr/bin/env bash
# Garde des metadonnees des images d'habillage, LS-25.
#
# POURQUOI CE CONTROLE EXISTE
#
# `public/habillage/` NE PASSE PAS PAR LA CHAINE D'ADR-007. Les photographies de
# produits sont televersees par l'administration et traitees par
# `src/integrations/medias/traitement.ts`, qui retire l'EXIF. Celles-ci sont
# versionnees a la main : le nettoyage est a la charge de qui les ajoute, et
# rien ne le verifiait.
#
# LE RISQUE S'EST MATERIALISE LE 20 SEPTEMBRE 2026. Sur six photographies
# fournies pour `/notre-univers`, cinq portaient du XMP et **la sixieme un bloc
# GPS**. Sans la conversion, la position du domicile de l'exploitante aurait ete
# servie publiquement.
#
# CE QU'IL CHERCHE, ET POURQUOI PAS SEULEMENT LE GPS
#
# Le bloc EXIF ENTIER, et non une latitude en clair : les coordonnees sont des
# rationnels binaires, introuvables par une recherche textuelle. Un fichier sans
# marqueur `GPS` peut porter un EXIF qui en contient, la cle vivant dans `IFD3`.
#
# XMP et les segments Photoshop sont cherches aussi : ils transportent
# `Software`, `Artist`, parfois des coordonnees dupliquees, et n'ont aucune
# raison d'etre servis.
#
# CE QU'IL NE FAIT PAS. Il ne nettoie rien. Un nettoyage automatique produirait
# un fichier modifie que personne n'a relu, et masquerait l'oubli au lieu de le
# signaler. Meme motif que `derive-documentation.yml`.
#
# Usage : ./scripts/verifier-metadonnees-habillage.sh
set -euo pipefail

DOSSIER="public/habillage"

if [ ! -d "$DOSSIER" ]; then
  echo "ECHEC $DOSSIER est introuvable, le controle ne peut pas conclure"
  exit 1
fi

anomalies=()
examines=0

# `-print0` ET `read -d ''` : un nom de fichier peut porter un espace, et le
# decoupage par defaut de la boucle le couperait en deux.
while IFS= read -r -d '' image; do
  examines=$((examines + 1))

  # LA LECTURE SE FAIT EN PYTHON ET NON PAR `grep` SUR LE BINAIRE : `grep`
  # s'arrete au premier octet nul sur certaines implementations, et rendrait un
  # vert sur un fichier qu'il n'a lu qu'en partie.
  trouve=$(python3 - "$image" <<'PY'
import sys

with open(sys.argv[1], "rb") as fichier:
    contenu = fichier.read()

# Les marqueurs cherches dans l'ordre de gravite. `Exif` couvre le bloc entier,
# GPS compris : les coordonnees vivent dans IFD3 et ne paraissent jamais en
# clair.
marqueurs = [
    (b"Exif\x00\x00", "EXIF"),
    (b"http://ns.adobe.com/xap/", "XMP"),
    (b"Photoshop 3.0", "Photoshop"),
]

print(",".join(nom for motif, nom in marqueurs if motif in contenu))
PY
)

  if [ -n "$trouve" ]; then
    anomalies+=("$(basename "$image") porte $trouve")
  fi
done < <(find "$DOSSIER" -type f \( -name '*.jpg' -o -name '*.jpeg' -o -name '*.png' -o -name '*.webp' -o -name '*.avif' \) -print0)

# UNE LISTE VIDE N'EST PAS UN VERDICT : un dossier vide, un motif `find` qui ne
# matche plus, et le controle passerait au vert sans avoir rien lu.
if [ "$examines" -eq 0 ]; then
  echo "ECHEC aucune image examinee dans $DOSSIER, le controle ne mesure rien"
  exit 1
fi

echo "Images d'habillage examinees : $examines"
echo

if [ ${#anomalies[@]} -eq 0 ]; then
  echo "-----------------------------------------"
  echo "  OK aucune metadonnee EXIF, XMP ni Photoshop"
  echo "-----------------------------------------"
  exit 0
fi

echo "ECHEC ${#anomalies[@]} image(s) portent des metadonnees :"
for anomalie in "${anomalies[@]}"; do
  echo "  - $anomalie"
done
echo
echo "Ce dossier ne passe PAS par la chaine d'ADR-007 : le retrait n'y est pas"
echo "automatique. Reconvertir l'image avant de la versionner, par exemple"
echo "\`sharp(source).rotate().jpeg({ quality: 80 }).toFile(cible)\`, sans"
echo "\`keepExif()\` : c'est l'absence d'appel qui protege."
echo
echo "Une photographie de smartphone porte par defaut la position du domicile"
echo "de l'exploitante."
exit 1
