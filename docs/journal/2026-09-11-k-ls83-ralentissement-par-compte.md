# 11 septembre 2026, LS-83 : le ralentissement par compte visé

Zone critique, authentification. ADR-021 mesure 2, ADR-027.

## Ce que la story ferme

ADR-021 demandait une limitation de débit « par identifiant de compte ». Le
mécanisme intégré de Better Auth, retenu par LS-79, compte par **adresse IP**.
ADR-027 énonçait cet écart plutôt que de le résoudre en silence, en annonçant un
ticket distinct hors Go-Live. C'est celui-ci.

**Les deux mécanismes se composent**, celui de la bibliothèque reste en place et
refuse en 429. Celui-ci ajoute un délai quand un même compte est visé, quelle que
soit l'adresse d'origine.

## Un ralentissement, jamais un blocage

ADR-027 écarte nommément le blocage complet après N échecs : « échouer
volontairement sur l'adresse de quelqu'un verrouillerait son compte ».

Cinq échecs sans délai, puis un doublement depuis 500 ms jusqu'à un **plafond de
huit secondes**. Ce plafond est la propriété qui compte, et non un réglage de
confort : au vingtième échec, un doublement non borné ferait attendre des heures
au vrai propriétaire, c'est-à-dire un verrouillage de fait.

Huit secondes suffisent à casser l'automatisation. Une campagne qui espérait
mille essais par minute en obtient sept.

## Le défaut grave, trouvé par la revue critique

**La première version écrivait dans `rate_limit`, la table de Better Auth**, ce
que le ticket demandait explicitement : « ne pas réinventer un stockage ».

Son limiteur lance `deleteExpiredRows`, **un `deleteMany` sans aucun filtre de
clé**, dès qu'il croise une de ses propres lignes hors fenêtre. Le seuil vaut
soixante secondes, `ctx.rateLimit.window` valant 10 par défaut et les règles
spéciales 10 et 60.

**La fenêtre de quinze minutes n'existait donc pas.** Toute ligne du projet plus
vieille d'une minute partait avec les siennes.

### Ce que le défaut coûtait

La mesure ne protégeait **pas contre ce qu'elle vise**. Une campagne répartie sur
un parc de machines est lente *par construction*, justement pour rester sous les
seuils par IP : elle ne franchissait jamais cinq échecs en moins de soixante
secondes. Seule la rafale rapide déclenchait le ralentissement, cas que la
limitation par IP attrape déjà.

L'écart qu'ADR-021 demandait de fermer restait donc ouvert, sous une protection
qui avait l'air de fonctionner.

### Pourquoi aucun test ne le voyait

Les sept tests écrits enchaînaient leurs tentatives en quelques millisecondes,
toutes dans la fenêtre de soixante secondes. **Ce qui manquait était l'écoulement
du temps**, et la fenêtre annoncée n'était donc vérifiée nulle part.

Le test ajouté vieillit les lignes en base de soixante-dix secondes, puis retente
**depuis une adresse IP déjà vue** : la purge ne part que lorsque Better Auth
rencontre une de ses propres lignes hors fenêtre, donc depuis une adresse neuve
le test passerait sans rien exercer. Repointé sur `rate_limit`, il annonce
`expected 1 to be 5`.

### La correction, et l'alternative écartée

Une table propre, `compteur_compte_vise`, sous le contrôle du projet.

Porter `rateLimit.window` à 900 secondes dans `auth.ts` remonterait le seuil de
purge et marcherait. Écarté : un invariant de sécurité dépendrait d'un réglage
lointain, et le comportement de `deleteExpiredRows` appartient à une dépendance
qui peut changer à toute mise à jour.

## Deux choses mesurées, écrites dans `securite.md`

**Un test mené depuis une seule adresse IP ne peut rien exercer de cette
mesure.** `/sign-in/email` est plafonné à cinq requêtes par minute et par IP : la
sixième tentative, celle qui déclenche le premier palier, part en **429 depuis
`onRequest`** sans jamais atteindre aucun hook. Mesuré à 5 ms.

Ce n'est pas une limite du test, c'est la raison d'être de la story : le
ralentissement par compte n'a d'utilité que là où la limitation par IP ne se
déclenche pas.

**La règle de délai a dû sortir du service.** L'importer tire Prisma, donc
`DATABASE_URL`, et le test unitaire échouait sur « DATABASE_URL absente » avant
d'exécuter une seule assertion. Elle vit dans `lib/delai-ralentissement.ts`, même
motif qu'`issue-connexion.ts`, dont l'en-tête documentait déjà exactement ce cas.

## Le hook attend réellement

`runAfterHooks` de Better Auth 1.6 attend chaque hook **en série** avant de rendre
la réponse, vérifié via Context7 dans le code de dispatch. Un hook dont le
résultat serait ignoré laisserait la réponse partir aussitôt, et le ralentissement
serait une ligne morte que rien ne signalerait.

La mutation `void` à la place d'`await` fait rougir cinq tests.

**Le ralentissement vient après l'écriture du journal**, et l'ordre est voulu :
l'inverse retarderait la trace de huit secondes, donc sous une attaque en cours la
table se remplirait en retard sur ce qu'elle décrit.

## Données personnelles

`cle` porte une **empreinte SHA-256** tronquée à 32 caractères, jamais l'adresse :
le dépôt est public, invariant 9. Elle reste une donnée personnelle puisqu'elle
distingue les personnes, et figure donc en **T8 du registre** avec une
conservation de vingt-quatre heures alignée sur `RateLimit`.

L'adresse est normalisée en minuscules et `trim` avant hachage. Sans la casse,
alterner les majuscules donnerait un compteur par variante et le seuil serait sans
objet.

Sa purge rejoint les cinq autres. **Le test de purge énumère ses tables en dur**
pour rendre cet ajout visible : il a rougi, et la question qu'il pose, « cette
table doit-elle figurer au registre », a bien été tranchée. Ne pas assouplir cette
assertion.

## Les cinq critères

| Critère | État |
|---|---|
| 1, ralentir quelle que soit l'IP | vérifié, trois adresses donnent un compteur à 3 |
| 2, jamais verrouillé | vérifié, plafond à 8 s prouvé à 10, 20 et 1000 échecs |
| 3, un voisin d'IP partagée n'est pas gêné | vérifié, il part de zéro et n'attend pas |
| 4, ne révèle pas si le compte existe | vérifié, une adresse inexistante est comptée pareil |
| 5, la mutation vise le bon cas | vérifié, **8 tests du compte rougissent, 21 tests d'IP restent verts** |

Le critère 5 demandait exactement cette séparation, et c'est le résultat obtenu.

## Un défaut de test, attrapé en suite complète

Le fichier de purge **passait seul et échouait en suite complète** : la base
d'intégration est partagée, et les tests de ralentissement y laissaient trois
empreintes que la purge comptait ensuite comme les siennes.

Le diagnostic coûte cher parce que la cause est dans un **autre fichier** que
celui qui rougit. La table manquait au `TRUNCATE`, et le commentaire pose
désormais la règle : toute table qu'un test assertionne doit figurer dans son
nettoyage.

## Preuves

```
npm run type-check   vert
npm run lint         vert
npm run test         94 fichiers, 1499 tests, tous verts
npm run db:verifier  118 réussites, 0 échecs, 38 tables
./scripts/verifier-regles.sh                  règles conformes au schéma
./scripts/verifier-registre-traitements.sh    38 tables rangées
./scripts/verifier-config-claude.sh           code 0
./scripts/verifier-taches-planifiees.sh       toute tâche déclarée est déclenchée
```

## Traçabilité

**Dépôt** : PR #391, quatre commits. **Journal** : ce document. **Mémoire** :
fiche « rate_limit vidée sans filtre ». **Jira** : LS-83 commenté avec l'état des
cinq critères, en cours jusqu'à la fusion.

ADR-027 porte la fermeture de son écart, `securite.md` porte la règle
d'application.

## Prochaine étape

**#391 est fusionnée** sur `main`, sept commits de `ec42ae8` à `2515e02`, tous
les contrôles verts. LS-83 est close. Rien ne reste sur le périmètre de la
story.
