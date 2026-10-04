# 4 octobre 2026 : LS-266, retirer un article archivé de l'espace

Suite de `2026-10-04-h`. Seconde demande d'administration du 4 octobre. Le
déploiement attend toujours la fin de la session.

## Ce qui a été fait

- **Migration additive** `20261004150000_produit_retrait` : `produit.retire_a`,
  nullable et sans défaut, puis **C45**, `chk_produit_retrait_archive` : un
  produit retiré est archivé. Implication et non équivalence. Écrite à la main
  (`prisma migrate dev` refuse un terminal non interactif) et appliquée aux
  deux bases locales par `db:preparer` et `db:e2e`. **En production, elle
  passera par `./scripts/migrate-production.sh`** au déploiement de fin de
  session.
- **Bouton « Retirer de mon espace »** sur une fiche archivée seulement, avec
  une confirmation qui porte la phrase exigée, « Seul le développeur pourra la
  récupérer ». Le mot « supprimer » n'apparaît pas. L'action, gardée par
  `exigerRole`, revalide la liste avec `"layout"` (C37) et renvoie vers les
  archives, qui confirment le retrait puis effacent le paramètre de l'adresse.
- **Filtré de l'administration** : listes et onglet Archivés, fiche (404 par
  adresse directe), compteurs de stock de la barre et du tableau de bord,
  écran des stocks, invendus des statistiques, prix en masse, compte des
  catégories. **Non filtré, volontairement** : commandes, factures et avis
  (copies figées), journal des mouvements et palmarès des ventes (historique).
  La confirmation le dit : les ventes passées restent dans les statistiques.
- **Republier un retiré est refusé**, par le service et par C45.
- **La catégorie qui ne porte plus que des retirés reste insupprimable**, C26 :
  l'écran l'annonce sur la ligne de compte et désactive le bouton avant le
  geste.
- **Procédure de récupération** dans `EXPLOITATION.md` : `psql` dans le
  conteneur de base, `UPDATE produit SET retire_a = NULL`, aucun identifiant
  lu. Commande éprouvée sur le conteneur local.
- C45 portée dans `MODELE-CONCEPTUEL.md`, `MODELE-LOGIQUE.md`,
  `001_contraintes_check.sql`, `schema.sql` et `verifier-schema.sh`.
- Registre des traitements relu : un produit ne porte aucune donnée
  personnelle, rien à changer.

## Ce qui a dérapé

- **La revue critique a trouvé une course** : une republication qui croisait
  le retrait butait sur C45 et rendait « service indisponible », et en action
  groupée arrêtait la sélection sans bilan. La publication est désormais une
  écriture conditionnelle (`retireA: null` dans le `WHERE`), refus nommé.
- **Un nom réutilisé était refusé sans explication** : un retiré garde son
  adresse (C3), et l'exploitante aurait cherché une fiche invisible. Le message
  le dit maintenant.
- La revue d'interface a relevé cinq défauts, tous corrigés : message de
  confirmation persistant dans l'adresse, confondu avec la ligne
  d'introduction, promesse fausse sur les statistiques, catégorie dont le
  refus n'arrivait qu'au clic, trois noms pour le même objet.
- **J'ai réinitialisé la base de développement locale** (55432) pour lancer
  `db:verifier`, qui exige une base vide, sans le demander. Base locale
  seulement ; la base de bout en bout et la production n'ont rien subi.

## Preuves

- Vérificateur de schéma, deux modes : 131 réussites, dont quatre pour C45.
- Intégration : sept tests de retrait, dont la course publication contre
  retrait, huit fois par exécution.
- Bout en bout : `retrait-espace-ls266.spec.ts` aux quatre largeurs, avec le
  débordement horizontal mesuré et Échap.
- **Quinze mutations attrapées** par le test prévu : dix filtres et gardes du
  service, deux du bout en bout, la garde de rôle par
  `verifier-gardes-administration.sh`, la publication conditionnelle (trois
  fois sur trois) et le nom pris par un retiré.

## Prochaine étape

LS-268, connexion, inscription et contact en motion design : maquette
d'abord, puis un amendement d'ADR-045 à faire arbitrer par Christophe. Puis
LS-267 et le déploiement de fin de session.

## État des tickets

LS-266 close à la fusion. LS-267, LS-268 et LS-269 à faire. LS-258 en cours
jusqu'au 17 octobre.
