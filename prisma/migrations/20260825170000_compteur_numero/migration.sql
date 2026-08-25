-- LS-117, ADR-031 : la numerotation des documents sequentiels.
--
-- POURQUOI UNE TABLE ET NON UNE `SEQUENCE`. Une sequence PostgreSQL n'est pas
-- transactionnelle : un `nextval` consomme par une transaction annulee est
-- perdu pour toujours. Sur ce projet le refus de stock est un cas FREQUENT et
-- non une anomalie, le catalogue etant fait de pieces uniques : chaque refus
-- creerait un trou dans la numerotation des commandes.
--
-- L'incrementation par `UPDATE ... RETURNING` prend au contraire un verrou de
-- ligne tenu jusqu'au `COMMIT`, et rend le numero avec la transaction si elle
-- est annulee. Aucun trou en fonctionnement normal.
--
-- UNE LIGNE PAR TYPE ET PAR ANNEE. La remise a zero annuelle de
-- `MODELE-LOGIQUE.md` est implicite : une nouvelle annee cree sa propre ligne
-- au premier document, par `INSERT ... ON CONFLICT`. Aucun amorcage manuel du
-- 1er janvier, dont l'oubli bloquerait toute vente.
--
-- TROIS TYPES PREVUS, un seul employe aujourd'hui. `type` porte COMMANDE,
-- FACTURE ou AVOIR : les deux dernieres sequences arriveront en phase 4 sans
-- nouvelle migration. Volontairement pas un enum, ADR-031 : ajouter une valeur
-- a un enum est une migration, et le piege du predicat d'index partiel a montre
-- qu'un enum elargi ouvre en silence des chemins non revus.
CREATE TABLE "compteur_numero" (
    "type" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "dernier" INTEGER NOT NULL,

    CONSTRAINT "compteur_numero_pkey" PRIMARY KEY ("type","annee")
);

-- Un compteur ne decroit jamais, meme regle que `nombre_envois` du journal
-- d'emails. Le premier document de l'annee ecrit 1, jamais 0.
ALTER TABLE "compteur_numero"
  ADD CONSTRAINT "chk_compteur_numero_positif"
  CHECK ("dernier" >= 1);
