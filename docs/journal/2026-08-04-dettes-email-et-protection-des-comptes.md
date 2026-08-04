# 4 août 2026, quatre dettes de LS-70 tranchées, et une vérification qui a corrigé ma recommandation

| Champ | Valeur |
|---|---|
| Ticket | Aucun au départ, session de décision. Cinq créés : LS-79 à LS-83 |
| Documents produits | **ADR-008** et **ADR-027** |
| Documents modifiés | `docs/REFERENCES.md`, quatre lignes |
| Contrôles | `verifier-config-claude.sh --strict` vert, `verifier-regles.sh` vert, aucun cadratin, accents complets. Après correction des dépendances : audit à zéro, lint, types, build, 60 tests |
| Mutation | 1 injectée sur le contrôle de cohérence, **détectée après correction de son ciblage** |
| Sources vérifiées | délibération CNIL n° 2021-122, documentation OVHcloud, deux avis GitHub |
| Jira | 5 stories créées, 5 tickets existants commentés |

Aucune ligne de code écrite. Cette session a fermé quatre décisions laissées
ouvertes par LS-70, qui auraient été reprises au jugé ou oubliées.

## Ce que je comptais mal au départ

J'ai annoncé « trois dettes » en fin de session précédente. ADR-021 énonce **cinq
mesures compensatoires**, dont deux étaient déjà faites, et l'alerte email de
connexion n'est pas une décision séparée : elle est une conséquence de la
décision sur l'email. Quatre points restaient à trancher, pas trois.

Le journal de LS-70 disait aussi qu'ADR-008 « n'a pas tranché le fournisseur ».
C'est vrai dans un sens que je n'avais pas vu : **le fichier n'existait pas**.
ADR-008 était un numéro réservé depuis le cahier des charges, cité par quatre
endroits comme une décision ouverte, sans document derrière.

## L'email, ou comment ma première recommandation était trop rapide

J'ai recommandé un fournisseur transactionnel en avançant trois arguments, dont
un faux.

**« Tu ne sauras pas si l'email est arrivé. »** Christophe m'a demandé de vérifier
comment SmartPlanning fait, puisque son système lui semblait tracé sans service
externe. La vérification a corrigé deux choses.

SmartPlanning **passe bien par un service externe**, le SMTP d'Hostinger. La
différence avec un fournisseur transactionnel tient au type de service, non à la
présence d'un tiers.

Et sa traçabilité existe, en base : une table `EmailLog` avec destinataire, type,
statut, identifiant de message. Trois précautions bien vues, reprises dans
ADR-008 : le log ne lève jamais, le retry s'arrête sur une erreur
d'authentification plutôt que de réessayer trois fois pour rien, et la table a
été ajoutée **après coup** pour combler un angle mort que son propre commentaire
avoue.

**Ma phrase était donc trop rapide.** On peut tracer beaucoup en SMTP classique.

Ce qui reste vrai, et qui est le coeur du compromis : un statut `ENVOYE` signifie
que **le serveur a accepté le message**, pas que le destinataire l'a reçu. Le
refus tardif, l'indésirable et l'adresse inexistante restent invisibles, quelle
que soit la qualité du code.

**Décision : SMTP OVH, traçabilité en base dès le premier envoi, et facture
téléchargeable depuis l'espace client.** Ce dernier point est la réponse à
l'angle mort : l'email transporte la facture, il n'en est pas le seul chemin.

Le vrai travail technique n'est pas l'envoi, c'est le DNS. SPF, DKIM et DMARC
sont nécessaires avec OVH aussi. LS-29 le notait déjà, avec une phrase qui reste
vraie telle quelle : cette démarche a un délai que le développeur ne contrôle
pas.

## Better Auth sait faire ce que je croyais devoir écrire

Vérifié par Context7 sur la version 1.6.11, proche de celle du projet.

La limitation de débit intégrée sait stocker ses compteurs **en base**,
`storage: "database"`, avec une table créée par migration. Pas besoin de Redis,
que le projet a écarté, ni de code à écrire.

Le stockage par défaut est **en mémoire**. Un compteur qu'un redémarrage remet à
zéro ne limite rien, et deux processus se contredisent. C'est la partie non
négociable du choix.

Deuxième point relevé par Context7, et il compte davantage : **la limitation est
désactivée en développement**. Un réglage faux ne se verrait qu'en production.
C'est exactement le motif du garde-fou jamais exercé, rencontré trois fois sur ce
projet, dont deux fois pendant LS-70 elle-même. ADR-027 impose donc de l'activer
hors production.

**Un écart avec ADR-021 est tracé plutôt que résolu en silence.** L'ADR demande
une limitation « par identifiant de compte », Better Auth compte par adresse IP.
Le mécanisme intégré arrête l'attaque automatisée venue d'une machine, non
l'attaque distribuée ni le verrouillage ciblé. Le comptage par compte devient
LS-83, hors Go-Live.

## Ma mutation ratait sa cible, pour la deuxième fois sur ce projet

Le contrôle `verifier-config-claude.sh` vérifie que chaque ADR accepté figure
dans la table de `REFERENCES.md`. Je l'ai muté en retirant la ligne d'ADR-027 de
la table.

**Il est resté vert.** Premier réflexe : le contrôle ne fait pas ce qu'il
annonce.

Faux. Le contrôle cherche l'identifiant avec `grep -q "$id" docs/REFERENCES.md`,
donc **n'importe où dans le fichier**. Or j'avais aussi cité ADR-027 en ligne 36,
dans la colonne « dette » de `src/lib/auth.ts`. Retirer la ligne de la table
laissait l'autre mention, et le contrôle était satisfait.

Muté correctement, en retirant les deux mentions, il rougit et sort en 1 :

```
CONFIGURATION CLAUDE CODE, 1 point(s) à vérifier :
  - ADR-027 accepté mais absent de la table de docs/REFERENCES.md
CODE DE SORTIE: 1
```

**Deuxième fois que le vert d'une mutation accuse le contrôle à tort**, après
LS-70 où trois substitutions ne trouvaient plus leur motif. Le réflexe correct
est de suspecter la mutation d'abord, puis le contrôle.

Cette mutation révèle en prime un ancrage discutable : **le contrôle cherche
l'identifiant partout, pas dans la table**. Un ADR mentionné en passant dans une
autre section le satisfait sans figurer dans la table d'aiguillage, qui est
pourtant ce que la prochaine session lit. Trop large, motif déjà connu ici. Noté,
non corrigé dans cette session.

## Les décisions, en une table

| Sujet | Retenu | Écarté |
|---|---|---|
| Envoi d'emails | SMTP OVH, nodemailer, trace en base, facture téléchargeable | fournisseur transactionnel, envoi depuis le VPS, deux canaux selon la criticité |
| Limitation de débit | Better Auth intégré, `storage: "database"`, actif hors production, quatre routes | Redis, blocage complet après N échecs |
| Journal des connexions | table dédiée, administration **et** clients, réussites **et** échecs, IP conservée avec purge | portée administration seule, aucune donnée identifiante |
| Session | un jour prolongé à l'usage, réauthentification sur quatre familles d'actions | sept jours inchangé, quelques heures |

Trois précisions qui ne sont pas des décisions d'architecture et ne se tranchent
pas ici :

**La durée de conservation du journal se vérifie aux sources.** Décider d'une
obligation juridique est un interdit du projet. La CNIL publie des
recommandations sur les journaux de connexion.

**La purge existe en même temps que la table.** Une durée appliquée par personne
est fictive.

**La limite d'envoi de l'offre OVH n'est pas connue.** Je l'avais citée comme un
risque en la supposant basse, sans l'avoir vérifiée. Elle se vérifie à la source.

## Le point qui demandera le plus d'attention à l'implémentation

La liste des actions sensibles de LS-81 a exactement la forme du défaut rencontré
trois fois ici : **un drapeau ajouté sans être porté dans toutes les conditions
d'accès**. Si une action sensible est oubliée, rien n'échoue et le trou reste
invisible.

Un contrôle de cardinalité est exigé, et son ancrage se prouve par mutation :
trop étroit il rate le fichier critique, trop large il crie partout. Les deux
extrêmes ont été rencontrés, et la présente session vient d'en produire un
troisième exemple sur `verifier-config-claude.sh`.

## Les deux chiffres, vérifiés aux sources après coup

Les ADR ont d'abord été écrits avec deux trous assumés, refermés dans la même
session.

### Six mois pour le journal, délibération n° 2021-122

Source : **délibération n° 2021-122 du 14 octobre 2021** de la CNIL, publiée au
Journal officiel. Le point 8 recommande une durée **comprise entre six mois et un
an**. Six mois retenu, le bas de la fourchette : le point 9 décrit une
sécurisation « essentiellement active » avec alertes traitées en temps réel, que
ce projet n'aura personne pour exercer, et le volume conservé est lui-même un
risque que la CNIL nomme.

Deux points du texte confortent des choix déjà pris. Le point 6 recommande
d'éviter de dupliquer dans les journaux les données du traitement principal, et
le point 22 de ne pas y conserver de données personnelles issues de celui-ci :
c'est ce que fait ADR-027 en interdisant d'enregistrer le mot de passe essayé.

Le point 7 ajoute une exigence non couverte, une conservation **ségrégée du
système principal**. Notée dans LS-80, elle relève d'une infrastructure que ce
projet mono-tenant n'a pas.

### Environ 200 messages par heure chez OVH

Chiffre relevé dans la documentation OVHcloud, page « Web Hosting, email sending
best practices », pour le MX Plan inclus avec l'hébergement.

**Le risque que j'avais énoncé était surestimé.** Une commande déclenche trois à
quatre messages : il faudrait une cinquantaine de commandes dans la même heure
pour approcher le plafond. J'avais cité cette limite comme un risque sans l'avoir
vérifiée.

**L'offre est le MX Plan**, confirmé par Christophe dans la journée : le chiffre
s'applique bien au compte du projet. Une seule réserve subsiste, la documentation
écrit « around 200 », donc un ordre de grandeur et non un seuil contractuel. Un
troisième chiffre, 300 par heure et par IP, vient d'un forum et n'est pas retenu.

**OVHcloud recommande lui-même un service tiers pour l'envoi en volume**,
newsletters et transactionnel en masse. Cela ne contredit pas ADR-008 au volume
attendu, mais s'appliquera le jour où une newsletter partira, cas qu'aucun ADR
n'a tranché.

## Deux avis de sécurité, et l'override qui casse ou non selon le contexte

La CI est passée au rouge sur `npm audit`, indépendamment de cette branche :
`brace-expansion` 5.0.8 et `fast-uri` 3.1.4, deux avis « high » parus le jour
même. La règle du projet exige zéro.

**Le cas de `brace-expansion` méritait une vérification et non un réflexe.** Le
commentaire de `package.json` porte une leçon antérieure : overrider
`brace-expansion` seul avait cassé ESLint avec `expand is not a function`. Ce
précédent aurait pu faire écarter l'override.

Il ne s'applique pas ici, et la distinction tient en une phrase : **ce cas-là
montait de 3.x à 5.x**, changement d'API, quand celui-ci va de **5.0.8 à 5.0.9**,
même branche, `minimatch` étant déjà en 10.x et appelant l'API 5.x. Vérifié par
le lint plutôt que supposé.

L'avis précise que la mitigation de 5.0.8 est justement celle qui est contournée,
donc 5.0.9 n'est pas facultative.

Pour `fast-uri`, la chaîne est
`prisma > @prisma/dev > @prisma/streams-local > ajv`. Corrigé en 3.1.5 sur la
branche 3.x ; la 4.1.2 aurait imposé un changement majeur qu'`ajv` n'attend pas.

Après installation : audit à zéro, lint, types, `prisma generate`, build, 60
tests. Le principe déjà écrit dans `package.json` s'applique aux deux, **viser la
version corrigée sans toucher aux versions majeures**.

## Une valeur en clair dans le journal de la CI

Le journal de l'intégration continue **affichait `BETTER_AUTH_SECRET` en clair**,
dans le bloc `env:` de chaque étape suivante, sur un dépôt public.

La cause tient à une règle de GitHub qui se comprend mal : **il ne masque que les
valeurs qu'il connaît déjà**, celles déclarées dans son magasin. Une valeur
engendrée pendant l'exécution lui est inconnue, donc elle traverse les journaux
telle quelle. Le commit `6779616` de LS-70, qui a introduit ce secret jetable,
n'avait pas ce réflexe.

Aucune conséquence réelle : la valeur naît d'`openssl` à chaque exécution et meurt
avec le runner. Le motif est ailleurs, **une valeur en clair tolérée dans un
journal apprend à ne plus regarder les suivantes**, exactement comme le secret de
complaisance qu'ADR-021 et le commentaire de ce fichier écartent.

Corrigé par `::add-mask::`, avec un détail qui aurait pu passer : la valeur est
capturée dans une variable **avant** d'être masquée puis écrite. Appeler
`openssl` deux fois produirait deux valeurs distinctes, et celle qui serait
masquée ne serait pas celle qui sert.

## Relecture de la configuration, deux chiffres faux

Christophe a demandé si `CLAUDE.md`, les agents et les skills étaient à jour. Les
affirmations vérifiables ont été recomptées plutôt que relues.

**L'agent `ls-critical-reviewer` et les deux skills sont justes.** Les versions
citées correspondent, les zones critiques de `story` couvrent déjà « autorisation »
et « données personnelles », donc le journal des connexions de LS-80 y entre sans
modification.

**Deux affirmations de `CLAUDE.md` étaient fausses**, toutes deux du même genre.

« Chaque dossier de `src/` porte un fichier de garde » : faux pour trois dossiers
sur huit. `generated/` est produit par Prisma et n'en a pas besoin, mais **`app/`
est le dossier où arrivent les entrées non fiables** et n'a pas de garde. Le fait
est maintenant écrit, plutôt que masqué par une affirmation générale qui le
recouvrait.

« Deux hooks l'appuient » quand `settings.json` en déclare **trois** : le
`PostToolUse` qui rejoue `verifier-regles.sh` après chaque édition n'était
mentionné nulle part.

C'est le même motif que le README annonçant trois overrides pour cinq, trouvé une
heure plus tôt. **Un compte écrit à la main reste une opinion tant qu'un contrôle
ne le confronte pas à la source.** Contrôle 8 ajouté, qui recompte les clés
d'événement de `settings.json`.

### La première version du contrôle est restée verte

Muté en « Deux hooks », le contrôle n'a rien vu. Le texte est enveloppé à 80
colonnes et le retour à la ligne tombait **entre le chiffre et le mot** :

```
porte le contrôle avant zone critique et la clôture de la traçabilité. Deux
hooks l'appuient : `PreToolUse` bloque la lecture des secrets, ...
```

`grep -qiE "\bdeux hooks"` cherche les deux mots sur une même ligne. Le texte est
désormais aplati avant recherche, et la mutation rougit dans les deux sens,
annonce trop basse comme hook réellement retiré de `settings.json`.

**Troisième variante du même motif en une journée**, après la mutation satisfaite
par une seconde mention. Tous les documents de ce projet étant enveloppés à 80
colonnes, toute expression de plusieurs mots peut être coupée, et un contrôle
ligne à ligne y échoue **en silence**.

## Le masquage du secret, vérifié par lecture

Le correctif `add-mask` ne se prouve pas par un contrôle vert, `add-mask`
n'échouant jamais bruyamment. Journal de l'exécution 30899239112 :

```
Installer Node                    BETTER_AUTH_SECRET: ***
1. Installation des dependances   BETTER_AUTH_SECRET: ***
Engendrer le client Prisma        BETTER_AUTH_SECRET: ***
```

La valeur s'affichait en clair à ces mêmes endroits avant le correctif.

## Prochaine étape

**LS-71**, socle de validation Zod, désignée par le journal de LS-70. Elle doit
aussi remplacer la garde locale sur la quantité dans `services/reservation.ts`.
L'ordre des stories restantes de LS-2 est libre.

Les cinq stories créées ici ne s'insèrent pas dans la chaîne de phase 1 et
attendent leur tour. **LS-82 est celle qui débloque le plus** : LS-54, la
vérification d'adresse, et trois mesures d'ADR-021 en dépendent.

## État des tickets

| Ticket | État |
|---|---|
| LS-79 à LS-83 | **Créés**, à faire |
| LS-29, LS-54, LS-70 | commentés, aucune description rectifiée |
| LS-70 | **Terminé**, ses dettes sont désormais tracées ailleurs |
| LS-71 à LS-75 | À faire, ordre libre |
| LS-9, LS-10 | En cours, hors chaîne de phase 1 |
