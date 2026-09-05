# 5 septembre 2026, session D : la permission invalide, LS-186

Correction courte, trouvée parce que Christophe a collé le message d'erreur de
GitHub avant de quitter la session.

## Le défaut

`derive-documentation.yml` déclarait `administration: read` sous `permissions:`.
**Cette portée n'existe pas** : GitHub n'accepte qu'une liste fermée de seize
clés, plus les deux formes globales.

Le fichier entier était donc **rejeté au chargement**, avant tout job, et le
contrôle hebdomadaire de dérive documentaire ne tournait plus depuis le
4 septembre.

## Ce qui a fait durer la panne

**La signature ne ressemble pas à un échec d'étape.** Mesuré sur les quatre
derniers runs :

```
push failure cree=2026-09-05T05:45:44Z maj=2026-09-05T05:45:44Z
push failure cree=2026-09-05T05:45:20Z maj=2026-09-05T05:45:20Z
push failure cree=2026-09-05T05:41:46Z maj=2026-09-05T05:41:46Z
push failure cree=2026-09-05T05:40:00Z maj=2026-09-05T05:40:00Z
```

`created_at` égale `updated_at` **à la seconde**, aucun job dans le run, et
`gh run view --log-failed` rend « log not found ». Trois symptômes qui désignent
un fichier refusé, jamais une étape en erreur.

**Je l'ai moi-même vu et écarté cette nuit.** Mes quatre pushs ont chacun
déclenché ce rouge, et je le lisais comme un workflow non requis qui échouait sur
autre chose que mon travail. La fiche mémoire du 4 septembre disait pourtant
exactement quoi chercher.

## Corriger la syntaxe n'aurait rien donné de plus

Lire `repos/<dépôt>/branches/main/protection` exige des **droits
d'administration du dépôt**, que le `GITHUB_TOKEN` d'un workflow ne peut obtenir
par **aucune** clé `permissions:` : il faut un jeton personnel.

La portée était donc à la fois invalide et inutile. Le ticket proposait trois
voies, et l'**option 1** a été retenue, celle que le ticket recommandait :
retirer la permission et laisser le script se taire en intégration continue.

**Il sait déjà le faire**, et c'est ce qui rend l'option immédiate :
`verifier-protection-branche.sh` écrit « IGNORÉ protection de branche illisible,
jeton sans droit d'administration » et sort en 0. C'est la règle du projet sur
les garde-fous, un contrôle qui ne peut pas conclure le dit plutôt que de
prétendre avoir vérifié. Il reste utilisable en local, où `gh` porte les droits
de Christophe.

## Le contrôle qui empêche le retour, critère 4

`verifier-config-claude.sh` confronte désormais toute portée déclarée dans
`.github/workflows/` à la liste fermée des seize valides.

**Prouvé par mutation** : remettre `administration: read` fait rougir le contrôle,
qui nomme le fichier et la portée. La liste est écrite à la main et c'est assumé,
elle ne bouge qu'à l'ajout d'une portée par GitHub, ce qui se remarquerait par un
faux positif et non par un silence.

## Deux pièges rencontrés en écrivant ce contrôle

**Une liste sur plusieurs lignes porte des retours à la ligne.** La comparaison
`case " $LISTE " in *" $x "*` ne les traite **pas** comme des espaces : « contents »,
premier mot de la deuxième ligne, n'était jamais reconnu. Le contrôle a signalé
**quatre workflows sains** à sa première exécution, ce qui l'a montré tout de
suite. La liste tient désormais sur une seule ligne.

**Les commentaires sont retirés avant lecture.** Ce fichier de workflow cite la
portée fautive pour l'expliquer, et les compter aurait fait échouer le contrôle
sur sa propre documentation. C'est le motif rencontré la veille sur
`verifier-actions-sensibles.sh`, qui s'était déclenché sur un commentaire
expliquant quand poser une marque.

## Vérification

| Contrôle | Résultat |
| --- | --- |
| `verifier-config-claude.sh` | vert, code 0 |
| Mutation, portée fautive remise | **rouge**, le fichier et la portée nommés |
| `npm run format:check` | vert |

## Le critère 2, vérifié après la fusion

`workflow_dispatch` s'exécute sur `main`, donc la preuve ne pouvait être faite
qu'après. Elle l'est, run `33948706709`, et le contraste avec l'état d'avant est
net :

```
workflow_dispatch completed success  cree=2026-09-05T06:01:39Z maj=2026-09-05T06:01:49Z
push              completed failure  cree=2026-09-05T05:48:59Z maj=2026-09-05T05:48:59Z
```

La ligne du bas est un de mes pushs de la nuit, `cree` égale `maj` à la seconde.
La ligne du haut porte **dix secondes d'écart**, donc du travail réel.

```
job: Comptes et renvois de la documentation -> success
  Contrôler la cohérence de la configuration: success
  Ouvrir une issue si la documentation a dérivé: skipped
```

**L'étape d'ouverture d'issue est `skipped`, et c'est le bon résultat** : aucune
dérive documentaire trouvée. Le workflow fait donc ce pour quoi il existe, pour
la première fois depuis le 4 septembre.

## État des tickets

**LS-186 est TERMINÉE**, cinq critères sur cinq. **115 terminés sur 180**, relevé
dans Jira après sa clôture.

**J'avais d'abord écrit 114 avec une explication inventée**, disant que le compte
ne bougeait pas. C'était faux, et la requête l'a montré : LS-186 s'ajoute
simplement aux 114 de la veille au soir. Le motif est celui que ce projet écrit
depuis des semaines, « un compte se relève dans Jira au moment d'écrire, jamais
de mémoire », et raisonner un chiffre plutôt que le lire est une variante du même
défaut.

## Prochaine étape

Inchangée : **LS-137**, le référencement technique, puis **LS-136** et **LS-148**.
