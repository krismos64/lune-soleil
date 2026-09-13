# 13 septembre 2026, la bascule au navigateur, le contrôle qui visait à côté, et les premiers emails HTML

Troisième session du jour. Christophe s'est connecté à Backblaze, les trois
gestes bloquants ont été faits, et **LS-223 est terminé**, ses six critères
fermés. Le contrôle écrit le matin même s'est révélé faux au moment où il
servait.

## Ce qui est livré

| Critère | Sujet | État |
|---|---|---|
| 1 | la clé ne porte plus `deleteFiles` | **fait**, quatre capacités |
| 2 | règle de rétention Backblaze | fait le matin, 30 jours |
| 3 | restauration réelle après bascule | **refait** avec la clé durcie, 241 objets |
| 4 | purge locale et service nocturne | **fait**, `Result=success` |
| 5 | test négatif de suppression | **fait**, `401 unauthorized` sur fichier réel |
| 6 | ancienne clé révoquée, documentation | **fait**, l'ancienne rend 401 |

## La console ne pouvait pas faire le travail

Le formulaire de création n'offre que **trois préréglages opaques**, « Read and
Write », « Read Only », « Write Only », sans aucune case par capacité. Deux
pages de la documentation Backblaze ont été consultées : **ni l'une ni l'autre
ne dit quelles capacités chaque préréglage accorde.**

La clé existante était en « Read and Write » et portait `deleteFiles`. « Write
Only » aurait probablement retiré `listFiles` et `readFiles`, dont le script a
besoin pour vérifier les empreintes et pour restaurer : le durcissement aurait
cassé la sauvegarde, ce qui est pire que le risque fermé.

**Deviner aurait demandé deux essais et une clé morte à chaque fois.** La voie
retenue est `b2_create_key` avec la clé maîtresse, qui nomme les capacités une
par une :

```
capacites : listBuckets, listFiles, readFiles, writeFiles
```

## Le secret n'a jamais transité par la conversation

Christophe a généré la clé maîtresse et l'a déposée dans un fichier du VPS. Le
script l'a **lue sur place**, a créé la clé applicative, et a écrit la nouvelle
valeur directement dans `/etc/lune-soleil/b2.conf`. Ni la clé maîtresse ni la
nouvelle clé n'ont été affichées.

Le fichier temporaire a été effacé au `shred` dans la foulée, et la copie de
l'ancienne clé, `b2.conf.avant-ls223`, une fois la révocation prouvée.

**Un détail rattrapé au passage** : le fichier déposé était en 644, lisible par
tout le monde. Remis en 600 avant d'être lu.

## L'API v4 a renommé un paramètre

Premier appel refusé en 400, et le message portait la réponse :

```
The bucketId parameter has been deprecated in favor of bucketIds list.
```

Lire le corps de l'erreur plutôt que le code HTTP a suffi. Le premier essai ne
montrait que `curl: (22) error: 400`, parce que `--fail` masque le corps.

## Le contrôle du matin ne testait pas ce qu'il prétendait

C'est le vrai enseignement de la session. Le sens 3 visait un fichier
**inexistant** avec un `fileId` fabriqué, `4_zdummy_ls223`, et jugeait le refus.
Sur la clé durcie il a rendu :

```
ECHEC : refus pour la mauvaise raison, code bad_request.
```

La mesure a tranché en comparant les deux cibles :

```
fileId factice   {"code":"bad_request","message":"Bad file ID: 4_zdummy_ls223"}
fichier reel     {"code":"unauthorized","status":401}
```

**Backblaze valide la FORME du `fileId` avant d'examiner les droits.** La
question de l'autorisation n'était jamais posée, donc le contrôle ne pouvait ni
confirmer ni infirmer le durcissement. Il rougissait le matin pour une raison
qui n'avait rien à voir avec `deleteFiles`, et j'ai pris ce rouge pour une
preuve.

**Le raisonnement qui l'a produit était bon, et c'est ce qui le rend piégeux** :
viser un fichier inexistant évitait qu'un test négatif devienne destructeur si
le durcissement était manqué. La précaution était juste, la cible rendait le
contrôle aveugle.

Le sens 3 vise désormais un fichier réel. Le risque que la précaution voulait
écarter est couvert autrement : une suppression qui aboutirait signalerait un
durcissement manqué, et la règle de rétention garde trente jours de versions.

Un garde a été ajouté contre le compartiment vide, qui ne permettrait pas
d'exercer le refus : il échoue plutôt que de rendre un OK silencieux.

## Ce que la clé durcie autorise et refuse, mesuré

```
b2_hide_file sur un fichier reel    action=hide, reussi
b2_delete_file_version sur le meme  401 unauthorized
etat du compartiment                hide 5, upload 16
```

**Seize uploads conservés.** Le masquage fonctionne sans `deleteFiles`, la
suppression est refusée, et la copie nocturne continue.

## Vérifications finales

```
verifier-cle-b2-durcie.sh   les quatre sens passent, code 0
service hors-site           Result=success, sha1 concordants
restauration                21 569 octets, PGDMP, 241 objets lisibles
ancienne cle                401, elle n'ouvre plus rien
```

## Un risque identique sur l'autre projet, signalé et non traité

La clé `smartplanning-vps` porte elle aussi `deleteFiles` sur
`smartplanning-backups`, vu sur la même page de console. **Même défaut, autre
projet**, donc hors du périmètre de ce ticket et laissé tel quel.

**LS-223 est terminé**, ses six critères fermés.

## LS-222 fermé dans la foulée, les premiers emails HTML de la production

Même session, après la clôture de LS-223. Le ticket attendait depuis le
12 septembre une observation sur boîtes réelles, et cinq de ses sept critères
étaient déjà faits.

### Ce qui bloquait n'était pas technique

**Rien n'avait déclenché d'envoi depuis le déploiement du gabarit.** La
production n'avait jamais émis que deux emails, tous deux du 10 septembre, donc
en texte brut. Les critères 2 et 6 n'avaient littéralement rien à observer.

Trois soumissions du formulaire de contact ont suffi, une par adresse, sujet
« Test technique LS-222 » pour que l'exploitante ne les prenne pas pour de
vraies demandes.

```
c.mostefaoui@yahoo.fr      ENVOYE  1 tentative  14:44
kayouw641@gmail.com        ENVOYE  1 tentative  14:46
contact@smartplanning.fr   ENVOYE  1 tentative  14:47
```

### Le résultat qui comptait, la délivrabilité

```
Yahoo    boite de reception
Gmail    boite de reception
OVH      boite de reception
```

**Trois fournisseurs sur trois en réception.** C'était le risque explicite du
critère 6 : le passage du texte seul au `multipart/alternative` peut modifier le
classement anti-indésirable. Il ne l'a pas dégradé.

Le rendu a été jugé « parfait » sur les trois clients, dont un sur mobile.

### Un faux diagnostic, et ce qui l'a produit

Après le premier envoi, `journal_email` ne montrait rien de neuf. J'en ai conclu
à un défaut et j'ai remonté une piste entière : sortie précoce de
`message-contact.ts` faute de destinataire d'alerte, cache de paramètres,
divergence entre le code lu et l'image déployée. Trois hypothèses, toutes
fausses.

**L'envoi avait parfaitement fonctionné depuis le début.** `journal_email` n'est
pas la file d'attente : l'outbox est `envoi_en_attente`, et elle portait les
quatre lignes attendues. La mesure visait la mauvaise table.

**Le signal était là et je ne l'ai pas lu** : le message de contact ÉTAIT
enregistré en base, et aucune trace d'erreur n'apparaissait dans les logs alors
que le code journalise explicitement « notification de message de contact non
deposee ». Un défaut de dépôt aurait laissé cette trace. Son absence disait que
le dépôt avait eu lieu.

Même famille que le motif « mesures fausses » : la sortie était plausible, une
table vide ressemblant à un envoi manquant.

### Ce qui reste en base

Trois messages de test en statut `NOUVEAU` dans l'administration, et trois
notifications reçues par l'exploitante. Ni commande ni facture, supprimables
sans contrainte.

## Prochaine étape

**LS-222 et LS-223 sont terminés.** Le compte passe à 195 sur 217 hors epics,
22 ouverts. **Huit tickets sont En cours**, mais **un seul dépend du code** :
LS-218, qui attend un colis réel donc LS-153. Les sept autres attendent
l'exploitante ou une démarche externe.

**J'avais écrit « un seul en cours » avant de le relever dans Jira**, en
confondant « ce qui dépend du code » et le statut réel. Le compte se mesure, il
ne se déduit pas d'un raisonnement.
