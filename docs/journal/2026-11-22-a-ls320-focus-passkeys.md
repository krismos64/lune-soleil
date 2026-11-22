# 22 novembre 2026 : LS-320, le test de focus des passkeys attend le focus

## Demande

Christophe : « où en est-on », puis « oui » à la proposition de commencer par
LS-320, test de composant instable en CI. Une question préalable sur les avis
saisis à la main a reçu une réponse sans code : un avis sans commande ne peut
pas entrer dans le système (LS-37), le présenter sous « Avis vérifiés » serait
une pratique trompeuse (L121-4, à vérifier aux sources), et Google interdit de
baliser des avis repris d'un autre site. Piste proposée sans ticket : un lien
vers le profil Vinted, en section séparée, hors `AggregateRating`.

## Constat

`tests/composant/gestion-passkeys-ls295.test.tsx`, cas « bascule vers la
confirmation quand la route refuse faute de preuve ». Quatre échecs en CI
relevés dans le ticket et ses commentaires (12, 13, 14 et 18 novembre), le
dernier ayant rendu inopérante une preuve lourde du nocturne 106.

## Cause, mesurée

Le ticket annonçait « 6 sur 6 en local ». Boucle de 30 passages au repos et 30
sous charge CPU (`yes` sur deux fois le nombre de cœurs) : **3 rouges sur 60**,
2 au repos et 1 sous charge. La CI n'est donc pas seule en cause.

L'échec imprime un paragraphe déjà doté de son `tabindex="-1"` et le focus sur
`body` : le rendu est fait, l'effet qui déplace le focus
(`gestion-passkeys.tsx`, `useEffect` sur `preuveExpiree`) n'a pas encore tourné.
La réponse d'`addPasskey` arrive hors d'`act`, et React exécute l'effet passif
après le rendu. Le test attendait le lien, puis lisait le focus sans l'attendre.

Le composant est correct : l'effet passe un instant plus tard dans le
navigateur. Seul le test change.

Les autres assertions `toHaveFocus` des tests de composant ont été relues :
elles suivent un `focus()` direct, un `fireEvent` synchrone (React exécute
alors ses effets avant de rendre la main) ou sont déjà dans un `waitFor`.

## Fait

- Le cas attend le focus, `await waitFor(() => expect(...).toHaveFocus())`,
  puis vérifie le lien et l'absence du message d'échec. Aucune temporisation.
- `scripts/verifier-tests-mutation.sh` : `GESTION_PASSKEYS` ajouté à
  `MUTABLES`, nouveau lanceur `composant()` sur le même ciblage que
  `unitaire()` et `integration()`, cas « focus non deplace apres refus faute de
  preuve ».

## Preuves

- Après correction : **60 verts sur 60 au repos, 60 sur 60 sous charge.**
- Mutation, même expression `perl` que le cas, même filtre `-t` que le lanceur :
  le cas visé rougit, « Received element with focus: body ». Fichier restauré.
- `verifier-mutations-a-sec.sh` : 232 expressions dans le script central (231
  avant), aucune périmée.
- Types, lint et format au vert ; `npm run test` : 130 fichiers, 2 110 tests ;
  `verifier-regles.sh` conforme.

## Dérive

Le cas n'a pas tourné dans le script central lui-même (35 minutes, bases
requises) : il sera exercé par le prochain nocturne, qui dira si le lanceur
`composant` se comporte comme les deux autres.

## Prochaine étape

LS-291, pistes SEO et GEO à arbitrer, où ranger aussi la piste du profil Vinted
si Christophe la retient.

## État des tickets

- LS-320 : terminée, aucun code applicatif touché, rien à déployer.
- Ouverts dans Jira : LS-291, LS-35, et les epics qui les portent.
