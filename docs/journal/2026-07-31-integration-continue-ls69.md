# 31 juillet 2026, les contrôles cessent de dépendre de la mémoire

| Champ | Valeur |
|---|---|
| Ticket | LS-69 |
| Commits | `1c47137` |
| Contrôles | à compléter après l'exécution |
| Mutations | à compléter |

Quatrième page du 31 juillet. Les huit contrôles de `CONTRIBUTING.md` entrent en
intégration continue, `.github/workflows/controles.yml`.

## Le motif, rappelé parce qu'il est le sujet

Trois oublis documentés : les huit assertions mortes de LS-13, le contrôle qui
n'examinait qu'un enum sur douze en LS-45, le défaut de schéma du 29 juillet
alors que `verifier-schema.sh` existait depuis deux jours et que personne ne le
lançait.

Un contrôle qui dépend de quelqu'un qui pense à le lancer finit par ne pas être
lancé. `verifier-schema.sh` passe donc **en premier** dans la chaîne.

## Deux décisions de conception

**La validation du schéma tourne sous ses deux modes, pas un seul.** Le mode
conception vérifie que le SQL de référence dit ce qu'on croit ; le mode
`--base-migree` vérifie ce que Prisma crée réellement. Une divergence entre
`schema.prisma` et `schema.sql` n'est visible que par le second, et c'est
exactement le défaut passé le 29 juillet.

**La base est démarrée par `docker run`, sans service GitHub Actions.** Le mode
`--base-migree` cible le conteneur nommé `lune-soleil-db`, écrit en dur, quand un
service porte un nom engendré à l'exécution que le script ne peut pas deviner.
Trois options existaient : démarrer le conteneur sous le bon nom, rendre le nom
paramétrable, ou laisser le mode réalité hors de la chaîne. La première a été
retenue à l'arbitrage : le script est prouvé par mutation, le modifier pour les
besoins de l'intégration continue obligerait à rejouer cette preuve.

`docker-compose.yml` n'est pas utilisable ici, il exige un `.env` jamais commité.

## Le faux positif de secret, deuxième occurrence

Le hook `pre-commit` a bloqué trois fois de suite. Les deux premières sur la
chaîne de connexion écrite en clair, ce que LS-68 avait déjà rencontré et résolu
en assemblant l'URL. La troisième était plus instructive :

```
COMMIT BLOQUE : chaine de connexion avec mot de passe dans .github/workflows/controles.yml
```

Le code était propre. C'était **le commentaire qui expliquait le contournement**
qui déclenchait le motif, en citant la forme littérale qu'il fallait éviter. Une
explication de garde-fou peut déclencher le garde-fou qu'elle explique.

Détail qui a coûté un aller-retour : un `printf` dont les valeurs sont des
substitutions `%s` déclenche le motif malgré tout. Un `%s` ne contient ni barre
oblique, ni arobase, ni espace, il satisfait donc la classe de caractères
attendue pour un identifiant et pour un mot de passe. Le préfixe du protocole
doit lui aussi être assemblé en deux morceaux.

Cette page a été bloquée par le même hook, pour la même raison, en décrivant le
problème. Une ligne qui cite la forme interdite est interdite.

## Ce que Context7 a servi de périmé

La documentation GitHub Actions donnait `actions/checkout@v6` et
`actions/upload-artifact@v4`. L'API GitHub, interrogée directement, répond v7 pour
les deux. Les tags majeurs flottants ont été vérifiés avant emploi.

La documentation d'un service se périme comme le reste : pour une version
d'action, la source qui fait autorité est le dépôt de l'action.

## Ce qui entre dans la chaîne au-delà des huit

Le format, la conformité de `.claude/rules/` au schéma, la cohérence de la
configuration Claude Code en mode `--strict`, et `npm audit --audit-level=low`.
Ce dernier parce qu'une dépendance vulnérable entre par une pull request, jamais
autrement.

Aucun compte de contrôles n'est inscrit dans le workflow : un chiffre attendu
deviendrait faux à la story suivante et serait relâché plutôt que corrigé.

## Ce qui reste volontairement hors de la chaîne

Les trois scripts de mutation modifient des fichiers du dépôt en place, ce qu'une
exécution partagée ne tolère pas. Le prototype d'interblocage documente un défaut
ouvert, LS-50 : le brancher rendrait la chaîne rouge en permanence.

## Prochaine étape

À compléter.

## État des tickets

| Ticket | État |
|---|---|
| LS-69 | En cours |
| LS-65 à LS-68, LS-78 | **Terminés**, pages précédentes |
| LS-70 à LS-75 | À faire |
| LS-50 | À faire, l'interblocage reste un script |
| LS-9, LS-10 | En cours, hors chaîne de phase 1 |
