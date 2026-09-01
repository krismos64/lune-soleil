/**
 * Mise en forme de l'administration des commandes, LS-121.
 *
 * CE MODULE NE DECIDE RIEN ET NE LIT RIEN : il traduit des valeurs en texte
 * lisible. Il vit a part parce qu'une page Next.js ne doit exporter que ses
 * conventions, `metadata`, `dynamic` et son composant : y ajouter des fonctions
 * utilitaires les rend inatteignables depuis le detail et brouille le contrat
 * du fichier de route.
 */
import type { StatutCommande } from "@/generated/prisma/enums";

/** Libelle affichable d'un statut, jamais la valeur brute de l'enum. */
export const LIBELLES_STATUT: Record<StatutCommande, string> = {
  EN_ATTENTE_PAIEMENT: "En attente de paiement",
  CONFIRMEE: "Confirmée",
  EN_PREPARATION: "En préparation",
  EXPEDIEE: "Expédiée",
  LIVREE: "Livrée",
  ANNULEE: "Annulée",
};

/** Libelle d'un statut de paiement, axe distinct du statut de commande. */
export const LIBELLES_PAIEMENT: Record<string, string> = {
  EN_ATTENTE: "En attente",
  REUSSI: "Réussi",
  ECHOUE: "Échoué",
  PARTIELLEMENT_REMBOURSE: "Partiellement remboursé",
  REMBOURSE: "Remboursé",
};

/** Libelle d'un mode de livraison, ADR-025. */
export const LIBELLES_LIVRAISON: Record<string, string> = {
  DOMICILE: "À domicile",
  POINT_RELAIS: "Point relais",
  LOCKER: "Locker",
};

/**
 * Date lisible, convertie a l'affichage seulement, invariant 8.
 *
 * `Europe/Paris` EST EXPLICITE et non deduit du serveur : un conteneur en UTC
 * afficherait sinon des heures decalees d'une ou deux selon la saison, et une
 * commande passee a 00h30 apparaitrait la veille.
 */
export function formaterDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(date);
}

/**
 * Qui a decide une transition, en clair.
 *
 * LA DISTINCTION EST LE POINT DE L'HISTORIQUE, regle S9 : savoir si une commande
 * a ete avancee par une personne ou par une tache est precisement ce qu'on vient
 * y chercher six mois plus tard.
 */
export function formaterOrigine(origine: string): string {
  switch (origine) {
    case "ADMIN":
      return "Administration";
    case "RECONCILIATION":
      return "Réconciliation automatique";
    default:
      return "Système";
  }
}

/**
 * Traduit un statut recu en `string`, avec repli sur la valeur brute.
 *
 * LES COLONNES D'HISTORIQUE SONT TYPEES `string` ET NON `StatutCommande`, parce
 * qu'elles conservent ce qui a ete ecrit, y compris un statut qui n'existerait
 * plus. Le repli est donc deliberé : un statut sans libelle s'affiche tel quel
 * plutot que de disparaitre, ce qui rendrait une ligne d'historique muette.
 */
export function traduireStatut(valeur: string): string {
  return LIBELLES_STATUT[valeur as keyof typeof LIBELLES_STATUT] ?? valeur;
}
