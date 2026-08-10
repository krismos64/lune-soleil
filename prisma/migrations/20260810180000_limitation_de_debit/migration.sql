-- Compteurs de limitation de debit, LS-79, ADR-027.
--
-- MIGRATION ECRITE A LA MAIN, `prisma migrate dev` etant interactif, meme
-- motif que la migration Better Auth de LS-70.
--
-- PUREMENT ADDITIVE : une seule table, aucune suppression.
--
-- Schema impose par Better Auth pour son stockage `database` du mecanisme de
-- rate limit : trois champs, `key`, `count`, `lastRequest`, ce dernier en
-- BIGINT, horodatage epoch millisecondes verifie via Context7.
CREATE TABLE "rate_limit" (
    "id"           TEXT NOT NULL,
    "key"          TEXT NOT NULL,
    "count"        INTEGER NOT NULL,
    "last_request" BIGINT NOT NULL,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rate_limit_key_key" ON "rate_limit"("key");
