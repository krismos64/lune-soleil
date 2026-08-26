# 26 août 2026, la session de paiement

**LS-118**, étapes 5 et 6 du parcours 1. La commande part désormais au paiement,
et la page de confirmation dit l'état réel plutôt qu'un texte d'attente.

## L'arbitrage pris au cadrage

Les quinze questions de zone critique ont fait apparaître un point qu'ADR-032 ne
tranchait pas. Au **réessai** de paiement, une nouvelle session dure au minimum
30 minutes, borne basse de Stripe, alors que la réservation posée à la commande
peut n'avoir plus que cinq minutes. L'alignement session-réservation, motif
central d'ADR-032, se rompait exactement sur le chemin que le parcours 1 prévoit
explicitement.

**Christophe a tranché pour la prolongation.** À chaque session créée, les
réservations actives sont réalignées sur son `expires_at`, et une réservation
déjà expirée est un refus métier sans aucun appel au prestataire. Le service
calcule **un seul instant** qu'il envoie au prestataire et pose sur les
réservations : l'alignement est une identité, pas une coïncidence de durées.

Ce que la prolongation ne fait pas : ressusciter une réservation expirée, le
`WHERE expire_a > now()` restant la ligne de défense si les deux instructions
croisent la tâche de libération.

## Ce que Context7 a confirmé

✅ Via Context7, stripe-node et la référence API : `sessions.create(params, {
idempotencyKey })`, `sessions.expire(id)` qui n'agit que sur une session `open`
et rend une erreur sinon, `expires_at` en secondes Unix. Cela recoupe les trois
faits qu'ADR-032 avait établis le 25 août.

Un point que la documentation a précisé : une session sans `url` existe pour les
modes intégrés, que ce projet n'emploie pas. Elle est traitée en indisponibilité
plutôt que propagée en `null`.

## Le prestataire absent est un état, pas une panne

`STRIPE_SECRET_KEY` n'existe pas, LS-18 attend le compte bancaire. La première
version levait une erreur franche sur son absence ; c'était faux pour ce projet.
Sans clé, le paiement est **indisponible** et non en panne serveur : le site se
déploie, la commande s'enregistre, l'écran propose le réessai et la réservation
expire proprement. Le journal nomme la variable absente, son nom seulement, sans
quoi une clé oubliée après LS-18 serait indistinguable d'une panne réelle.

C'est le même motif que `integrations/email` pour ADR-008, et il rend la suite
e2e utile : elle exerce le cas d'erreur du parcours 1 sur l'état réel du système,
pas sur une simulation.

## Deux points de conception qui ne se voient pas dans le résultat

**Le paiement encaissé se vérifie en plus du statut de commande.** Entre
l'événement signé et la mise à jour du statut existe une fenêtre où la commande
est encore `EN_ATTENTE_PAIEMENT` avec un paiement `REUSSI` : créer une session
là, c'est offrir le double encaissement qu'ADR-032 prévient. Le prédicat porte
les **trois** états d'encaissement, jamais le seul `REUSSI`, piège de LS-45.

**Une panne réseau sur l'expiration arrête la création.** `DEJA_FERMEE` n'est pas
une panne et laisse continuer, ADR-032 le dit ; une indisponibilité, si. Créer
une session sans savoir si la précédente est encore payable rouvre exactement le
trou que la prévention ferme.

## Preuves

```
type-check          au vert
lint                au vert
format:check        au vert
build               au vert, /commande/confirmation en dynamique
test                41 fichiers, 688 tests
test:e2e            335 passés, 4 ignorés, code de sortie 0
verifier-regles.sh                 règles conformes au schéma
verifier-propagation-docs.sh       14 schémas, tous documentés
verifier-registre-traitements.sh   33 tables rangées
verifier-tests-non-ignores.sh      toute la suite s'exécute
```

**Cinq mutations, chacune détectée par le test qui porte sa garantie**, jouées
une par une, le script complet étant réservé aux portes de sortie de phase.

| Mutation | Test qui rougit |
|---|---|
| création de session déplacée dans la transaction, critère 9 | panne du prestataire, la commande disparaît |
| garde de réservation rendue existentielle | panier dont une seule pièce est réservée |
| rattrapage des sessions concurrentes neutralisé | deux démarrages concurrents |
| tentative non réservée avant l'appel | session créée et rattachée |
| tentative non retirée après un échec | tentative retirée sur échec |

Les cinq sont versées dans `scripts/verifier-tests-mutation.sh`, cas 96 à 100.
Deux mutations ont été rejetées en route, parce qu'elles ne faisaient rougir
personne : les deux verrous de ligne, ce qui a conduit à les retirer du code.

## La revue critique a trouvé quatre défauts, tous réels

`ls-critical-reviewer` a relu la zone avant clôture. Les quatre défauts étaient
fondés, et tous de la même famille : la prévention d'ADR-032 lisait un état
qu'elle ne tenait pas.

**La garde de réservation était existentielle.** « Au moins une réservation
active » répond vrai sur un panier à deux pièces dont une seule est encore
réservée : le client aurait payé les deux, dont une repartie au catalogue.
L'invariant est universel, et c'est désormais la prolongation elle-même qui sert
de garde, son compte de lignes étant comparé au nombre de lignes de commande.

**Lire puis écrire rouvrait la fenêtre.** Entre la vérification et la
prolongation s'intercalait l'appel réseau d'expiration, jusqu'à vingt secondes.
Une seule instruction dont on lit le compte supprime l'intervalle.

**La tentative s'écrivait après l'appel.** Une écriture perdue laissait la session
orpheline : payable trente minutes, inconnue de la base, donc jamais expirée au
réessai. Elle est maintenant réservée avant, `identifiantFournisseur` nul, puis
complétée, et retirée si la création échoue.

**Deux démarrages simultanés créaient deux sessions payables**, aucune n'ayant
expiré l'autre.

## Le verrou que j'ai posé, puis retiré

Ma première correction du quatrième défaut posait un `SELECT ... FOR UPDATE` sur
la commande. La mutation l'a démenti : **le retirer ne faisait rougir aucun
test**, sur les deux emplacements où je l'avais mis.

Le motif est structurel et vaut d'être retenu. Un verrou pris dans cette
transaction est relâché **avant** l'appel réseau, donc avant que la session
existe : les deux démarrages lisent toujours « aucune session précédente ».
Étendre le verrou jusqu'après l'appel est précisément ce qu'ADR-024 interdit.

La garantie vient donc d'un **rattrapage après création** : une fois sa session
rattachée, un démarrage expire toute autre session encore ouverte de la commande.
Le dernier à rattacher ferme les précédentes. Le verrou est retiré plutôt que
gardé « au cas où » : une protection qu'aucun test n'exerce est une affirmation.

## Le test de concurrence ne prouvait rien non plus

Le premier test des deux onglets passait au vert **avec et sans** correction. Le
double du prestataire rendait instantanément : les deux appels ne
s'entrelaçaient jamais, et la fenêtre à fermer ne s'ouvrait pas. Une latence de
60 ms sur le double, qui représente l'aller-retour réel, rend le test voyant.
C'est la fiche « fenêtre de course dans un test de concurrence », rencontrée à
nouveau.

## Un contrôle mort depuis LS-122

`verifier-tests-mutation.sh` échouait **avant sa première mutation** : il
déclarait `src/app/page.tsx`, que LS-122 avait déplacé dans le groupe
`(boutique)`, et son garde-fou de lisibilité arrêtait tout. Même chose pour
`carte-produit.tsx`. Le script rendait 1 sans avoir rien joué, ce qui ressemble
à une mutation ratée : personne ne l'avait vu. Les deux chemins sont corrigés.

Le script complet dure une trentaine de minutes et ne se lance qu'aux portes de
sortie de phase. Les cinq cas neufs ont donc été prouvés un par un, chacun
détecté par le test qui porte sa garantie.

## Une dérive, et elle vient du test

Trois tests e2e ont échoué au premier passage sur `getByRole("alert")` :
`__next-route-announcer__` de Next.js porte lui aussi ce rôle, le sélecteur était
ambigu. Défaut du test et non du code, corrigé en ciblant le nom accessible.

Le premier lancement les a aussi masqués : la commande était tuyautée vers `tail`,
qui rendait 0 pendant que Playwright échouait. Les lancements suivants écrivent
dans un fichier et affichent le code de sortie.

## État des tickets

| Ticket | État |
|---|---|
| LS-118 | **Terminé**, fusionné sur `main`, `99336e6` et `76b5192` |
| LS-125 | reste ouverte, la page est désormais dynamique, ce qui la rend applicable. Son critère 3 est à retrancher, la page rendant un 200 explicatif et non un 404 |
| LS-18 | bloqueur inchangé, la vérification contre l'API réelle l'attend |

## Prochaine étape

**LS-119**, le webhook signé : idempotence ancrée sur l'effet, confirmation de
commande et mouvement de stock. C'est elle qui porte la **détection** du double
encaissement et son `AlerteCritique`, quand cette story a posé la prévention.
