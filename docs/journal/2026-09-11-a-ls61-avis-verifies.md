# 11 septembre 2026, a : LS-61, les avis vérifiés

Débloquée par `livreA`, que LS-131 renseigne depuis le suivi Sendcloud. Une
story de domaine complet : une tâche, un parcours public, un écran
d'administration, un affichage, et une obligation légale qui n'était pas remplie.

## Ce que la base a refusé, et elle avait raison

Mon premier jet partageait **un seul jeton** entre les trois invitations d'une
commande à trois pièces. La base l'a refusé sur `InvitationAvis.jetonAccesId`,
qui est `UNIQUE`, et la justification de la règle R20 disait déjà pourquoi :
« sinon la résolution du jeton vers sa ligne de commande serait ambiguë ».

Un jeton par ligne, donc. Le lien de l'email ne porte que le premier, ce qui
suffit : `JetonAcces.commandeId` désigne une **commande**, donc n'importe lequel
des trois ouvre l'écran sur les trois pièces.

**Un modèle conceptuel qui porte ses justifications se relit plus vite qu'il ne
se contourne.** J'avais lu la règle R20 sans en tirer la conséquence, et c'est
la contrainte qui me l'a apprise.

## Et l'autre bout m'a contraint en sens inverse

`envoi_en_attente_actif_unique` et `journal_email_systeme_unique` portent toutes
deux sur `(commandeId, modele)`. Trois intentions du même modèle sur la même
commande verraient les deux dernières **avalées en silence** par `deposerEnvoi`,
qui traite `P2002` comme un doublon normal.

Le client recevrait une invitation sur trois, et **rien ne rougirait**. Un test
fixe l'invariant dans l'autre sens : une commande à trois pièces produit trois
invitations et **une** intention d'envoi.

Le schéma impose donc les deux à la fois : le droit de déposer est par ligne,
l'envoi est par commande.

## Le délai de publication n'était tranché nulle part

L'article D111-10 2° impose d'annoncer le délai maximum de publication d'un avis
dans une rubrique accessible. ADR-028 tranchait la **conservation**, sans limite,
et `legal.md` écrivait en toutes lettres que le délai de publication « reste un
paramètre commercial à fixer ».

**Sept jours**, arbitré. Plutôt que deux : l'exploitante relève ses avis entre
deux marchés, et un délai qu'un week-end chargé ferait dépasser vaut moins qu'un
délai tenu. Ne pas tenir le délai annoncé est un manquement, pas une négligence
commerciale.

La valeur vit dans **une seule constante**, `DELAI_PUBLICATION_JOURS`, qui
alimente la rubrique légale, l'email d'invitation et l'écran de dépôt. Trois
valeurs recopiées divergent au premier changement, et c'est l'annonce publique
qui deviendrait fausse.

**Les deux obligations de l'article sont cumulatives.** Le 1° vit près de chaque
avis, sur la fiche produit : procédure de contrôle, date de publication, date de
l'expérience, critère de classement. Le 2° dans la rubrique dédiée. Porter l'une
ne dispense pas de l'autre.

## La revue frontend, cinq défauts

Le plus sérieux : **après une décision de modération, le focus retombait sur
`body`**. C'est le cas nominal et non un cas limite, le succès étant précisément
ce qui fait disparaître le bouton cliqué. Au clavier, la décision ne produisait
ni accusé de succès ni point de focus. Le patron `isConnected` de LS-103 est
repris, et l'accusé ajouté.

Une classe CSS nommée `.entreeNote` servait **trois** choses sans rapport, dont
une région live et un complément de nom accessible. Renommée d'après son rôle.

Deux défauts de coupure : `white-space: pre-wrap` garde les sauts de ligne mais
ne coupe **aucun** mot. Une URL collée dans un avis débordait à 320 px. Le même
fichier portait déjà `overflow-wrap: anywhere` sur quatre blocs de texte
variable, avec le commentaire qui dit pourquoi : mes classes en avaient recopié
la moitié.

Un accord au féminin sur le lecteur, et le bouton d'envoi désactivé d'emblée
sans qu'aucun texte ne dise quelle condition manque, un bouton désactivé n'étant
pas atteint par la tabulation.

## La revue critique, quatre défauts, et le premier était sur le chemin nominal

**Un client qui notait une pièce sur deux ne pouvait plus jamais noter l'autre.**
Le jeton était consommé au premier dépôt : en revenant, l'écran annonçait « un
avis a déjà été déposé pour cette commande », ce qui était faux pour la seconde
pièce, et celle-ci devenait **définitivement** innotable, aucun autre chemin
d'écriture n'existant. Le jeton de cette ligne existait pourtant, valide
quatre-vingt-dix jours, mais sa valeur n'avait jamais circulé.

Mon commentaire annonçait ce cas comme « peu fréquent ». Il était pire : le
retour n'était pas seulement fermé **par ce lien**, il l'était tout court.

Le jeton n'est désormais consommé que si **toutes** les pièces sont notées. Ce
qui protège du rejeu n'est plus lui mais l'unicité `ligneCommandeId`, déjà en
place et déjà éprouvée. C'est aussi ce qui donne enfin un usage aux jetons des
autres lignes que la règle R20 impose de créer.

**Une ligne répétée dans un envoi faisait perdre les avis sincères du même
envoi.** `P2002` levé dans la transaction l'annulait en entier : trois saisies,
deux légitimes, zéro avis écrit, et le client lisait « avis déjà déposé » sur un
avis qui n'existait pas. Les lignes sont dédupliquées, la première l'emportant.

**Une republication effaçait le motif du retrait précédent.** `motifDecision`
était écrit inconditionnellement, et une publication n'a légitimement aucun motif
à porter : la seule trace de la raison du retrait partait avec. L'asymétrie avec
`publieA`, protégé par sa clause, était le piège, motif « règle à deux versants ».

**Un rattrapage de ligne renvoyait une seconde sollicitation.**
`envoi_en_attente_actif_unique` ne couvre que `EN_ATTENTE` et `ENVOI_EN_COURS` :
une première invitation déjà passée à `ENVOYE` ne bloque plus rien.

## Ce que les cinq premières mutations ne pouvaient pas voir

Elles s'exerçaient **toutes** sur des commandes à une seule ligne, où
`retenues.length` vaut toujours le nombre total de pièces. Les quatre défauts
ci-dessus vivent exactement dans l'écart entre « une pièce » et « plusieurs », et
seraient restés verts sous n'importe laquelle.

Le fichier de tests portait bien `commanderEtPayer(3)`, mais uniquement pour
compter les intentions d'email, jamais pour un dépôt partiel.

**Un helper de test était fragile pour la même raison.** Il prenait le jeton par
`ORDER BY expire_a DESC LIMIT 1` : sur une commande multi-lignes, les jetons
naissent dans la même transaction à la milliseconde près, donc l'ordre est
indéterminé et l'assertion pouvait porter sur un autre jeton que celui du lien.
Il sélectionne désormais par empreinte.

## Deux contrôles ont attrapé mes propres oublis

`verifier-regles.sh` a refusé un appel de modèle Prisma depuis le service : la
requête appartient à `repositories/`. `verifier-propagation-docs.sh` a vu que mes
trois schémas Zod manquaient à `VALIDATION.md`.

Et le test de navigation d'administration a rougi parce que « Avis » restait dans
`RUBRIQUES_A_VENIR` tout en devenant un lien : il lit les entrées **réellement
rendues** sous « Bientôt disponible » plutôt que de recopier une liste.
Quatrième entrée à quitter cette liste sans que le test soit touché.

## Ce que cette story ne livre pas, et qui n'est pas un oubli

Quatre choses du parcours 7, écrites dans `PARCOURS.md` plutôt que laissées à
découvrir :

| Ce qui manque | Pourquoi |
|---|---|
| la **réponse publique** de l'exploitante | l'usage n'est pas décidé, commentaire Jira du 3 septembre qui demande de ne pas construire l'écran. La fiche produit **rend** la réponse si elle existe, aucun chemin n'en crée |
| le **renvoi** d'une invitation | aucun écran ne le porte. La révocation existe, et l'écran distingue déjà un lien remplacé d'un avis déposé |
| la **modification** d'un avis par son auteur | elle suppose un espace où l'auteur retrouve son avis |
| l'**alerte** de délai dépassé | la pastille de la barre rend le retard visible à chaque connexion |

**Conséquence à dire : une invitation part une fois et une seule.** Un client qui
perd son email ne peut pas en redemander un aujourd'hui. Cela se paie en avis non
déposés, jamais en droit perdu.

## Vérifications

```
npm run type-check                     vert
npm run lint                           vert
npm run format:check                   vert
npm run test                           91 fichiers, 1455 tests
vitest avis (intégration)              28 tests
playwright pages-erreur mobile-320     16 tests
playwright administration-connectee    4 tests sur l'écran Avis
playwright navigation-administration   30 tests
verifier-regles.sh                     règles conformes au schéma
verifier-contraste.sh                  toutes paires conformes
verifier-bordure-controle.sh           seuil 3:1 tenu
verifier-propagation-docs.sh           24 schémas, tous présents
verifier-registre-traitements.sh       36 tables rangées
verifier-taches-planifiees.sh          7 tâches, les deux listes concordent
verifier-loading-et-404.sh             conforme
verifier-lien-evitement.sh             conforme
verifier-actions-sensibles.sh          cohérentes
verifier-revalidation-layout.sh        conforme
verifier-description-accessible.sh     conforme
mutations LS-61                        9 cas
```

## État des tickets

**LS-61 développée**, epic LS-36. Les sept critères d'acceptation sont remplis :
invitation après livraison constatée, dépôt transactionnel, révocation
distinguée, mentions légales vérifiées aux sources, idempotence, rendu à 320 px.

Le critère 3, « un renvoi révoque l'ancien jeton », est **tenu par le code mais
non exerçable** : aucun écran de renvoi n'existe, et le test correspondant
vérifie la révocation directement en base. Il est signalé plutôt que déclaré fait.

## Prochaine étape

**LS-77**, le signalement d'un avis, article L111-7-2 : Must sur Go-Live, et sans
objet tant que les avis n'existaient pas. Ou **LS-190**, la frise d'étapes.
