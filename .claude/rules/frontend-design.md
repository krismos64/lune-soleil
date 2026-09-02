---
paths:
  - "src/app/**/*.{ts,tsx}"
  - "src/components/**/*.{ts,tsx}"
  - "src/**/*.css"
---

# Design et accessibilité

Direction : artisanal, féminin, élégant, chaleureux, naturel, légèrement premium.
La photographie et la matière portent l'identité, pas les ornements.

**Référence visuelle : `docs/architecture/PROTOTYPE.md`.** Il capture l'intention
et l'enchaînement des écrans d'un prototype gelé le 5 août 2026, dont les six
états non nominaux et la table parcours vers écran. Il ne prime sur rien : en cas
de divergence avec un ADR ou une règle d'ici, c'est le prototype qui a tort, et
ce document liste déjà les cinq écarts connus.

## Palette, fixée par ADR-022

Utiliser les jetons de `src/styles/tokens.css`, jamais une valeur hexadécimale en
dur.

| Jeton | Valeur | Usage |
|---|---|---|
| `--ls-background` | `#FBF7F0` | fond de page |
| `--ls-surface` | `#FFFFFF` | cartes, formulaires |
| `--ls-surface-sand` | `#F2EADF` | sections alternées, footer |
| `--ls-text` | `#3B2F2A` | texte courant |
| `--ls-text-muted` | `#7A6A5D` | légendes |
| `--ls-primary` | `#5F4519` | actions, bandeau, focus, prix |
| `--ls-primary-hover` | `#4A2A0B` | survol |
| `--ls-accent-gold` | `#C4A052` | décor seulement |
| `--ls-accent-gold-deep` | `#8A6A22` | liens, texte accentué |
| `--ls-accent-terracotta` | `#B4643E` | décor, texte large ou gras |
| `--ls-accent-terracotta-deep` | `#9C4F2B` | fond de badge en petit texte |

### Deux règles de contraste, mesurées

1. `--ls-accent-gold` (`#C4A052`) donne **2,31:1** sur crème. **Interdit pour
   tout texte**, y compris large. Filets, icônes décoratives, éclats uniquement.
   Tout texte doré utilise `--ls-accent-gold-deep` (4,72:1).
2. `--ls-accent-terracotta` (`#B4643E`) donne **4,07:1** sur crème, et **4,35:1**
   sur blanc. Sous le seuil AA de 4,5:1 dans les deux cas. Conforme AA en texte
   large ou gras seulement.
3. `--ls-accent-terracotta-deep` (`#9C4F2B`) donne **5,89:1** avec du texte
   blanc. C'est le jeton de tout **badge en petit texte**, « Dernière pièce » en
   tête.

   **La version précédente de cette règle prescrivait ici « fond terracotta avec
   texte blanc », et cette prescription était fausse** : elle constatait 4,35:1
   deux lignes plus haut sans en tirer la conséquence. Le défaut a été mesuré par
   `axe-core` en LS-104, sur un badge écrit en suivant la règle à la lettre. Une
   règle qui énonce un chiffre et prescrit son contraire se franchit de bonne
   foi.

**« Texte large » commence à 18,66 px en gras**, ou 24 px en graisse normale.
Un libellé d'accroche en 11 ou 12 px gras n'est **pas** du texte large : c'est
l'erreur la plus facile à commettre avec ce jeton, et le prototype la commet 35
fois. Pour ce cas, employer `--ls-accent-gold-deep` (4,72:1) ou assombrir jusqu'à
un rapport mesuré supérieur à 4,5:1.

Le jeton `primary-night` `#1B2A41` du cahier des charges est **écarté**. Aucun
bleu dans ce projet, le logo n'en contient pas.

### C31, ce qui se mesure est une paire, jamais une couleur

**Un rapport écrit à côté d'un jeton ne vaut que pour un fond**, et rien dans le
jeton ne dit lequel. Le même `--ls-text-muted` donne 4,86:1 sur crème et
**4,35:1 sur sable** : la couleur est légitime, la paire ne l'est pas.

Avant d'employer un jeton de texte sur un fond, **recalculer sur ce fond**.
Trois paires du projet sont sous le seuil et se ressemblent assez pour être
écrites par recopie d'un écran sain :

| Paire | Rapport | Verdict |
|---|---|---|
| `--ls-text-muted` sur `--ls-surface-sand` | 4,35:1 | refusée |
| `--ls-accent-gold-deep` sur `--ls-surface-sand` | 4,23:1 | refusée |
| `--ls-text-on-primary` sur tout fond clair | 1,00:1 | refusée |

**Le sable est le fond piégeux du projet.** Sur lui, employer `--ls-text` ou
`--ls-primary`, jamais un jeton secondaire.

**Recopier une couleur en ajoutant un fond casse l'hypothèse sous laquelle elle
était juste.** C'est la forme la plus discrète du défaut, et celle par laquelle
il est entré deux fois : l'écran d'origine n'a aucun `background`, donc son
texte est sur crème où le jeton tient sa promesse.

`scripts/verifier-contraste.sh` mesure toute paire colocalisée dans `src/`. Il
est **générique** et non ancré sur un nom de jeton, arbitrage du 19 août 2026 :
un contrôle nominatif resterait vert sur une couleur insuffisante portant un
autre nom. Il ne voit pas le fond **hérité**, que `axe-core` mesure de son côté
sur le rendu réel ; aucun des deux ne remplace l'autre.

## Rédaction des textes visibles

Tout texte affiché aux visiteuses et à l'administratrice suit les règles de
rédaction française du projet : orthographe correcte, **tous les accents
présents**, aucun tiret cadratin ni demi-cadratin.

Cela couvre les libellés de boutons, les messages d'erreur, les états vides, les
textes alternatifs, les titres de section, les libellés de formulaire et les
noms accessibles.

Un accent manquant dans l'interface d'une boutique artisanale française abîme la
crédibilité de la marque autant qu'une faute de frappe. Cette règle a donc un
impact produit, pas seulement rédactionnel.

### Ne pas accorder au féminin par défaut

Le cahier des charges emploie systématiquement « cliente », « visiteuse »,
« acheteuse ». **Ne pas reprendre cette convention dans les textes visibles.**

Une part notable des acheteurs sera masculine : un homme qui achète un bijou en
cadeau, particulièrement autour de Noël et de la fête des mères. Lire « vous
serez livrée » l'exclut de la boutique. L'enjeu est commercial.

Tourner les phrases **sans accord de genre**, plutôt qu'écrire « client(e) » ou
une forme à point médian, qui alourdissent et se prononcent mal au lecteur
d'écran.

| À éviter | Formulation neutre |
|---|---|
| Vous serez livrée sous 48 h | Livraison sous 48 heures |
| Chère cliente | Bonjour, ou le prénom |
| Vous êtes connectée | Connexion réussie |
| Aucune commande trouvée pour cette cliente | Aucune commande trouvée |

S'applique **partout, pas seulement aux textes visibles** : libellés,
confirmations, erreurs, états vides, emails transactionnels, documents, mais
aussi documentation technique, commentaires de code, tickets Jira et réponses de
conversation. Écrire « le client », jamais « la cliente », par défaut.

Christophe a dû le signaler deux fois, les 27 et 28 juillet 2026. La règle avait
été comprise comme portant sur l'interface seule.

Exception : « l'administratrice » et « l'exploitante » désignent une personne
réelle et identifiée, l'accord y est correct.

Voir LS-32 : le féminin dans les contenus
éditoriaux, page histoire et descriptions, reste à arbitrer avec l'exploitante.

## Interdits visuels

Pas de glassmorphisme, pas de carte transparente flottante, pas de dégradé
violet ou bleu, pas d'esthétique SaaS, pas de rose dominant, pas de
suranimation. Aucun **dégradé métallique** sur un bouton, un bandeau ou un
footer : c'est un marqueur de site généré automatiquement. Les aplats unis
uniquement.

Les primitives shadcn/ui et Radix servent pour l'accessibilité, jamais comme
identité visuelle par défaut.

Pas de faux avis, faux compteur, promotion inventée ni urgence artificielle.
Pas de tableau dans la boutique publique.

## Mobile first

Référence 320 à 430 px d'abord, puis 390, 768, 1280. Aucun débordement
horizontal à 320 px, y compris avec un nom de produit long et un prix à trois
chiffres. Zones tactiles proches de 44 par 44 px. Zoom à 200 % sans perte de
contenu ni blocage de l'achat.

Le back-office adopte cartes et listes quand un tableau devient illisible sur
mobile. Cible : créer un produit complet en moins de trois minutes sur
smartphone, photographies comprises.

### C33, tout écran d'administration est atteignable sans saisir d'URL

Une **barre permanente** porte les rubriques, posée par
`src/app/administration/layout.tsx`, arbitrage du 2 septembre 2026. Elle ne
s'affiche que pour une session au rôle `ADMINISTRATRICE` : la cacher n'est pas
une protection, les pages restant gardées une par une, mais l'afficher
divulguerait la structure de l'administration.

**Un écran ajouté entre dans la barre, ou son absence s'écrit.**
`scripts/verifier-navigation-administration.sh` confronte les rubriques aux
routes du dépôt **dans les deux sens** : une rubrique sans route est un lien
mort, une route ni navigable ni exclue est un écran inatteignable. Les écrans
de détail, à segment dynamique, sont exclus par leur forme.

**Le défaut est resté invisible huit stories durant**, chacune ajoutant un
écran sans le relier. Les tests de bout en bout appellent `page.goto()` avec
l'URL en dur : ils ne passent jamais par une navigation réelle, donc l'absence
totale de menu ne faisait rougir aucune assertion.
`tests/e2e/navigation-administration.spec.ts` navigue **au clic** pour cette
raison.

L'écran courant est annoncé par `aria-current="page"`, et **le style s'ancre sur
cet attribut** plutôt que sur une classe : deux sources distinctes finiraient
par désigner des rubriques différentes, sans que rien ne rende l'écart visible.

## Accessibilité, WCAG 2.2 AA sur les parcours critiques

Focus visible d'environ 3 px, jamais supprimé sans remplacement. Navigation
clavier complète et ordonnée. Texte alternatif décrivant le bijou ou le geste,
alt vide réservé au décor dupliqué. Erreur associée à son champ, jamais
transmise par la couleur seule. Nom accessible sur tout bouton icône. Respect
systématique de `prefers-reduced-motion`.

## États obligatoires

Le prototype ne les montre pas, ils doivent exister : vide, chargement, erreur
serveur, pending, disabled, indisponible, aucun résultat de filtre, rupture.
Jamais de faux succès optimiste : une erreur serveur produit un message visible
associé à l'action.

### C32, aucun `loading.tsx` sur une route qui appelle `notFound()`

**Le seul cas où l'état de chargement exigé ci-dessus est interdit.** Un
`loading.tsx` enveloppe la page entière dans une frontière Suspense : le
streaming commence **avant** que `notFound()` soit atteint, et Next.js ne peut
plus changer le statut d'une réponse déjà commencée. Il laisse **200** et se
contente d'ajouter un `noindex`.

Mesuré en LS-111 : 404 sans le fichier, 200 avec.

**Le défaut est invisible à l'écran**, la page rendue étant identique dans les
deux cas. Un moteur indexerait une fiche produit inexistante, et le `noindex` ne
protège que des moteurs qui le respectent. Le SEO tranche : un statut faux est
un défaut de correction, un écran figé n'est qu'un défaut de confort.

Ce qui rétablit le chargement sans le conflit : placer le contenu lourd sous un
`<Suspense>` **dans** la page, en gardant le contrôle d'existence au-dessus.

`scripts/verifier-loading-et-404.sh` l'attrape à l'écriture ;
`tests/e2e/pages-erreur.spec.ts` vérifie le **code de statut** et non l'aspect
de la page, ce qui l'attrape quelle qu'en soit la cause.

### Les trois pages d'erreur publiques, LS-146

| Fichier | Ce qu'il couvre |
|---|---|
| `app/not-found.tsx` | les appels de `notFound()` **et** toute URL sans route |
| `app/(boutique)/error.tsx` | l'erreur serveur des écrans publics |
| `app/global-error.tsx` | l'échec du layout racine lui-même |

**Aucun détail technique n'atteint une page publique**, invariant 9 : ni trace,
ni nom de classe, ni `error.digest`. Le message dit que le problème vient du
site, jamais ce qui a échoué.

`global-error.tsx` **remplace** le layout racine au lieu de s'y imbriquer. Il
porte donc ses propres `html` et `body`, `lang="fr"` compris, et **ses couleurs
sont écrites en dur** : c'est la seule exception du projet à la règle « aucune
valeur hexadécimale », les jetons venant du fichier dont la défaillance amène
cette page. Il n'importe aucun composant ni service, pour la même raison.
`scripts/verifier-palette-secours.sh` garde ces deux invariants.

## Frontière avec le métier

Les composants rendent des données et émettent des intentions. Le calcul métier
reste dans les services. Un prix, un total ou une disponibilité affichés viennent
du serveur, jamais d'un calcul dans le navigateur.

L'état des filtres et du tri est sérialisé dans l'URL, pour que le retour
navigateur et le partage de lien fonctionnent.

## Dimensionnement du catalogue

Le catalogue ouvrira avec 10 à 20 références et peut atteindre 30 à 40 sans
changement d'architecture. **Aucune limite technique ne plafonne le nombre de
produits**, ni en base, ni dans une requête, ni dans un composant. Le schéma n'en
porte aucune aujourd'hui, ne pas en introduire.

Cet ordre de grandeur commande la conception dans les deux sens : il interdit de
sous-dimensionner comme de sur-concevoir.

Retenu :

- catégories principales visibles, sans niveau intermédiaire
- filtres limités aux critères réellement utiles, prouvés par le catalogue réel
- tri par nouveautés, `Produit.publieA`, et éventuellement par prix
- photographies optimisées : AVIF, WebP et repli JPEG, servis en 320, 640 et
  1280 px, plus 1920 px en AVIF et WebP pour les écrans à haute densité. Les
  largeurs et les formats sont fixés par ADR-007, ne pas en ajouter ici sans
  l'amender : l'original étant supprimé après traitement, une largeur ajoutée
  après coup oblige à redemander les photographies
- fonctionnement à partir de 320 px

Écarté, et à ne pas réintroduire sans arbitrage :

- moteur de recherche externe, Algolia, Meilisearch ou équivalent
- mégamenu
- système générique d'attributs **typés**, EAV. Les sections de fiche produit
  d'ADR-026 n'en sont pas : du texte titré et ordonné ne porte ni type, ni unité,
  ni règle de validation par attribut
- toute architecture dimensionnée pour plusieurs milliers de références
- aperçu rapide et ajout rapide complexes depuis la liste

Une recherche interne simple, filtrage sur le nom et la description, reste
**Could, jalon V1.x**. Quarante références se parcourent à l'œil, la recherche
n'est pas le chemin d'accès principal.

## Fiche produit, ordre des blocs

L'ordre est conçu pour un écran de 320 px, où tout est empilé : ce qui décide de
l'achat est au-dessus, ce qui rassure et détaille vient ensuite. Les blocs 8 à 13
peuvent être repliés, jamais absents.

| # | Bloc | Source |
|---|---|---|
| 1 | Nom du bijou | `Produit.nom` |
| 2 | Présentation courte | `Produit.descriptionCourte` |
| 3 | Prix | `Variante.prixCentimes` |
| 4 | Disponibilité | dérivée, voir ci-dessous |
| 5 | Choix de la variante, si plusieurs | `Variante.libelle` |
| 6 | Ajout au panier | |
| 7 | Informations de livraison | composant de réassurance |
| 8 | Dimensions | `Variante.dimensions` |
| 9 | Sections éditoriales, dans leur ordre | `SectionProduit` visibles et non vides |
| 10 | Retours et rétractation | textes légaux, jamais recopiés |
| 11 | Avis vérifiés, s'il en existe | `Avis` publiés |

### Le bloc 9 est piloté par l'administratrice, ADR-026

Les quatre colonnes `Produit.description`, `matieres`, `entretien` et
`fabrication` **n'existent plus**. Leur contenu est devenu des lignes de
`SectionProduit`, ordonnées, renommables et supprimables.

Quatre sections sont proposées à la création d'un produit : Description
détaillée, **Matières et composants**, Fabrication, Conseils d'entretien.
L'administratrice les renomme, les réordonne, les masque ou les supprime, et en
crée d'autres. Le rendu suit donc `SectionProduit.ordre`, jamais un ordre écrit
en dur dans un composant.

Trois règles de rendu :

- une section **non visible** ne s'affiche pas, C22
- une section **sans contenu** ne s'affiche pas, titre compris, C23
- `SectionProduit.contenu` est du **texte simple**. `dangerouslySetInnerHTML` et
  tout rendu HTML équivalent y sont **interdits**. Les sauts de ligne deviennent
  des paragraphes, rien d'autre

**Les dimensions ne sont pas une section.** Elles restent
`Variante.dimensions`, leur source de vérité, parce qu'elles varient d'une
déclinaison à l'autre, un collier en 40 et 45 cm. Aucune section « Dimensions »
n'est proposée par défaut, ce qui éviterait une double saisie contradictoire. Une
section personnalisée peut porter un guide des tailles, jamais la dimension
structurée de la variante.

Les blocs de réassurance, retours et avis restent **hors** de cet éditeur : leurs
tarifs et textes viennent de la configuration et des textes légaux, jamais d'une
saisie libre.

### États de disponibilité

Trois états seulement, dérivés côté serveur :

| État | Condition |
|---|---|
| En stock | disponible à la vente web, quantité supérieure à 1 |
| Dernière pièce | disponible, quantité exactement 1 |
| Épuisé | quantité nulle, vente web désactivée ou variante archivée |

**La quantité exacte n'est pas affichée publiquement**, sauf « dernière pièce »
qui est une information d'urgence utile et vraie. Publier « 7 en stock » expose
le niveau d'activité de la boutique sans rien apporter au client.

La disponibilité vient du serveur, jamais d'un calcul dans le navigateur. Elle
tient compte des réservations actives : une pièce réservée par un autre client
n'est pas disponible, voir `database.md`.

### Produits similaires

Could, jalon V1.x. Règle simple : autres produits actifs de la même catégorie,
hors produit courant. Aucun moteur de recommandation, aucun calcul de similarité.

## Réassurance commerciale

Should, jalon Go-Live. Un composant unique, réutilisé sur les fiches produit, le
panier et le tunnel. Les mêmes faits apparaissent aussi dans la foire aux
questions, la page Livraison, les emails et les textes juridiques.

**Aucun tarif ni seuil n'est écrit en dur dans un composant.** Tout vient d'une
configuration centralisée, la même que celle qui sert au calcul serveur des frais
de port. C'est la seule façon de garantir qu'un changement de seuil ne laisse pas
« offerte dès 39 € » sur la fiche produit et 45 € au panier.

Un tarif affiché et un tarif facturé qui divergent constituent une information
précontractuelle fausse, sanctionnée bien au-delà de l'écart de prix.

Six éléments, sans en ajouter :

| Élément | Formulation | Réserve |
|---|---|---|
| Fabrication | bijoux faits main en Béarn | **à confirmer par l'exploitante**, allégation d'origine |
| Paiement | paiement sécurisé par Stripe | |
| Livraison | Mondial Relay, Point Relais, Locker ou domicile | ADR-025 |
| Gratuité | livraison offerte dès 39 €, tous modes | valeur issue de la configuration |
| Rétractation | 14 jours pour changer d'avis | frais de retour à la charge du client, mention obligatoire |
| Contact | réponse par email | |

La mention des frais de retour accompagne celle de la rétractation partout où
elle apparaît. L'annoncer sans elle expose au délai de douze mois de l'article
L221-20, voir `legal.md`.

« Faits main en Béarn » n'est pas un argument décoratif. Une allégation d'origine
géographique fausse relève de la pratique commerciale trompeuse. Ne pas la
publier avant confirmation explicite de l'exploitante sur le lieu réel de
fabrication.

## Paillettes

Could, jalon V1 cible. CSS déterministe, pas de bibliothèque, `aria-hidden`,
`pointer-events: none`, supprimé en mouvement réduit, jamais par-dessus un bijou
ou un contrôle. Ne bloque jamais l'ouverture.
