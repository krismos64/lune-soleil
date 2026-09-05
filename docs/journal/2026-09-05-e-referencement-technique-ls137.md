# 5 septembre 2026, session E : le référencement technique, LS-137

Première story de l'epic LS-7, la phase 6, dont aucune n'était encore livrée.
Le SEO est déclaré priorité maximale sur ce projet, et une boutique qui ouvre
sans référencement technique rattrape ensuite pendant des mois ce qui se pose
en une story.

## Ce qui existait déjà

Plus que je ne l'attendais. Les 39 pages portaient toutes un `title` et une
`description`, et les 33 routes privées portaient déjà `robots: { index:
false }`. Manquaient les URL canoniques partout, l'Open Graph, le balisage
structuré, le sitemap et le robots.txt.

## Le piège central, critère 2

Le JSON-LD `Product` porte une disponibilité, et schema.org propose
`inventoryLevel` pour publier une quantité. La renseigner republierait ce que
l'interface masque délibérément : `frontend-design.md` n'expose que trois états
publics, et « 7 en stock » dirait le niveau d'activité de la boutique.

Deux gardes, dont une **structurelle** :

- le type `ProduitBalise` n'a **aucun champ** où glisser une quantité. Le défaut
  est rendu impossible par la signature, pas seulement interdit par une règle
- `DERNIERE_PIECE` est traduit en `InStock`, donc **indistinguable** de
  `EN_STOCK`. Les distinguer, par `LimitedAvailability` qui semble pourtant le
  mot juste, dirait à tout agrégateur qu'il reste exactement une pièce : c'est
  la quantité exacte publiée par un autre chemin que l'écran

## Le critère 3 sans réécrire de filtre

Le sitemap appelle `lireCataloguePublic`, exactement le service qui sert le
catalogue au visiteur. Écrire ici une requête « les produits publiés » donnerait
**deux définitions** du publié que rien ne garderait d'accord : le jour où l'une
change, le sitemap déclare des URL que le site rend en 404.

## Cinq mécanismes qui se ratent, tous vérifiés via Context7

**`openGraph` n'est pas hérité, il est remplacé.** Dès qu'une page déclare la
clé, la valeur du layout est intégralement écrasée. Mon layout posait `siteName`
et `locale` comme un socle, et chacune des six pages les effaçait. Invisible à
l'écran, aux types, et au contrôle textuel : la clé était bien présente partout.

**Les sitemaps sont mis en cache par défaut.** Figé au build, il annoncerait des
pièces vendues pendant des jours et ignorerait les nouveautés.

**`metadataBase` s'évalue une fois par processus**, pas à chaque rendu. Sans
exception, `next build` échoue sur « Failed to collect page data » quand `.env`
est absent, ce qui est le cas de l'image Docker que `.dockerignore` en prive.
Motif « construire n'est pas servir », déjà appliqué à `BETTER_AUTH_SECRET`.

**Un gabarit de titre s'applique à tous les segments enfants**, à n'importe
quelle profondeur. Voir plus bas.

**React n'échappe rien dans un `<script>`.** Voir plus bas également.

## Les deux revues ont trouvé deux défauts réels

### Un défaut de sécurité, `ls-critical-reviewer`

`/facture/` était absent de `robots.txt` alors que sa route jumelle
`/retractation/` y figurait. Les deux servent un client **sans session** sur
seule signature de jeton, mais `/facture/` rend un PDF portant nom, adresse de
facturation et montants.

C'était aussi la **moins défendue** : `/retractation/` est une `page.tsx` qui
porte déjà `noindex`, là où un gestionnaire `route.ts` ne peut porter aucune
métadonnée. J'avais protégé la route qui l'était déjà et laissé l'autre ouverte.

Deux lignes de défense posées : la liste `robots.txt`, lue depuis
`CHEMIN_ACCES_DOCUMENT` et `CHEMIN_RETRACTATION` plutôt que recopiée, et un
en-tête `X-Robots-Tag` sur les **deux** réponses de la route, refus compris,
l'uniformité des réponses étant sa règle.

**Mon contrôle ne peut pas voir ce défaut** : il n'énumère que les `page.tsx`.
La garde est le test de bout en bout, et le script de mutation le documente
comme non couvrable plutôt que de faire semblant.

### Vingt-cinq titres doublés, `ls-frontend-revue`

Le gabarit `template: "%s, Lune & Soleil"` posé au layout racine s'applique à
tout titre de chaîne de n'importe quel segment enfant. J'avais raccourci mes six
pages et laissé les autres, qui recevaient le suffixe une seconde fois : « Mon
compte, Lune & Soleil, Lune & Soleil ».

Deux d'entre elles sont vues par un client qui suit un lien d'email, la
confirmation de commande et la rétractation par jeton.

L'administration reçoit son propre gabarit dans son layout de segment, « ,
administration », qui **remplace** celui du parent au lieu de s'y empiler : un
titre résolu par un segment ne repasse pas dans le gabarit du parent.

Mesuré sur dix pages du serveur de production après correction, le nom apparaît
exactement une fois partout.

## Ce que la mutation a rattrapé, deux fois

### Le contrôle satisfait par son propre commentaire

Deux des quatre premières mutations laissaient `verifier-seo.sh` **vert**. Le
mot « canonical » subsistait dans le commentaire qui l'explique, et
`grep -q "canonical"` le trouvait.

C'est le motif déjà en fiche sur ce dépôt, et je l'avais **explicitement
écarté** en écrivant dans le script qu'une clé d'objet ne s'écrit pas dans une
phrase d'explication. Elle s'y écrit, et c'est moi qui l'y avais mise trois
lignes plus haut.

Les commentaires sont retirés avant toute recherche, et la clé est cherchée en
syntaxe d'objet. **Deux formes acceptées**, `cle:` et le raccourci `cle,` en fin
de ligne : exiger la première seule accusait le catalogue, qui construit sa
description en variable, sur du code parfaitement correct. Un contrôle qui
rougit sur du code juste se fait désactiver.

### Le contrôle qui ne regardait que les clés

Le sens ajouté après la revue pour le titre doublé est placé **avant**
l'aiguillage public/privé : 23 des 25 pages fautives étaient privées, et le
doublon y est un titre d'onglet faux plutôt qu'un défaut d'index.

## Ce que la CI a refusé, et la mesure qui a suivi

`verifier-rendu-texte-simple.sh` a rejeté mon composant : la règle C23 interdit
`dangerouslySetInnerHTML` dans **tout** `src/`, sans exception. Le contrôle a
raison de ne pas en tolérer une, il existe précisément parce qu'une
désactivation ESLint tient dans un commentaire de ligne que personne ne relit.

J'ai donc réécrit le composant avec un enfant texte de `<script>`, **et retiré
l'échappement manuel** en supposant que React échapperait le contenu comme il le
fait partout ailleurs. Le test a rougi immédiatement :

```
sans echappement  ->  {"<cle>":"<valeur>"}
avec              ->  {"name":"a </script> b"}
```

Un `<script>` est du texte **brut** au sens de la spécification HTML, où `&lt;`
ne serait pas décodé. React suit la spécification et n'y échappe rien. Croire
l'inverse aurait laissé le trou ouvert en pensant l'avoir fermé, sur une saisie
d'administration publiée sur une page publique.

Les deux contraintes tiennent ensemble : échappement explicite en séquence
unicode, sans rendu HTML brut.

**Ce qui l'a attrapé** : les tests portent sur le HTML rendu et non sur la
fonction prise à part. Tester la fonction seule aurait validé un mécanisme sans
jamais vérifier qu'il s'applique là où il compte.

## Ce que j'ai raté dans la conduite

**Trois contrôles de la chaîne n'ont pas été lancés avant le premier push**,
dont celui qui a fait échouer la CI. Je m'étais fié aux quatre que je connaissais
plutôt que de lire le workflow. Les treize sont maintenant verts en local.

**`verifier-seo.sh` n'était pas dans la CI** en le livrant. Un contrôle absent de
la chaîne ne protège rien, comme `verifier-actions-sensibles.sh` qui a dormi
depuis LS-81. Ajouté en étape 6m.

**J'ai annoncé à tort la perte du `.env`.** Une commande composée avait été
bloquée par un hook après l'exécution de son `mv`, et mes recherches ensuite ont
échoué sur des refus de permission et des filtres trop étroits. J'ai lu ces
sorties vides comme une absence et conclu à la perte, alors que le fichier était
intact, 39 variables dont 36 renseignées. C'est exactement ce que ce projet
interdit : un contrôle qui ne peut pas conclure le dit, il ne prétend pas avoir
vérifié. Fiche mémoire écrite.

## Vérification

| Contrôle | Résultat |
| --- | --- |
| `type-check`, `lint`, `format:check` | verts |
| `vitest --project unitaire` | **474 verts**, 27 fichiers |
| `playwright referencement.spec.ts` | **19 verts** |
| Les treize contrôles de la chaîne | tous verts |
| `verifier-seo-mutation.sh` | **5 mutations sur 5** détectées et nommées |
| Titres servis, dix pages | le nom apparaît **une seule fois** partout |

## État des tickets

**LS-137 est TERMINÉE**, six critères sur six, PR #240.

**LS-192 créée**, Low, sous LS-3 : le préfixe des médias est répété dans cinq
fichiers sous deux noms de variable différents, `MEDIA_PREFIXE_PUBLIC` et
`NEXT_PUBLIC_MEDIA_PREFIXE`, aucun des deux dans `.env.example`. Rencontré en
composant l'URL des photographies. Ne bloque rien, le repli identique rendant le
comportement correct tant que la variable n'est pas renseignée.

**Deux dettes constatées et non ticketées**, faute d'être bloquantes : la
numérotation des étapes du workflow est cassée avant cette story, deux `6h` et
deux `6i`, et la description de LS-137 mentionnait `/espace-client`, route qui
n'existe pas, l'espace client vivant sous `/compte` depuis LS-54.

## Prochaine étape

**LS-136** puis **LS-148**, les deux stories sans dépendance externe restantes.
LS-150, la visibilité dans les moteurs de réponse, est débloquée par cette story
et peut désormais être arbitrée : son socle technique est posé.
