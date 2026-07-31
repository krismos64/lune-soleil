/**
 * Jeu de donnees minimal pour les tests d'integration, LS-68.
 *
 * DONNEES OUVERTEMENT FICTIVES. Les noms portent le prefixe « TEST », les
 * references le prefixe « TEST- », et le catalogue reel n'en contient aucune.
 * Le cahier des charges interdit d'introduire des donnees de prototype comme
 * donnees reelles : un jeu de test qui ressemble a du catalogue finit recopie
 * dans une base de demonstration, puis cite comme un prix pratique.
 *
 * MINIMAL AU SENS STRICT : uniquement ce que les cles etrangeres et les
 * contraintes NOT NULL exigent pour qu'une variante existe et soit reservable.
 * Ajouter des champs facultatifs rendrait le jeu plus fragile a chaque evolution
 * du schema sans rien prouver de plus.
 */
import { randomUUID } from "node:crypto";

import type { Client } from "pg";

export type ContexteStock = {
  varianteId: string;
  produitId: string;
  categorieId: string;
};

/**
 * Cree une categorie, un produit et une variante avec le stock demande.
 *
 * `quantitePhysique` vaut 1 par defaut : la piece unique est le cas du projet,
 * chaque bijou etant fait main. C'est aussi le seul cas ou la survente se voit
 * sans ambiguite, un exemplaire vendu deux fois.
 */
export async function creerVarianteEnStock(
  client: Client,
  options: {
    quantitePhysique?: number;
    venteWebActivee?: boolean;
    archivee?: boolean;
  } = {},
): Promise<ContexteStock> {
  const {
    quantitePhysique = 1,
    venteWebActivee = true,
    archivee = false,
  } = options;

  const categorieId = randomUUID();
  const produitId = randomUUID();
  const varianteId = randomUUID();
  const suffixe = varianteId.slice(0, 8);

  await client.query(
    `INSERT INTO categorie (id, nom, slug, ordre, cree_a)
     VALUES ($1, 'TEST Categorie', $2, 1, now())`,
    [categorieId, `test-categorie-${suffixe}`],
  );

  await client.query(
    `INSERT INTO produit (id, categorie_id, nom, slug, statut, cree_a, modifie_a)
     VALUES ($1, $2, 'TEST Produit', $3, 'ACTIF', now(), now())`,
    [produitId, categorieId, `test-produit-${suffixe}`],
  );

  await client.query(
    `INSERT INTO variante (
       id, produit_id, reference, libelle, prix_centimes,
       quantite_physique, quantite_reservee, vente_web_activee, archivee_a, cree_a
     )
     VALUES ($1, $2, $3, 'TEST Variante', 4900, $4, 0, $5, $6, now())`,
    [
      varianteId,
      produitId,
      `TEST-${suffixe.toUpperCase()}`,
      quantitePhysique,
      venteWebActivee,
      archivee ? new Date() : null,
    ],
  );

  return { varianteId, produitId, categorieId };
}

/**
 * Cree une commande en attente de paiement, support obligatoire d'une
 * reservation depuis ADR-024.
 *
 * Les montants sont a zero : ces tests portent sur le stock, pas sur le calcul
 * monetaire. Un total invente ici serait un nombre sans signification que
 * quelqu'un finirait par prendre pour une reference.
 */
export async function creerCommande(client: Client): Promise<string> {
  const commandeId = randomUUID();
  const adresse = JSON.stringify({
    nom: "TEST Destinataire",
    ligne1: "1 rue de Test",
    codePostal: "00000",
    ville: "TESTVILLE",
    pays: "FR",
  });

  await client.query(
    `INSERT INTO commande (
       id, numero, statut, email_normalise, nom_client,
       adresse_livraison, adresse_facturation,
       sous_total_centimes, mode_livraison, frais_port_centimes,
       total_centimes, montant_taxe_centimes,
       cgv_acceptees_a, cgv_version, cree_a
     )
     VALUES (
       $1, $2, 'EN_ATTENTE_PAIEMENT', 'test@example.invalid', 'TEST Client',
       $3::jsonb, $3::jsonb,
       0, 'DOMICILE', 0,
       0, 0,
       now(), 'test', now()
     )`,
    [commandeId, `TEST-${commandeId.slice(0, 8)}`, adresse],
  );

  return commandeId;
}
