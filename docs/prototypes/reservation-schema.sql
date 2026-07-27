-- Prototype de verification de la strategie de reservation
-- Section 15.4 du cahier des charges Lune & Soleil

DROP TABLE IF EXISTS reservation;
DROP TABLE IF EXISTS variante;

CREATE TABLE variante (
  id                 SERIAL PRIMARY KEY,
  reference          TEXT NOT NULL UNIQUE,
  quantite_physique  INT  NOT NULL,
  quantite_reservee  INT  NOT NULL DEFAULT 0,
  vente_web_activee  BOOLEAN NOT NULL DEFAULT true,

  -- Les trois contraintes qui constituent la derniere ligne de defense.
  -- Meme si le code applicatif se trompe, la base refuse l'operation.
  CONSTRAINT chk_physique_positif  CHECK (quantite_physique >= 0),
  CONSTRAINT chk_reservee_positif  CHECK (quantite_reservee >= 0),
  CONSTRAINT chk_pas_de_survente   CHECK (quantite_physique - quantite_reservee >= 0)
);

CREATE TABLE reservation (
  id           SERIAL PRIMARY KEY,
  variante_id  INT NOT NULL REFERENCES variante(id),
  quantite     INT NOT NULL,
  expire_a     TIMESTAMPTZ NOT NULL,
  CONSTRAINT chk_quantite_positive CHECK (quantite > 0)
);

CREATE INDEX idx_reservation_expire ON reservation(expire_a);

-- La piece unique : une seule paire de boucles d'oreilles en stock
INSERT INTO variante (reference, quantite_physique) VALUES ('LS-ECLIPSE-01', 1);
