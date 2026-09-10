-- LS-218 : l'identifiant du colis chez le transporteur.
--
-- POURQUOI CETTE COLONNE EXISTE. L'etiquette n'est PAS stockee, decision de
-- LS-218 : elle appartient au transporteur, aucune obligation de conservation
-- ne s'y attache, et la relire ne coute rien puisque seule la CREATION du colis
-- est facturee. Cet identifiant est le seul moyen de la relire.
--
-- SANS LUI, UNE ETIQUETTE PAYEE DEVIENT IRRECUPERABLE. Il ne vivait que dans
-- l'etat du composant client : un rafraichissement, un onglet ferme ou une
-- session reprise le lendemain le perdaient definitivement, et l'exploitante
-- devait retourner sur Sendcloud, ce que la story existait precisement pour
-- supprimer. Le message de succes demandait meme de rafraichir la page.
-- Releve par la revue frontend le 10 septembre 2026.
--
-- NULLABLE, ET CE N'EST PAS UN OUBLI. Une expedition declaree A LA MAIN n'a
-- aucun colis chez le transporteur, et ce chemin reste ouvert : transporteur
-- indisponible, envoi hors Sendcloud, colis remis en main propre. La colonne
-- distingue donc « creee par l'API » de « declaree a la main », ce qu'aucune
-- autre donnee ne dit.
--
-- ENTIER ET NON TEXTE : Sendcloud rend un identifiant numerique, et la route
-- qui sert l'etiquette le valide comme tel avant de construire son URL,
-- invariant 7.

ALTER TABLE "expedition"
  ADD COLUMN "identifiant_colis" INTEGER;
