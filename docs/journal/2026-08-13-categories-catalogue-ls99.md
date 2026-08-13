# 13 août 2026, LS-99, catégories du catalogue

Sixième session du 13 août, première story d'implémentation de la phase 2.

## Ce qui est livré

Deux écrans d'administration, `/administration/categories` et
`/administration/produits/nouveau`, avec le service, le dépôt et la validation
Zod dessous. Le produit se crée en `BROUILLON` et se rattache à une catégorie.

## Les deux questions ouvertes de la story, tranchées

**Suppression d'une catégorie peuplée.** Rien à décider : `onDelete: Restrict`
depuis LS-13. C26 l'énonce, et le contrôle vérifie les deux sens, refus sur
catégorie peuplée et acceptation sur catégorie vide. Vérifier qu'un refus a lieu
sans vérifier qu'une suppression légitime passe laisserait un `RESTRICT` posé sur
la mauvaise colonne indétectable.

**Ordre d'affichage.** LS-49 avait tranché le principe, l'exploitante choisit.
Rien n'en garantissait l'unicité : deux catégories pouvaient porter le rang 3.
Arbitrage de Christophe, contrainte `UNIQUE DEFERRABLE INITIALLY DEFERRED`, même
motif que C22.

## Trois règles ajoutées, C24 à C26

C24 rang unique et positif, C25 nom non vide, C26 suppression restreinte.
Onze contrôles au vérificateur de schéma, 95 puis 106, verts dans les deux modes.

## Le trou trouvé en relisant `familles-sans-action.txt`

La règle impose cette relecture à chaque story ajoutant un écran
d'administration, et c'est elle qui a payé cette fois.

**Le sens 4 n'examinait que les fichiers touchant à la réauthentification.** Une
Server Action d'administration sans `exigerAdministratrice` sortait de sa boucle
par le `continue` : invisible des deux côtés, exactement le motif que le fichier
documente pour lui-même. Rien n'aurait signalé son absence sur une story future.

Le sens 6 le ferme. **Sa première version ne prouvait rien**, et seule la
mutation l'a montré : elle cherchait la garde n'importe où dans le fichier, si
bien que retirer celle de `creerCategorieAction` la laissait verte, les quatre
autres actions satisfaisant le motif à sa place. Motif « mutation satisfaite
ailleurs », déjà rencontré ici, et déjà corrigé au sens 1 pour la même raison.

`PARAMETRES_BOUTIQUE` reste en attente, la question ayant été posée
explicitement : une catégorie est du contenu éditorial, réversible, sans effet
financier. LS-98 rendra cette ligne fausse, c'est écrit dans le fichier.

## Ce qui a dérapé, et ce que ça a appris

**Le test négatif e2e visait le mauvais signal.** Il exigeait un code HTTP
supérieur à 300 sur un POST direct. Un POST sans en-tête `Next-Action` est traité
par Next.js comme une navigation ordinaire : il redirige et rend 200 au bout de
la chaîne. Le test rougissait sur un comportement correct. L'assertion porte
désormais sur l'effet, ce qui est aussi la bonne question : un 403 accompagné
d'une écriture serait un défaut, un 200 sans écriture n'en est pas un.

**Six tests de réservation cassés par C24.** La fixture partagée insérait toutes
ses catégories au rang 1, ce que la contrainte refuse dès le deuxième appel dans
un même test. Elle calcule maintenant le maximum plus un. Effet réel de la
contrainte, pas un contournement.

**Un script de mutation a restauré `familles-sans-action.txt` depuis git**,
effaçant la relecture écrite quelques minutes plus tôt. Elle a été réécrite, et
le fichier d'actions est entré dans la fonction `restaurer` du script de
mutation : un fichier muté hors de cette liste laisse le défaut sur le disque.

**Un test de concurrence antérieur a rougi en intégration continue**, deux
exécutions au lieu d'une sur le verrou de tâche planifiée. L'échec était juste,
et le verrou n'y était pour rien : les vingt appels partent ensemble mais le
service passe par le pool de `prisma`, dix connexions par défaut. La seconde
vague demandait donc le verrou après que la première exécution l'avait relâché,
le travail ne durant que cinquante millisecondes. Deux exécutions successives et
non simultanées, ce qui est le comportement correct.

Le test mesurait une course, pas la propriété qu'il annonce. Vert en local,
y compris répété cinq fois et sous charge. LS-99 l'a déclenché sans toucher au
verrou, en ajoutant 43 tests sur la même base éphémère.

Corrigé en supprimant la fenêtre plutôt qu'en l'élargissant : le détenteur tient
le verrou jusqu'à ce que les dix-neuf refus soient comptés. Le test passe de 30
secondes à 1, et la mutation a été rejouée pour prouver qu'il attrape toujours
son défaut. Voir [[lune-soleil-test-concurrence-fenetre-de-course]].

**Le contrôle visuel a demandé un vrai compte.** Le cookie de session est signé
en HMAC avec `BETTER_AUTH_SECRET`, dont la lecture est interdite ici. Le chemin
légitime a servi : inscription par l'API, puis promotion en base. L'index partiel
de LS-70 a d'ailleurs refusé la seconde administratrice, ce qui est son travail.

## Preuves

| Contrôle | Résultat |
|---|---|
| `npm run test` | 319 passés, contre 276 |
| `npm run test:e2e` | 79 passés, contre 55 |
| `verifier-schema.sh`, deux modes | 106 réussites chacun, contre 95 |
| `verifier-regles.sh` | 73 identifiants, 24 dossiers couverts |
| `verifier-actions-sensibles-mutation.sh` | 10 / 10 |

Sept mutations distinctes, chacune détectée par le contrôle qui la vise. Le test
d'échange de positions reste vert quand la contrainte disparaît : il ne prouve
rien seul.

Rendu contrôlé aux quatre largeurs avec une session réelle, aucun débordement,
aucun bouton sous 44 px. Parcours complet exercé, création, permutation et
création de produit vérifiées en base. Contrastes mesurés, erreur 6,56:1,
succès 6,15:1, atténué 4,86:1 sur crème.

## Un contrôle qui ne tournait nulle part

Trouvé en fin de session, en vérifiant la traçabilité plutôt qu'en écrivant du
code. `verifier-actions-sensibles.sh` existe depuis LS-81 et **n'était déclenché
par rien** : ni la chaîne d'intégration, ni un hook, ni une mention de
`CONTRIBUTING.md`. Il ne tournait que lancé à la main.

Le sens 6 ajouté par cette story aurait donc dormi, comme les cinq autres. C'est
le motif du garde-fou jamais exercé, déjà rencontré ici sous une autre forme :
un contrôle juste qui ne protège rien parce que rien ne l'appelle.

Ajouté à la chaîne en étape 6g, et documenté dans `CONTRIBUTING.md`. La règle
`securite.md` décrit désormais le sens 6, qu'elle ignorait : elle citait le sens
4 et s'arrêtait là.

## État des tickets

- **LS-99**, en cours jusqu'à la fusion de la PR 110
- **LS-100** est débloquée dès la fusion, elle attendait LS-99 par lien `Blocks`

## Prochaine étape

**LS-100**, éditeur de fiche produit, sections d'ADR-026. Le schéma est prêt,
`SectionProduit` porte déjà la contrainte différable et les commentaires de
conception.

L'ADR sur le stockage des médias reste à écrire avant LS-102, avec `/adr`.
