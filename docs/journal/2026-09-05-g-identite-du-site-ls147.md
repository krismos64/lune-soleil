# 5 septembre 2026, session G : l'identité du site, LS-147

Troisième story de la journée, choisie parce qu'elle complétait le socle de
référencement posé la veille par LS-137, et parce qu'elle ne dépendait ni du VPS,
ni de Mondial Relay, ni du médiateur.

Christophe a fourni le logo, un médaillon rond de 1024 px, et a tranché trois
arbitrages avant que le travail ne commence.

## Le défaut trouvé en chemin, plus large que la story

**LS-137 avait posé les balises Open Graph sur les 25 pages sans jamais fournir
d'image.** Mesure avant correction : **zéro `og:image`** sur les six pages
publiques. Tout lien partagé sortait en carte de texte nu, sur un site qui vend
des objets dont la photographie est l'argument principal.

Le contrôle SEO restait vert : il ne regardait que `title`, `description` et le
canonical. Trois sens y ont été ajoutés.

## Ce qui a coûté la story

La forme documentée par Next.js, un `opengraph-image.tsx` composé par
`ImageResponse`, **n'a pas tenu**. La balise sortait en développement et
disparaissait sous `next start`, sur toute page déclarant son propre `openGraph`.

Le mécanisme n'a pas été élucidé, malgré la lecture de `mergeStaticMetadata`,
`resolveOpenGraph`, `resolveAndValidateImage` et `resolveUrl` dans le Next 16.2.12
installé. Aucune de ces fonctions ne rejette une image.

**Arbitrage de Christophe : un PNG statique, référencé par une URL absolue.** Le
rendu ne dépend plus d'aucune résolution relative, d'aucun `metadataBase` et
d'aucune convention de fichier. Le prix payé est une image figée, que
`scripts/engendrer-images-marque.mjs` reproduit à l'identique.

### Deux erreurs de méthode, à dire

**Un `next-server` résiduel survivait à `kill`.** Le `kill $SRV` tuait le wrapper
npm sans arrêter le serveur, qui gardait le port 3111. Plusieurs mesures ont donc
porté sur d'anciens builds, et j'en ai tiré des conclusions fausses à répétition :
« le déplacement dans `(boutique)` ne change rien », « la clé `images` bloque
l'image », toutes contredites ensuite.

**J'ai enchaîné des hypothèses au lieu d'instrumenter tôt.** La sonde qui a
tranché, un `console.log` de ce que la fonction retourne au build, aurait pu être
posée dès le troisième essai.

## Les trois arbitrages de Christophe

**Le recadrage des petites icônes**, confirmé par mesure. Une planche comparative
à 16, 32 et 48 px montre qu'à 32 px le médaillon complet devient une tache dorée
sur un disque beige, texte illisible, alors que le croissant et le soleil seuls
restent identifiables. Quatre nombres cadrent le symbole sans attraper le texte :
le symbole et le nom sont trop proches pour qu'un carré plus large les sépare.

**L'image de partage porte le logo, le nom et l'accroche** sur le fond sable.

**Aligner `NOM_BOUTIQUE` sur la graphie du logo**, « Lune-soleil » contre
« Lune & Soleil ». **Ce travail n'est pas fait** : il touche 24 fichiers dont les
mentions légales, les CGV, les emails et le JSON-LD, donc bien au-delà du
périmètre de LS-147. Il lui faut son ticket et sa PR.

## Ce que les mutations ont montré

**Un test e2e a été AJOUTÉ parce qu'une mutation restait verte.** Retirer l'image
du layout racine ne faisait rougir aucun test : toutes les pages couvertes
déclarent leur propre `openGraph` et reposent l'image par `openGraphDePage`. La
moitié de la correction n'était pas protégée. `/panier`, qui ne déclare rien, la
couvre désormais.

**Le troisième sens du contrôle SEO ne détectait rien.** Il cherchait
`imagePartageDecrite()` dans tout `seo.ts`, où la **définition** de la fonction
figure aussi : retirer l'appel laissait vert, sur exactement le défaut visé.
Motif « contrôle par fichier ou par fonction », déjà en fiche.

**Et son ancrage corrigé était faux aussi.** La plage `awk` fermait sur `^}`, or
la signature de `openGraphDePage` prend un objet littéral dont l'accolade
fermante ouvre la ligne `}): Record<...> {`. La plage s'arrêtait donc à la
signature, huit lignes, sans jamais voir le corps : le contrôle échouait en
permanence, y compris sur du code juste.

## Une assertion corrigée par ce que le test a montré

Le critère 5 demande qu'un produit archivé ne fournisse aucune image. Écrit
littéralement, `toHaveCount(0)`, le test échouait : la page 404 hérite du layout
racine, image comprise.

**Exiger zéro balise aurait fait supprimer l'image du layout**, c'est-à-dire
recréer le défaut que la story répare, pour satisfaire une lecture trop littérale.
Ce qui compte est que ce ne soit pas la photographie de la pièce : un médaillon
sous « Page introuvable » ne trompe personne.

## Vérification

| Contrôle | Résultat |
| --- | --- |
| `type-check`, `lint`, `format:check` | verts |
| `vitest --project unitaire` | **485 verts**, 28 fichiers |
| `playwright referencement` | **29 verts**, dont 10 neufs |
| Mutations unitaires | 3 sur 3, ciblées |
| Mutations e2e | 2 sur 2, dont une qui a révélé un trou |
| Mutations du contrôle SEO | 3 sur 3 |
| `engendrer-images-marque.mjs --verifier` | 6 images conformes |
| `verifier-seo.sh`, `verifier-regles.sh` | verts |
| **Image Docker** | 5 ressources en 200, `og:image` sur le domaine réel |
| Icônes en navigateur | contrôlées à 16, 32 et 180 px |

Le critère 6, les fichiers servis depuis l'image Docker, a été vérifié en
construisant l'image et en interrogeant le conteneur : c'est là que l'URL absolue
`https://lune-soleil.fr/habillage/partage.png` a été vue pour la première fois.

## État des tickets

**LS-147 est TERMINÉE**, six critères sur six, PR #245 fusionnée en rebase.

**LS-193 créée**, Medium, sous LS-3 : l'alignement du nom de marque, arbitré par
Christophe et sorti du périmètre. Sa description porte un point à trancher avant
de coder, le nom **juridique** de l'entreprise n'étant pas forcément le nom
commercial : un remplacement global toucherait les mentions légales et les
factures, où la dénomination sociale ne se modifie pas à la légère.

**118 terminés sur 183**, relevé dans Jira après la clôture.

Le logo source est rangé dans `assets/`, dossier neuf qui n'est pas servi par
Next.js, avec son README de garde. Il a été recompressé sans perte, 990 Ko à
276 Ko.

## Ce qui reste, et qui n'est pas de cette story

**L'alignement du nom de marque**, arbitré par Christophe et non fait ici.

**Le mécanisme Open Graph de Next.js 16.2.12** reste inexpliqué. Le contournement
est solide et testé, mais la cause première n'est pas connue : si une story future
veut revenir à `opengraph-image.tsx`, elle repartira de zéro sur ce diagnostic.

## Prochaine étape

Le lot des états non nominaux de l'administration, **LS-191** et **LS-127** :
seize écrans d'administration pour un seul `error.tsx`, et deux `loading.tsx` sur
tout le site. Une requête qui échoue rend une page blanche à l'exploitante.

Ensuite le lot d'accessibilité, **LS-166** en tête, la largeur 768 px n'étant
mesurée par aucun projet Playwright alors que l'invariant 10 la cite.
