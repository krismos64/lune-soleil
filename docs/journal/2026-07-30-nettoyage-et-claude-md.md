# 30 juillet 2026, nettoyage documentaire et CLAUDE.md ramené sous 200 lignes

Troisième page du 30 juillet. Les deux précédentes portent LS-65 puis ADR-026 et
LS-76.

## Ce qui a été fait

### Six corrections de nettoyage, avant LS-66

| Cible | Correction |
|---|---|
| LS-66 | porte `prisma.config.ts`, comptes figés remplacés par les commandes qui les mesurent, les deux fichiers de contraintes cités |
| LS-67 | titre purgé de tout nombre, périmètre réduit, `prisma.config.ts` et la fixation de Node retirés |
| LS-68 | contradiction levée par un découpage en deux niveaux de test |
| LS-70 | aligné sur ADR-023, seize caractères pour tous les comptes |
| ADR-026 | « story de correction de schéma à créer » devient LS-76, comptes figés retirés |
| LS-27 et `.env.example` | le tarif unique devient les deux tarifs d'ADR-025 |

Sur **LS-67**, le titre annonçait « les seize CHECK ». Ce nombre avait été faux
deux fois de suite, seize puis vingt-et-une, et il aurait été faux une troisième
fois après LS-76 qui en ajoute quatre. Il est remplacé par les commandes `grep -c`.

Sur **LS-68**, la contradiction se résout en séparant ce qui est testable
maintenant de ce qui ne l'est pas. Le test porte sur la **primitive SQL** de
réservation, qui existe déjà et ne dépend d'aucun service : il passe donc vert dès
la story, avec preuve par mutation. Le test du service complet part en LS-17.
Aucun test ignoré, un critère l'interdit explicitement.

Point traité au passage : `interblocage-panier.sh` documente un défaut **non
corrigé**, LS-50. Le porter en test automatisé aurait recréé la suite rouge que
cette correction cherche à éviter. Il reste un script jusqu'à LS-50.

### CLAUDE.md, de 312 à 200 lignes

Christophe a signalé le dépassement des 200 lignes recommandées par la
documentation officielle pour un fichier chargé à chaque session.

Le découpage garde dans `CLAUDE.md` ce qui doit être lu **avant toute action**,
dix invariants, interdits, quatre canaux de clôture, règles de rédaction, et
déporte vers **`docs/REFERENCES.md`** ce qui se consulte **au moment de
concevoir** : documents d'architecture, ADR acceptés, chemins de déclenchement des
règles, méthode de lecture des commentaires Jira.

Les six renvois de `CLAUDE.md` ont été vérifiés, tous pointent vers un fichier
existant.

## Quatre affirmations périmées trouvées pendant le découpage

Toutes du même type : **un état transitoire écrit au présent dans un fichier
permanent**.

| Affirmation | Réalité |
|---|---|
| « Tant que `src/` est vide, trois de ces quatre fichiers ne se déclenchent jamais » | `src/` est peuplé depuis LS-65 |
| « se trace dans la section Priorisation **ci-dessus** » | elle était en dessous |
| `npm run test` et `test:e2e` listés comme disponibles | ils arrivent en LS-68 |
| exemple daté sur LS-27, « un commentaire du même jour » | un commentaire plus récent l'avait dépassé |

Le dernier cas a produit une décision : `REFERENCES.md` énonce la règle de lecture
des commentaires Jira **sans exemple daté**, qui se périmerait au commentaire
suivant. Un exemple concret aide à comprendre, mais dans un fichier permanent il
devient un piège.

Deux manques ont aussi été comblés en condensant : la nuance **collecte au
Go-Live contre interface en V1 cible**, issue de LS-63, absente de la section
Priorisation, et la règle de **preuve par mutation** absente de la section de
vérification alors qu'elle est appliquée depuis LS-13.

## Audit des canaux, à la demande de Christophe

Vérifié plutôt que supposé, en simulant ce qu'une prochaine session trouverait.

| Canal | État |
|---|---|
| `CLAUDE.md` | 200 lignes, sous la limite |
| `docs/REFERENCES.md` | créé, tables d'aiguillage |
| Journal | trois pages du 30 juillet, celle-ci comprise |
| Mémoire | 48 fiches, toutes indexées, **aucun lien mort**, aucune orpheline |
| Skills | `story` et `adr` |
| Agent projet | `ls-critical-reviewer`, calibré sur les zones à risque |
| Hooks | trois, secrets bloqués, commits non poussés, règles contre schéma |
| MCP | hérités du global, Atlassian et Context7, pas de `.mcp.json` projet à créer |
| Jira | un seul ticket en cours, LS-9 documentation Confluence, aucun code ouvert |

Trois fiches de mémoire portaient des mentions à vérifier. Deux étaient des
**récits d'incidents passés**, donc correctes historiquement. La troisième,
`lune-soleil-decoupage-ls2-decide`, annonçait « la prochaine action est LS-65 »
**dans sa description**, ce qu'une session lit en premier. Corrigée, avec la table
des onze stories qui porte maintenant leur état.

## Prochaine étape

**LS-66**, sans nettoyage préalable. La base PostgreSQL 18 locale, `prisma.config.ts`
et la migration initiale.

Le schéma est prêt, 92 contrôles au vert sur PostgreSQL 18.4, quatre mutations
détectées. Les descriptions des stories de la chaîne sont à jour.

## État des tickets

| Ticket | État |
|---|---|
| LS-65, LS-76 | Terminé, fusionnés |
| LS-66 | À faire, **prochaine action**, description corrigée |
| LS-67, LS-68, LS-70 | À faire, descriptions corrigées |
| LS-27 | À faire, commentaire rectificatif sur les deux tarifs |
| LS-9 | En cours, documentation Confluence, hors chaîne de phase 1 |
