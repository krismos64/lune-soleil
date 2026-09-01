# 1er septembre 2026, session D : la dette de cohérence du code, LS-158

Story de convergence issue des deux audits croisés du matin : aucun
comportement visible ne change, trois familles de copies disparaissent.
Arbitrage de Christophe sur la frontière Prisma : dérogation écrite pour les
services de socle, repositories pour le métier.

## Un seul endroit où des centimes deviennent des euros

`src/lib/montant.ts` porte désormais `formaterMontant`, promue de l'écran des
commandes qui avait le meilleur commentaire des huit copies, et
`centimesVersSaisie` pour la valeur d'un champ de saisie, qui existait en deux
exemplaires. Neuf copies remplacées dans sept écrans, le module d'affichage
des commandes et le gabarit PDF ; la garde de `lib/` prévoyait déjà « formatage
de montants en centimes » comme contenu légitime.

Après la passe, `grep "/ 100"` ne rend plus rien dans `src/app/` ni
`src/integrations/`, hors le `getTime() / 1000` de Stripe qui est un horodatage.

## exigerRole vit une fois, avec un seul contrat

Sept fichiers d'actions portaient chacun leur copie, avec trois signatures de
retour : booléen, identité ou `Headers`. La version `Headers` ne servait à
rien, ses cinq appelants testant la valeur en booléen. La fonction unifiée vit
dans `services/autorisation.ts`, rend `IdentiteAppelant | null`, et reçoit les
en-têtes en paramètre : le fichier de garde des services interdit d'y lire la
requête, et c'est ce qui a fixé la signature.

Les 27 sites d'appel passent par `exigerRole(await headers())`. Le contrôle
`verifier-gardes-administration.sh` reste voyant, prouvé par mutation manuelle :
la garde retirée de la seule `creerCategorieAction` fait échouer le contrôle en
nommant cette fonction, et la restauration rend « 20 actions, toutes gardées ».

## La frontière Prisma, arbitrée et contrôlée dans les deux sens

Quatorze appels de modèle directs vivaient dans six services. Le sort de
chacun :

- `utilisateur.ts` et `suppression-compte.ts` passent par un
  `repositories/utilisateur.ts` neuf : profil et lectures de l'export RGPD.
  Aucune fonction n'y écrit `role`, règle E11
- `document-comptable.ts` réutilise `lireFactureDeCommande`, qui existait déjà
  dans le repository des factures : l'appel direct était une redondance
- `journal-connexion.ts`, `purge-journaux.ts` et `reauthentification.ts`
  dérogent, tables d'infrastructure et non de domaine, liste arbitrée dans
  `.claude/services-socle-prisma.txt`

`verifier-regles.sh` porte le contrôle, sur le motif des familles sans action :
un service hors liste qui appelle un modèle échoue, et une ligne de la liste
dont le service n'appelle plus rien échoue aussi, une dérogation ne se gardant
pas en réserve. `prisma.$transaction` et `$queryRaw` restent hors motif,
l'ouverture de transaction par le service étant l'architecture d'ADR-024.

## Un compte dérivé de plus, trouvé en passant

Le `README.md` annonçait « douze fois » pour le script de mutation des règles,
qui portait **treize** cas : le cas 8bis de LS-106 était entré sans que la
phrase soit reprise, et rien ne recompte ce chiffre-là. Corrigé à **quinze**
avec les deux cas neufs, et l'énumération « huit premiers, quatre derniers »
réécrite, elle aussi fausse depuis LS-106.

## Un accroc en route

La fonction du repository s'est d'abord appelée `mettreAJourProfil`, nom que le
service exporte déjà : collision d'import vue par `tsc`, renommée
`ecrireProfil`. Et le premier passage de vérification affichait des codes de
sortie mensongers, le pipe vers `tail` les masquant, piège déjà fiché : les
codes ont été repris sans pipe avant de conclure.

## Vérifications

```
npm run type-check                     OK
npm run lint                           OK
npm run format:check                   All matched files use Prettier code style!
npm run test                           809 tests, 52 fichiers, verts en 102 s
npm run test:e2e                       386 tests verts, 4 skips conditionnels, trois largeurs
./scripts/verifier-regles.sh           32 services, 3 dérogations exercées, 41 dossiers couverts
./scripts/verifier-regles-mutation.sh  15 mutations, 15 détectées, dont les deux cas neufs
./scripts/verifier-gardes-administration.sh   20 actions, toutes gardées, prouvé par mutation
./scripts/verifier-actions-sensibles.sh       OK, 1 action sensible cohérente
```

## La revue critique n'a rien trouvé, et a laissé deux observations

`ls-critical-reviewer` a recompté les gardes fichier par fichier, 27 sur 27,
vérifié la sortie du formateur sur quatorze valeurs bornes comprises, l'espace
insécable étroit préservé, et confirmé que le type de `ecrireProfil` ferme
l'écriture de `role` sous `exactOptionalPropertyTypes`. Deux observations non
bloquantes : la limite du motif de frontière, qui ne voit que le client nommé
`prisma`, est désormais écrite dans l'en-tête du contrôle ; et une lacune
**préexistante** du contrôle des gardes, qui ne balaie que les fichiers nommés
`actions.ts` quand neuf Server Actions vivent dans trois `actions-*.ts`, part
en ticket, LS-159.

## Ce qui reste

L'arbitrage de la frontière est tracé dans le ticket, le README de garde des
services et la liste de dérogation, pas dans un ADR : si Christophe le juge
structurant, le skill `adr` en fera un. La neuvième copie du formateur, celle
du gabarit PDF, partage désormais la fonction commune : sa sortie est identique
octet pour octet, les tests du PDF qui extraient le texte le prouvent.

## Le compte de la phase 6 a bougé trois fois dans la journée

Douze le matin, treize à la création de LS-158, quatorze avec LS-159, puis
treize à la clôture de LS-158 : chaque mouvement a demandé sa PR pour une
unité, la ligne du tableau du `README.md` étant un instantané qui se périme à
chaque création ou clôture de story. La règle « relever dans Jira au moment
d'écrire » est tenue, mais sa granularité se paie. Suggestion déposée pour
arbitrage de Christophe : soit le tableau ne porte plus que l'état qualitatif
des phases (en cours, close, découpée) et renvoie à Jira pour les nombres,
soit le compte par phase reste et son coût est assumé. Aucun changement sans
arbitrage, la ligne reste comptée d'ici là.

## Prochaine étape

Inchangée depuis la session C : **LS-34 hors code en urgence**, l'échéance de
réception des factures électroniques étant atteinte, puis **LS-132** côté code,
le lien signé qui rend la facture téléchargeable, et **LS-128** pour l'avoir.

## État des tickets

LS-158 livrée et close par cette session. LS-84, LS-85, LS-82, LS-86 et LS-9
restent en cours, inchangées.
