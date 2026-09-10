# 10 septembre 2026, i : l'audit de fin de session

Christophe voulait quitter la session en confiance. Les contrôles mécaniques
étaient tous verts. Cinq affirmations fausses vivaient quand même dans la
documentation.

## Ce que les contrôles ne pouvaient pas voir

`verifier-config-claude.sh`, `verifier-regles.sh`,
`verifier-propagation-docs.sh` et `verifier-registre-traitements.sh` passaient
tous. La mémoire ne portait ni fiche hors index, ni lien mort. Les 24 ADR
figuraient dans la table d'aiguillage, `CLAUDE.md` tenait ses 200 lignes, et
toutes ses commandes existaient.

**Aucun de ces contrôles ne lit le SENS d'une phrase.** Un document qui affirme
« les clés SMTP ne sont pas posées » est syntaxiquement irréprochable le
lendemain du jour où elles ont été posées.

## Le plus grave, EXPLOITATION.md

`CLAUDE.md` en fait la lecture obligatoire **avant toute intervention sur la
machine**. Sa section « ce que la production n'a pas encore » décrivait une
production qui n'existait plus depuis le matin :

```
annonce   « les cles Stripe et SMTP ne sont pas posees »
annonce   « treize variables techniques »
mesure    dix-huit variables, SMTP compris
```

Le paragraphe suivant était faux par conséquence : il annonçait que la tâche
`envoi-emails` rend `ConfigurationEmailIncompleteError` chaque minute, « ce qui
est le comportement voulu ». Quelqu'un diagnostiquant la production avec ce
document en main aurait cherché un symptôme disparu.

**Le compte de variables est remplacé par la commande qui le mesure**, motif que
le README applique déjà avec succès pour ses comptes de scripts.

**Le piège de l'`env_file` y est désormais documenté**, avec son diagnostic par
trois horodatages : ni `docker restart` ni `docker compose up -d` ne font relire
le fichier, et le script de déploiement n'a aucune option pour forcer la
recréation. C'est un savoir d'exploitation qui a coûté une heure aujourd'hui et
que rien ne portait.

## Le README se contredisait lui-même

**LS-107 était annoncée ouverte ligne 34 et close ligne 88.** Deux affirmations
opposées dans le même fichier, à cinquante lignes d'écart.

**« Les emails partent depuis LS-82 »** était l'affirmation exacte que LS-214 a
démentie : ils ne sont jamais partis pour l'authentification. Elle était fausse
depuis six semaines et personne ne pouvait le savoir, le repli ne levant pas.

**Le compte de tickets** disait 165 sur 211 en se datant du 10 septembre, donc du
jour même. Le vrai compte était 170 sur 215. Le paragraphe suivant expliquait
pourtant que « le dénominateur bouge autant que le numérateur », sans se
l'appliquer.

**LS-89 était présentée comme non branchée**, reliquat d'août : le branchement
est acté depuis le 13 août et `verifier-actions-sensibles.sh` le garde en
intégration continue.

## Un agent qui se contredisait

`ls-conteneurisation.md` disait « le quatrième conteneur dépend d'un ADR qui
n'existe pas » dans son tableau de topologie, et « la mesure d'audience est
tranchée, ADR-040 » dans sa section de détail, cent lignes plus bas.

**Un agent qui lit le tableau en premier repart avec la mauvaise conclusion.**

## Deux périmés dans REFERENCES.md

« Seize écrans d'administration » en valait **dix-huit** depuis LS-175. Le
chiffre était juste à LS-191 et s'est périmé sans que rien ne le signale.
Remplacé par sa commande de mesure.

`src/services/passkeys.ts` manquait à la table du code applicatif, alors qu'elle
porte des entrées pour des modules plus anodins et que ce service a une propriété
non triviale : sa projection reconstruite champ par champ écarte `publicKey` et
`credentialID`.

## Les deux leçons du jour, ajoutées à la règle qui les porte

`securite.md` est le seul fichier chargé automatiquement sur
`src/integrations/email/**`. Il ignorait les deux défauts les plus coûteux de la
journée.

**E12** : vérifier l'envoyeur **câblé** et non seulement celui écrit. Vingt tests
de `choisirEnvoyeurEmail` restaient verts en remettant le défaut d'origine, une
fonction correcte et du code mort produisant les mêmes tests verts.

**E13** : le refus d'envoi hors production, et pourquoi il se prouve dans les
deux sens, une garde trop zélée coupant la production en silence.

## Ce qui a été vérifié et laissé intact

Le rapport d'audit signalait deux points comme douteux. Les deux se sont révélés
justes après mesure.

`CLAUDE.md` annonce que le bout en bout, `npm audit` et l'image sont au
**nocturne** : le job de `nocturne.yml` s'appelle littéralement « Scenarios de
bout en bout, audit et image ». Les deux contrôles ajoutés aujourd'hui vivent
dans `controles.yml`, donc par pull request. Rien à corriger.

**Aucun document n'affiche de compte de contrôles CI**, et c'est délibéré : le
nombre a bougé deux fois dans la journée, 48 puis 49 puis 50.

## Vérifications

```
50 controles                        0 en echec
verifier-config-claude.sh --strict  configuration coherente
verifier-regles.sh                  regles conformes au schema
npm run format:check                vert
CLAUDE.md                           200 lignes, le seuil exact
```

**`CLAUDE.md` est à la limite exacte du contrôle.** Toute correction à y porter
doit être une substitution, jamais un ajout : la ligne 201 ferait rougir la CI.

## État des tickets

Aucun ticket ouvert pour cet audit, arbitrage de Christophe de corriger
directement. Les huit journaux de la journée restent cohérents entre eux.

## Prochaine étape

**LS-23, les photographies.** Elle appartient à l'exploitante, qui dispose
désormais de son accès à l'administration. Côté développement, seules LS-20 et
LS-170 sont jouables sans elle.
