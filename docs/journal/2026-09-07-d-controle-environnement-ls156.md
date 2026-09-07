# 7 septembre 2026, d : contrôler l'environnement, et deux défauts réels trouvés

LS-156, choisie après LS-179 comme le seul travail Haute priorité entièrement
autonome, LS-200 attendant les clés Sendcloud. Le contrôle a trouvé deux défauts
de configuration dès sa première exécution, sur la machine de Christophe.

## Les deux défauts, authentiques

**`STRIPE_WEBHOOK_SECRET` ne concordait pas avec `stripe listen`.** C'est le cas
1 du ticket, celui contre lequel aucune vérification de forme ne peut rien :

```
stripe listen  : empreinte 0136eb69, longueur 70
valeur du .env : empreinte 2629a087, longueur 70
concordent     : false
```

Deux chaînes de 70 caractères, même préfixe `whsec_`. Indiscernables à l'œil, et
la conséquence est muette : chaque événement rend 400, la commande reste en
`EN_ATTENTE_PAIEMENT` alors que Stripe a encaissé.

**`DOCUMENTS_RACINE` était absente.** Elle porte le stockage des factures sur
trois routes, dont `/facture/[jeton]` qui sert un PDF nominatif. Sans elle,
aucune facture n'est ni écrite ni servie. C'est le défaut 2 du ticket,
`MEDIA_RACINE`, rejoué sur une autre variable dix-sept jours plus tard.

Les deux sont corrigés, et le contrôle passe au vert.

## Ce que le ticket demandait, et ce que la mesure a imposé en plus

La description demandait quatre sens. Le script en porte six, et les deux
ajouts viennent de mesures, pas d'intuitions.

**Le groupe qui va ensemble.** `@facultative` dit qu'une variable peut manquer,
il ne dit rien de ce qui doit manquer **avec** elle. Marquer les trois variables
du médiateur facultatives rendait chacune absente sans conséquence : un `.env`
portant le nom du médiateur **sans son adresse** passait au vert.
`lireMediateur` rend `null` dans ce cas, et son commentaire porte la raison,
une désignation partielle laisse le client sans moyen d'exercer son recours tout
en donnant l'apparence de la conformité.

**Le mode `--exemple-seul`.** La chaîne d'intégration n'a pas de `.env` et n'en
aura jamais. Sans ce mode, le contrôle ne tournerait nulle part en CI et sa
convention se rééroderait sans bruit, motif déjà payé par ce dépôt avec les
liens Jira. Le mode ne vérifie que `.env.example`, versionné, et **annonce ce
qu'il n'a pas pu vérifier** plutôt que de conclure au vert.

## La liste n'est pas dans le script

Elle est dérivée de `.env.example`, qui gagne un marqueur
`# @facultative <raison>`. La raison est obligatoire : une exemption sans motif
est un interrupteur, pas une décision, règle déjà appliquée par le contrôle des
bordures et par celui de LS-179.

Vingt variables marquées, chacune avec la sienne, et les raisons ne sont pas
interchangeables : un défaut existe côté applicatif, la fonctionnalité est hors
périmètre d'ouverture, ou le vide **désactive** délibérément quelque chose.

## Trois formes de lecture, et une recherche qui ratait la moitié

En cadrant, j'ai cherché `process.env.X` et trouvé 32 variables. Le dépôt en lit
**37** : `smtp.ts` reçoit un objet `env` en paramètre, `livraison.ts` lit un
`brut.X`. Les cinq variables SMTP manquaient, dont deux secrets.

Le nom du conteneur d'objet varie librement, donc chercher les formes connues
est perdu d'avance. C'est le motif « liste écrite à la main » transposé au motif
de recherche, et c'est ce qui a fait retenir `.env.example` comme source unique
plutôt que le code.

## Quatre pièges en écrivant la preuve par mutation

Aucun n'était prévisible, et chacun aurait produit une preuve fausse.

```
sleep 30 --api-key X        -> sleep REFUSE l'argument et meurt : rien a mesurer
bash -c 'sleep 30' --api... -> bash REMPLACE son image, ps affiche « sleep 30 »
repertoire stripe/ en PATH  -> command -v trouve le vrai binaire plus loin
valeurs factices credibles  -> gitleaks refuse le commit, a juste titre
```

Le deuxième est le plus instructif : le contrôle restait vert **à juste titre**,
le secret ayant disparu de la ligne de commande. L'accuser aurait été une erreur
de diagnostic. C'est `perl`, qui garde ses arguments dans `argv` sans les
réinterpréter, qui a fini par servir de témoin.

Le quatrième a été attrapé par le garde-fou du dépôt : mes valeurs de test
ressemblaient trop à de vrais secrets. Le critère 8 du ticket l'annonçait, et je
l'ai quand même écrit avant de m'en souvenir.

## Le hook a bloqué son propre test, deux fois

Le sens ajouté au hook refuse une valeur de secret en argument. Ma première
commande de test portait les motifs en clair : **le hook l'a refusée**. Puis la
commande qui appliquait un correctif, pour la même raison.

Motif « le hook bloque son explication », déjà en fiche. Les préfixes sont
désormais assemblés à l'exécution partout où ils apparaissent, et les
substitutions passent par un fichier plutôt que par une ligne de commande.

## L'accès au `.env` est ouvert, arbitrage de Christophe

Demandé en cours de session : voir les défauts au lieu de les deviner. Les trois
couches sont ouvertes ensemble, règles `deny`, hook fichiers et hook commandes.
Clés privées et certificats restent bloqués.

**Un sens reste fermé, et ce n'est pas le même risque.** Une valeur en
**argument** est lisible par tout `ps`, donc par un autre utilisateur de la
machine : fuite hors du périmètre de la session, quand une lecture reste dans
l'historique. Le hook me l'a rappelé en refusant ma propre commande de
correction.

**Ce que l'ouverture n'a pas changé** : sur un secret, le diagnostic outillé bat
la lecture. Le secret discordant a été trouvé par comparaison d'empreintes
**avant** l'ouverture, et l'œil ne l'aurait pas vu.

## Ce que la session ne prouve pas

Le contrôle complet ne tourne pas en CI, faute de `.env`, et il n'y tournera
jamais : c'est un outil de poste, ce que la portée du ticket énonce. Seul le
sens portant sur `.env.example` y entre, à l'étape `6t`.

La concordance du secret de webhook n'est pas exercée par la preuve par
mutation, qui la neutralise par `LS_SANS_STRIPE=1` : sur un poste authentifié,
un `.env` factice ne concorderait jamais et l'état de référence serait rouge.
Elle est prouvée autrement, ayant trouvé un vrai défaut le jour de son écriture.

## État des tickets

**LS-156 est livrée.** Les huit critères sont remplis, détail dans le
commentaire Jira.

## Prochaine étape

**LS-200**, le raccordement de l'API Sendcloud, inchangée depuis ce matin. Elle
attend que Christophe crée les clés d'API dans Sendcloud, Réglages puis
Boutiques connectées : `.env.example` ne porte aucune variable Sendcloud,
vérifié, et `verifier-environnement.sh` les exigera dès qu'elles y seront
déclarées.
