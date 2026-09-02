# 2 septembre 2026, session B : LS-97

Le formulaire de contact. `MODELE-CONCEPTUEL.md` avait écarté l'entité `Message`
le 28 juillet 2026, faute de parcours qui la mobilise, en renvoyant à « un ticket
propre, où sa règle principale devra être posée ». Cette session est cette pose.

Contrairement aux trois stories précédentes, **une migration était nécessaire** :
la table n'existait pas.

## La règle principale, et pourquoi elle inverse ADR-033

**Le message est persisté AVANT toute tentative d'envoi d'email**, et les deux
écritures sont **deux transactions distinctes**.

C'est l'inverse de ce que fait le reste du projet. ADR-033 pose que l'intention
d'envoi et l'effet métier partagent la transaction : les deux existent ou aucun,
parce qu'une confirmation de commande envoyée sans commande serait fausse.

**Ici le risque n'est pas symétrique.** Une demande client perdue ne se rattrape
par aucun rejeu, personne ne sait qu'elle a existé. Une notification manquée se
voit dans l'administration, où le message attend en `NOUVEAU`.

Prouvé par mutation : fondre les deux transactions fait rougir le test central,
avec le symptôme exact que la story décrit, `INDISPONIBLE` au lieu de
`ENREGISTRE`, donc **le message est perdu**.

## Trois couches contre les envois automatisés, aucune suffisante seule

Le projet écarte les services tiers, donc pas de reCAPTCHA.

1. **champ piège**, nommé `site` et non `piege` : un nom explicite serait ignoré
   par tout script sérieux. Masqué par position absolue et **pas** par
   `display: none`, la première propriété qu'un script anti-piège vérifie
2. **délai minimum**, trois secondes. Le seuil est bas exprès : il ne mesure pas
   un temps de rédaction crédible, ce qui punirait un texte préparé ailleurs,
   mais écarte la soumission instantanée
3. **plafond par adresse IP**, cinq par heure

**Le piège rend un succès apparent**, délibérément : dire « refusé » à un robot
lui apprend son existence. Le plafond, lui, **dit son refus** : il concerne une
personne réelle dans l'immense majorité des cas.

**Le plafond ne s'applique pas quand l'adresse est nulle.** Ranger tout le monde
sous une clé commune offrirait un déni de service au premier venu, défaut que
`limitation-action.ts` documente déjà pour expliquer son ancrage sur la session.

## Deux décisions prises sur des sources, pas au jugé

**La conservation est de trois ans**, référentiel CNIL n° 2021-131, même ancrage
que T2 pour les données de prospect. J'avais annoncé douze mois en début de
session : c'était une intuition sans source, corrigée après vérification.

**Le corps du message ne part jamais dans la notification.** ADR-008, précaution
3 : « le contenu du message n'est pas stocké, seulement son type et son
destinataire ». Les variables d'un modèle traversent `EnvoiEnAttente`, table que
T9 déclare file de travail : y recopier le corps le stockerait une seconde fois,
avec une durée de rétention différente.

**Le corps est un champ libre**, ce qui le distingue de tout autre traitement du
registre : une personne peut y écrire une donnée sensible au sens de l'article 9
qu'aucun formulaire ne lui a demandée. Rien ne peut l'empêcher techniquement, et
prétendre filtrer donnerait une fausse assurance. La parade est la durée et le
destinataire unique, écrites au registre.

## La réponse ne passe pas par le code

Arbitrage de Christophe, et **ADR-008 le disait déjà en toutes lettres** : « la
boîte contact@lune-soleil.fr garde son usage humain. La correspondance avec les
clients ne passe pas par le code. » Le prototype montre pourtant un champ de
réponse avec bouton d'envoi.

L'administration propose un lien `mailto:` au sujet prérempli. La troisième
raison est la plus solide : répondre depuis le code obligerait à expédier depuis
le domaine authentifié et jamais depuis l'adresse du client, sous peine de casser
SPF et DKIM. La délivrabilité est déjà fragile chez Yahoo, LS-155 n'étant pas
close.

## Un neuvième parcours

`PARCOURS.md` en listait huit et le contact n'en était aucun. C'est exactement le
motif qui a fait naître le huitième, le carnet d'adresses : une entité modélisée
qu'aucun parcours ne traverse. Ici en sens inverse, l'entité était écartée faute
de parcours.

Le parcours 9 porte huit étapes et sept cas d'erreur, dont la panne d'email qui
est sa raison d'être.

## Un piège de React 19 rencontré

`Date.now()` dans un composant serveur fait échouer le lint sur
`react-hooks/purity`, et **ni `connection()` ni la sortie du JSX n'y changent
rien** : la règle vise tout appel impur dans un composant, où qu'il soit.

Je ne l'ai pas désactivée. La lecture vit dans un module ordinaire,
`instant-ouverture.ts`, où lire l'horloge est le travail attendu. Un
`eslint-disable` aurait fait taire un contrôle sain sans rien changer au fond.

`connection()` reste nécessaire par ailleurs, ✅ via Context7 : sans lui,
l'instant pourrait être figé dans la coquille statique et servi identique à tous
les visiteurs.

## Ce que la revue frontend a corrigé

Elle valide les huit points d'attention par la mesure : contrastes calculés,
débordement mesuré aux quatre largeurs sur données hostiles, `axe-core` à zéro
violation, aucun croisement d'identifiants entre cartes.

**Le défaut principal était un mensonge de commentaire.** Le bloc de classement
affirmait que « les boutons changent après un succès » : `statutActuel` étant une
prop figée par le rendu serveur, ils ne changeaient pas. L'exploitante voyait
encore « marquer comme lu » sur un message qu'elle venait de lire, et un second
clic réécrivait le même statut en rendant `SUCCES`.

Un commentaire qui décrit une intention non tenue est pire qu'une absence de
commentaire : il fait passer la relecture suivante à côté.

Trois autres corrections :

- **les libellés étaient typés `Record<string, string>`**, qui compile sans rien
  garantir. Prouvé en ajoutant `ARCHIVE` à l'enum : `tsc` rougit désormais aux
  **deux** endroits, là où les gestes seuls rougissaient
- **l'adresse du `mailto:` était encodée**, transformant l'arobase en `%40` : la
  RFC 6068 la laisse littérale, et les clients anciens ne la décodent pas
- **aucune frontière d'erreur** sur les deux écrans neufs. Celle du contact donne
  l'adresse email en repli, et c'est le point : une erreur sur cette page ferme
  le canal qu'elle sert

**Le test de classement manquait**, angle mort que la revue a nommé : les tests
vérifiaient que les blocs s'affichent, aucun ce qui se passe **après** un clic,
c'est-à-dire exactement là où vivait le défaut.

## Deux cartes en données de test, leçon appliquée de LS-130

La rubrique amorce **deux** messages, statuts différents, et non un seul. Avec
une carte, une assertion sur un libellé passe quel que soit l'état des `id`, et
la table `GESTES` ne serait exercée que sur une de ses trois entrées.

C'est la leçon directe de la session A, appliquée avant que le défaut n'existe
plutôt qu'après.

## Une CI rouge, et le symptôme désignait le mauvais coupable

Le test de classement, ajouté sur relevé de la revue, **a fait rougir la CI sur
`mobile-390` seulement**. Un projet sur trois, ce qui pousse à chercher une
particularité de largeur qui n'existe pas.

**La cause est que les trois projets Playwright partagent la base et tournent en
parallèle.** Le test classait le message amorcé : il passait `TRAITE` pour un
projet pendant qu'un autre comptait encore ses gestes.

C'est « assertion qui suppose un ordre » appliqué aux **projets** et non aux
transactions, et j'avais pourtant écrit la règle deux heures plus tôt dans le
fichier de contact : « ce fichier ne soumet jamais le formulaire, un envoi
réussi écrirait un message que rien ne nettoie ». Je l'ai violée sur l'autre
fichier.

Trois corrections, dont deux vont au-delà du symptôme :

- **le test crée sa propre donnée**, avec le nom du projet dans le sujet
- **les assertions de comptage portent sur la carte visée**, jamais sur la page
  entière : un compte global casse dès qu'un message supplémentaire existe
- **l'amorce passe de `DO NOTHING` à `DO UPDATE`.** C'est la correction de fond :
  le statut d'un message est **écrit par les tests**, contrairement aux autres
  amorces de ce fichier, donc `DO NOTHING` laissait l'état de l'exécution
  précédente. Une amorce doit poser un **état**, pas garantir une existence

**Le plafond de débit se retournait aussi contre le test.** Cinq envois par heure
et par adresse, trois consommés par exécution : une seconde exécution dans
l'heure atteignait six, et le sixième était refusé. La CI part d'une base vierge
et ne l'aurait jamais vu ; le poste de développement, si, au deuxième lancement.
Le compteur est nettoyé à l'amorce, en ne visant que sa propre clé.

**Prouvé par deux exécutions consécutives**, 154 verts puis 154 verts. Une seule
ne prouve rien : c'est la seconde qui révèle une amorce non idempotente.

## Vérifications

```
npm run type-check                                    OK
npm run lint                                          OK
npm run format:check                                  All matched files use Prettier code style!
npm run build                                         OK, /contact et /administration/messages dynamiques
npm run test:unitaire                                 388 tests verts
npm run test:integration                              524 verts, 37 fichiers
tests e2e contact + administration-connectee          175 verts, 3 largeurs
npm run db:verifier:conception                        112 réussites, 0 échec
./scripts/verifier-actions-sensibles.sh               OK, 32 fichiers
./scripts/verifier-gardes-administration.sh           32 actions, toutes gardées
./scripts/verifier-actions-sensibles-mutation.sh      10/10
./scripts/verifier-gardes-administration-mutation.sh  6/6, contre 5/5 en session A
./scripts/verifier-regles.sh                          36 services, frontière respectée
./scripts/verifier-registre-traitements.sh            36 tables rangées, 10 traitements
./scripts/verifier-propagation-docs.sh                20 schémas, tous dans VALIDATION.md
```

**Deux mutations ciblées.** Fondre les transactions fait rougir le test de panne
et lui seul ; ajouter une valeur à l'enum fait rougir les deux tables typées.

**Le contrôle de schéma a fait son travail** : il a refusé `StatutMessage` tant
que l'enum n'était pas confronté au modèle conceptuel, ce qui a obligé à y
déclarer l'entité plutôt qu'à la laisser vivre dans le seul schéma Prisma.

## Un piège de méthode évité de justesse

L'arbitrage de `familles-sans-action.txt` a été **commité avant** de lancer les
scripts de mutation. En session A il avait été effacé une première fois : ces
scripts restaurent leurs cibles, donc ils écrasent un fichier modifié non
commité, sans aucun message.

## Ce qui reste

**LS-163 créée** : les listes d'administration plafonnent à 100 sans le dire, et
le compte affiché porte sur la tranche tronquée. Le défaut est commun aux
messages, aux commandes et à la file d'expédition, donc traité à part.

**Aucun `loading.tsx`** sur les deux écrans neufs, seulement `error.tsx`. Les
deux pages sont rapides et le formulaire public n'a aucune requête : l'ajouter
relèverait de LS-127, qui porte les états de chargement de l'administration.

**Le rafraîchissement n'est pas automatique**, convention de LS-160 et LS-130 :
`revalidatePath` invalide le cache serveur, le composant client déjà monté ne se
remonte pas. Un `router.refresh()` reste la correction propre, sur les quatre
écrans à la fois, notée dans LS-161.

## Prochaine étape

**LS-154**, la purge de l'outbox, dernière des trois stories demandées. Elle
distingue les lignes terminées des lignes bloquées : une purge par âge seul
effacerait les secondes avant que quiconque ne les traite.

## État des tickets

LS-97 livrée. **LS-163 créée**, le plafond des listes, rattachée à LS-3. LS-130
close en session A, **LS-162 créée** au même moment. LS-84, LS-85, LS-82, LS-86,
LS-9 et LS-161 restent ouvertes, inchangées.
