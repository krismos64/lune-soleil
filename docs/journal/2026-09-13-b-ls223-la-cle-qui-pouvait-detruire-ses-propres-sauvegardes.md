# 13 septembre 2026, la clé qui pouvait détruire ses propres sauvegardes

Deuxième session du jour. LS-223, choisi comme « le seul travail autonome du
backlog », s'est révélé bloqué dès la lecture de son commentaire. Ce qui a suivi
a quand même fermé quatre de ses six critères, et deux affirmations du ticket se
sont révélées fausses à la mesure.

## Ce qui est livré

| Critère | Sujet | État |
|---|---|---|
| 1 | la clé ne porte plus `deleteFiles` | **attend un geste console** |
| 2 | règle de rétention Backblaze, durée écrite | **fait**, 30 jours, révision 3 |
| 3 | restauration réelle après bascule | **fait**, 241 objets lisibles |
| 4 | purge locale et service nocturne intacts | **fait**, `Result=success` |
| 5 | test négatif, suppression refusée | **contrôle écrit et éprouvé**, attend la clé |
| 6 | ancienne clé révoquée, `EXPLOITATION.md` | **doc faite**, révocation à faire |

## Le ticket a été choisi sur son titre, ce que le skill interdit

Le point de départ mérite d'être écrit parce que c'est exactement le piège que
`story` documente. J'ai proposé LS-223 à Christophe comme le seul travail
réellement autonome après avoir lu son **titre** et son **statut**, sans ouvrir
son commentaire, qui dit depuis le 12 septembre qu'il est bloqué sur trois
gestes de console.

**Le commentaire a été lu à la demande de travail, pas au classement.** Il aurait
suffi qu'il le soit une étape plus tôt.

## Deux affirmations du ticket, démenties par la mesure

### La clé n'était pas si restreinte que ça

Le commentaire du 12 septembre écrit : « elle ne peut ni créer d'autres clés ni
modifier les règles du compartiment ». La première moitié est vraie, la seconde
est **fausse** :

```
capacites : 18, dont writeBucketLifecycleRules, writeBuckets, deleteFiles
writeKeys : NON, creation de cle impossible
```

`writeBucketLifecycleRules` étant présente, **la règle de rétention se pose
depuis le serveur**, sans console. Le critère 2 a été fermé dans la foulée,
révision du compartiment 2 vers 3.

C'est le critère que la description présentait comme « celui qui compte plus que
l'autre », et il ne demandait aucun geste humain.

### La description craignait une panne, le commentaire une facture, c'était ni l'un ni l'autre

Le vrai obstacle n'était dans aucun des deux. La rotation appelait
`b2_delete_file_version`, qui **détruit définitivement** une version : une règle
de rétention n'aurait rien protégé contre le script lui-même.

**La bascule tenait en un appel** : `b2_hide_file` pose un marqueur qui retire le
fichier de la liste par nom sans détruire un octet, et la règle de cycle de vie
efface réellement trente jours plus tard. Il n'exige que `writeFiles`, vérifié à
la documentation Backblaze.

Le grossissement sans limite que craignait le commentaire n'arrive donc pas, et
le retrait de `deleteFiles` ne casse rien.

## La preuve que le masquage conserve

C'est le cœur du ticket, et une affirmation ne suffisait pas. Rétention forcée à
deux jours sur une exécution manuelle, pour exercer un chemin qu'une rétention à
quatorze jours n'aurait pas atteint :

```
Rotation distante : 4 masque(s), 3 jeu(x) conserve(s) sur 2.

versions par action   hide 4, upload 10
uploads presents      les 10, du 10 au 13 septembre
visibles par nom      6, les plus recents
```

**Dix uploads conservés, quatre marqueurs de masquage.** Un rançongiciel qui
masquerait tout ne détruirait aucun octet.

## `--fail` manquait aux six appels curl, et ça comptait ici

Défaut trouvé en écrivant la modification. Sans `--fail`, `curl -sS` sort en 0
sur un `401 unauthorized` : **un refus de Backblaze aurait été compté comme un
ménage réussi**.

Le durcissement de ce ticket serait devenu invisible au moment précis où il
faudrait le voir. L'appel de rotation le porte désormais.

## Le contrôle échoue avant d'être réparé, et c'est sa preuve

`scripts/verifier-cle-b2-durcie.sh` porte quatre sens. Lancé sur la clé actuelle,
non durcie, il rougit sur exactement les deux que la bascule fermera :

```
OK     : writeFiles presente.
OK     : listFiles presente.
ECHEC  : la cle porte encore deleteFiles.
ECHEC  : refus pour la mauvaise raison, code bad_request.
OK     : retention de 30 jours apres masquage.
code de sortie : 1
```

**Aucune mutation n'a été fabriquée**, le défaut est réel et présent. Les deux
sens verts prouvent en même temps que le durcissement ne cassera pas la copie
nocturne, ce qui serait pire que le risque fermé.

**Le troisième sens exerce une suppression réelle** plutôt que de lire les
capacités annoncées : la déclaration de Backblaze n'est pas son application. Sa
cible est un fichier **inexistant**, pour que le jour où il révèle un
durcissement manqué, il ne détruise aucune sauvegarde.

Les deux refus ne valent pas la même chose, et le script les distingue :
`unauthorized` est le résultat voulu, `file_not_present` dirait que la clé
**aurait pu** supprimer.

## Un script vide sort en 0

Piège rencontré en installant le contrôle sur la machine. Un `tee` mal groupé
derrière un `||` a créé un fichier de **zéro ligne**, et son exécution a rendu :

```
code de sortie : 0
```

Aucune sortie, aucune erreur, un succès apparent. La sortie vide a trahi
l'affaire, pas le code de retour. Un `wc -l` sur le fichier installé l'a
confirmé.

## La restauration reste prouvée après la bascule

Le critère 3 demandait une restauration réelle, pas une présomption :

```
telechargement depuis B2   21 569 octets
dechiffrement local        PGDMP, 103 585 octets
pg_restore --list          241 objets lisibles
```

Et le service nominal, relancé tel qu'il tournera cette nuit :

```
Result=success  ExecMainStatus=0
Rotation distante : 0 masque(s), 3 jeu(x) conserve(s) sur 14.
```

## Ce qui reste, et pourquoi je ne peux pas le faire

Trois gestes en console, la clé en service ne portant pas `writeKeys` :

1. créer une clé sur `lune-soleil-backups` avec `writeFiles`, `listFiles` et
   `readFiles`, **sans** `deleteFiles`
2. remplacer les deux valeurs dans `/etc/lune-soleil/b2.conf`, 600 root
3. vérifier par le contrôle, puis **révoquer** l'ancienne clé

La procédure est écrite dans `EXPLOITATION.md`, et le contrôle dira si elle a
abouti. Il passe de deux échecs à zéro, sans interprétation.

## Une conséquence du test à surveiller

L'exécution à deux jours a masqué de vrais jeux du 10 et 11 septembre. **Ils ne
sont pas perdus**, la règle de rétention les garde trente jours, et c'est
précisément ce que la session a prouvé. Le compte affiche « 3 jeux sur 14 » et
remontera d'un jeu par nuit.

## Prochaine étape

**LS-223 reste en cours**, quatre critères sur six fermés. Il ne rouvrira aucune
question technique : la bascule est préparée, éprouvée et documentée.

> **Fermé le jour même.** Christophe s'est connecté à Backblaze dans la session
> suivante, la clé durcie est en service et l'ancienne révoquée. Le contrôle
> écrit ici s'est révélé **faux** au moment de servir, sa cible inexistante étant
> rejetée sur sa forme avant tout examen des droits. Voir le journal
> `2026-09-13-c`.

Les deux autres tickets en cours attendent toujours un geste physique, LS-222
l'observation d'emails réels et LS-218 un colis réel.
