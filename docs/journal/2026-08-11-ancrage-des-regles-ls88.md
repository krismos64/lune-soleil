# 11 août 2026, LS-88, les règles s'ancrent sur le socle technique

Story courte, sans code applicatif : elle corrige un trou de garde-fou trouvé la
veille au soir pendant la vérification de fin de session.

## Le défaut

Éditer `src/lib/auth.ts` ne chargeait **aucune** règle de `.claude/rules/`. Les
quatre fichiers couvraient `prisma/`, `repositories/`, `services/`, `app/`,
`components/`, `styles/`, `integrations/stripe/` et `integrations/mondial-relay/`,
et rien d'autre.

Ce fichier porte pourtant le secret de signature des sessions, l'attribut `Secure`
du cookie et la limitation de débit d'ADR-027. `src/integrations/email/` était
dans le même cas, alors que `payments.md` couvre `stripe/` et `legal.md` couvre
`mondial-relay/`.

C'est le motif « ancrage des contrôles » déjà rencontré trois fois ici : la règle
existe, elle est juste, et son déclencheur rate le fichier critique.

## L'arbitrage

Le ticket laissait deux options ouvertes. Christophe a tranché pour la **règle
dédiée**, `securite.md`, plutôt que d'étendre les `paths` existants.

La raison est mesurable : `database.md` fait 362 lignes de stock, de transactions,
de numérotation comptable et de migrations, sans une ligne sur l'authentification.
Y ranger `src/lib/**` aurait chargé 362 lignes hors sujet à chaque édition
d'`auth.ts`, c'est-à-dire l'ancrage trop large que le critère 3 du ticket
interdit.

La mémoire du projet pose de ne créer une règle que « lorsqu'une erreur répétée le
justifie, jamais par anticipation ». Le critère est rempli : la fuite d'adresse
email fermée en LS-73 et les six tests faux de LS-79 sont deux erreurs réelles sur
ces chemins, commises sans qu'aucune règle soit chargée.

`securite.md` porte les invariants 2, 7 et 9, et les pièges déjà payés : Better
Auth ne lève pas mais retombe, construire n'est pas servir, `auth.api` n'est
jamais soumis au rate limit.

## Le contrôle de couverture

`verifier-regles.sh` gagne un troisième contrôle : il échoue si un dossier de
`src/` n'est couvert par le `paths` d'aucune règle.

**La liste des dossiers est relevée sur le disque et non écrite à la main.** Une
liste figée serait une opinion : elle resterait verte le jour où quelqu'un crée
`src/paiement/` sans règle, exactement le trou qu'on venait de fermer. C'est le
cas 11 de la mutation, qui crée un dossier neuf et exige que le contrôle rougisse.

**Une nuance trouvée en vérifiant plutôt qu'en supposant.** Le contrôle comptait
`src/integrations` comme couvert parce qu'un de ses descendants l'est. J'ai
vérifié combien de fichiers vivent à la racine de ces dossiers parents : zéro
aujourd'hui, donc rien de masqué. Un `src/integrations/medias.ts` posé demain à la
racine aurait toutefois échappé à toute règle. Un dossier n'est donc couvert par
ses seuls descendants que s'il ne porte lui-même aucun fichier TypeScript.

## La bascule vers le code, déclenchée par elle-même

`securite.md` a fait rougir le contrôle existant sur neuf identifiants :
`useSecureCookies`, `rateLimit`, `baseURL`, `journaliserErreur` et cinq autres.
Tous réels, tous écrits dans le dépôt.

Le commentaire de la liste d'exemptions `hors_schema` annonçait précisément ce
moment : « le jour où elle devient longue, le bon geste est de confronter ces
identifiants au CODE plutôt que de les exempter ». Neuf ajouts d'un coup, c'était
ce jour.

Le contrôle confronte désormais les identifiants au schéma **et** au code de
`src/` et `tests/`, hors `src/generated/` dont les milliers de noms engendrés
rendraient le contrôle aveugle à une règle périmée. La liste d'exemptions tombe de
cinq à deux entrées, et son critère d'entrée se resserre : seuls y restent les
identifiants que le code ne doit **justement pas** porter, `dangerouslySetInnerHTML`
et `localeCompare`, cités par une règle pour être écartés. Une règle qui dit
« n'utilisez jamais X » ne peut pas prouver X par le code, son respect se mesurant
à son absence.

**Le défaut historique de LS-46 reste détecté**, vérifié par mutation avant de
continuer : réintroduire `taxRate` dans `database.md` fait toujours rougir.
L'élargissement n'a pas affaibli le contrôle.

## Ce qui a dérivé

**Node était en v23.9.0 au démarrage**, version impaire interdite. Rattrapé avant
tout contrôle, mais c'est la deuxième fois : `engine-strict` ne garde que
`npm install`, jamais `npm run`. Le réflexe `nvm use` en début de session n'est
pas encore acquis.

**La CI a rougi sur la première PR**, et elle avait raison : j'avais commité sans
écrire cette page de journal. Le contrôle passait en local parce que je l'avais
lancé avant de commiter, la détection portant sur la date du dernier commit de
code. Le garde-fou a fonctionné exactement comme prévu.

**Une fausse alerte, vérifiée plutôt que supposée.** `verifier-config-claude.sh`
n'affiche rien quand tout va bien, ce que j'ai d'abord pris pour un script cassé.
C'est délibéré et documenté en pied de script : « un hook qui parle à chaque
session devient un bruit que l'on apprend à ignorer ». Le mode `--strict` confirme
par une ligne.

## État des contrôles

| Contrôle | Avant | Après |
|---|---|---|
| Règles de `.claude/rules/` | 4 | **5** |
| Contrôles de `verifier-regles.sh` | 2 | **3** |
| Mutations des règles | 8 | **12**, toutes détectées |
| Identifiants confrontés | schéma | **schéma et code**, 50 |
| Dossiers de `src/` couverts | non mesuré | **15 sur 15** |

Le compte de mutations est désormais **calculé** et non écrit en dur dans le
script : trois comptes de ce dépôt ont déjà dérivé après l'ajout d'un cas que
personne n'a reporté.

Types et lint verts, 113 tests unitaires verts. **Les tests d'intégration exigent
Docker, non lancé sur ce poste** : la CI les a rejoués sur la PR #84, les huit
contrôles de `CONTRIBUTING.md` verts avant fusion.

## Prochaine étape

**Libre parmi LS-72, LS-80 et LS-81.** L'epic LS-2 compte dix-huit stories
filles, **quatorze terminées et quatre restantes**, compté le 11 août et non
recopié. LS-75 est la quatrième : elle se traite en dernier, elle vérifie les
autres.

LS-88 étant hors chaîne de phase 1, elle ne débloque rien et n'en bloquait rien.

Fusionnée sur `main` en rebase, PR #84, commits `3952fb9` pour la story et
`e152d9d` pour cette page.
