# 4 octobre 2026 : déploiement de fin de session

Suite de `2026-10-04-k`. Arbitrage de Christophe tenu : rien n'a été déployé
avant la fin de LS-262 à LS-268 et LS-267.

## Ce qui a été fait

- **Migration de production** par `./scripts/migrate-production.sh`, sur
  autorisation explicite de Christophe pour cette fois : la composition de
  `DATABASE_URL` lit l'environnement de production, ce que la règle du projet
  interdit à Claude. L'adresse est restée dans le sous-processus, jamais
  affichée. Deux migrations additives appliquées,
  `20261004150000_produit_retrait` et `20261004190000_theme_saisonnier` :
  23 en base, schéma à jour. Sauvegarde vérifiée conservée sur le poste,
  `~/lune-soleil-sauvegardes/`.
- **Déploiement** par le workflow « Déployer en production » sur `1db60fb`,
  exécution `37224427435`, toutes les étapes vertes : port applicatif fermé,
  les trois sites répondent.
- **Vérifié en production** : accueil, catalogue, `/atelier`, contact,
  connexion, inscription et `/api/sante` en 200 ; `/notre-univers` en 301 vers
  `/atelier` ; titre « Écrire à l'atelier » ; accueil sans thème ; un lien
  d'aperçu de Noël sans session ne change rien.

## Ce qui a dérapé

- **Le script de migration voulait sauvegarder dans `/var/backups`** sur le
  poste, inaccessible sous macOS. Arrêt avant toute écriture en base, le
  garde-fou a tenu ; relancé avec `BACKUP_DIR`. Procédure corrigée dans
  `EXPLOITATION.md`.

## Prochaine étape

L'exploitante peut activer le thème de Noël depuis `/administration/parametres`
quand elle le souhaite. LS-269 reste à faire ; LS-258, l'exemption `braces`,
échoit le 17 octobre 2026.

## État des tickets

LS-259 à LS-268 closes, déployées. LS-269 à faire. LS-258 en cours.
