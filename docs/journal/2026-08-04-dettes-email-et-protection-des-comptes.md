# 4 août 2026, quatre dettes de LS-70 tranchées, et une vérification qui a corrigé ma recommandation

| Champ | Valeur |
|---|---|
| Ticket | Aucun au départ, session de décision. Cinq créés : LS-79 à LS-83 |
| Documents produits | **ADR-008** et **ADR-027** |
| Documents modifiés | `docs/REFERENCES.md`, quatre lignes |
| Contrôles | `verifier-config-claude.sh --strict` vert, `verifier-regles.sh` vert, aucun cadratin, accents complets |
| Mutation | 1 injectée sur le contrôle de cohérence, **détectée après correction de son ciblage** |
| Jira | 5 stories créées, 3 tickets existants commentés |

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
