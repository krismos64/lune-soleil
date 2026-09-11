#!/usr/bin/env python3
"""Liste les régions live d'un ensemble de fichiers, LS-85.

Sert `verifier-regions-live-parcours.sh`, qui ne peut pas faire cette analyse
en shell : une balise JSX étale ses attributs sur plusieurs lignes, et un motif
`grep` de ligne ne verrait jamais l'`aria-label` posé deux lignes plus bas.

Chaque région produit une ligne, `ETAT chemin:ligne role=…`, où l'état vaut :

    NOMMEE           elle porte un `aria-label` ou un `aria-labelledby`
    ENVELOPPE_TITRE  elle contient un titre, qui EST déjà ce qu'elle annonce
    ANONYME          rien ne dit de quoi elle parle

Usage : lister-regions-live.py RACINE fichier [fichier...]
"""

import re
import sys

BALISE_REGION = re.compile(
    r"<[a-zA-Z][^>]*?role=\"(status|alert)\"[^>]*?>", re.S
)

# UNE BALISE QUI ENVELOPPE UN TITRE N'A PAS BESOIN DE NOM, et lui en donner un
# serait nuisible : le titre qu'elle contient EST ce qu'elle annonce, et un
# `aria-label` par-dessus ferait redire deux fois la même chose.
#
# SIX CENTS CARACTERES SUFFISENT, un titre enveloppé venant toujours en premier
# enfant. Lire jusqu'à la fermeture réelle demanderait d'analyser le JSX, ce qui
# est hors de portée d'un contrôle textuel et n'apporterait rien ici.
FENETRE_TITRE = 600
TITRE = re.compile(r"<h[1-6]")


def etat_de(balise: str, suite: str) -> str:
    if "aria-label" in balise:
        return "NOMMEE"
    if TITRE.search(suite):
        return "ENVELOPPE_TITRE"
    return "ANONYME"


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: lister-regions-live.py RACINE fichier...", file=sys.stderr)
        return 2

    racine = sys.argv[1]

    for chemin in sys.argv[2:]:
        try:
            source = open(chemin, encoding="utf-8").read()
        except OSError:
            continue

        for balise in BALISE_REGION.finditer(source):
            ligne = source[: balise.start()].count("\n") + 1
            court = chemin.replace(racine + "/", "")
            suite = source[balise.end() : balise.end() + FENETRE_TITRE]
            print(f"{etat_de(balise.group(0), suite)} {court}:{ligne} role={balise.group(1)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
