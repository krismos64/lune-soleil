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
 * L'etat de verification de l'adresse, LS-54.
 *
 * LECTURE DEDIEE PLUTOT QU'UN CHAMP AJOUTE A `IdentiteAppelant`. Ce type est
 * volontairement reduit a ce dont une decision d'AUTORISATION a besoin, et son
 * fichier le dit : « une vue qui les veut les relit, ce qui evite qu'un champ
 * d'affichage se retrouve a fonder une autorisation ».
 *
 * Le distinguo compte ici plus qu'ailleurs : la verification d'adresse ne
 * conditionne AUCUN acces, arbitrage du 2 septembre 2026. La porter dans
 * l'identite inviterait tot ou tard a l'y employer.
 */
export async function lireEtatVerification(
  client: ClientBase,
  utilisateurId: string,
): Promise<boolean> {
  const utilisateur = await client.utilisateur.findUnique({
    where: { id: utilisateurId },
    select: { emailVerifie: true },
  });

  /*
   * DEFAUT « NON VERIFIE » quand le compte est introuvable. Le cas ne devrait
   * pas se produire, l'identite venant d'une session valide, mais le sens du
   * repli n'est pas neutre : « verifie » ferait disparaitre le rappel a
   * l'ecran, donc masquerait l'anomalie au lieu de la montrer.
   */
  return utilisateur?.emailVerifie ?? false;
}

/**
 * Ce que le GABARIT de l'espace client affiche en tete de barre, LS-180.
 *
 * UNE SEULE REQUETE POUR DEUX CHAMPS, ET C'EST LA RAISON D'ETRE DE CETTE
 * FONCTION. Le layout a besoin du nom, pour la pastille d'initiales et la
 * salutation, ET de l'etat de verification, pour la mention sous le nom.
 * Composer `lireEtatVerification` avec une seconde lecture ferait DEUX allers
 * vers la base a chaque rendu de page de l'espace client, sur toutes les
 * navigations, pour deux colonnes de la meme ligne.
 *
 * `lireEtatVerification` RESTE, ET N'EST PAS REMPLACEE : la page `/compte`
 * l'appelle pour son rappel de verification, et elle seule. Les deux fonctions
 * lisent la meme colonne sans se recouvrir, l'une pour une decision d'affichage
 * ponctuelle, l'autre pour l'en-tete permanent.
 *
 * LE NOM PEUT ETRE VIDE, et ce n'est pas une anomalie : `nom` est facultatif au
 * compte, l'inscription ne le demandant pas. L'appelant decide quoi montrer a
 * sa place, ce fichier ne tranche pas un affichage.
 */
export async function lireEnteteEspaceClient(
  client: ClientBase,
  utilisateurId: string,
): Promise<{ nom: string | null; emailVerifie: boolean } | null> {
  return client.utilisateur.findUnique({
    where: { id: utilisateurId },
    select: { nom: true, emailVerifie: true },
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
