# 7 novembre 2026 : une remise connue fait passer la commande à LIVREE, LS-312

## Constat

L'administratrice voyait C-2026-0001 « en transit » alors que le colis était
retiré et noté. En base : `expedition.livre_a` posé le 3 novembre à 14:52 UTC
(LS-311), `commande.statut` resté `EXPEDIEE`. Le compteur de la barre compte
`statut = 'EXPEDIEE'`. **Aucun code ne posait `LIVREE`** : `enregistrerSuivi`
écrivait la date seule, et l'en-tête du service des commandes renvoyait encore
à « la décision de LS-33, non prise ». Règle V11 écrite, jamais appliquée.

Sans effet juridique : le délai de rétractation se calcule sur `livre_a`.

## Fait

- `passerCommandeLivree` (`repositories/expedition.ts`) : `EXPEDIEE` vers
  `LIVREE` dans l'écriture même, sous condition du statut et d'une remise
  connue, puis l'historique `SYSTEME` sans acteur (S9), dans une transaction.
- `synchroniserSuivi` rattrape en fin de cycle toutes les commandes
  `EXPEDIEE` à remise connue, `listerRemisesNonLivrees`. **Un seul chemin** :
  une première version écrivait aussi le statut dans la boucle, et le balayage
  aurait masqué la mutation de ce second chemin. Retiré.
- `payments.md`, `PARCOURS.md` (étape 12) et l'en-tête du service des
  commandes disent désormais la source de `LIVREE`.

## Preuves

- 7 tests ajoutés à `expedition.sequential.test.ts` : passage et historique,
  aucune transition sans remise, une seule ligne d'historique sur deux cycles,
  rattrapage d'une remise antérieure, commande annulée intacte, et deux appels
  directs de `passerCommandeLivree` : la liste filtrant déjà sur les mêmes
  conditions, l'écriture devait être éprouvée seule.
- 4 mutations, chacune rouge à la main, inscrites dans
  `verifier-tests-mutation.sh` (203 cas).

## En production

PR #640 fusionnée (`54f5a2b`), déployée par le workflow, run 42379336615,
conteneur sain après 10 s, aucune migration. Au cycle de suivi de
14:23:00 UTC, C-2026-0001 est passée de `EXPEDIEE` à `LIVREE` : une ligne
d'historique `SYSTEME` sans acteur, journal applicatif `rattrapees: 1`. C'est
la transition normale du système, pas une écriture à la main (LS-246).

## Prochaine étape

- LS-313, la page « Avis clients » et le bloc de l'accueil.
- LS-291 : délais d'ADR-035 jamais codés, après vérification de L111-1 et
  L216-1.

## État des tickets

LS-312 close. Ouverts : LS-313, LS-291, LS-35.
