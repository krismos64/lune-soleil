# ADR-027 : limitation de débit, journal des connexions et réauthentification

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 4 août 2026 |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-70, LS-54 |

## Ce que cet ADR précise

ADR-021 énonce cinq mesures compensatoires au maintien du mot de passe sur le
compte d'administration. Deux sont faites, livrées par LS-70 : la longueur
minimale de seize caractères, et la passkey elle-même. Une troisième, l'alerte
email de connexion, devient possible avec ADR-008.

**Les trois restantes étaient énoncées sans être définies** : « limitation de
débit stricte », « journal des connexions consultable », « durée de session
limitée avec réauthentification pour les actions sensibles ». Une mesure de
sécurité formulée en trois mots n'est pas implémentable, et laissée en l'état
elle serait implémentée au jugé ou oubliée.

Cet ADR ne remplace pas ADR-021, il en fixe le **comment**. Il en étend aussi la
portée : ADR-021 ne visait que le compte d'administration, deux des trois mesures
couvrent ici également les comptes client.

## Contexte

Le mot de passe reste disponible sur les deux types de compte : sur
l'administration par ADR-021, comme recours quand la passkey est inaccessible,
et sur l'espace client par ADR-023.

Le risque diffère selon le compte, et cette différence gouverne les décisions.

**Sur l'administration**, le mot de passe fait seize caractères et le devinage
aléatoire est hors de portée. Le risque réel est la réutilisation d'un mot de
passe compromis ailleurs, où un seul essai suffit. Aucune limitation de débit ne
protège de ce cas.

**Sur les comptes client**, le mot de passe sera court et probablement déjà
utilisé sur d'autres sites. C'est là que les essais en rafale fonctionnent, et
que la limitation de débit protège réellement.

## Décision 1, limitation de débit

**Le mécanisme intégré de Better Auth est retenu, avec `storage: "database"`.**

Le stockage en base est la partie non négociable de ce choix. Le stockage par
défaut est en mémoire : les compteurs disparaissent à chaque redémarrage et se
contredisent entre deux processus. Un compteur qu'un redémarrage remet à zéro ne
limite rien. Le projet n'a pas Redis, décision assumée, et PostgreSQL est déjà
là.

**La limitation est activée hors production.** Better Auth la désactive en
développement par défaut. Un réglage faux ne se verrait alors qu'en production,
ce qui reproduit le motif du garde-fou jamais exercé, rencontré trois fois sur ce
projet. La limitation doit être exerçable par un test.

Quatre routes portent une règle stricte, via `customRules` :

| Route | Motif |
|---|---|
| Connexion par mot de passe | la route visée par ADR-021 |
| Réinitialisation de mot de passe | sans limite, des centaines d'emails partent vers une adresse choisie |
| Inscription client | création de comptes en masse, et autant d'emails de vérification |
| Formulaire de contact | chaque envoi consomme le quota SMTP et arrive chez l'exploitante |

Trois de ces quatre routes déclenchent un email. **La limitation de débit protège
donc aussi le quota d'envoi retenu par ADR-008**, qui est plafonné.

### L'écart avec ADR-021, assumé et tracé

ADR-021 demande une limitation « par identifiant de compte ». **Le mécanisme
intégré de Better Auth compte par adresse IP.** La mesure 2 d'ADR-021 est donc
couverte partiellement, et cet écart est énoncé plutôt que résolu en silence.

Ce que le comptage par IP couvre : l'attaque automatisée depuis une machine, cas
courant.

Ce qu'il ne couvre pas : l'attaque répartie sur de nombreuses adresses, plus
coûteuse pour l'attaquant, et le verrouillage ciblé d'un compte précis.

Le comptage par compte visé demanderait du code écrit par-dessus, dans une zone
critique. Il fait l'objet d'un ticket distinct, hors Go-Live. Retenir le
mécanisme intégré maintenant vaut mieux que reporter toute limitation en
attendant la version complète.

## Décision 2, journal des connexions

**Une table dédiée au projet**, et non une table fournie par la bibliothèque : la
consultation dans l'administration fait partie de l'exigence d'ADR-021, et aucune
table de bibliothèque ne porte cet écran.

**Portée : administration et clients**, réussites et échecs.

Enregistrer les échecs est ce qui rend le journal utile. Dix échecs suivis d'une
réussite est le motif d'une attaque qui a fini par aboutir ; ne garder que les
réussites ne montre que la fin de l'histoire.

**Le mot de passe essayé n'est jamais enregistré**, même faux. Les erreurs de
saisie sont à un caractère du vrai mot de passe, et les gens saisissent souvent
celui d'un autre site. Un journal d'échecs qui les contiendrait serait une liste
de mots de passe presque justes, sur un compte dont on connaît l'adresse.

**L'adresse IP et le navigateur sont enregistrés**, avec une durée de
conservation limitée et une purge qui l'applique. Sans eux, le journal dit
« quelqu'un s'est connecté » sans permettre de distinguer l'exploitante d'un
intrus, ce qui vide la mesure de son sens.

Trois conséquences suivent, et aucune n'est optionnelle :

1. **La durée de conservation reste à fixer**, aux sources. Une durée n'est pas
   une décision d'architecture, c'est une obligation à vérifier, et ce projet
   interdit de décider d'une obligation juridique. La CNIL publie des
   recommandations sur les journaux de connexion.
2. **La purge existe en même temps que la table.** Une durée écrite dans un
   document et appliquée par personne est fictive.
3. **Le registre des traitements mentionne ce journal.**

## Décision 3, session et réauthentification

**Durée de session d'administration : un jour, prolongée à l'usage.** Elle valait
sept jours.

L'exploitante reste connectée tant qu'elle travaille, et une machine laissée de
côté se déconnecte le lendemain. Sept jours donnaient à un appareil volé une
semaine d'accès aux données personnelles de tous les clients. Descendre à
quelques heures imposerait plusieurs saisies quotidiennes du mot de passe de
seize caractères sur un appareil sans passkey, ce qui pousse à le raccourcir ou à
l'écrire : une mesure de sécurité qu'on subit finit contournée.

**Quatre familles d'actions exigent une réauthentification, session ouverte ou
non :**

| Action | Ce qu'elle permettrait sans garde |
|---|---|
| Changer le mot de passe ou la passkey | verrouiller la vraie propriétaire dehors, ce qu'un intrus fait en premier |
| Exporter ou consulter en masse les données clients | le risque principal nommé par ADR-021 |
| Rembourser ou émettre un avoir | sortir de l'argent, par une écriture irréversible |
| Modifier les paramètres de la boutique | détourner des paiements par une modification discrète des coordonnées bancaires |

La réauthentification protège mieux qu'une session courte pour une gêne moindre,
puisqu'elle ne s'active qu'aux moments qui comptent. Avec une passkey, elle coûte
un contact du doigt.

### La liste des actions sensibles doit être prouvée complète

Une liste d'actions écrite à la main a exactement la forme du défaut rencontré
trois fois sur ce projet : un drapeau ajouté sans être porté dans toutes les
conditions d'accès. Si une action sensible est oubliée, rien n'échoue et le trou
reste invisible.

**Un contrôle de complétude est donc exigé**, sur le modèle de ceux qui existent
déjà : une liste énumérée à la main reste une opinion tant qu'un contrôle de
cardinalité ne la confronte pas au code réel.

## Alternatives écartées

**Redis pour les compteurs de débit.** Écartée, le projet n'a pas Redis et
PostgreSQL suffit à ce volume. L'ajouter pour cette seule fonction introduirait
un service à exploiter sur le VPS.

**Blocage complet du compte après N échecs.** Écartée sur un effet pervers :
échouer volontairement sur l'adresse de quelqu'un verrouillerait son compte. Le
ralentissement progressif casse l'attaque automatique sans jamais fermer la porte
au vrai propriétaire.

**Session de quelques heures sans réauthentification.** Écartée, voir plus haut :
la gêne quotidienne pousse à affaiblir le mot de passe, et la fenêtre de vol
reste ouverte pendant les heures de travail, qui sont précisément celles où
l'appareil est sorti.

**Journal limité au compte d'administration**, périmètre strict d'ADR-021.
Écartée : un compte client compromis expose l'adresse et l'historique d'achat de
son propriétaire, et le journal est ce qui permet de répondre à une réclamation.

**Ne rien enregistrer d'identifiant, ni IP ni navigateur.** Écartée : sans eux le
journal n'aide pas à juger si une connexion était légitime, et une mesure qui
n'aide pas à décider ne justifie pas la table qui la porte.

## Conséquences

**Une migration ajoute deux tables** : celle de Better Auth pour les compteurs de
débit, et le journal des connexions. Les migrations se créent à la main sur ce
projet, `migrate dev` étant interactif.

**La durée de session passe de sept jours à un jour** dans la configuration de
Better Auth. Aucune session existante n'est concernée, aucun compte réel n'étant
ouvert à ce jour.

**Une fonction de réauthentification est écrite**, appelée par les actions
sensibles, avec le contrôle de complétude qui l'accompagne.

**Les tests portent sur le comportement, pas sur la présence du code.** Un test
qui vérifie qu'une limitation est configurée ne prouve pas qu'elle refuse la
requête de trop. Le projet a déjà mesuré l'écart entre un garde-fou de cardinalité
resté vert et le contrôle de comportement qui, lui, voyait le défaut.

**La purge du journal est une fonctionnalité**, avec sa propre vérification.

## Risques

**La limitation de débit peut gêner un usage légitime.** Une famille derrière la
même connexion partage une adresse IP. Le réglage doit laisser passer plusieurs
essais avant de ralentir, et le message d'erreur doit rester compréhensible.

**Le comptage par IP est contournable.** C'est l'écart assumé plus haut. Il ne
doit pas être présenté comme une couverture complète de la mesure 2 d'ADR-021.

**Le journal devient une cible.** Il concentre les adresses IP et les habitudes
de connexion. Sa consultation est réservée à l'administration, et la purge limite
ce qu'une fuite exposerait.

**Une réauthentification mal placée bloque l'exploitante.** Si elle est exigée sur
une action fréquente, elle sera vécue comme un obstacle. La liste des quatre
familles est volontairement courte.

**Un contrôle de complétude mal ancré crie partout ou rate le fichier
critique.** Le projet a déjà rencontré les deux extrêmes ; l'ancrage se prouve
par mutation.
