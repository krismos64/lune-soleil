-- LS-131 : une seule alerte OUVERTE par type et par cible.
--
-- POURQUOI CET INDEX N'EXISTAIT PAS ALORS QUE LE CODE LE CROYAIT.
-- `envoi-email.ts` affirmait en commentaire que `leverAlerteCritique` refusait
-- un doublon sur la meme cible non acquittee, et son `try/catch` avait la forme
-- d'une gestion de conflit. Mesure sur la base reelle le 10 septembre 2026 :
-- `alerte_critique` ne portait qu'un seul index, sa cle primaire. Le `catch`
-- attrapait une erreur que rien ne levait.
--
-- CE QUE CA COUTAIT. La tache `envoi-emails` tourne toutes les MINUTES,
-- ADR-033 : un envoi bloque produisait une alerte par minute, soit 1440 par
-- jour. L'ecran d'alertes devenait illisible au moment precis ou l'exploitante
-- en a besoin, et une seconde anomalie survenue pendant ce temps passait
-- inapercue.
--
-- LE FILTRE EST CE QUI REND LA CONTRAINTE JUSTE. Sans lui, une alerte acquittee
-- empecherait pour toujours qu'une neuve soit levee sur la meme cible : un
-- probleme resolu puis resurgi resterait muet. Avec lui, l'acquittement libere
-- la place, ce qui est le comportement voulu.
--
-- LE PREDICAT N'EMPLOIE PAS `IN`. Prisma 7 veut recreer a l'identique, a chaque
-- `migrate dev`, les index partiels dont le predicat en contient un.
--
-- IL N'EST PAS DIFFERABLE, et ne peut pas l'etre : un index n'est pas une
-- contrainte au sens de PostgreSQL. Aucune transaction de cette story n'echange
-- deux valeurs sur ces colonnes, donc rien ne le demande.

-- LES DOUBLONS EXISTANTS SONT ACQUITTES, JAMAIS SUPPRIMES, regle E7 : une
-- alerte effacee est une incoherence dont plus rien ne porte la trace. Sur la
-- base de developpement la table est vide, mais la production peut en porter, et
-- une migration qui echouerait a la creation de l'index laisserait le
-- deploiement a moitie applique.
--
-- LE PLUS RECENT DE CHAQUE GROUPE RESTE OUVERT : c'est celui dont le message
-- decrit l'etat courant.
UPDATE "alerte_critique" AS a
SET "acquittee_a" = now()
WHERE "acquittee_a" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "alerte_critique" AS plus_recente
    WHERE plus_recente."type" = a."type"
      AND plus_recente."id_cible" IS NOT DISTINCT FROM a."id_cible"
      AND plus_recente."acquittee_a" IS NULL
      AND (plus_recente."cree_a", plus_recente."id") > (a."cree_a", a."id")
  );

CREATE UNIQUE INDEX "alerte_ouverte_unique"
  ON "alerte_critique" ("type", "id_cible") NULLS NOT DISTINCT
  WHERE "acquittee_a" IS NULL;
