# 1er novembre 2026 : retrait d'un avis par son auteur, LS-305

Suite de la relecture des mentions légales, LS-28. La page promettait le retrait
d'un avis « à votre demande », aucun chemin ne le permettait, et la trace d'un
avis écarté n'avait aucune durée.

**Arbitrages de Christophe du même jour** : code 3213ZZ confirmé sur
l'attestation ; capture de la console Backblaze, point de terminaison
`s3.eu-central-003`, donc stockage aux Pays-Bas ; anonymiser plutôt que
supprimer, « aucune suppression en production » maintenue ; durée de la trace
laissée à la recommandation, retenue à cinq ans (article 2224 du code civil).

## Fait

- **ADR-049**, complète ADR-028 : retrait par l'auteur, anonymisation, trace de
  cinq ans, avis effacé jamais republié. Règle **R19** ajoutée, R6 amendée.
- **Migration additive** `20261101150000_avis_efface` : colonne `efface_a`
  nullable et `chk_avis_efface_anonyme`, une implication vers commentaire et
  auteur nuls. Reportée dans `schema.sql`, `001_contraintes_check.sql` et
  `verifier-schema.sh`, deux contrôles neufs dans les deux sens.
- `effacerAvisDeLAuteur` : effacement filtré sur l'auteur et `effaceA` nul
  **d'abord**, ce qui verrouille la ligne, passage en `RETIRE` ensuite. Point 12
  des transactions critiques de `database.md`.
- `appliquerDecision` filtre sur `effaceA` nul : la modération ne republie pas un
  avis effacé, et publie toujours l'avis d'un compte supprimé.
- Purge `Avis` dans `purge-journaux.ts`, `CONSERVATION_TRACE_AVIS_ANNEES = 5`,
  calcul d'années partagé avec les messages (`reculerDAnnees`).
- **Interface** : bouton « Retirer cet avis » sur chaque carte de `/compte/avis`,
  confirmation qui dit le caractère définitif, redirection et annonce hors de la
  liste (la carte disparaît avec son bouton).
- Page légale (rubrique « Retirer son avis », cinq ans), politique de
  confidentialité (retrait, Backblaze aux Pays-Bas), registre T7 et section des
  destinataires, `PARCOURS.md`, procédure des droits des personnes.

## Vérifié

- Intégration : `retrait-avis.sequential.test.ts`, dix cas, dont le négatif
  d'autrui, le rejeu, l'avis refusé qui garde sa décision, la frontière des cinq
  ans, et l'avis d'un compte supprimé qui reste modérable.
- **Mutation**, cinq défauts injectés sur `repositories/avis.ts`, chacun vu par
  le test qui lui est destiné : filtre d'auteur retiré, garde `effaceA` retirée
  de `appliquerDecision`, `lt` en `lte`, filtre de statut de la purge retiré,
  passage en `RETIRE` supprimé. Restauré par `git checkout`.
- Suite complète : 1899 sur 1900, l'échec est `paiement-session` (assertion
  globale sur base partagée, déjà relevé), 15 sur 15 sur trois relances isolées.
  Construction verte.
- `purge-journaux` a rougi sur l'énumération des tables, comme son commentaire
  le prévoit : liste mise à jour après inscription au registre.
- Bout en bout : 148 passés sur `compte-avis`, `informations-legales` et
  `mentions-retractation`, retrait aux quatre largeurs.
- `db:verifier` : 137 réussites, 0 échec.

## Revues, corrigé dans la même branche

**`ls-critical-reviewer`**, aucun défaut bloquant, deux relevés :

- **Un avis déposé sans compte restait orphelin** : il prend l'auteur de la
  commande au dépôt, donc aucun, et le rattachement de la commande ne le suivait
  pas. Son auteur ne pouvait pas le retirer, alors que la page l'annonçait.
  `rattacherAvisDesCommandes` le rattache dans la transaction de rattachement,
  **à chaque passage** et pas seulement quand une commande vient d'être
  rattachée : une commande rattachée avant LS-305 ne se rattache plus. Trois cas
  neufs dans `rattachement-commandes.sequential.test.ts`, mutation vue par deux.
- **La course avec la modération n'était exercée par aucun test.** Un test tient
  le verrou de ligne sur une seconde connexion et lance une republication dans
  la fenêtre : elle attend, puis n'écrit rien. Il prouve aussi que `update` de
  Prisma 7 avec `effaceA: null` est une seule instruction : une mutation en
  lecture puis écriture le fait rougir. L'inversion de l'ordre des deux
  écritures, que la revue croyait invisible, est vue par le test négatif
  existant, mesuré.

**`ls-frontend-revue`** : le succès est devenu `AnnonceRetrait`, qui prend le
focus (le bouton disparaît avec la carte), porte un nom, retire le paramètre de
l'adresse et se remonte à chaque retrait par une clé aléatoire. Bouton de
confirmation en `.actionDanger`. Confirmation reformulée (« pour cet achat »,
R2 porte sur la ligne et non sur l'article). La page légale ne se contredit plus
sur les cinq ans, et dit qu'un avis déposé sans compte rejoint l'espace client.
Test de bout en bout : 44 px du bouton de confirmation, région nommée,
focus reçu, adresse nettoyée, débordement après redirection. 124 passés.

## Relevé, non traité

- **Un compte supprimé laisse ses avis avec leur texte**, ADR-028, et son
  auteur n'a plus d'écran pour les retirer. Demande non outillée : la procédure
  conseille de retirer ses avis avant de supprimer le compte. À trancher :
  effacer le texte des avis à la suppression du compte.
- `verifier-hook-secrets.sh` : 19 échecs en local, identiques sur `main` sans
  cette branche, dépendants de l'environnement de session.

## Prochaine étape

- Migration de production par `./scripts/migrate-production.sh`, puis
  déploiement, puis contrôle du bouton en production.
- Nocturne du 2 novembre pour LS-304.
