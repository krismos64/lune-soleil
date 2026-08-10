# 10 août 2026, nuit, les contrôles de configuration étendus

**Travail non commité en fin de session, à commiter dans la session suivante.**
Trois fichiers modifiés, aucun commit, arbitrage de Christophe qui devait
quitter la session.

## La question posée

Les scripts ne contrôlent pas la justesse du contenu : peut-on les améliorer
pour que skills, agents, hooks, `CLAUDE.md`, `README.md`, mémoire, journal et
tickets Jira se mettent à jour de façon optimisée ?

**La mise à jour automatique n'a pas été retenue, et ce n'est pas un renoncement
technique.** `verifier-config-claude.sh` porte déjà en tête la raison :
il avertit et ne corrige pas, parce qu'un chiffre faux est le symptôme d'une
modification non documentée, et qu'un hook qui écrirait dans le dépôt produirait
un commit que personne n'a relu. La mémoire du projet ajoute que la question a
été tranchée le 4 août : ne pas proposer de correcteur automatique.

Un script ne sait pas non plus si une phrase du journal dit vrai ni si une fiche
mémoire est encore pertinente. Ce qu'il sait faire, c'est **détecter les écarts
mécaniques**. C'est donc la détection qui a été étendue.

## Ce qui a été ajouté

`verifier-config-claude.sh` passe de onze à **treize contrôles**, et son script
de mutation de neuf à **treize cas, tous détectés**.

**Contrôle 12, chaque hook déclaré pointe vers un script exécutable.** Le plus
important des trois. La documentation officielle de Claude Code pose qu'un hook
dont la commande ne peut pas être lancée produit une erreur **non bloquante** :
l'action continue. Un `hook-block-secret-files.sh` renommé, déplacé ou privé de
son bit exécutable laisserait donc passer la lecture des `.env` en silence, et
il n'existe aucun lint officiel de `settings.json`, `/hooks` se contentant de
lister la configuration.

**Contrôle 13, les skills cités par `CLAUDE.md` existent.** Même trou que celui
comblé en LS-31 pour les agents : le contrôle des renvois ne voit que les
chemins écrits en entier, et `CLAUDE.md` cite ses skills par leur nom nu.

**Contrôle 14, les renvois de `docs/REFERENCES.md` existent.** Le contrôle
équivalent ne couvrait que `CLAUDE.md`, alors que `REFERENCES.md` est la table
d'aiguillage vers laquelle `CLAUDE.md` renvoie.

## Le défaut le plus grave était déjà là

**`chiffre_en_lettres` s'arrêtait à « dix ».** Au-delà, elle rendait une chaîne
vide, `compte_annonce` aussi, et la comparaison était **sautée** : le contrôle
passait au vert sans avoir rien vérifié. C'est un mode fail-open, celui-là même
que LS-42 a corrigé sur le script de migration.

Le seuil était **déjà franchi** : `verifier-tests-mutation.sh` porte vingt-et-un
cas, compte que le README écrit en toutes lettres. La table monte désormais à
trente, et l'alternance de recherche est ordonnée du plus long au plus court,
sans quoi « dix-sept » se lit « dix ».

Un compte de plus est désormais recompté : celui des mutations de la **suite de
tests**, qui n'était surveillé par rien et avait été corrigé à la main pendant
LS-79. C'est le troisième compte du README à dériver, après les overrides et les
mutations de configuration.

## Deux faux positifs corrigés avant de conclure

Le contrôle des mutations de tests, ancré sur « <nombre> fois » seul, rendait 8
au lieu de 21 : le README emploie « fois » à trois endroits pour trois scripts
différents, et la première occurrence gagnait. Ancrage resserré sur le **nom du
script**.

Le contrôle des renvois de `REFERENCES.md` signalait `src/integrations/stripe/`,
qui n'existe pas encore. C'est la table des chemins de **déclenchement** des
règles, qui désigne légitimement des dossiers de phase 3. `src/` en est donc
exclu, seules les cibles documentaires devant exister.

Les deux sont le défaut d'ancrage déjà connu ici : trop large, il crie sur ce qui
est juste.

## Ce qui n'a pas été fait, et pourquoi

**Aucun contrôle sur la justesse du contenu du journal ni des fiches mémoire.**
Vérifier qu'une page de journal dit vrai demande de lire le dépôt et de juger,
ce qu'un script ne fait pas. Le contrôle existant reste volontairement grossier,
il exige une page du jour quand du code a été commité.

**Aucun contrôle sur la fraîcheur des descriptions Jira.** `verifier-jira.sh`
couvre la structure, epic parent et liens de dépendance. Juger qu'une
description est périmée demande de la comparer au code, et la convention du
projet est déjà qu'un commentaire récent rectifie la description.

## État

Trois fichiers modifiés, **non commités** : `README.md`,
`scripts/verifier-config-claude.sh`,
`scripts/verifier-config-claude-mutation.sh`.

Contrôles au vert : `verifier-config-claude.sh --strict`, `verifier-regles.sh`,
et la preuve par mutation à treize sur treize.

**Rien n'a été fait sur LS-88**, l'écart d'ancrage des règles sur `src/lib/`
trouvé plus tôt dans la soirée. Ces contrôles-ci ne le couvrent pas : LS-88
demande un contrôle de **couverture**, qui vérifierait qu'un dossier critique de
`src/` est visé par au moins une règle. Le travail reste entier.
