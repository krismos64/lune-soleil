# 12 août 2026, LS-90, le registre des traitements existe

## Ce qui est fait

**LS-90 est terminée**, ses cinq critères remplis.

`docs/architecture/REGISTRE-DES-TRAITEMENTS.md` recense **neuf traitements**,
chacun portant finalité, personnes concernées, catégories de données, tables,
base légale, durée de conservation, destinataires et transferts hors UE. C'est
le contenu qu'exige l'article 30 paragraphe 1 du RGPD.

Le document dit aussi **ce qu'il n'est pas** : ni la politique de
confidentialité, ni les mentions légales, ni une analyse d'impact. Ces trois
confusions conduiraient à publier un document interne, ou à croire une
obligation remplie alors qu'elle ne l'est pas.

## Les durées, et d'où elles viennent

Le projet interdit de décider d'une obligation juridique. Chaque durée est
tracée à sa source primaire, vérifiée le 12 août 2026 :

| Durée | Ce qu'elle couvre | Source |
|---|---|---|
| dix ans | factures, avoirs, pièces comptables | article L123-22 du code de commerce |
| cinq ans | rétractation et litiges | article 2224 du code civil, prescription de droit commun |
| trois ans | commandes, fin de la relation commerciale | délibération CNIL n° 2021-131 |
| deux ans | compte client inactif | délibération CNIL n° 2021-131 |
| six mois | journal des connexions | délibération CNIL n° 2021-122, déjà dans ADR-027 |

**Un lien Légifrance était faux** dans ma première rédaction, celui de la
délibération 2021-122 : l'identifiant `JORFTEXT000044292963` ne résout pas, le
bon est `JORFTEXT000044272396`. Trouvé en ouvrant le lien plutôt qu'en le
supposant juste.

## La dispense de l'article 30-5 ne s'applique pas

Point qui méritait d'être vérifié plutôt que supposé. L'article 30 paragraphe 5
dispense les organismes de moins de 250 salariés, **sauf** dans trois cas dont
il suffit qu'un seul soit rempli. Deux le sont ici : le traitement n'est pas
occasionnel, et le journal des connexions présente un risque pour les droits des
personnes. La condition d'exclusion est objectivement remplie, ce n'est pas un
choix de prudence.

## Le contrôle, et le défaut qu'il a trouvé sur moi

`scripts/verifier-registre-traitements.sh` confronte le registre au schéma dans
**trois sens**, prouvé à **12 mutations sur 12**.

Le troisième sens est celui qui protège réellement. Les deux premiers seraient
satisfaits en rangeant n'importe quelle table dans « sans donnée personnelle » :
le registre resterait complet en apparence, et faux. Le sens 3 relève les champs
personnels sur le schéma, jamais sur une liste écrite dans le script, et refuse
ce classement.

**Il a attrapé son premier défaut à l'écriture même du registre.** J'avais rangé
`MouvementStock` parmi les tables sans donnée personnelle, avec une
justification écrite de bonne foi : le mouvement décrit une pièce de stock, pas
une personne. La table porte un `acteurId` qui désigne l'exploitante. Le
classement était faux, et aucune relecture ne l'avait vu. La table est
maintenant rattachée à T9.

C'est le motif déjà connu du projet, dans sa forme documentaire : une liste
écrite à la main reste une opinion tant qu'un contrôle de cardinalité ne la
confronte pas au code réel.

## La dérive de la session, à ne pas répéter

**J'ai lancé le script de mutation avant de commiter le registre.** Les scripts
de mutation restaurent par `git checkout`, qui ne connaît pas un fichier non
suivi : les mutations des cas 3, 7, 8, 9, 10 et 11 sont restées sur le disque, et
le document portait « politique maison », « informations du site », `Entités`,
`CarnetDAdresses`, `JournalDesAcces` et une section renommée.

Réparé à la main, en vérifiant après coup plutôt qu'en supposant la restauration
faite. Le contrôle lui-même a désigné trois des traces restantes, ce qui est la
meilleure preuve de son utilité, mais il ne les aurait pas toutes vues :
« politique maison » n'est visible que par son propre contrôle de mention.

**La règle**, déjà en mémoire depuis le 11 août et vérifiée à nouveau : commiter
avant de lancer un script de mutation. Elle vaut aussi, et surtout, pour un
fichier neuf.

Un second effet du même défaut : le **cas 5 ratait sa cible**, parce que le cas 4
avait déjà consommé le motif et que la restauration entre les deux n'avait pas
opéré. Le garde-fou `muter` a correctement annoncé « mutation sans effet »
plutôt que de compter un faux « non détecté ». Une fois le fichier suivi par
git, les 12 cas passent.

## Ce qui reste dû, tracé dans le registre

Trois points identifiés, **non traités par cette story**, écrits dans le
document plutôt que résolus en silence. **Les trois ont reçu un ticket le
12 août**, à la demande de Christophe, et le registre les cite :

1. **LS-93**, la durée de conservation des avis est posée à trois ans sans texte
   qui l'impose. Ni le code de la consommation ni le référentiel CNIL n° 2021-131
   ne fixent de durée pour un avis publié. Un ADR doit trancher. Epic LS-36.
2. **LS-94**, aucune purge n'est branchée pour `JournalAudit` ni `RateLimit`,
   dont la durée est pourtant annoncée. La purge de `JournalConnexion` existe mais
   reste appelée par personne, dette ouverte depuis LS-72. Epic LS-2, bloquée par
   LS-72 et LS-90. Elle pose aussi la question de la durée de `RateLimit`, dont
   les six mois sont un alignement discutable.
3. **LS-95**, la suppression d'un compte client n'est pas implémentée, ni la
   réponse à une demande d'accès ou d'effacement, articles 15 et 17. Le schéma la
   prépare, aucun code ne l'exécute. Epic LS-36. **Elle ferait naître la première
   vraie action sensible du dépôt**, ce qui débloquerait une partie des critères
   en dette de LS-81 et LS-89.

## Traçabilité

| Canal | État |
|---|---|
| Dépôt | fusionné sur `main` en rebase, PR #94, commits `ecc5bba`, `1c7b06b`, `3067662` |
| Journal | cette page |
| Mémoire | [[lune-soleil-classement-hors-perimetre]], plus la fiche d'état du projet |
| Jira | LS-90 en Terminé, commentaire critère par critère posté |

## Prochaine étape

**Cinq stories ouvertes sur LS-2.** LS-75 reste en dernier, elle vérifie les
autres. LS-91, proxies de confiance, débloquerait l'adresse IP du journal des
connexions, aujourd'hui nulle en production derrière Nginx : c'est ce qui rend
le journal réellement exploitable, et le registre vient d'en faire un traitement
recensé.

Les critères 2, 3 et 6 de LS-89 et 3, 4, 6, 7 de LS-81 restent en dette, faute
d'actions sensibles à garder dans le dépôt.

240 tests inchangés, cette story n'ajoute aucun test Vitest. **Dix-sept scripts
de contrôle, dont sept de mutation.** 95 contrôles de schéma.
