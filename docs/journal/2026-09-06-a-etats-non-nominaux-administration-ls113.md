# 6 septembre 2026, session A : les états non nominaux de l'administration, LS-113

Suite directe de LS-188, livrée la veille au soir : elle avait fermé l'état de
chargement, celle-ci ferme les quatre autres états obligatoires. Le ticket datait
du 18 août, et sa vérification préalable a montré qu'il tenait encore, à une
nuance près.

Elle a fini par corriger un défaut qu'elle ne visait pas, **LS-168**, parce qu'il
empêchait de prouver son propre travail.

## Un arbitrage demandé avant de coder

Deux des cinq états vides sont **inatteignables en bout en bout**. « Aucune
catégorie » s'affiche quand la table entière est vide, ce que la fixture ne peut
pas produire puisqu'elle en insère toujours une, et vider la table en cours de
suite ferait voir cet état aux travailleurs voisins, la base étant partagée.

`jsdom` et `@testing-library/react` étaient installés depuis longtemps sans
qu'aucun projet Vitest ne les utilise. **Arbitrage de Christophe : un troisième
projet `composant`.** Il rend le composant réel, celui que la page monte, et lui
passe la seule entrée dont l'état dépend.

C'est le premier écran que verra l'exploitante sur une boutique qui démarre, et
rien ne le protégeait.

## Ce que la story a livré

**Cinq états vides rendus et assertés**, trois en bout en bout et deux en test de
composant, chacun avec son cas négatif. Un second produit de contrôle,
`PRODUIT_VIDE`, vide de toute variante, photo et section, rend intentionnels
trois états qui n'étaient atteints que par accident.

**Le premier clic sur un bouton d'administration de toute la suite.** Aucun test
n'en cliquait aucun : ni l'état pending, ni le double clic sur une Server Action,
ni le message de refus n'étaient exercés. Publier la fiche vide produit
maintenant le refus serveur, avec ses quatre motifs concaténés, le texte le plus
long de l'éditeur et le meilleur candidat au débordement.

**Le panneau d'archivage est ouvert, mesuré, fermé par Échap et passé à
`AxeBuilder`.** Il portait `role="alertdialog"`, `aria-labelledby`,
`aria-describedby`, `tabIndex={-1}` et une gestion d'`Escape` depuis LS-103, sans
qu'aucun test ne les vérifie. Aucune violation.

**Les deux écrans protégés manquants sont rendus avec session.** Le critère les
disait absents de la liste ; vérification faite, `journal-connexions.spec.ts`
existe depuis, mais ne couvre que le **refus** sans session. L'écart est signalé
plutôt que résolu en silence.

**L'état de succès a été ajouté après la revue**, qui a relevé que le seul clic
livré était un clic refusé. `frontend-design.md` interdit le faux succès
optimiste, et rien ne gardait ce non-optimisme.

## LS-168 corrigée en chemin, arbitrage de Christophe

Le plafond d'authentification a bloqué la préparation une dizaine de fois pendant
cette session, et rendait la preuve par mutation impossible : le script enchaîne
plusieurs passes Playwright, chacune rejouant la préparation.

**La cause tenait en une ligne.** `session-cliente.setup.ts` s'inscrivait à
chaque exécution avec une adresse horodatée, et `/sign-up/email` est plafonné à
**trois appels par minute** : trois exécutions rapprochées suffisaient à bloquer
la suite entière. Le commentaire du fichier affirmait « l'inscription a lieu une
fois », ce qui valait pour une exécution, jamais entre deux.

`session-administration.setup.ts` avait résolu le même problème en LS-111, avec
un compte à adresse fixe et trois paliers : réutiliser l'état, sinon se
connecter, sinon s'inscrire. La fixture cliente reprend ce motif.

**Vérifié avant de figer l'adresse** : aucun test ne détruit ce compte.
`compte-suppression-connecte.spec.ts` mesure le **refus** de suppression faute de
preuve d'identité, et assertit explicitement que le compte est toujours là.

**Mesure : trois exécutions d'affilée sans aucun 429**, là où trois suffisaient à
bloquer.

### Un test qui échouait sur `main` a disparu avec

`navigation-administration`, « les rubriques à venir sont annoncées sans être
cliquables », échouait sur `main` avant cette story. J'avais conclu à une
régression de rubrique laissée par LS-185. C'était faux : l'échec venait du
plafond, et la correction de la fixture l'a fermé.

**Un second effet a demandé une correction de plus.** Le test de mot de passe
faux provoque une vérification ratée, comptée par le compteur global par IP de
Better Auth. Rejoué aux trois largeurs, il en consomme trois : ajoutées à la
connexion de la préparation, cela suffisait à faire basculer le compteur lors de
la toute première exécution sur base vierge, celle de la CI. Il est limité à
320 px, la largeur contraignante.

## Ce que la revue d'interface a trouvé

`ls-frontend-revue` a relevé sept points, dont trois retenus et traités.

**Deux états vides n'avaient ni cas négatif ni mutation.** La fixture pose
désormais une section sur la fiche de contrôle, ce qui rend le cas négatif des
sections mesurable : avant, aucune fiche du dépôt n'en portait. Celui des photos
reste non couvert, poser une photo demandant un fichier traité sur disque.

**Ma justification écrite était bancale.** Le commentaire affirmait que « d'autres
tests mesurent le compte de l'écran Catégories » : ils le mesurent en
**intégration**, sur base éphémère, donc hors de portée de cette fixture. Corrigé,
avec ce que le second produit change réellement.

**L'état de succès n'était couvert nulle part**, traité ci-dessus.

## Six mutations prouvées, deux écrites et désactivées

Six cas sur huit rougissent **par le test attendu**, et pas seulement « la suite
rougit ».

**Les deux derniers ne sont pas prouvés, et c'est écrit dans le script plutôt que
tu.** Ils mutent la condition d'un état vide vers « toujours affiché », et le test
négatif ne rougit pas alors que la mutation **est** compilée : vérifié en
construisant à la main, la condition disparaît des deux bundles, serveur et
client, et le texte de l'état vide y est présent.

Écarté au fil du diagnostic : le plafond de débit, corrigé par ailleurs ; un
serveur résiduel, aucun processus n'écoutant le port ; un découpage fautif de
l'argument `-g`, qui était un défaut réel du script et a été corrigé ; une cible
de mutation inexistante, la substitution modifiant bien le fichier.

**La cause n'est pas isolée.** Les activer ferait échouer le script en
permanence, ce qui le rendrait ignoré ; les supprimer effacerait la question. Ils
restent derrière une variable d'environnement, avec leur diagnostic complet.

Ce qui reste prouvé sur ces deux états : leur **présence**, par le cas 4 qui
rougit bien quand le texte change. C'est leur **absence** sur une fiche qui n'en
a pas besoin qui n'est pas prouvée.

## Une erreur de méthode de ma part

J'ai affirmé deux fois qu'une mesure prouvait le contraire de ce qu'elle
prouvait. La première, une substitution Perl qui ne modifiait rien, faute d'un
motif correspondant au code réel : le `diff` était vide et je ne l'ai pas lu. La
seconde, une mesure faite avant que la fixture ne pose la section, donc sur un
état différent de celui du script.

Les deux fois, la correction est venue de relire la sortie plutôt que de la
supposer.

## Vérification

| Contrôle | Résultat |
| --- | --- |
| `type-check`, `lint`, `format:check` | verts |
| `vitest run`, les trois projets | **1236 verts**, 82 fichiers |
| `playwright test`, suite entière, état de session vierge | **1061 verts**, aucun échec |
| Les 24 contrôles textuels | verts |
| `verifier-etats-non-nominaux-mutation.sh` | **6 sur 6**, chacune par le test attendu |
| Trois exécutions e2e d'affilée | aucun 429, contre un blocage à la troisième avant |

## État des tickets

**LS-113 est TERMINÉE**, six critères sur six.

**LS-168 est traitée à sa source** par cette story, sans être fermée : elle porte
d'autres instabilités de la suite. Son commentaire dira ce qui reste.

## Ce qui reste, et qui n'est pas de cette story

**L'état vide « aucune photo » n'a ni cas négatif ni mutation.** Poser une photo
demande un fichier traité sur disque, ce qui dépasse le périmètre.

**Quatre écrans gardent un état vide non couvert** : commandes, messages,
rétractations et clients. La story visait le catalogue, et le titre du ticket
disait « les écrans d'administration » sans restreindre.

**Les deux cas de mutation désactivés**, dont la cause reste à isoler.

## Prochaine étape

**LS-166**, la largeur 768 px, dont LS-191 a posé le motif sur un seul écran.
Ensuite **LS-194**, le lien d'évitement absent des seize écrans d'administration,
WCAG 2.4.1 niveau A.
