# 12 septembre 2026, cinq tickets enchaînés, et trois défauts trouvés par les contrôles

Troisième session du jour, en autonomie complète : Christophe absent, consigne
d'enchaîner LS-219 à LS-224 sans interruption et de trancher seul.

## Ce qui est livré

| Ticket | Sujet | État |
|---|---|---|
| LS-224 | preuve par mutation de l'atomicité intention/avoir | **fusionné**, PR #408, **terminé** |
| LS-219 | trois interrupteurs d'alerte branchés | **fusionné**, PR #410, reste En cours |
| LS-221 | écran « Mes avis » de l'espace client | **fusionné**, PR #411, reste En cours |
| LS-222 | gabarit HTML des quinze emails, logo, aperçus | **fusionné**, PR #409 |
| LS-220 | signal nocturne d'écart production contre `main` | **fusionné**, PR #412 |
| LS-223 | clé Backblaze sans `deleteFiles` | **bloqué**, commenté |
| LS-225 | modifier son propre avis, R10 | **créée**, l'obstacle est levé |

187 tickets terminés sur 214 hors epics, relevés dans Jira.

## Quatre questions posées avant le départ, quatre arbitrages rendus

LS-223 écarté de la session, il n'est faisable que dans la console Backblaze.
Logo des emails en **pièce jointe intégrée** `cid:` plutôt qu'en data URI, que
Gmail et Outlook bloquent largement. Alerte de stock **au passage à zéro** plutôt
qu'à un exemplaire restant, sur des pièces souvent uniques. Aperçus en
**fichiers HTML statiques** plutôt qu'en route d'application.

## LS-224, la concurrence ne savait pas mesurer ce défaut

C'est la part la plus instructive de la session.

Le correctif de la veille déplaçait `marquerIntentionAboutie` dans la transaction
de l'avoir. Restait à le prouver par mutation, c'est-à-dire à remettre le défaut
et vérifier qu'un test rougit.

**Quatre tentatives par la concurrence, toutes abandonnées sur mesure :**

```
delai fixe dans le double de fournisseur, test isole   3 rouges sur 5
le meme, dans la suite complete                        0 rouge sur 5
barriere sur le premier appel au prestataire           0 rouge sur 5
attente de aboutie_a renseigne en base                 0 rouge sur 5
```

**La raison, établie par une sonde et non devinée.** Le verrou `FOR UPDATE` de
`reserverIntentionRemboursement` sérialise les demandes **avant** la fenêtre, qui
ne dure que le temps d'un aller vers PostgreSQL. Les trois réservations
concurrentes lisent `enCours` à 0, 2000 puis 4000 : chacune voit la part des
précédentes, et l'emplacement du marquage ne change rien.

Une des versions était aveugle pour une raison **étrangère au sujet** : son
attente ne filtrait pas sur la facture et voyait l'intention d'un test précédent,
la base étant partagée entre fichiers. Un contrôle qui passe pour la mauvaise
raison est le motif que ce dépôt connaît le mieux.

**Ce qui a fonctionné mesure l'atomicité, pas la course.** Si la transaction de
l'avoir échoue, aucune intention ne doit rester marquée aboutie. Sous mutation,
le marquage est commité avant, donc il survit à l'échec : le montant quitte
définitivement le calcul du restant. Cinq rouges sur cinq, sans dépendre d'aucun
ordonnancement.

L'échec est provoqué par la base elle-même, `chk_facture_avoir_borne` saturée
**pendant** l'appel au prestataire. Saturée trop tôt, la borne sous verrou refuse
en amont et le chemin d'échec reste inexploré : mesuré, `appels` vide.

## Un trou trouvé en posant un critère de documentation

Le critère 5 de LS-224 demandait d'écrire la règle dans `payments.md`. En
l'ouvrant : ses `paths` ne couvraient **ni** `services/avoir.ts` **ni**
`repositories/avoir.ts`. La règle du paiement ne se chargeait donc pas quand on
touchait au code du remboursement, alors qu'elle porte l'invariant 5.

## LS-219, le ticket était plus petit qu'il ne disait

Deux affirmations de sa description corrigées par la mesure.

**« Quatre interrupteurs »** : trois. LS-29 a branché `alerteCommandePayee`
entre-temps, et livré le socle `destinataireAlerte` que le ticket décrivait
comme restant à écrire.

**« Stock faible n'a pas de seuil défini »** : il en a un,
`ParametreBoutique.seuilStockFaible`, livré par LS-98 et réglable depuis l'écran
des paramètres. L'écrire en dur aurait rendu ce champ décoratif, c'est-à-dire le
défaut même que ce ticket ferme.

**Une troisième affirmation était fausse** : « commande payée et paiement annulé
sont sur le chemin du webhook Stripe ». Aucun événement d'annulation n'existe,
`TypeEvenementPaiement` ne portant que `PAIEMENT_REUSSI` et `PAIEMENT_REMBOURSE`.
Une commande abandonnée au tunnel n'est annulée que par la réconciliation.

### Le test négatif a trouvé ce que le nominal ne pouvait pas montrer

Les deux lectures de réglages étaient en `Promise.all` **dans une transaction
interactive**, ce qui fait lever `PrismaClientValidationError`. Le `catch`
l'avalait : aucune alerte ne partait, et rien ne disait pourquoi.

```
{"niveau":"error","message":"reglages d'alerte de stock illisibles","erreur":"PrismaClientValidationError"}
```

Seul le test qui **attendait un envoi** l'a vu. Le chemin nominal passait.

### Une régression évitée de justesse

Mon `afterEach` supprimait la ligne de paramètres. La base étant **partagée**
entre fichiers d'intégration, cela faisait rougir quatre tests de deux autres
fichiers, qui lisent les tarifs depuis la base. La ligne d'origine est relevée au
démarrage et restaurée en fin de fichier.

## LS-222, le HTML est dérivé du texte

La décision que le ticket laissait ouverte : **dériver plutôt qu'écrire deux
fois**. Quinze modèles en double font quinze occasions de corriger une version et
pas l'autre, et rien ne le signalerait, le client n'en voyant qu'une.

**Le logo voyage en pièce jointe `cid:`**, donc aucune requête réseau à
l'ouverture : un email ne trace pas sa lecture, ADR-040. Une URL vers un serveur
du projet serait un pixel espion, que la mesure soit voulue ou non.

**Un défaut vu à l'œil, invisible dans le texte.** La confirmation de commande
porte deux liens, facture et rétractation : avec un libellé fixe, un lecteur
d'écran annonce deux fois « Ouvrir le lien » pour deux destinations différentes.
Le libellé est désormais dérivé de la phrase d'annonce.

Une première version bornait cette phrase à 80 caractères et retombait sur le
repli pour la rétractation, dont l'annonce fait 113 caractères. L'annonce est la
**dernière phrase** du paragraphe, pas le paragraphe.

## LS-221, deux contrôles ont attrapé des défauts réels

L'écran rendait correctement, et il portait deux défauts que rien de visible ne
montrait.

**`verifier-lien-evitement.sh`** : la page rendait un `<div>` là où C34 exige
`<main id="contenu" tabIndex={-1}>`. Le lien d'évitement n'avait aucune cible.

**`verifier-atteignabilite-boutique.sh`** : la route n'était desservie que par la
barre de navigation, sans le raccourci que `/compte` porte pour chaque rubrique.

**La liste des rubriques à venir est désormais vide**, et le bloc entier
disparaît : sans cette garde, « Bientôt disponible » resterait affiché au-dessus
d'une liste sans aucune entrée. Le cas n'existait pas quand ce bloc a été écrit.

## LS-220, la mutation a trouvé un trou dans mon propre contrôle

Quatre mutations, et la deuxième a raté à la première exécution. Le contrôle
cherchait la **chaîne** `git cat-file -e`, qu'un `if false &&` inséré devant
laisse intacte : il serait resté vert sur une garde morte, précisément celle qui
porte le critère 4. Le motif porte désormais sur la condition entière.

**Trois arbitrages rendus** que le ticket laissait ouverts : le nocturne plutôt
que le hook `SessionStart`, qui interrogerait le réseau à chaque démarrage de
session ; `deployer.sh --etat` plutôt que `/api/sante`, délibérément muette ; et
le seuil posé sur la **migration**, un commit de documentation n'étant pas un
incident.

## Un effet de bord corrigé au passage

`next dev` ajoutait à chaque démarrage un bloc `nextjs-agent-rules` dans
`CLAUDE.md`, **portant un tiret cadratin** que la règle de rédaction interdit
partout. Il revenait après chaque suppression. `agentRules: false` dans
`next.config.ts`, vérifié : un `npm run dev` laisse désormais le fichier intact.

## Les aperçus d'email, pour l'exploitante

```bash
npm run apercus-emails
open apercus-emails/index.html
```

Quinze fichiers HTML autonomes et une page d'accueil, ouvrables sans application
ni base. Le dossier n'est pas versionné, il se reconstruit en une seconde. Un
modèle ajouté au code sans exemple **fait échouer** la commande plutôt que de
produire un dossier incomplet en silence.

Le logo y est en base64 et seulement là : un navigateur ne résout pas un `cid:`
dans un fichier isolé, et sans cette substitution les quinze aperçus montreraient
une image cassée.

## LS-223, bloqué et documenté

Ses six critères exigent tous une action dans la console Backblaze. La clé du
`.env` est **applicative restreinte** : elle ne peut ni créer d'autres clés ni
modifier les règles du compartiment.

**Un constat du code allège le ticket** : la rotation distante ne fait pas
échouer le script, son commentaire l'écrit. Retirer `deleteFiles` **signalerait**
des échecs de ménage sans casser la sauvegarde, contrairement à ce que la
description craint. Le risque réel est le grossissement du stockage distant.

## Prochaine étape

**Deux critères restent ouverts et se ressemblent** : la preuve par mutation de
LS-219 et celle de LS-221. Aucun cas de `verifier-tests-mutation.sh` n'exerce ni
la lecture des interrupteurs, ni le filtre par utilisateur des avis.

**La modification d'un avis par son auteur** devient faisable : LS-221 livre
l'espace que `PARCOURS.md` nommait comme son préalable. Elle demande un ticket.

**LS-29 attend toujours un envoi réel**, donc un déploiement. La production est
en retard sur `main` de toute cette session : le workflow de LS-220 l'annoncera
dès cette nuit, et c'est son premier cas d'usage réel.

**L'adresse d'alertes vaut toujours `a-configurer@exemple.invalid`** en
production. Tant qu'elle n'est pas remplacée dans l'écran Paramètres, aucune des
cinq alertes n'arrive nulle part. C'est une action de Christophe.
