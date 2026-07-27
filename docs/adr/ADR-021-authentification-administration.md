# ADR-021 : authentification de l'administration par passkey

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 27 juillet 2026 |
| Décideur | Christophe Mostefaoui, avec l'exploitante |
| Amende | Cahier des charges section 6.2 et exigence F-ACC-01 |
| Ticket | LS-17 |
| Vérifié via | Context7, Better Auth 1.6.23 |

## Contexte

L'administration donne accès aux nom, adresse, email et téléphone de toutes les
clientes, à toutes les factures, à l'historique des commandes et à la
modification des prix. L'exigence F-ACC-01 la classe Must sur le jalon Go-Live,
et la section 29.3 fait de son absence de protection un critère de refus
d'ouverture.

Le cahier des charges prévoyait en section 6.2 un compte administrateur unique
partagé par Stacy et sa soeur, protégé par une application d'authentification à
mot de passe à usage unique, dont le secret serait enregistré sur les deux
téléphones.

Deux éléments de contexte réel ont invalidé cette hypothèse.

**La répartition des rôles est différente de celle supposée.** Stacy est la seule
à gérer le site. Sa soeur intervient sur la création des bijoux et les marchés,
sans accès au back-office. Le compte partagé n'a donc plus d'objet.

**L'exploitante refuse le second facteur par application**, jugé trop compliqué
et contraignant, et propose de changer son mot de passe régulièrement à la place.

Cette proposition n'est pas retenue : un mot de passe seul sur un back-office
contenant des données personnelles de clientes expose l'ensemble des données dès
lors que ce mot de passe est réutilisé sur un autre site compromis, ce qui est le
scénario de compromission le plus courant. Le changement régulier de mot de passe
n'est plus une recommandation de la CNIL ni de l'ANSSI, la pratique poussant à
des mots de passe plus faibles et prévisibles.

## Décision

**Un seul compte administrateur**, celui de Stacy. La soeur n'a pas d'accès au
back-office.

**Authentification principale par passkey**, sur le standard WebAuthn, via le
plugin `@better-auth/passkey` de Better Auth. Stacy se connecte par Touch ID sur
son MacBook ou Face ID sur son iPhone.

**Mot de passe conservé comme méthode de secours**, avec les mesures
compensatoires listées plus bas.

Cette décision satisfait F-ACC-01 : la passkey est un facteur de possession lié
au matériel, plus fort qu'un code à usage unique puisqu'elle résiste au
hameçonnage. L'exigence n'est pas réduite, son mode d'application change.

## Pourquoi la passkey lève l'objection de l'exploitante

| Critère | Mot de passe seul | Application OTP | Passkey |
|---|---|---|---|
| Effort par connexion | saisir le mot de passe | mot de passe puis code à six chiffres | une empreinte |
| Application à installer | non | oui | non |
| Résiste au vol de mot de passe | non | oui | oui, il n'y en a pas |
| Résiste au hameçonnage | non | partiellement | oui, lié au domaine |

La passkey est **moins contraignante** qu'un mot de passe tout en étant plus
sûre qu'une application d'authentification. L'objection portait sur la
contrainte, elle ne s'applique pas.

## Matériel de l'exploitante et synchronisation

Stacy possède un iPhone et un MacBook avec Touch ID, sur le même compte iCloud.
La passkey se synchronise par le trousseau Apple entre les deux appareils. Elle
l'enregistre une fois et se connecte depuis l'un ou l'autre.

Plusieurs passkeys peuvent être enregistrées : l'API `addPasskey` accepte un nom,
ce qui permet de distinguer les appareils.

## Chaîne de secours, du plus simple au plus lourd

Le scénario de la caméra ou du capteur défaillant a été explicitement soulevé et
doit rester couvert.

| Situation | Comment Stacy se connecte |
|---|---|
| Cas normal | Touch ID ou Face ID, deux secondes |
| Face ID indisponible | code de déverrouillage de l'appareil, comportement natif iOS |
| Un appareil en panne | passkey synchronisée sur l'autre appareil |
| Appareil tiers, iPhone en main | QR code affiché à la connexion, scanné puis validé par Face ID |
| Appareil tiers sans son iPhone | email et mot de passe |
| Mot de passe oublié | lien signé expirant envoyé sur son adresse |
| Email inaccessible | codes de récupération imprimés, conservés hors ligne |

Elle ne peut pas se retrouver sans accès.

## Mesures compensatoires liées au mot de passe

Le mot de passe restant disponible, le niveau de sécurité réel serait celui du
mot de passe si rien ne l'entourait. Cinq mesures l'encadrent.

1. Longueur minimale de seize caractères. La valeur par défaut de Better Auth est
   de huit, insuffisante pour un compte administrateur sans second facteur.
2. Limitation de débit stricte sur la route de connexion.
3. Alerte email à chaque connexion réussie par mot de passe, avec date et
   contexte technique non sensible. Une connexion qui n'est pas la sienne devient
   immédiatement visible.
4. Journal des connexions consultable dans l'administration.
5. Durée de session limitée, avec réauthentification pour les actions sensibles.

L'alerte email est la mesure la plus utile des cinq : elle transforme une
compromission silencieuse en incident détecté.

## Alternatives écartées

**Application d'authentification à mot de passe à usage unique**, ce que prévoyait
le cahier des charges. Écartée sur refus de l'exploitante, et devenue moins
pertinente : la passkey offre une protection supérieure contre le hameçonnage
pour un effort moindre.

**Mot de passe seul avec changement régulier**, ce que proposait l'exploitante.
Écartée. Contredit un Must et un critère de refus d'ouverture, et le changement
périodique n'est plus recommandé par les autorités compétentes.

**Passkey seule, sans mot de passe.** Plus sûre, mais laisse Stacy sans recours si
ses deux appareils deviennent inaccessibles en même temps. Envisageable plus tard,
une fois l'usage de la passkey confirmé sur plusieurs semaines. Notée comme
évolution possible, pas retenue au lancement.

**Deux comptes administrateur distincts**, un par soeur. Sans objet puisque la
soeur n'accède pas au back-office.

## Conséquences

Le plugin `@better-auth/passkey` s'installe en dépendance distincte de
`better-auth`. Il ajoute une table `passkey` au schéma.

`emailAndPassword` reste activé, avec `minPasswordLength` porté à seize et
`sendResetPassword` branché sur le fournisseur d'email, dont le choix reste
ouvert dans ADR-008.

La section 6.2 du cahier des charges est amendée sur deux points : le compte
n'est plus partagé, et le mode du second facteur change. La conséquence positive
est que le journal d'audit devient exploitable, puisque l'actrice est identifiée.

L'enregistrement de la passkey doit se faire **avec Stacy**, depuis ses propres
appareils. Il ne peut pas être préparé à sa place. À prévoir dans le guide
d'administration et lors de la première séance de recette.

Les codes de récupération sont générés à la configuration, imprimés et conservés
hors ligne par l'exploitante. Ils ne sont ni stockés en clair ni transmis par
email.

## Risques

**Panne du fournisseur d'email.** Si l'email est indisponible et que Stacy a
perdu ses appareils, le lien de réinitialisation ne lui parvient pas. Les codes de
récupération hors ligne sont la seule réponse. Leur existence doit être vérifiée
avant l'ouverture, pas supposée.

**Le mot de passe reste le maillon faible.** Un mot de passe long, la limitation
de débit et l'alerte de connexion réduisent le risque sans l'éliminer. Le passage
en passkey seule est l'évolution qui le supprime.

**Accès croisé.** Un test négatif doit vérifier qu'une passkey enregistrée ne
permet pas d'ouvrir une session sur un autre compte. À couvrir dans la phase
fondations.

**Perte simultanée des deux appareils et des codes.** Aucun recours automatique.
La procédure de dernier ressort passe par une intervention manuelle en base, à
documenter dans le guide d'exploitation et à réserver au développeur.
