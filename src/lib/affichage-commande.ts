/**
 * Mise en forme d'une commande, LS-121. Partage par l'administration et la
 * boutique.
 *
 * CE MODULE NE DECIDE RIEN ET NE LIT RIEN : il traduit des valeurs en texte
 * lisible. Il vit a part parce qu'une page Next.js ne doit exporter que ses
 * conventions, `metadata`, `dynamic` et son composant : y ajouter des fonctions
 * utilitaires les rend inatteignables depuis le detail et brouille le contrat
 * du fichier de route.
 *
 * DEPLACE DE `app/administration/commandes/` VERS `lib/` PAR LS-57, et ce
 * deplacement est ce qui evite une source seconde. L'espace client affiche les
 * MEMES statuts et les MEMES modes de livraison : les recopier aurait produit
 * deux tables a garder d'accord, dont la divergence se serait vue le jour ou un
 * statut est ajoute, cote client seulement. Quatre fichiers d'administration
 * l'importaient deja par des chemins relatifs remontants, `../commandes/
 * affichage`, ce qui signalait qu'il n'etait plus a sa place.
 *
 * UN ENUM AJOUTE FAIT ECHOUER LE `type-check` sur `LIBELLES_STATUT` ET
 * `LIBELLES_LIVRAISON`, tous deux exhaustifs : c'est ce qui empeche un statut
 * ou un mode d'apparaitre vide a l'ecran, piege deja rencontre sur ce projet.
 *
 * `LIBELLES_LIVRAISON` ne l'etait PAS jusqu'a la revue frontend de LS-57, et
 * cette phrase l'annonçait deja pour les deux : un commentaire qui promet plus
 * que le code est ce qui a laisse l'asymetrie passer.
 *
 * `LIBELLES_PAIEMENT` reste volontairement faible, voir son propre commentaire.
 */
import type { ModeLivraison, StatutCommande } from "@/generated/prisma/enums";

/** Libelle affichable d'un statut, jamais la valeur brute de l'enum. */
export const LIBELLES_STATUT: Record<StatutCommande, string> = {
  EN_ATTENTE_PAIEMENT: "En attente de paiement",
  CONFIRMEE: "Confirmée",
  EN_PREPARATION: "En préparation",
  EXPEDIEE: "Expédiée",
  LIVREE: "Livrée",
  ANNULEE: "Annulée",
};

/**
 * Libelle d'un statut de paiement, axe distinct du statut de commande.
 *
 * `Record<string, string>` EST ASSUME ICI, a la difference des deux tables
 * voisines : les colonnes de paiement sont lues en `string` par
 * l'administration, qui applique deja un repli. Aucun ecran client ne
 * l'emploie. Le jour ou l'un le fera, ce type devra devenir exhaustif comme
 * les autres.
 */
export const LIBELLES_PAIEMENT: Record<string, string> = {
  EN_ATTENTE: "En attente",
  REUSSI: "Réussi",
  ECHOUE: "Échoué",
  PARTIELLEMENT_REMBOURSE: "Partiellement remboursé",
  REMBOURSE: "Remboursé",
};

/**
 * Libelle d'un mode de livraison, ADR-025.
 *
 * `Record<ModeLivraison, string>` ET NON `Record<string, string>`, corrige par
 * la revue frontend de LS-57. Le typage faible laissait passer un mode ajoute a
 * l'enum : `LIBELLES_LIVRAISON[mode]` rendait `undefined`, que React affiche en
 * chaine vide, et le champ « Livraison » de l'ecran client apparaissait VIDE
 * sans qu'aucun controle n'ait rougi.
 *
 * Mutation faite pour le prouver : ajouter `CONSIGNE` a `ModeLivraison` ne
 * faisait echouer que le tunnel, jamais ce fichier. Avec le type exhaustif, il
 * echoue ici aussi, et c'est ce qui empeche un mode d'apparaitre vide.
 *
 * L'en-tete de ce fichier annonçait cette protection pour `LIBELLES_STATUT`
 * seul : un commentaire qui couvre un cas et laisse croire qu'il les couvre
 * tous est ce qui a permis a l'asymetrie de passer.
 */
export const LIBELLES_LIVRAISON: Record<ModeLivraison, string> = {
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
