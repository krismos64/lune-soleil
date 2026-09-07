#!/usr/bin/env bash
# Garde du préchargement des liens de l'administration, LS-166.
#
# ----------------------------------------------------------------------------
# CE QUE CE CONTRÔLE EMPÊCHE, ET IL A ÉTÉ MESURÉ.
#
# Toutes les routes d'administration sont `force-dynamic`, et
# `staleTimes.dynamic` vaut ZÉRO par défaut, vérifié via Context7 : une réponse
# préchargée est donc périmée à l'instant où elle arrive. Next.js la jette et
# repart, sans fin, tant que le lien est à l'écran.
#
# MESURE DU 7 SEPTEMBRE 2026, journal du navigateur sur le tableau de bord au
# repos : chaque rubrique enchaîne `200`, `ERR_ABORTED`, puis une requête neuve
# avec un jeton `_rsc` différent. Onze rendus serveur en boucle, chacun
# interrogeant PostgreSQL, pour un écran que personne ne touche.
#
# CE QUE CELA CASSAIT, ET CE N'EST PAS QU'UNE QUESTION DE CHARGE. La navigation
# réelle entre en concurrence avec ce flot et perd parfois la course : l'URL
# change, le `<main>` n'arrive JAMAIS, ni la page ni son `loading.tsx`. Mesuré :
# toujours bloqué après 61 secondes, deux essais sur quatre. La personne reste
# devant une coquille vide, sans rien qui lui dise quoi faire.
#
# POURQUOI UN CONTRÔLE ET NON SEULEMENT DIX-HUIT CORRECTIONS. Le défaut ne se
# voit ni au type-check, ni au lint, ni sur un écran isolé : il ne se manifeste
# que sous charge, et de façon intermittente. Un lien ajouté sans `prefetch`
# ramènerait la boucle en silence, et le premier symptôme serait un test de
# bout en bout rouge par intermittence, très loin de sa cause.
#
# `staleTimes.dynamic` A ÉTÉ ESSAYÉ PUIS ÉCARTÉ, motif écrit dans
# `next.config.ts` : il rend réutilisable le LAYOUT, dont les pastilles de
# comptage, et fait alors mentir la barre sur une liste pourtant fraîche.
# Mesure : il a fait passer `navigation-administration` de deux largeurs en
# échec à trois.
# ----------------------------------------------------------------------------
#
# CE QU'IL NE VÉRIFIE PAS. Que le préchargement soit réellement désactivé à
# l'exécution : un contrôle textuel ne remplace pas un test d'exécution, motif
# déjà en fiche sur ce dépôt. C'est la suite de bout en bout qui le mesure, en
# naviguant au clic sous la charge des quatre largeurs.
#
# Usage : ./scripts/verifier-prefetch-administration.sh
# Aucun prérequis, ni Docker ni base : contrôle purement textuel.

set -u
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
ko=0

# ---------------------------------------------------------------------------
# LES DEUX EMPLACEMENTS, ET NON LE SEUL DOSSIER DE ROUTES.
#
# La barre latérale vit dans `src/components/`, hors de `src/app/administration/`.
# Un contrôle ancré sur le seul dossier de routes laisserait donc le fichier qui
# porte ONZE des liens hors de portée, motif « ancrage trop étroit » déjà
# rencontré ici.
# ---------------------------------------------------------------------------
CIBLES=(
  "$RACINE/src/app/administration"
  "$RACINE/src/components/navigation-administration.tsx"
)

for cible in "${CIBLES[@]}"; do
  if [ ! -e "$cible" ]; then
    echo "ÉCHEC : $cible est introuvable, le contrôle ne peut pas conclure."
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# LE COMPTAGE SE FAIT EN NODE, ET C'EST DÉLIBÉRÉ.
#
# Une balise `<Link>` s'écrit sur une ou plusieurs lignes, et ses attributs
# portent des accolades imbriquées. `grep` ligne à ligne ne peut pas décider si
# un `prefetch` appartient à la balise ouvrante qu'il vient de croiser ou à la
# suivante : il rendrait des faux négatifs sur la forme multiligne, qui est
# justement la plus fréquente ici.
#
# LE DÉCOUPAGE EST FAIT SUR LA BALISE OUVRANTE ENTIÈRE, du `<Link` au `>` qui
# la ferme, en ignorant les `>` internes à une expression `{...}`.
# ---------------------------------------------------------------------------
manquants=$(node -e '
const fs = require("fs");
const path = require("path");

const cibles = process.argv.slice(1);
const fichiers = [];

function parcourir(chemin) {
  const infos = fs.statSync(chemin);
  if (infos.isFile()) {
    if (chemin.endsWith(".tsx")) fichiers.push(chemin);
    return;
  }
  for (const entree of fs.readdirSync(chemin)) {
    parcourir(path.join(chemin, entree));
  }
}

for (const cible of cibles) parcourir(cible);

const fautifs = [];

for (const fichier of fichiers) {
  const texte = fs.readFileSync(fichier, "utf8");

  for (let i = 0; i < texte.length; i++) {
    /*
     * LES COMMENTAIRES SONT SAUTES AVANT TOUTE RECONNAISSANCE, et pas seulement
     * a linterieur dune balise. `error.tsx` explique son choix en ecrivant
     * « `<Link>` ET NON UN `<a>` NU » dans le commentaire qui PRECEDE le lien :
     * pris pour une balise, ce texte faisait chercher `prefetch` entre `<Link>`
     * et le `>` de `<a>`, donc dans quelques caracteres de prose. Faux positif
     * mesure, sur un lien parfaitement conforme.
     *
     * Motif « le commentaire qui decrit la regle la declenche », deja rencontre
     * sur ce depot avec le hook des secrets.
     */
    if (texte.startsWith("/*", i)) {
      const fin = texte.indexOf("*/", i + 2);
      if (fin === -1) break;
      i = fin + 1;
      continue;
    }

    if (!texte.startsWith("<Link", i)) continue;
    // `<Links` ou `<LinkQuelqueChose` ne sont pas la balise cherchee.
    const suivant = texte[i + 5];
    if (suivant && /[A-Za-z0-9_]/.test(suivant)) continue;

    /*
     * Avancer jusquau `>` de la balise ouvrante.
     *
     * LES COMMENTAIRES SONT SAUTES, et cest ce qui manquait a la premiere
     * version : un commentaire JSX pose ENTRE deux attributs peut contenir
     * nimporte quel caractere, `>` compris. `error.tsx` ecrit ainsi
     * « `<Link>` ET NON UN `<a>` NU » juste avant son `prefetch`, et le
     * parseur sarretait sur ce `>` la, donc AVANT lattribut quil cherchait.
     * Deux faux positifs mesures, sur des liens parfaitement conformes.
     *
     * LES ACCOLADES SONT COMPTEES pour la meme raison : `href={`...${x}`}`
     * porte des chevrons dans certaines expressions.
     */
    let profondeur = 0;
    let j = i + 5;
    for (; j < texte.length; j++) {
      if (texte.startsWith("/*", j)) {
        const fin = texte.indexOf("*/", j + 2);
        if (fin === -1) break;
        j = fin + 1;
        continue;
      }

      const c = texte[j];
      if (c === "{") profondeur++;
      else if (c === "}") profondeur--;
      else if (c === ">" && profondeur === 0) break;
    }

    const balise = texte.slice(i, j + 1);
    if (/\bprefetch\b/.test(balise)) continue;

    const ligne = texte.slice(0, i).split("\n").length;
    fautifs.push(`${path.relative(process.cwd(), fichier)}:${ligne}`);
  }
}

console.log(fautifs.join("\n"));
' "${CIBLES[@]}" 2>&1)

if [ -n "$manquants" ]; then
  echo "ÉCHEC : un lien de l'administration ne désactive pas le préchargement."
  echo
  echo "$manquants"
  echo
  echo "Toutes ces routes sont force-dynamic et staleTimes.dynamic vaut zéro :"
  echo "le préchargement boucle sans fin et affame la navigation réelle, qui"
  echo "reste alors bloquée sur une page vide, LS-166."
  echo "Ajouter prefetch={false} sur la balise, ou expliquer ici pourquoi ce"
  echo "lien-là peut s'en passer."
  ko=1
fi

# ---------------------------------------------------------------------------
# LE CONTRÔLE DOIT AVOIR TROUVÉ DES LIENS.
#
# Une extraction qui ne trouve rien conclurait « tout est conforme » sur zéro
# ligne examinée : c'est le motif « contrôle satisfait par l'absence », déjà
# rencontré sur ce dépôt. Un renommage de dossier ou une balise réécrite sous
# une autre forme rendrait le contrôle muet sans que rien ne l'annonce.
# ---------------------------------------------------------------------------
total=$(grep -rho "<Link" "${CIBLES[@]}" --include='*.tsx' | wc -l | tr -d ' ')

if [ "$total" -lt 10 ]; then
  echo "ÉCHEC : seulement $total balises <Link> trouvées, le contrôle n'examine"
  echo "presque rien. Le dossier a-t-il été renommé, ou la balise réécrite ?"
  ko=1
fi

if [ "$ko" -eq 0 ]; then
  echo "OK : les $total liens de l'administration désactivent le préchargement."
fi

exit "$ko"
