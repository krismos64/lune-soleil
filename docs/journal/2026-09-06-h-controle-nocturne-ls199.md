# 6 septembre 2026, h : le contrôle nocturne, et le garde-fou qui n'a jamais fonctionné

LS-199, menée en autonomie. Le ticket demandait de réparer des tests rouges et,
surtout, de décider comment un échec nocturne se fait voir. La réponse à la
seconde question était déjà écrite dans le dépôt, et elle ne marchait pas.

## Le vrai défaut : une étiquette qui n'existait pas

`nocturne.yml` ouvre une issue GitHub à chaque échec, motif posé par LS-177 et
repris de `derive-documentation.yml`. Le mécanisme est correct, les permissions
aussi.

L'étape échouait pourtant, deux nuits de suite :

```
could not add label: 'controle-nocturne' not found
```

**L'étiquette n'avait jamais été créée dans le dépôt.** `gh issue create --label`
échoue si elle n'existe pas, et l'étape entière tombe avec elle. Aucune issue,
aucune alerte, et c'est exactement ce silence qui a laissé les tests rouges
passer inaperçus deux nuits.

Le garde-fou censé rendre un échec visible était lui-même invisible.

### La créer à la main ne suffisait pas

Je l'ai créée, puis j'ai rendu le workflow autonome : il crée son étiquette
lui-même, `--force` rendant l'instruction idempotente.

Le motif compte plus que le geste. **Une étiquette vit dans les réglages du
dépôt, pas dans le dépôt.** Elle ne survit ni à un clone, ni à un dépôt recréé,
ni à une migration. Un garde-fou qui dépend d'une ressource créée à la main hors
du dépôt est un garde-fou en sursis.

### Le contrôle qui ferme la famille

`verifier-config-claude.sh` gagne un sens : toute étiquette **posée** par un
workflow doit être **créée** par ce même workflow. Il ne peut pas interroger
GitHub, tournant hors ligne : il vérifie la propriété qui rend l'appel sûr.

Il a immédiatement trouvé le même risque latent sur `derive-documentation.yml`,
dont l'étiquette existe uniquement parce que quelqu'un l'a créée un jour.
Corrigé au passage.

Mutation : retirer la création fait lever le contrôle, la restauration le rend
muet.

## Cinq tests réparés, trois natures distinctes

Le ticket supposait des tests périmés par des stories ultérieures. Un seul
l'était.

**Périmé par une story**, `navigation:407` : la liste
`["Statistiques", "Clients", "Paramètres"]` était écrite en dur, et LS-185 a
livré l'écran Clients sans l'en retirer. Le test exigeait donc l'inverse de ce
que le produit doit faire.

Il lit désormais les entrées **réellement rendues** sous « Bientôt disponible ».
Une rubrique qui quitte `RUBRIQUES_A_VENIR` sort de la liste lue, et le test suit
sans être touché. Trois entrées l'ont quittée en trois jours : recopier cette
liste, c'était signer un rendez-vous avec le même échec. Mutation : rendre une
rubrique cliquable fait rougir.

**Fenêtre de course ouverte par LS-188**, trois tests. Les `loading.tsx` ajoutés
par cette story remplacent le `<main>` pendant la navigation. Une assertion posée
juste après un clic porte alors sur un élément absent du DOM.

**Marqueur ambigu**, `catalogue:120` : il cherchait « Catégories du catalogue »,
titre qui figure aussi dans le squelette de chargement. Un écran protégé
paraissait fuiter alors que la garde fonctionnait, la réponse portant bien
`NEXT_REDIRECT`. Le marqueur est désormais « Renommer », qui n'existe que sur
l'écran réel.

**Largeur exigée à tort**, `erreur:65` et `erreur:181`. Le premier attendait le
bouton « Menu », que le composant masque au-delà de 768 px, son propre commentaire
disant pourtant « à 320 px c'est lui qui est visible ». Le second cherchait
« Tableau de bord » dans toute la page, alors que la barre dépliée en bureau en
ajoute un second.

## Mon erreur, et ce qu'elle a coûté

**J'ai conclu à un défaut produit sur un lien qui fonctionne.**

Le lien « Afficher tous les comptes » paraissait inerte : l'URL gardait son
paramètre après le clic. J'ai infirmé plusieurs hypothèses, mesuré, et affirmé
qu'il ne naviguait pas.

Il navigue. Ce que je lisais était **l'URL figée d'un rapport d'échec**, prise à
l'instant du timeout, pendant que `loading.tsx` avait retiré le champ du DOM.
Playwright attendait un élément absent, et le snapshot montrait l'état de départ.

L'écran catalogue emploie le même motif de lien et navigue correctement : il n'a
pas de `loading.tsx`, son Suspense étant interne. C'est cette asymétrie qui
expliquait tout, et je ne l'avais pas vue.

`ls-critical-reviewer` a fait le diagnostic. Le commentaire que j'avais écrit
généralisait un raisonnement faux à un test voisin : il est réécrit, et dit
maintenant pourquoi ce test-là passe pour une raison différente de celle qu'il
annonçait.

## Deux mesures faussées par le serveur réutilisé

`playwright.config.ts` porte `reuseExistingServer: !process.env.CI`. Un serveur
lancé plus tôt est réutilisé, servant un build **antérieur** aux corrections.

J'ai conclu deux fois qu'une correction ne marchait pas, alors qu'elle n'était
pas dans le binaire mesuré. Tuer le processus sur le port 3100 avant de conclure.

## Ce que le ticket demandait, point par point

**Liste complète relevée depuis le journal** : 8 échecs la nuit du 6, 3 la nuit
du 5. Les listes ne se recouvrent que sur un test, et le nombre **augmentait**.

**Périmés séparés des vrais défauts** : un seul périmé, quatre défauts de test,
zéro défaut produit après vérification.

**Depuis quand** : le dernier vert est le 4 septembre. La chaîne est récente,
cinq exécutions seulement, créée par LS-177.

**Comment un échec se fait voir** : le mécanisme existait et était cassé. Réparé,
et la famille fermée par un contrôle.

## Résultat mesuré

```
avant   9 échecs sur la suite complète
après   3 échecs
```

Les trois restants relèvent de **LS-168**, ouverte, qui porte l'instabilité liée
aux plafonds d'authentification. Deux sont le cas qu'elle nomme explicitement,
`compte-profil` sur un mot de passe refusé. Le troisième passe seul et n'échoue
que sous charge, à une largeur sur trois.

LS-199 cite LS-168 comme distincte : je n'ai pas empiété.

## État des tickets

**LS-199** livrée. Les cinq critères sont tenus.

**LS-168** reste ouverte et gagne en importance : c'est désormais le seul
obstacle à un contrôle nocturne vert.

## Prochaine étape

**LS-168**, devenue la suite naturelle : trois échecs instables subsistent, et
ils rouvriront des issues nocturnes chaque nuit maintenant que le garde-fou
fonctionne. Un contrôle qui alerte pour du bruit finit ignoré, ce qui ramènerait
au défaut que cette story vient de fermer.

Sinon **LS-179**, la bascule d'affichage du mot de passe.
