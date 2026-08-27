# 27 août 2026, l'événement signé confirme le paiement

**LS-119**, étape 7 du parcours 1, la story la plus critique de la phase. La
commande passe `CONFIRMEE`, la réservation devient un mouvement de stock, et
l'idempotence tient sur l'effet plutôt que sur l'identifiant d'événement.

## Les deux arbitrages du cadrage

Les quinze questions de zone critique ont laissé deux points ouverts, tranchés
par Christophe avant la première ligne de code.

**Les remboursements sont traités**, partiel et total, et non simplement
persistés en attendant la phase 4. Le paiement passe `PARTIELLEMENT_REMBOURSE`
ou `REMBOURSE` selon le montant, sans jamais toucher au statut logistique : un
colis parti reste `EXPEDIEE`. Le critère 9 est donc rempli tel qu'écrit. L'avoir
et l'email restent en phase 4, la facturation n'existant pas encore.

**Un paiement arrivant sur une pièce repartie au catalogue confirme la commande
et alerte.** Refuser laisserait de l'argent encaissé sans commande. Une
contrainte a décidé de la forme exacte : `chk_variante_physique_positif` interdit
de descendre sous zéro, donc le stock plancher à zéro et l'`AlerteCritique` porte
l'écart. Faire échouer la transaction aurait fait rejouer l'événement
indéfiniment sur un état qui ne se résout jamais seul.

## Ce que Context7 a confirmé

✅ Via Context7, stripe-node : **`constructEventAsync` et non `constructEvent`**.
La forme synchrone lève `CryptoProviderOnlySupportsAsync` dès que le fournisseur
de chiffrement est celui de Web Crypto, ce que l'exécution Next.js peut employer.
L'asynchrone fonctionne dans les deux cas, elle est donc la seule sûre.

Le corps doit être le **corps brut**, la signature portant sur les octets exacts,
et la vérification échoue avec un message explicite si un objet déjà décodé lui
est passé.

## Une violation d'unicité avorte la transaction entière

C'est la découverte technique de la journée, et elle a invalidé ma première
conception. J'avais écrit la boucle des mouvements sur le motif de
`catalogue.ts` : tenter l'écriture, rattraper `P2002`, continuer. Ce motif
fonctionne hors transaction. Dedans, **PostgreSQL avorte toute la transaction**,
code `25P02`, et l'instruction suivante échoue par « current transaction is
aborted » sans aucun rapport avec elle.

Le défaut ne s'est pas vu au test nominal : c'est la mutation qui l'a fait
apparaître, en échouant sur `supprimerReservations` deux instructions plus loin.
La correction lit avant d'écrire, et la contrainte reste la **seconde ligne de
défense** pour la concurrence entre lecture et écriture, où l'échec de la
transaction est alors le bon comportement puisque le prestataire rejouera.

## Trois tests qui ne prouvaient pas ce qu'ils annonçaient

Les douze premiers tests sont passés du premier coup. Les mutations ont montré
que trois d'entre eux étaient aveugles, chacun pour une raison différente.

**Le test de l'événement tardif n'exerçait pas la clé du mouvement.** Quand la
réconciliation a tout écrit, c'est la clé du **paiement** qui arrête l'événement,
et le service sort avant d'atteindre la boucle des mouvements. Neutraliser la
garde du mouvement laissait donc le test vert. Un second test part d'une
régularisation **incomplète**, mouvement écrit sans paiement encaissé, seul état
par lequel cette clé s'exerce.

**Le test négatif de signature aurait rougi pour la mauvaise raison.** Les corps
de test n'étaient pas du JSON exploitable : la mutation remplaçant la
vérification par un décodage faisait rougir toute la suite sur des erreurs de
décodage, sans rien dire de la signature. Tous les corps portent désormais un
événement complet, et seul le test négatif change de comportement.

**Le test du corps brut était invisible sur une charge compacte.** Un
`JSON.stringify` nu produit déjà la forme canonique : l'aller-retour
`parse`/`stringify` redonne la même chaîne à l'octet près. Stripe envoie du JSON
**indenté**, où l'aller-retour détruit la signature. La charge de test est donc
indentée.

## Une garde qui n'était pas la seule ligne de défense

Retirer la garde sur `STRIPE_WEBHOOK_SECRET` absente ne changeait ni le statut,
ni l'absence d'effet : le SDK rejette de toute façon un secret vide. Ce que cette
garde seule apporte est **le journal nommant la variable manquante**. Sans lui,
une variable oubliée au déploiement serait indistinguable d'une charge
falsifiée, et l'exploitation chercherait une attaque devant une erreur de
configuration. C'est donc sur cette ligne que l'assertion porte, même motif que
la clé absente de LS-118.

Au passage, le journal écrit sur `process.stderr` et non sur `console.error` :
intercepter la console ne voyait rien passer, et l'assertion était vide en
croyant prouver quelque chose.

## Un test de LS-118 instable, corrigé

Le garde-fou d'état de référence de `verifier-tests-mutation.sh` a refusé de
démarrer : la suite d'intégration n'était pas verte avant mutation. Le test de
concurrence de LS-118 échouait **deux fois sur trois** en exécution isolée, tout
en passant dans la suite complète.

Défaut du test et non du code. Il exigeait que la session expirée soit nommément
`cs_test_1_…`, alors que le rattrapage d'ADR-032 est porté par le **dernier à
rattacher** : selon l'entrelacement, c'est la première ou la seconde session qui
est fermée. L'assertion porte désormais l'invariant, exactement une expiration
sur l'une des deux sessions, et reste voyante sous la mutation du cas 98,
vérifié.

## Preuves

```
type-check       au vert
lint             au vert
format:check     au vert
build            au vert, /api/webhooks/paiement en dynamique
test             43 fichiers, 705 tests
verifier-regles.sh                 règles conformes au schéma
verifier-propagation-docs.sh       socle Zod et son document accordés
verifier-registre-traitements.sh   33 tables rangées
verifier-tests-non-ignores.sh      toute la suite s'exécute
```

**Sept mutations, sept détectées par le test attendu**, jouées par le script du
projet, cas 101 à 107. Le script complet dure une trentaine de minutes et reste
réservé aux portes de sortie de phase.

| Mutation | Test qui rougit |
|---|---|
| vérification de signature remplacée par un décodage | aucun effet quand la signature est invalide |
| garde du mouvement de vente web neutralisée | le stock ne sort pas deux fois sans paiement encaissé |
| prédicat d'encaissement raccourci au seul `REUSSI` | paiement `REMBOURSE` sur remboursement total |
| double encaissement confondu avec un rejeu bénin | alerte sur une seconde session payée |
| plancher à zéro retiré de la sortie de stock | confirmation et alerte sur stock épuisé |
| corps du webhook re-sérialisé | confirmation sur un événement réellement signé |
| absence de secret non journalisée | aucun effet quand le secret est absent |

## Ce que la story ne fait pas

**Le critère 5 n'est rempli qu'à moitié, et il faut le dire.** Il demande que
chacune des quatre clés d'unicité soit exercée par un test. **Deux le sont** :
`paiement_reussi_unique` par le test du double encaissement,
`mouvement_vente_web_unique` par celui du mouvement déjà sorti. Les deux autres,
`facture (commande_id)` et `journal_email_systeme_unique`, existent en base mais
**rien dans le dépôt n'écrit encore ni facture ni email** : la facturation est en
phase 4 et l'envoi réel est LS-82. Aucun test ne peut donc les exercer
aujourd'hui sans inventer un émetteur factice, ce qui prouverait le test et non
le code. Vérifié plutôt que supposé, le compte annoncé d'abord était faux.

Ces deux clés se prouveront avec la story qui écrira l'effet correspondant, et
c'est noté au ticket.

La vérification contre l'API réelle attend le compte, **LS-18** : le code est
écrit sur la documentation vérifiée, les tests passent par le double, et le test
de route emploie une signature authentique engendrée par le SDK.

## État des tickets

| Ticket | État |
|---|---|
| LS-119 | à clore selon la revue en cours, commits `6e8c56c` et `824d701` |
| LS-18 | bloqueur inchangé |

## Prochaine étape

**LS-120**, libération des réservations expirées et réconciliation des commandes
en attente. Les deux tâches planifiées sont déjà en place et vides ; la
réconciliation appellera `traiterEvenementPaiement` avec l'origine
`RECONCILIATION`, second chemin d'entrée que cette story a déjà prévu et testé.
