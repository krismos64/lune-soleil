#!/bin/bash
# Référencement technique, LS-137, critère 5.
#
# CE QUE CE CONTRÔLE EMPÊCHE. Une page publique ajoutée sans `title`, sans
# `description` ou sans canonical. Le défaut est INVISIBLE : la page s'affiche
# parfaitement, elle est simplement mal indexée, et personne ne le découvre
# avant de constater qu'elle ne remonte pas. Le SEO est déclaré priorité
# maximale sur ce projet, et une page publique neuve est le cas courant.
#
# ET LE DÉFAUT SYMÉTRIQUE, plus grave : une page PRIVÉE ajoutée sans `noindex`.
# Un écran d'administration ou d'espace client indexé publierait des libellés
# internes, et le retrait d'un index prend des semaines.
#
# LE CONTRÔLE EST GÉNÉRIQUE, jamais une liste de pages écrite à la main. Il
# part de `find` sur les `page.tsx` du dépôt : une liste manuelle est une
# opinion sur ce qui existe, et elle se périme au premier écran ajouté sans que
# rien ne le signale. Motif « contrôle générique et complétude », déjà en fiche
# sur ce dépôt.
#
# CE QU'IL NE VÉRIFIE PAS. Que le canonical soit JUSTE. Il constate sa présence,
# pas sa cible : `tests/unitaire/seo.test.ts` couvre la construction des URL, et
# `tests/e2e/referencement.spec.ts` lit le HTML réellement servi. Un contrôle
# textuel ne remplace pas un test d'exécution, motif déjà en fiche.
#
# Usage : ./scripts/verifier-seo.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
APP="$RACINE/src/app"
ko=0

[ -d "$APP" ] || { echo "ECHEC dossier des routes introuvable : $APP"; exit 1; }

# ---------------------------------------------------------------------------
# Retire les commentaires d'un fichier TypeScript avant toute recherche.
#
# POURQUOI. Un commentaire qui EXPLIQUE une clé porte le mot de cette clé, et
# une recherche textuelle ne distingue pas l'explication de la chose expliquée.
# Le contrôle restait donc vert sur exactement le défaut qu'il prétend attraper.
#
# CE N'EST PAS UN PARSEUR, et ça n'a pas à l'être. Les trois formes du dépôt
# suffisent : bloc `/* */`, ligne `//`, et le `*` de continuation d'un bloc
# JSDoc, que la suppression de bloc laisse derrière elle quand `perl` travaille
# ligne à ligne. Une chaîne de caractères contenant « // » resterait mal
# traitée ; aucune n'existe ici, et le cas produirait un faux positif bruyant,
# jamais un silence.
# ---------------------------------------------------------------------------
sans_commentaires() {
  perl -0777 -pe 's{/\*.*?\*/}{}gs; s{^\s*//.*$}{}gm' "$1"
}

# ---------------------------------------------------------------------------
# Les routes privées, reconnues par leur chemin.
#
# ELLES DOIVENT PORTER `noindex`, ET NON UN CANONICAL. Une page derrière une
# session n'a rien à déclarer canonique : elle ne doit pas être indexée du tout.
#
# LE PRÉFIXE FAIT FOI ET NON UNE ÉNUMÉRATION. Ajouter un écran sous
# `/administration` le range automatiquement du bon côté ; l'énumérer laisserait
# chaque nouvel écran non couvert par défaut, soit l'inverse de ce qu'on veut.
# ---------------------------------------------------------------------------
est_privee() {
  case "$1" in
    administration/*|administration/page.tsx) return 0 ;;
    \(boutique\)/compte/*) return 0 ;;
    # Le tunnel : contenu propre à un visiteur, vide pour un robot.
    \(boutique\)/panier/*|\(boutique\)/commande/*) return 0 ;;
    # Rétractation par jeton signé : le lien ne doit jamais entrer dans un index.
    \(boutique\)/retractation/*) return 0 ;;
    *) return 1 ;;
  esac
}

publiques_examinees=0
privees_examinees=0

while IFS= read -r page; do
  [ -n "$page" ] || continue
  relatif="${page#"$APP"/}"

  # UNE SEULE FOIS PAR PAGE, toutes les recherches de clé lisent cette valeur.
  corps="$(sans_commentaires "$page")"

  # Le bloc de métadonnées, `metadata` statique ou `generateMetadata`.
  #
  # LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE RECHERCHE, et cette ligne a été
  # écrite APRÈS que la mutation l'a imposée. La version précédente affirmait
  # qu'une clé d'objet ne s'écrit pas dans une phrase d'explication : c'est
  # faux, et le dépôt en portait déjà trois. Le commentaire « canonical
  # explicite » posé au-dessus de la clé satisfaisait `grep -q canonical`, et
  # le contrôle restait VERT sur une page dont le canonical avait disparu.
  #
  # C'est le motif « contrôle satisfait par un commentaire », déjà en fiche sur
  # ce dépôt, et la première mutation l'a rattrapé. Le prix est le numéro de
  # ligne, qu'on perd : le message nomme donc le fichier et la clé manquante.
  if ! printf '%s' "$corps" | grep -q "export const metadata\|export async function generateMetadata"; then
    if est_privee "$relatif"; then
      echo "ECHEC $relatif ne déclare aucune métadonnée"
      echo "      une page privée doit porter robots: { index: false }"
    else
      echo "ECHEC $relatif ne déclare aucune métadonnée"
      echo "      une page publique doit porter title, description et canonical"
    fi
    ko=$((ko + 1))
    continue
  fi

  if est_privee "$relatif"; then
    privees_examinees=$((privees_examinees + 1))

    # `index: false` ET NON `robots:` SEUL. Chercher la clé `robots` resterait
    # vert sur `robots: { index: true }`, qui est exactement le défaut.
    if ! printf '%s' "$corps" | grep -q "index: false"; then
      echo "ECHEC $relatif est une route privée sans noindex"
      echo "      ajouter robots: { index: false, follow: false } aux métadonnées."
      echo "      Sans lui, un écran interne peut entrer dans un index public,"
      echo "      et le retrait prend des semaines."
      ko=$((ko + 1))
    fi
    continue
  fi

  publiques_examinees=$((publiques_examinees + 1))

  # Une page publique qui se déclare noindex est un cas légitime mais rare : le
  # contrôle ne l'interdit pas, il la dispense simplement du canonical.
  if printf '%s' "$corps" | grep -q "index: false"; then
    continue
  fi

  # LA CLÉ EN SYNTAXE D'OBJET, et non le mot nu. `grep -q "canonical"`
  # trouvait « canonical explicite » dans une phrase d'explication ; les deux
  # formes ci-dessous ne s'écrivent pas par accident en français.
  #
  # DEUX FORMES ACCEPTÉES, et la seconde a été ajoutée après un faux positif.
  # Le catalogue construit sa description dans une variable puis l'écrit en
  # raccourci d'objet, `description,` : exiger `description:` l'accusait à tort
  # sur du code parfaitement correct. Un contrôle qui rougit sur du code juste
  # se fait désactiver, ce qui coûte plus cher que le défaut qu'il cherche.
  #
  # `$cle,` EN FIN DE LIGNE UNIQUEMENT, sans quoi un appel `f(title, x)`
  # satisferait la recherche. Combiné au décommentage, il reste la syntaxe
  # d'objet et elle seule.
  for cle in "title" "description" "canonical"; do
    if ! printf '%s' "$corps" | grep -qE "(^|[^a-zA-Z])$cle(:|,\s*$)"; then
      echo "ECHEC $relatif est une page publique sans $cle"
      case "$cle" in
        canonical)
          echo "      ajouter alternates: { canonical: \"/le-chemin\" }."
          echo "      Sans canonical, deux URL servant la même page se font"
          echo "      concurrence dans l'index et se diluent mutuellement."
          ;;
        *)
          echo "      ajouter $cle aux métadonnées de la page."
          ;;
      esac
      ko=$((ko + 1))
    fi
  done
done <<EOF
$(find "$APP" -name "page.tsx" 2>/dev/null | sort || true)
EOF

echo "Pages publiques examinées : $publiques_examinees"
echo "Pages privées examinées  : $privees_examinees"

# ---------------------------------------------------------------------------
# L'ANCRAGE SE PROUVE.
#
# Zéro page examinée signifie que le contrôle ne regarde plus rien, et un
# contrôle muet qui rend « OK » est pire que son absence. Les DEUX compteurs
# sont vérifiés : un dépôt d'où toutes les routes publiques auraient disparu
# est aussi anormal qu'un dépôt sans routes du tout.
# ---------------------------------------------------------------------------
if [ "$publiques_examinees" -eq 0 ]; then
  echo "ECHEC aucune page publique examinée : l'ancrage du contrôle est cassé"
  echo "      (src/app déplacé, ou tout le site rangé sous un préfixe privé)"
  ko=$((ko + 1))
fi

if [ "$privees_examinees" -eq 0 ]; then
  echo "ECHEC aucune page privée examinée : l'ancrage du contrôle est cassé"
  echo "      (les préfixes de est_privee ne correspondent plus aux routes)"
  ko=$((ko + 1))
fi

# ---------------------------------------------------------------------------
# Second sens : les deux fichiers de convention existent toujours.
#
# SANS CE SENS, LE CONTRÔLE MENTIRAIT PAR OMISSION. Il resterait vert sur un
# dépôt d'où `sitemap.ts` aurait disparu : il ne distingue pas « aucune page
# fautive » de « plus rien à référencer ».
# ---------------------------------------------------------------------------
for fichier in "sitemap.ts" "robots.ts"; do
  if [ ! -f "$APP/$fichier" ]; then
    echo "ECHEC src/app/$fichier a disparu"
    ko=$((ko + 1))
  fi
done

# `metadataBase` porte la résolution des canoniques relatifs. Sans elle, chaque
# `canonical: "/chemin"` est émis tel quel et résolu contre l'hôte de la
# requête : juste par accident, faux dès qu'un second nom de domaine sert le
# site.
if ! sans_commentaires "$APP/layout.tsx" | grep -q "metadataBase:"; then
  echo "ECHEC src/app/layout.tsx ne déclare plus metadataBase"
  echo "      sans elle, les canoniques relatifs des pages ne sont plus résolus"
  ko=$((ko + 1))
fi

echo
if [ "$ko" -eq 0 ]; then
  echo "OK métadonnées présentes sur toutes les routes, sitemap et robots en place"
else
  echo "$ko problème(s) détecté(s)"
fi

exit "$ko"
