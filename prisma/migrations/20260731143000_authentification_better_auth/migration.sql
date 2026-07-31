-- Authentification, les quatre tables de Better Auth 1.6, LS-70.
--
-- ADR-021 decide la passkey pour l'administration, ADR-023 l'email et mot de
-- passe pour les clients. Les deux populations partagent une seule instance
-- Better Auth, donc un seul jeu de tables.
--
-- MIGRATION ECRITE A LA MAIN, comme celle de LS-67 et pour une raison de plus.
-- `prisma migrate dev` est interactif, donc impossible a scripter, et le SQL
-- que `migrate diff` produit contenait ici TROIS instructions destructrices a
-- ecarter :
--
--   DROP INDEX journal_email_systeme_unique
--   DROP INDEX paiement_reussi_unique
--   DROP INDEX section_produit_ordre_unique
--
-- Les deux premieres sont la fausse derive connue des index partiels : leur
-- predicat emploie IN, que PostgreSQL normalise en `= ANY (ARRAY[...])`, et
-- Prisma lit cet ecart de forme comme une difference reelle. Les index sont
-- presents en base, verifie par pg_indexes avant d'ecrire ce fichier.
--
-- La troisieme etait le vrai danger. `section_produit_ordre_unique` est une
-- contrainte UNIQUE DEFERRABLE creee par LS-67, forme que Prisma ne sait pas
-- exprimer : il la voit donc a supprimer et NE LA RECREE PAS. Appliquer le SQL
-- genere tel quel aurait silencieusement retire la contrainte qui permet de
-- permuter deux rangs de sections, ADR-026.
--
-- Cette migration est donc PUREMENT ADDITIVE : trois colonnes, quatre tables,
-- leurs index et leurs cles etrangeres. Rien n'est supprime.

-- ---------------------------------------------------------------------------
-- Utilisateur, les trois colonnes attendues par Better Auth
-- ---------------------------------------------------------------------------
--
-- `nom` est NULLABLE alors que Better Auth declare `name` requis dans son
-- schema coeur : sa route d'inscription en exige toujours un, aucune ligne
-- qu'il ecrit ne le laisse vide. Le rendre obligatoire ici imposerait une
-- valeur aux comptes crees par un autre chemin, sans rien a y mettre.
--
-- `mis_a_jour_a` porte un DEFAULT alors que Prisma genere la colonne sans.
-- La table est vide aujourd'hui, la migration passerait donc en local dans les
-- deux cas ; sur une table peuplee un NOT NULL sans defaut echoue. Une
-- migration qui ne vaut que pour une base vide n'est pas une migration.
ALTER TABLE "utilisateur"
  ADD COLUMN "nom" TEXT,
  ADD COLUMN "image" TEXT,
  ADD COLUMN "mis_a_jour_a" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------------
-- Session, le jeton de connexion
-- ---------------------------------------------------------------------------
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Compte, le moyen d'authentification. `password` porte une EMPREINTE, jamais
-- le mot de passe : invariant 9, un secret ne se stocke pas en clair.
-- ---------------------------------------------------------------------------
CREATE TABLE "compte" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "password" TEXT,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(3),
    "refresh_token_expires_at" TIMESTAMPTZ(3),
    "scope" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "compte_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Verification, jetons a usage unique. Aucune cle etrangere vers utilisateur :
-- `identifier` porte une adresse email qui n'a pas encore de compte.
-- ---------------------------------------------------------------------------
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Passkey, WebAuthn, ADR-021
-- ---------------------------------------------------------------------------
CREATE TABLE "passkey" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "public_key" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "device_type" TEXT NOT NULL,
    "backed_up" BOOLEAN NOT NULL,
    "transports" TEXT,
    "aaguid" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passkey_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");
CREATE INDEX "session_user_id_idx" ON "session"("user_id");
CREATE INDEX "compte_user_id_idx" ON "compte"("user_id");
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");
CREATE INDEX "passkey_user_id_idx" ON "passkey"("user_id");

-- UNIQUE et non un simple index, plus strict que le schema de reference du
-- plugin passkey, qui n'en pose qu'un ordinaire. Une credential WebAuthn est
-- unique par construction, rien en base ne l'imposait : deux lignes portant la
-- meme credential sur deux comptes distincts entraient sans erreur, et la
-- recherche par credential a la connexion aurait alors eu deux comptes a
-- departager. C'est le risque d'acces croise qu'ADR-021 demande de couvrir.
CREATE UNIQUE INDEX "passkey_credential_id_unique" ON "passkey"("credential_id");

-- ---------------------------------------------------------------------------
-- Cles etrangeres
--
-- CASCADE sur les trois : session, compte et passkey sont des moyens d'acces,
-- ils n'ont aucune valeur sans leur compte. A la difference de
-- Commande.utilisateur_id, en SET NULL, une commande devant survivre a la
-- suppression du compte, avec `dissocie_a` marque AVANT la suppression.
-- ---------------------------------------------------------------------------
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "compte" ADD CONSTRAINT "compte_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
