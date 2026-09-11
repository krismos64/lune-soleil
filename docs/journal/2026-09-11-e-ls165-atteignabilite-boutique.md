# 11 septembre 2026, e : LS-165, l'atteignabilité des écrans de la boutique

La transposition côté public du contrôle que LS-162 avait posé sur
l'administration. Un Should, jalon V1 cible, qui ferme un défaut rencontré
**deux fois** sans qu'aucun test ne le signale.

## Pourquoi rien ne le voyait

Les tests de bout en bout appellent `page.goto()` avec l'URL en dur. Ils
n'exercent jamais une navigation réelle : l'absence totale de chemin vers un
écran ne fait rougir aucune assertion.

C'est ainsi que huit écrans d'administration sont restés inatteignables jusqu'à
LS-162, et que `/compte/verification` l'était jusqu'à la revue de LS-54, alors
que le scénario même de cet écran est « le message n'arrive pas », donc le
retour.

## La difficulté propre à la boutique

Le contrôle d'administration s'appuie sur une **barre permanente**, source unique
des rubriques. La boutique n'en a pas et ne doit pas en avoir : ses chemins
d'accès sont contextuels, un lien depuis l'en-tête, un depuis le panier, un
depuis un email.

Le contrôle cherche donc, pour chaque route servie, **au moins un** `href` qui la
désigne. C'est une condition plus faible, et c'est la bonne ici : ce qui compte
est qu'un chemin **existe**, pas qu'il parte d'un endroit précis.

## Il a trouvé deux défauts réels à sa première exécution

**Six occurrences de lien vers `/notre-univers`**, page non livrée qui rend 404,
dont une depuis l'en-tête de **toutes** les pages publiques. Le journal du
3 septembre annonçait « trois liens morts, tous vers `/notre-univers` », et
ajoutait que c'était « la dernière page à liens morts ». Le compte était deux
fois trop bas.

Je ne peux pas la livrer : elle porte l'histoire de la marque et les matières,
que seule l'exploitante détient, LS-25. Le lien mort est donc **compté et annoncé
à chaque exécution** plutôt que passé sous silence, avec une liste fermée : un
lien mort neuf fait échouer le contrôle.

**`/compte/donnees/export` accusé à tort**, second défaut, celui-là dans mon
contrôle : c'est un **gestionnaire de route**, `route.ts`, qui sert un fichier
plutôt qu'un écran. Ne dériver que les `page.tsx` le rendait invisible.

## Trois formes de lien, et n'en chercher qu'une était mon défaut

Le contrôle accusait `/aide` et `/avis/signaler`, tous deux **parfaitement
reliés**. Le dépôt porte trois formes :

```
href="/aide"                                     attribut JSX
{ href: "/aide", libelle: "…" }                  table de liens du pied
href={{ pathname: "/avis/signaler", query: … }}  objet de route Next.js
```

Un contrôle qui accuse du code sain est pire qu'une absence de contrôle : la
correction évidente aurait été de réécrire des liens valides.

## Les mutations ont corrigé mes mutations

Mon premier jeu visait `/catalogue` en retirant **deux liens sur sept** : la
mutation restait verte, et le script accusait un contrôle parfaitement voyant.
Motif documenté de ce dépôt, « choisir les mutations sur les formes réellement
présentes ».

Cela a révélé une **limite réelle**, désormais écrite dans l'en-tête du contrôle
et dans la règle C41 : un seul lien suffit, y compris depuis une page d'erreur.
Retirer les liens de l'en-tête et du pied laisserait le contrôle vert sur une
boutique dont la vitrine ne s'atteindrait plus que par un 404.

**Le resserrer serait pire.** Exiger un lien depuis un composant de navigation
ferait échouer le contrôle sur `/compte/adresses`, légitimement atteint depuis
l'écran de compte, et pousserait à inventer une barre que la boutique ne doit pas
avoir.

## Quatre mutations, dont la garde contre soi-même

La quatrième vérifie que le contrôle **dit que son ancrage est cassé** plutôt que
de conclure « tout est atteignable » sur zéro examen. C'est un défaut que deux
autres scripts de ce dépôt ont déjà porté.

## Vérifications

```
verifier-atteignabilite-boutique.sh          25 routes, 16 examinées, 18 liens
verifier-atteignabilite-boutique-mutation.sh 4 mutations, 4 détectées
verifier-config-claude.sh                    configuration cohérente
verifier-navigation-administration.sh        conforme
controles.yml                                YAML valide, étape 9s quater
```

## État des tickets

**LS-165 développée**, epic LS-3. Les cinq critères sont remplis : les deux sens,
la liste d'exclusion motivée, la preuve par mutation, et l'entrée en intégration
continue.

## Prochaine étape

**LS-125**, les états de la page de confirmation, ou **LS-85**, les annonces aux
lecteurs d'écran.
