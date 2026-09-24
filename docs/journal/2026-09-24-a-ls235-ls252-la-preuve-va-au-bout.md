# 24 septembre 2026 : LS-235 et LS-252, la preuve complète va au bout

Christophe a demandé LS-235 et LS-252 ensemble. Il a aussi tranché deux points
laissés ouverts le 23 : **aucune commande n'a jamais été passée**, donc aucun
geste à prévoir après LS-249 ; le texte incrusté de la bannière à 320 px et sa
graphie sont acceptés.

## Le nocturne rouge depuis trois nuits avait une cause que LS-235 avait laissée

Les nocturnes du 22 et du 23 sont tombés à la borne de 45 min, étape « Preuves
par mutation lourdes ». Le journal du 23, lu cas par cas sur le runner :

```
07:27:18  debut de l'etape
07:42:00  verifier-tests-mutation demarre   (14 min 42 pour les quatre premiers)
07:54:37  suites de reference vertes       (12 min 37)
07:55:43  huit cas d'integration faits     (environ 8 s chacun)
08:06:54  PREMIER cas de bout en bout      (11 min 11 a lui seul)
08:12:31  borne atteinte
```

Les dix cas de bout en bout rejouaient chacun la suite Playwright entière, et le
commentaire du script affirmait qu'ils « ne pèsent pas dans le budget ». Ils ne
lancent plus que leur fichier porteur, préparations comprises, mesuré par
`--list`.

## Six corrections pour aller au bout

Première exécution complète relevée depuis LS-235 : **180 mutations en
3507 s**, 58 min en local. Six corrections pour y arriver, aucune visible tant
que le script mourait avant :

- **cas 96**, `paiement.ts` : l'expression énumérait les arguments d'avant
  `fraisPortPresenteCentimes`, LS-98 du 11 septembre. Elle s'insère désormais
  après `client,`
- **cas 134**, `webhook-paiement.ts` : garde retournée par la revue critique de
  LS-126 le 31 août
- **vignette** : l'accueil levait sous mutation, Playwright attendait `/`
  180 s puis s'arrêtait **sans lancer un test**. La piste du quota d'inscription
  inscrite dans le ticket était fausse. La disponibilité se lit désormais sur
  `/api/sante`, ce qui vaut aussi pour le nocturne réel : un accueil cassé fera
  rougir ses tests au lieu de couper toute la suite
- **cas 148**, `traitement-retractation.ts` : deux autres gardes masquaient
  l'absence de celle-ci, la réauthentification sans session et la garde de rôle
  d'`avoir.ts` pour un CLIENT. Aucun argent ne sortait, mais un CLIENT
  réauthentifié recevait `STATUT_INCOMPATIBLE` et son `statutActuel` : **un
  oracle sans test**. Le test « ne revele pas l'etat de la demande a un compte
  CLIENT » le ferme, rouge sous mutation sur `"DEPOSEE"`
- **cas 180**, comptabilité : la détection dépendait de l'ordre des fichiers,
  « NON détecté » en fichier seul **et** en suite entière. Le test émet sa
  propre pièce avant sa fenêtre, trois fois vert, rouge sous mutation, fichier
  seul
- **deux motifs génériques** de bout en bout désignaient vingt-cinq et trois
  fichiers : `cas` prend un quatrième argument, le porteur imposé, qui arrête
  le script s'il ne contient plus le motif

Le script imprime aussi la **durée de chaque cas**, pour que la borne se
resserre sur une mesure du runner.

## Un contrôle à sec a remplacé une demi-heure d'attente

Les deux expressions périmées se sont révélées après 29 et 30 minutes. Un script
jetable a appliqué les 188 expressions à leur fichier sans lancer de test :
**une seule restait périmée** après la première correction, trouvée en deux
secondes. Il vit dans le scratchpad de la session, non versionné : en faire un
contrôle par PR est proposé à Christophe, pas décidé.

## Les bornes montent, après la correction du coût et non à sa place

Arbitrage de Christophe : une durée plus longue la nuit ne pose pas de problème.
Borne de l'étape à **150 min**, plafond du job à **180**. Estimation, et non
mesure : 100 à 115 min pour ce script sur un runner 1,5 à 1,8 fois plus lent
que le poste, plus 15 min pour les cinq autres preuves.

## Ce qui a dérapé

- mes sondes injectées par `perl` dans le service ont échoué deux fois en
  silence, dont une qui ne correspondait à rien : c'est une assertion
  volontairement fausse dans le test qui a donné l'issue réelle
- **une instabilité observée une fois** : « dissocie la commande et ne la
  supprime pas », `suppression-compte`, a rougi sur la suite entière pendant la
  preuve du cas 180, mutation limitée à un autre fichier et sans écriture. Non
  reproduite sur la suite complète qui a suivi, 1734 passés. Non ticketée, à
  surveiller : même famille que LS-231

## Vérifications

```
type-check, lint, test          CODE 0, 1734 passed
verifier-regles, grep-q-pipefail, tests-non-ignores, couverture-mutations   0
shellcheck verifier-tests-mutation.sh   propre
controle a sec                  188 expressions, 0 perimee
```

## État des tickets

**LS-252** : critère 1 fait (cas 96 prouvé), critère 2 fait (cause mesurée,
corrigée, prouvée), critère 3 fait en local (180 cas jusqu'au verdict). Reste à
voir la même chose sur le runner.

**LS-235** : critère 7 ouvert, le nocturne doit repasser au vert. Premier
nocturne portant ces corrections : celui qui suit la fusion.

## Prochaine étape

1. Fusionner, puis lancer le nocturne à la main pour ne pas attendre la nuit
2. Lire la durée cas par cas sur le runner, resserrer les deux bornes
3. Proposé à Christophe : le contrôle à sec par PR, et une cadence
   hebdomadaire de la preuve complète si les deux heures pèsent
