# 7 septembre 2026, j : LS-197, le contrôle a été faux avant d'être juste

Une variable `NEXT_PUBLIC_` est substituée par `next build`, pas lue à
l'exécution. Le Dockerfile ne la portait ni en `ARG` ni en `ENV` : tout
`docker build` figeait `/medias` dans le bundle servi, et aucune configuration
d'exécution ne pouvait le changer.

## L'arbitrage, et ce que la mesure a écarté

Le ticket proposait trois voies et disait que la troisième, retirer la variable
au profit d'une constante, « mérite d'être examinée sérieusement ».

**La mesure l'a écartée.** Nginx ne porte **aucun** bloc `/medias`, aucun volume
n'est monté, et c'est Next.js qui sert `public/medias`. La chaîne de service des
médias reste entièrement à construire par LS-138 et LS-151, qui attendent le
VPS : figer une constante maintenant aurait décidé à leur place.

Christophe a retenu l'`ARG`, avec `/medias` en défaut. La raison est écrite à
côté de l'avertissement existant sur `docker history` : ce préfixe n'est pas un
secret, il ne révèle qu'un chemin public déjà visible dans le HTML.

## Deux formes dans le bundle, et un contrôle faux avant d'être juste

C'est le point qui vaut d'être gardé. **Ma première version du contrôle cherchait
`"$attendu"` avec ses guillemets doubles**, supposant une chaîne littérale. Elle
ne trouvait rien, et j'ai cru un instant que la substitution ne fonctionnait pas.

Les deux formes ont été mesurées :

```
variable DEFINIE   ->  Next.js inline la valeur, `/cdn-test/${e}/...`
variable ABSENTE   ->  il laisse `process.env.X??"/medias"` ENTIER,
                       et c'est le repli qui s'applique au navigateur
```

Mon motif ne trouvait **ni l'une ni l'autre**. Le contrôle aurait été un **faux
négatif permanent**, rouge sur une chaîne parfaitement fonctionnelle, et la
réaction naturelle aurait été d'accuser le Dockerfile.

**J'ai failli me tromper deux fois.** Un `grep -rl ... | head -2` suivi d'un
`echo` m'a d'abord fait lire « la substitution fonctionne » alors qu'aucun
fichier ne correspondait : c'est le `echo` que je voyais, pas un résultat. Le
motif « ce que la commande affiche n'est pas ce que la commande a trouvé ».

## Ce que le placement en CI a imposé

Le contrôle exige un bundle **construit**. Le mettre dans la famille 9 des
contrôles textuels, comme les précédents, l'aurait fait échouer sur « aucun
bundle construit » : cette famille s'exécute bien avant l'étape 7.

Il vit donc en `7 bis` et `7 ter`, juste après la construction dont il dépend, et
le commentaire du workflow dit pourquoi.

## La preuve, sur l'image réelle

```
docker build --target builder --build-arg NEXT_PUBLIC_MEDIA_PREFIXE=/cdn-preuve
docker run --rm ... grep -r cdn-preuve .next/static

  -> `/cdn-preuve/${e}/` dans le bundle DE L'IMAGE
```

Pas une simulation : l'image a été construite, inspectée, puis supprimée.

Cinq mutations sur cinq, dont la plus instructive est l'`ENV` retiré en laissant
l'`ARG` seul. Un Dockerfile dans cet état semble correct à la relecture et fige
pourtant le repli, un `ARG` n'étant pas exporté dans l'environnement des `RUN`
suivants.

## État des tickets

**LS-197 LIVRÉE ET CLOSE**, PR #291 fusionnée en rebase, commit `b5213ee`. Les
étapes `7`, `7 bis` et `7 ter` rendent toutes `success`, vérifié à l'API du run.

Comptes relevés dans Jira après la fermeture : **139 tickets terminés sur 192**.
L'epic LS-7 passe à douze stories ouvertes.

## Prochaine étape

**LS-200**, le raccordement de l'API Sendcloud, qui attend les clés de
Christophe.
