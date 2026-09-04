# 5 septembre 2026, session A : le gabarit de l'espace client, LS-180

Story jumelle de LS-181, qui avait posé le gabarit de l'administration la veille.
Elle partage son modèle et deux de ses corrections.

## Le défaut qu'elle ferme

**Aucun `layout.tsx` sous `compte/`.** Les stories LS-54 à LS-62 ont livré les
écrans un par un, chacun se suffisant : `/compte` était devenue un **sommaire**
de six sections portant chacune un lien vers son écran, et chaque écran un lien
« Retour à mon compte ».

Circuler des commandes vers les adresses demandait donc **deux navigations** en
repassant par le sommaire. Le prototype montre au contraire une barre latérale
persistante, et c'est elle qui donne son unité à l'espace client.

## Ce que Context7 a tranché

✅ Deux points vérifiés sur la documentation de l'App Router, tous deux
structurants :

**Un layout partagé ne se re-rend pas** à la navigation entre routes sœurs, il
est « reused (already mounted) ». La navigation doit donc être un composant
client avec `usePathname` : un chemin lu côté serveur resterait figé sur la
première page ouverte, et le marqueur d'écran courant désignerait la mauvaise
rubrique après chaque clic.

**Le groupe de routes est la voie officielle** pour exclure des routes d'un
layout. Elle a été **écartée** ici : elle déplacerait dix-neuf fichiers et
changerait les chemins de sept écrans cités dans les tests, les emails de Better
Auth et les redirections, pour une story qui « ne change aucun comportement ».
La session dit déjà exactement ce qu'il faut, et le layout s'efface sans elle.

## Deux écarts au prototype, assumés et écrits

**« Profil et données » devient deux entrées.** Le prototype en montre une pour
ce que le dépôt sert en deux routes, LS-60 et LS-62. Les fondre cacherait l'une
des deux, et le carnet de droits RGPD n'est pas un détail du profil.

**« Mes avis » est montrée inerte**, avec son ticket LS-61, bloquée par LS-33 et
le compte Mondial Relay. C'est l'arbitrage pris la veille pour l'administration,
repris tel quel : la barre annonce la structure complète plutôt que de laisser
croire que la fonction n'existe pas.

**Le prototype dit cinq onglets, le ticket six.** Aucune contradiction, le
sixième est « Se déconnecter », une action et non une rubrique.

## Ce que les tests ont trouvé dans mon propre code

**Deux liens identiques vers la même cible.** Ma tuile « Voir mes données »
doublait la section du même nom, restée en place. `compte-donnees.spec.ts` l'a
attrapé en violation de mode strict, « resolved to 2 elements », et il avait
raison : au clavier la tabulation traverse deux fois la même destination, et un
lecteur d'écran annonce deux fois le même libellé. La section est retirée.

**Playwright apparie par sous-chaîne.** « Voir mes commandes » contient « Mes
commandes » : mes propres assertions trouvaient deux éléments. Elles sont
désormais ancrées sur le repère de navigation, ce qui dit aussi ce qu'elles
mesurent.

**`browser.newContext()` n'hérite pas de `baseURL`.** Mon test sans session ne
chargeait donc aucune page, et l'erreur se lisait « element(s) not found » sur un
`h1` pourtant présent, ce qui accusait le rendu au lieu de la navigation.
`context.clearCookies()` fait le travail.

**Un 404 profond ne rend pas la barre.** J'avais visé une URL inexistante pour
exercer la règle du préfixe sur un écran profond : `not-found.tsx` vit à la
racine de `app/`, donc **hors** du layout de `compte/`. L'hypothèse était fausse
et le test l'a montré avant que le commentaire ne la fige.

## Ce que la revue d'interface a trouvé

**Le défaut principal : la déconnexion derrière un menu.** Placée en pied de
barre, elle disparaissait avec le panneau replié sous 768 px. Sur un appareil
partagé, fermer sa session est le geste d'urgence : le mettre derrière un
hamburger est l'inverse de ce que cet état demande. Deux tests de bout en bout
l'ont attrapé à 320 et 390 px.

**J'avais choisi la mauvaise des deux issues.** Mon diagnostic du doublon était
juste, ma conclusion non : il fallait garder les deux emplacements et les rendre
distinguables, pas en supprimer un. Le bouton rejoint la ligne de bascule,
toujours visible, et le CSS le ramène en pied de colonne au-delà de 768 px.
**Un seul nœud dans le DOM, deux dispositions**, par `order: 1`.

**Deux rapports de contraste annoncés étaient faux**, 5,44 pour 5,51 et 12,63
pour 12,92. Tous deux pessimistes donc sans conséquence produit, mais un chiffre
faux écrit à côté d'une couleur est exactement ce que C31 met en garde de
recopier plus tard.

**`.titre` était défini deux fois** dans le même fichier. La cascade rendait le
bon résultat, et qui lisait le premier bloc croyait tenir la définition complète.

**Le layout annonçait sept écrans d'authentification et en énumérait six**, dont
un qui exige au contraire une session. Motif « un compte recopié n'est pas une
mesure ». Le compte est désormais mesuré route par route : **quatre** écrans
s'ouvrent sans session, neuf portent la barre.

**Trois écrans sous session n'avaient pas de sur-titre.** Décision écrite plutôt
que trou laissé : ce sont des écrans de **passage**, vérification,
réauthentification et rétractation, pas des rubriques. Un sur-titre les rangerait
sous une rubrique qui n'existe pas.

**Un nom valant « ... » passait `trim` sans être vide**, s'affichait tel quel
puis rendait « ? » en pastille. Le layout affirme pourtant refuser « un nom vide
ou un ? » parce que cela masquerait une anomalie derrière un affichage
plausible. **Des deux, c'est le commentaire qui avait raison.**

## Un défaut de conception révélé par le test unitaire

Les deux fonctions pures vivaient dans `services/espace-client.ts`. Le test a
**échoué à l'import**, avant sa première assertion :

```
Error: DATABASE_URL absente.
```

Importer un découpage de chaîne tirait `lib/prisma`. Le défaut ne se voit pas à
l'usage, le service fonctionnant parfaitement ; il se voit au moment de
**tester**, et il aurait poussé à monter une base pour vérifier deux fonctions
qui ne touchent rien, ou pire à ne pas les vérifier. Elles vivent désormais dans
`lib/nom-affiche.ts`.

## La largeur que personne ne mesurait

**Aucun projet Playwright ne couvre 768 px**, manque porté par LS-166 : la
configuration a 320, 390 et 1280. Or 768 est **exactement** le point de bascule
de cette barre. Les trois largeurs existantes mesurent donc les deux états et
jamais la frontière entre eux.

Un quatrième projet de largeur rejouerait les 240 tests de la suite une fois de
plus, quand LS-177 vient de ramener une PR de 24 à 14 minutes. `compte-gabarit`
pose donc ses propres viewports : trois navigations au lieu de 240 tests.

## Vérification

| Contrôle | Résultat |
| --- | --- |
| Vitest | **1144 tests verts**, 74 fichiers, dont 15 neufs |
| Playwright, espace client | **250 verts**, trois largeurs, plus 6 neufs à 768 px |
| `verifier-contraste.sh` | 140 paires, toutes conformes, contre 81 avant |
| `verifier-regles.sh`, gardes, actions sensibles, format, lint, types | verts |

**Quatre mutations prouvent les tests neufs**, chacune attrapée par le seul test
qui la vise :

| Mutation | Test qui rougit |
| --- | --- |
| Bascule à 769 px au lieu de 768 | 1 seul, celui de la bascule exacte |
| `aria-current` retiré | 1 seul, celui du marqueur d'entrée courante |
| Cas particulier de `/compte` retiré | 2, chacun sur sa moitié de la règle |
| Retour au test de longueur sur le nom | 1 seul, celui des noms sans lettre |

**La mesure de couverture de contraste a presque doublé**, 81 paires avant, 140
après : déclarer le fond dans le même bloc rend mesurable ce que le contrôle
ignorait, il n'apparie jamais un fond hérité du JSX.

## Un échec qu'il ne fallait pas m'attribuer

La suite complète a échoué sur `compte-profil.spec.ts`, plafond de débit
d'authentification. **Le même test échoue à l'identique sur `main`**, sans une
ligne de cette branche, et passe seul en isolation. C'est **LS-168**, le fond de
bruit déjà ticketé, dont la fiche prévient de ne pas accuser une story qui touche
à l'authentification avant de l'avoir vérifié. Le réflexe a servi.

## Un ticket né de l'outillage

**LS-189 créée**, Medium sous LS-7 : la préparation de bout en bout échoue sur
une base portant un compte d'administration **réel**, l'index partiel
`utilisateur_administratrice_unique` n'admettant qu'une ligne. La préparation
rétrograde bien les administratrices, mais uniquement celles préfixées `e2e-`,
et c'est **une bonne décision** qu'il ne faut pas défaire : sans cette clause,
un `UPDATE` retirerait son rôle au compte réel de l'exploitante en silence.

Contourné pour livrer, en rétrogradant à la main puis en restaurant à
l'identique, état relevé avant et après. Ce n'est pas tenable.

## Ce qui n'est pas fait

**Aucun contrôle visuel dans un navigateur.** Les mesures automatisées couvrent
le débordement, le contraste et l'accessibilité aux quatre largeurs, jamais le
jugement esthétique. Quatre points signalés par la revue restent à regarder :

- un nom long dans la colonne de 240 px, qui s'enroule sur trois ou quatre lignes
  sans déborder
- le panneau ouvert à 320 px, qui pousse le `h1` sous la ligne de flottaison
- la grille de tuiles, qui reste à une colonne jusqu'à 480 px de largeur utile,
  donc toujours dans une colonne bornée à `60ch`
- la barre qui dépasse `100vh` sur un écran très court, théorique à cinq entrées

## État des tickets

**LS-180 est TERMINÉE**, neuf critères sur neuf. **LS-189 créée**, Medium sous
LS-7.

## Prochaine étape

**LS-175**, l'amorçage du compte administrateur, qui touche la même zone que
LS-189 et la rejoint sur la question de savoir quel compte d'administration
existe sur quelle base. Puis **LS-184** et **LS-185**, les deux écrans du
découpage de LS-182, LS-185 commençant par un arbitrage RGPD.
