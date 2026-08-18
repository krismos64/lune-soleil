# 18 août 2026, LS-106, le stock multicanal

Cinquième session du 18 août, après LS-111, LS-112, LS-104 et LS-105. Elle ferme
la tranche verticale de l'epic LS-3 : « l'administration suspend la vente web
puis enregistre une vente externe, le stock physique décrémente et le mouvement
est historisé ».

C'est la huitième et dernière story du **découpage** de LS-3, celui de LS-99 à
LS-106. L'epic lui-même porte davantage : quatre autres stories y sont
rattachées, dont deux que ce découpage n'a jamais mentionnées.

## L'arbitrage que l'écriture des tests a révélé

En écrivant le test « refuse de compenser deux fois », j'ai buté sur un trou du
modèle. La règle S14 impose de corriger une vente externe par un mouvement
inverse, jamais par une modification, mais elle est **muette sur la répétition**
de cette correction.

Rien ne reliait un compensateur à son origine : le lien n'existait que dans le
texte libre du `motif`, illisible pour toute requête et toute contrainte. Un
double clic faisait donc remonter le stock de deux pièces là où une seule était
partie, et le journal portait deux corrections en apparence légitimes.

**ADR-030 et règle S15** : une colonne `compenseId` et un index unique partiel.
La garantie vient de la base, pas du service : deux corrections simultanées ne
peuvent pas passer toutes les deux, là où un contrôle applicatif les laisserait
passer entre son `SELECT` et son `INSERT`.

## Le prédicat que je croyais indispensable

J'avais écrit dans l'ADR que le prédicat `WHERE compense_id IS NOT NULL` était
indispensable, et créé un contrôle censé le prouver.

**La mutation a montré que c'était faux.** En le retirant, aucun contrôle n'a
rougi. PostgreSQL traite les `NULL` comme distincts dans un index unique : un
index sans `WHERE` rejette exactement les mêmes lignes. Le prédicat n'apporte
aucune garantie fonctionnelle ici, seulement le fait de ne pas indexer
inutilement un journal qui ne fait que croître.

Les trois endroits qui portaient l'affirmation fausse sont rectifiés, et le
contrôle renommé pour dire ce qu'il vérifie vraiment. La leçon dépasse ce cas :
**savoir ce qu'un prédicat garantit avant d'écrire un contrôle qui prétend le
vérifier**.

## Le journal d'audit existait depuis LS-13, jamais alimenté

Le parcours 2 exige une « entrée au journal d'audit » à la suspension de la vente
web. Le modèle `JournalAudit` est au schéma depuis LS-13, et **aucune story ne
l'avait jamais écrit**.

Deux tests se lisent ensemble sur ce point : le premier prouve qu'aucune quantité
ne bouge à la bascule, invariant 6 ; le second qu'une trace est tout de même
écrite. Sans le second, « aucun mouvement de stock » se satisferait d'une bascule
qui ne laisse rien du tout.

## Trois défauts trouvés par la revue critique

La revue `ls-critical-reviewer` est morte **quatre fois** sur des erreurs réseau,
sans jamais rendre de rapport complet. Elle a néanmoins livré deux trouvailles
avant de tomber, toutes deux justes.

**Une réservation expirée faisait accuser le stock.** `quantiteReservee` ne
redescend qu'à la libération, tâche planifiée de LS-72 qui n'existe pas encore :
entre l'expiration et le prochain cycle, la pièce reste comptée. L'UPDATE
conditionnel la refusait à juste titre, mais le diagnostic comptait les seules
lignes `expire_a > now()` et rendait zéro, concluant « stock insuffisant ».
L'exploitante aurait cherché du côté du réassort un blocage qui se résout au
cycle suivant. Le diagnostic lit désormais la **même grandeur** que la décision.

**La garde de type ne vivait que dans le composant.** `corrigerMouvement`
acceptait n'importe quel `mouvementId` : seule l'interface limitait le bouton aux
ventes externes. Sur une vente web, cela produisait un `RETOUR` incrémentant le
stock physique sans toucher la commande, la facture ni le paiement : une pièce
vendue en ligne et expédiée serait remise en vente. C'est le motif exact de
LS-89, une Server Action s'invoquant sans passer par l'écran.

**La double vente externe**, mesurée en vérifiant un point que j'allais lui
soumettre : deux ventes identiques passaient toutes les deux, le stock descendant
de 5 à 3. Arbitrage de Christophe, garde côté écran seulement : vendre deux
pièces d'affilée sur un stand est légitime, et une clé d'idempotence
compliquerait le modèle pour un cas que l'écran couvre. `disabled` seul ne
suffisait pas, un bouton grisé sans libellé changeant passant inaperçu.

## Deux défauts du rendu, invisibles à la mesure de débordement

**« Disponible » retombait seule** sous les deux autres quantités à 320 px, alors
que c'est le chiffre qui décide de la vente : sa séparation visuelle suggérait
qu'elle n'appartenait pas au même groupe. Une grille de trois colonnes égales les
fait tenir.

**« Vendre sur un marché » était proposé sur une pièce à zéro disponible**, ce
qui menait à un refus certain. Le bouton est désactivé et son libellé distingue
les deux causes, qui n'appellent pas le même geste : un stock nul se résout par
un réassort, une réservation active par un contrôle du paiement.

## Un contrôle du dépôt qui criait sur du texte juste

En documentant S15, `verifier-regles.sh` a rougi : il réclamait `VENTE_WEB` à mon
bloc sur la compensation, dont le prédicat n'a rien à voir.

`mouvement_stock` est la **première table du projet à porter deux index
partiels**, et le contrôle, écrit quand chaque table n'en avait qu'un, les
confondait par son ancrage sur le nom de table.

Deux choses valent d'être retenues de la correction. **Ma première version
ouvrait un trou** : ignorer tout bloc citant un autre index rendait le contrôle
aveugle dès qu'un prédicat périmé citait le mauvais nom. Il fallait deux
conditions, pas une.

Et **ma première mutation était indétectable par construction**. Je mutais le
prédicat de la compensation en `type = 'VENTE_WEB'`, ce que ce contrôle ne peut
pas distinguer : il vérifie que les valeurs attendues sont citées, et `VENTE_WEB`
est justement celle qu'il attend pour l'autre index. Une mutation qui ne peut pas
être détectée n'accuse pas le contrôle, elle accuse son auteur.

## Chiffres

**510** tests unitaires et d'intégration, dont 15 neufs sur le stock multicanal.
**250** de bout en bout, contre 231 avant cette story, dont 20 sur cet écran.
**109** contrôles de schéma, dont trois neufs sur S15. **13** cas de mutation du
contrôle des règles, tous détectés.

Quatre mutations exercées sur le code de la story :

| Mutation | Ce qui rougit |
|---|---|
| un mouvement créé à la suspension | les 2 tests d'invariant 6, exigé par le critère 11 |
| garde `quantite_physique - quantite_reservee` retirée | le test de réservation active, et lui seul |
| garde de type `VENTE_EXTERNE` retirée | le test de compensation d'une vente web |
| règle CSS d'alignement retirée | le test à 320 px, « Expected: 1, Received: 2 » |

## Ce qui reste ouvert

**LS-72**, la libération des réservations expirées, n'est pas implémentée. Tant
qu'elle ne l'est pas, `quantiteReservee` ne redescend jamais : une réservation
expirée bloque la vente externe jusqu'au prochain cycle, qui n'arrive pas. Le
diagnostic le dit correctement depuis cette story, mais le blocage demeure.

**LS-63**, le montant encaissé d'une vente externe, est de fait couvert : le prix
figé est saisi, validé et historisé. Le ticket reste ouvert, sa clôture demandant
de vérifier ses propres critères.

**La revue critique n'a pas rendu de rapport complet**, morte quatre fois sur des
erreurs réseau. Deux points sur quatre ont eu son regard. J'ai vérifié le
troisième moi-même, les `return` dans les transactions, en relisant chaque refus :
tous sortent avant écriture. Le quatrième, « tout autre défaut », reste sans
relecture externe.

**Un test intermittent**, observé une fois sur trois exécutions de la suite
complète, sans que j'aie pu l'identifier : la relance suivante était verte, et le
message d'échec n'apparaissait plus. À surveiller.

## État des tickets

LS-106 **En cours** au moment d'écrire, en attente de la PR et de la fusion.

**LS-3 n'est pas fermée pour autant**, et l'affirmer aurait été faux. Le
découpage LS-99 à LS-106 est complet, mais l'epic porte quatre stories de plus,
toutes « À faire » au 18 août 2026. Vérifié dans Jira plutôt que déduit du
découpage, qui ne les mentionne pas.

| Ticket | Sujet | État réel du travail |
|---|---|---|
| LS-63 | montant encaissé d'une vente externe | **de fait couvert** par LS-106 : prix figé saisi, validé, historisé. Le ticket porte dix critères à confronter un par un |
| LS-84 | contraste du terracotta en petit texte | **de fait traité** en LS-104, jeton `--ls-accent-terracotta-deep` créé et ADR-022 amendé |
| LS-85 | régions live et noms accessibles | **partiellement** : régions live en LS-104, vignettes nommées en LS-105. Reste la vérification au lecteur d'écran sur un parcours complet |
| LS-87 | quatre sections et non cinq | **de fait résolu** en LS-100, `SECTIONS_PAR_DEFAUT` en porte quatre |

Trois de ces quatre tickets décrivent donc un travail déjà fait, sans que leur
statut le dise. Les clore demande de confronter leurs critères un par un, ce que
cette session n'a pas fait : les laisser ouverts est moins trompeur que les
fermer sans vérifier.

## Prochaine étape

Deux chemins possibles, à arbitrer.

**Clore ce qui est déjà fait** : reprendre LS-63, LS-84, LS-85 et LS-87 critère
par critère, et fermer ce qui l'est réellement. C'est peu de code et beaucoup de
vérification, mais cela remet Jira en accord avec le dépôt.

**Ouvrir la phase 3**, epic LS-4, qui porte le panier et la réservation. C'est là
que le bouton d'ajout au panier de LS-105 retrouvera son état actif, et que la
libération des réservations expirées de LS-72, dont cette story a montré
l'absence, devra être posée.
