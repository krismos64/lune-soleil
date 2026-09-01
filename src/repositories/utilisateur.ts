/**
 * Lectures et ecritures du compte utilisateur, LS-158.
 *
 * Ce fichier n'ouvre aucune transaction et ne decide rien : le service
 * appelant lui passe le client, et c'est lui qui juge. Ces requetes vivaient
 * dans `services/utilisateur.ts` et `services/suppression-compte.ts`, seuls
 * acces directs a Prisma hors des services de socle : rapatriees ici pour que
 * la frontiere des couches reste vraie, arbitrage de LS-158.
 *
 * AUCUNE FONCTION N'ECRIT `role`, regle E11 : ce champ ne se pose ni depuis un
 * formulaire ni depuis ce fichier, et `ecrireProfil` n'accepte que les
 * champs que son type enumere.
 */
import type { ClientBase } from "@/repositories/stock";

/**
 * Met a jour les champs de profil fournis, et eux seuls.
 *
 * Le type ferme la porte : ajouter un champ ici est un geste visible en revue,
 * quand un `data` libre laisserait passer `role` sans bruit.
 */
export async function ecrireProfil(
  client: ClientBase,
  utilisateurId: string,
  champs: { nom?: string },
): Promise<void> {
  await client.utilisateur.update({
    where: { id: utilisateurId },
    data: champs,
  });
}

/**
 * Le compte pour l'export RGPD : identite et nombres de moyens de connexion.
 *
 * LES VALEURS NE SORTENT PAS, seul leur nombre : `_count` compte les comptes
 * et les passkeys sans jamais charger l'empreinte ni la cle publique.
 */
export async function lireCompteExport(
  client: ClientBase,
  utilisateurId: string,
) {
  return client.utilisateur.findUnique({
    where: { id: utilisateurId },
    select: {
      email: true,
      nom: true,
      emailVerifie: true,
      creeA: true,
      _count: { select: { comptes: true, passkeys: true } },
    },
  });
}

/**
 * Les quatre volets de l'export RGPD d'une personne.
 *
 * L'INSTANTANE LEGAL DE LA COMMANDE EST INCLUS : c'est bien une donnee
 * personnelle de la personne, adresses figees comprises, et elle a le droit
 * d'en recevoir copie meme si le document ne s'efface pas.
 */
export async function lireDonneesExport(
  client: ClientBase,
  utilisateurId: string,
) {
  const [adresses, commandes, avis, connexions] = await Promise.all([
    client.adresseCarnet.findMany({ where: { utilisateurId } }),
    client.commande.findMany({
      where: { utilisateurId },
      include: { lignes: true },
    }),
    client.avis.findMany({ where: { utilisateurId } }),
    client.journalConnexion.findMany({
      where: { utilisateurId },
      orderBy: { creeA: "desc" },
    }),
  ]);

  return { adresses, commandes, avis, connexions };
}
