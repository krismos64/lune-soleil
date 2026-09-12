# 12 septembre 2026 : le déploiement qui attendait, et deux dettes tracées

Session courte, aucun code écrit. Elle part d'une question de Christophe sur
l'état du projet et se termine par une production à jour, deux tickets créés et
un défaut de la chaîne de livraison mis au jour.

## Ce qui a été fait

| Sujet | État |
|---|---|
| Déploiement de `1edbd55` vers `e07534a` | **fait**, 66 commits et 4 migrations |
| LS-219, les interrupteurs d'alerte inertes | **créée** |
| LS-220, aucun signal d'écart avec la production | **créée** |

## La question qui a tout déclenché

Christophe a demandé où en était le projet. J'ai lu le journal de la veille et
relevé les comptes dans Jira : 188 sur 218, quand le journal disait 184 sur 208.
Dix tickets créés depuis, et le compte du journal déjà périmé. Motif « un compte
recopié n'est pas une mesure », qui se vérifie une fois de plus.

Puis il a signalé que Statistiques, Avis et Paramètres étaient toujours dans la
section « Bientôt disponible » de l'administration en production.

**J'avais répondu deux fois que ces écrans étaient livrés.** C'était vrai sur
`main` et faux en production, et c'est la production qu'il regardait. La
distinction comptait, je ne l'avais pas faite.

## L'écart, et pourquoi personne ne l'a vu

```
production : 1edbd55   déployé le 10 septembre à 18 h 52
main       : e07534a   image publiée le 11 à 14 h 37
écart      : 66 commits, 4 migrations
```

L'écart embarquait LS-61, LS-64, LS-77, LS-83, LS-98, LS-218 et deux ADR.

**Le déclenchement manuel n'est pas le défaut.** Les quinze derniers
déploiements sont tous en `workflow_dispatch`, sur plusieurs jours : la chaîne a
toujours fonctionné ainsi, et `EXPLOITATION.md` explique pourquoi. Les 9 et 10
septembre, le déploiement suivait chaque fusion de si près, jusqu'à sept fois
dans la journée du 10, que l'enchaînement paraissait automatique.

Le défaut est qu'aucun signal ne dit qu'une image publiée attend. Ni le hook de
démarrage, ni le contrôle de fin de session, ni le nocturne. LS-220 le porte.

## Une mesure fausse, prise pour un fait

En cherchant ce que la production servait, j'ai lu le fichier de navigation au
commit déployé et conclu que la liste des rubriques à venir était vide.

**La mesure était fausse.** `git show <sha>:<fichier>` me rendait 154 lignes
quand `git grep` lisait la ligne 452 du même fichier au même commit. Les deux ne
pouvaient pas avoir raison.

Le blob lu directement a tranché : 479 lignes, et la liste portait bien les trois
entrées que Christophe décrivait.

```
export const RUBRIQUES_A_VENIR = [
  { libelle: "Statistiques", ticket: "LS-64" },
  { libelle: "Avis", ticket: "LS-61" },
  { libelle: "Paramètres", ticket: "LS-98" },
] as const;
```

**La leçon est de ne pas conclure sur une sortie qui contredit une autre.** Deux
outils du même dépôt donnaient des réponses incompatibles, et j'ai failli garder
la première. Le troisième outil, `git cat-file` sur le blob, est celui qui ne
passe par aucune interprétation de chemin.

## La migration

Les quatre migrations en attente sont additives, aucune instruction destructive.
Le garde-fou 1 l'a confirmé avant d'agir.

```
4 migration(s) analysee(s), aucune instruction destructive.
  20260910220000_identifiant_colis_expedition
  20260911010000_signalement_avis
  20260911020000_compteur_compte_vise
  20260911110000_parametres_boutique
All migrations have been successfully applied.
```

**Le garde-fou 2 a bloqué au premier essai**, et c'était juste : `BACKUP_DIR`
vaut `/var/backups/lune-soleil`, un chemin de la machine, alors que le script
tourne depuis le poste. La variable est surchargeable, la sauvegarde est partie
ailleurs.

**Une sauvegarde d'avant-migration ne se laisse pas dans un répertoire
éphémère.** Le premier jet l'écrivait dans le scratchpad de session, qui
disparaît avec elle. Elle vit désormais dans `~/sauvegardes-lune-soleil/`, à côté
de celle du 10 septembre, et son intégrité est vérifiée par `pg_restore --list`.

Vérifié sur la base réelle après coup : 19 migrations, les trois tables neuves
présentes, et la ligne unique de `parametre_boutique` amorcée.

## Le déploiement

```
Étape 1, sauvegarde préalable          sauvegarde faite
Étape 3, contrôle du schéma            migrations attendues 19, appliquées 19
Étape 5, attente d'un conteneur sain   conteneur sain après 10 s
Étape 6, vérification domaine public   https://lune-soleil.fr/api/sante rend 200
Étape 8, non-régression SmartPlanning  smartplanning.fr 200, analytics 200
Port 3002 injoignable depuis l'extérieur, conforme.
```

Le résultat visible, celui de la question de départ :

```
/administration/statistiques   307
/administration/avis           307
/administration/parametres     307
```

307 est la redirection vers la connexion, donc les routes existent. Avant, elles
rendaient 404.

## Deux dettes, dont une seule méritait un ticket

Le journal de la veille en signalait deux. Les deux ont été vérifiées dans le
code plutôt que reprises telles quelles, et elles n'ont pas le même statut.

**Les interrupteurs d'alerte, dette réelle.** Mesuré : seul `alerteMessageRecu`
est lu par un service. Les quatre autres ne vivent que dans le formulaire, la
validation et le dépôt, soit le circuit « je coche, j'enregistre, je relis ma
coche ». Et `destinataireNotification` n'existe nulle part ailleurs, donc il
manque aussi l'envoi lui-même : les deux moitiés sont à écrire. LS-219.

**Les scripts de mutation, fausse dette.** 26 sur 41 ne tournent nulle part,
mais **LS-213 a déjà tranché** le 10 septembre : ils prouvent les contrôles et
n'ont pas vocation à tourner par pull request. Le journal de la veille signalait
un manque sans voir l'arbitrage rendu la veille encore.

**Chercher le ticket avant de conclure à une dette** est ce qui a évité d'ouvrir
un ticket contre une décision prise.

## Ce qui reste, et se signale

**L'adresse d'alertes est un marqueur invalide.** La migration amorce
`a-configurer@exemple.invalid`. Tant qu'elle n'est pas remplacée dans l'écran
Paramètres, l'alerte de message reçu, seule des cinq à être câblée, part vers une
adresse qui n'existe pas.

**Le conteneur `cron` tourne depuis 36 heures** et n'a pas été recréé. C'est le
défaut connu depuis le 10 septembre : il est construit sur l'hôte, le workflow ne
le reconstruit jamais, et son crontab se périme à chaque story qui ajoute une
tâche. Non traité ici, hors du périmètre d'un déploiement.

## Prochaine étape

Trois tickets restent faisables sans dépendre de l'exploitante, inchangés depuis
la veille : **LS-145**, mesurer F-ADM-07 au chronomètre ; **LS-150**, arbitrer la
visibilité dans les moteurs de réponse ; **LS-35**, e-reporting.

S'y ajoutent les deux tickets créés aujourd'hui, **LS-219** et **LS-220**, dont
aucun n'est bloqué.

Restent bloquées sur les photographies de LS-23 : LS-107 critères 4 et 6, LS-140
critère 1, LS-123 pour `/notre-univers`.
