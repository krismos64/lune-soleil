# 13 septembre 2026, la bascule faite au navigateur, et le contrôle qui visait à côté

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

## Prochaine étape

**LS-223 est terminé.** Les deux tickets restants attendent toujours un geste
physique, LS-222 l'observation d'emails réels et LS-218 un colis réel.
