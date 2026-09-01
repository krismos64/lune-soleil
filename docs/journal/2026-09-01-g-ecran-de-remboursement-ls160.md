# 1er septembre 2026, session G : LS-160

L'écran d'administration du remboursement. `rembourserCommande` existait depuis
LS-128 sans aucun appelant : le service n'avait pas de surface HTTP, et le
critère 6 de LS-128 avait été reporté ici faute de page à garder.

Trois défauts trouvés, aucun dans ce que j'avais écrit en premier jet : deux
dans le service livré la veille, un troisième dans un contrôle qui accusait du
code correct depuis LS-95.

## Les deux gardes, et pourquoi elles sont à deux endroits

`demanderRemboursement` porte le rôle puis la fraîcheur d'identité, dans cet
ordre, et c'est elle qui porte la marque de famille. La Server Action `rembourser`
exige le rôle une seconde fois.

**La redondance est délibérée et elle ferme deux chemins distincts.** La garde de
l'action ferme le point d'entrée HTTP, une Server Action étant invocable
directement sans jamais charger l'écran. La garde du service ferme l'appel direct
par un futur appelant, qui contournerait l'action.

**L'ordre n'est pas indifférent.** Le rôle d'abord : l'inverse proposerait une
réauthentification à quelqu'un qui n'a de toute façon aucun droit sur cet écran,
ce qui lui apprendrait que l'écran existe.

La ligne `REMBOURSEMENT` a quitté `.claude/familles-sans-action.txt`. Elle disait
« Stripe n'est pas branché avant la phase 4 », et elle avait cessé d'être vraie
en deux temps : l'ouverture du compte le 31 août, puis LS-128. Elle est restée
fausse tant qu'aucune action n'existait, l'écart étant invisible dans les deux
sens du contrôle.

## Deux onglets ouverts remboursaient le double

Trouvé par `ls-critical-reviewer`, mesuré : **9800 centimes rendus pour 4900
encaissés**.

`page.tsx` engendre un `randomUUID()` par rendu de page. Deux onglets portent donc
deux références différentes, et l'unicité `(facture_id, cle_idempotence)` ne
sérialise que deux demandes de **même** clé. La borne du restant lisait
`montantAvoirCentimes` **hors transaction** : les deux demandes lisaient zéro et
se jugeaient toutes deux légitimes.

**Mon commentaire affirmait que la réservation d'intention fermait ce cas.** Il
était faux dès que les clés diffèrent, et je l'avais écrit en reprenant la
justification de LS-128 sans vérifier qu'elle couvrait ce cas-là.

**L'état final paraissait sain, ce qui rendait le défaut muet** : un seul avoir,
un cumul exact, le second appel étant rejeté par `chk_facture_avoir_borne` APRÈS
le départ de l'argent. Rien en base ne portait trace du surplus, et l'écran
affichait « Remboursement indisponible, réessayer plus tard » à une exploitante
qui venait de rendre le double.

La borne vit désormais dans `reserverIntentionRemboursement`, sous verrou
`FOR UPDATE` de la ligne de facture. La transaction reste courte et commite avant
l'appel réseau, ce que `database.md` exige.

**Elle ne compte que les intentions non abouties**, et cette condition a coûté
deux tests nominaux passés au rouge avant que je la trouve : une intention
aboutie est déjà dans `montantAvoirCentimes`, la compter une seconde fois
soustrait deux fois le même argent et refuse un second remboursement légitime.

## Le cumul du paiement écrasait sa propre valeur

Trouvé par le test de non-régression que j'écrivais pour le défaut précédent, pas
par relecture.

Deux remboursements partiels concurrents de 1000 et 2000 laissaient le paiement à
**2000 pour 3000 réellement sortis**. `marquerRembourse` écrivait le cumul en
valeur absolue, calculé sur une lecture faite au tout début du service : les deux
lisaient zéro, et la seconde écriture écrasait la première.

`ecrireAvoir` incrémentait déjà `facture.montantAvoirCentimes`. **L'écart entre
les deux était exactement le défaut**, et il tenait dans une ligne.

## Un contrôle qui accusait du code correct depuis LS-95

`verifier-actions-sensibles.sh` refusait `demanderRemboursement` alors qu'elle
portait ses deux gardes. Son extraction du corps s'arrêtait sur
`): Promise<...> {`, cette ligne commençant par `)`.

**Le script documentait déjà ce piège pour `}` sans l'avoir fermé pour `)`.** Le
sens de l'erreur est le pire : un faux positif pousse à retirer la marque plutôt
qu'à comprendre, et la protection disparaît par la porte que le contrôle a
lui-même ouverte.

Le comptage d'accolades naïf ne suffisait pas non plus : un objet de paramètres
en ouvre une puis la referme avant le corps, donc la profondeur retombait à zéro
trop tôt. Le début du corps est désormais borné à la fin de la signature.

Toute fonction à objet de paramètres et type de retour long échappait à ce
contrôle depuis LS-95.

## Trois cas de mutation morts ou déplacés

Le rapport passe de 9/10 à 10/10, et l'écart vient de la correction ci-dessus.

**Le cas 10 était mort, et il l'était déjà sur `main`** : il cherchait
`exigerRole()` quand le code porte `exigerRole(await headers())`. Sa substitution
ne modifiait aucun caractère, donc il rapportait « non détecté » en accusant un
contrôle sain. Un garde-fou `cksum` le rend désormais impossible, prouvé en
cassant volontairement la cible : échec franc qui nomme le fichier.

**Les cas 4 et 5 visaient une cible disparue.** Ils s'appuyaient sur
`REMBOURSEMENT` étant en attente, ce qui a cessé d'être vrai dès que la famille a
été couverte. Reciblés sur `PARAMETRES_BOUTIQUE`, avec la note qui dit pourquoi la
cible doit rester une famille sans action.

## La mesure de rendu voyait la mauvaise branche

Le détail de commande était déjà mesuré aux trois largeurs, mais sur une commande
`EN_ATTENTE_PAIEMENT` : l'écran de remboursement y rend « aucune facture émise »,
un paragraphe. **Le formulaire n'aurait été mesuré à aucune largeur.**

C'est le motif de LS-121, où un contraste à 4,04:1 a échappé à `axe-core` faute
d'une commande remboursée en données de test.

Une commande confirmée et facturée est donc amorcée, distincte de la première qui
reste dédiée à la page de confirmation. **La mesure a été prouvée plutôt que
supposée** : le champ élargi volontairement à 900 px fait rougir les trois
largeurs de cet écran, et elles seules.

## Ce que la revue frontend a corrigé

- **la référence brûlée après un succès** refusait en silence un second
  remboursement légitime : l'exploitante changeait le montant, cliquait, et
  recevait « cette demande est déjà partie ». Le formulaire se ferme désormais
- **l'`aria-label` de la région live annulait la description** des champs, le
  calcul du nom accessible consultant `aria-label` avant le contenu. Le même
  défaut vit dans `document-facture.tsx`, hors périmètre
- **le bouton porte le rattachement au message**, comme sur les deux écrans
  voisins : le refus du prestataire et son indisponibilité ne concernent aucun
  champ, et rien ne ramenait au message
- **les avoirs passent après le geste**, leur état vide encadré disparaît : sans
  facture, aucun avoir ne peut structurellement exister, et présenter cela comme
  un état vide ordinaire laissait lire « rien n'a été fait, on peut y aller »
- **`maxLength` retiré du motif** : il tronquait sans aucun retour un texte qui
  finit sur un document comptable opposable

## Vérifications

```
npm run type-check                                    OK
npm run lint                                          OK
npm run format:check                                  All matched files use Prettier code style!
npm run test:unitaire                                 388 tests verts
npm run test:integration                              492 verts, 35 fichiers
tests e2e administration-connectee                    97 verts, 3 largeurs et bascule 768
./scripts/verifier-actions-sensibles.sh               OK, 30 fichiers
./scripts/verifier-gardes-administration.sh           30 actions, toutes gardées
./scripts/verifier-actions-sensibles-mutation.sh      10/10, contre 9/10 sur main
./scripts/verifier-gardes-administration-mutation.sh  4/4
./scripts/verifier-regles.sh                          34 services, frontière respectée
./scripts/verifier-registre-traitements.sh            35 tables rangées
./scripts/verifier-config-claude.sh --strict          cohérente
```

**Les deux corrections sont prouvées par mutation ciblée.** La borne sous verrou
neutralisée fait rougir un seul test, celui qui la vise ; l'`increment` remplacé
par une écriture absolue en fait rougir deux, ceux du cumul. Aucune des deux
mutations n'est brutale au point de tout faire rougir.

## Ce qui reste

**Le même défaut d'`aria-label` vit dans `document-facture.tsx`**, livré par
LS-129. Le corriger ici seul laisse l'écran incohérent, trois régions live y
coexistant avec trois comportements différents : **LS-161** le porte, rattachée à
LS-3, avec le contrôle textuel qui empêche sa réintroduction par mimétisme.

**Le rafraîchissement de l'écran après un remboursement n'est pas automatique.**
`revalidatePath` invalide le cache serveur, mais l'action étant appelée depuis
`useTransition`, le composant client déjà monté ne se remonte pas. Le message dit
« rafraîchir la page », convention déjà en place sur `DocumentFacture`. Un
`router.refresh()` serait plus propre, sur les deux écrans à la fois : noté dans
LS-161 comme explicitement hors de son périmètre, pour ne pas mélanger les deux
sujets.

**Deux points demandent un contrôle visuel** que le code ne tranche pas : le
comportement réel d'un lecteur d'écran sur la région live, et la saisie du montant
au clavier de smartphone, `centimesVersSaisie` produisant une virgule quand
`inputMode="decimal"` propose souvent un point selon la locale.

## Prochaine étape

**LS-130**, l'écran d'expédition, dernier écran d'administration manquant de la
phase 4. Puis **LS-97**, le formulaire de contact, et **LS-154**, la purge de
l'outbox.

## État des tickets

LS-160 livrée et close. **LS-161 créée**, l'`aria-label` de `document-facture.tsx`, rattachée à LS-3. LS-84, LS-85, LS-82, LS-86 et LS-9
restent ouvertes, inchangées.
