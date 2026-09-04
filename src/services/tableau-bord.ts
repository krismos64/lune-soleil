/**
 * Tableau de bord et pastilles de l'administration, LS-181.
 *
 * CE SERVICE NE CHANGE AUCUN ETAT. Il lit, il agrege, il ne decide d'aucune
 * transition et n'ouvre aucune transaction : les comptages qu'il rend sont un
 * instantane d'affichage, jamais une base de decision metier. Un ecran qui
 * afficherait « 2 a preparer » puis en preparerait deux sur la foi de ce nombre
 * serait faux ; c'est la liste qui fait foi, pas la pastille.
 *
 * OU VIT LE JUGEMENT, ET POURQUOI ICI. Le repository sait compter, il ne sait
 * pas ce qu'est un stock faible. Ce seuil est une regle d'exploitation, il vit
 * donc dans la couche qui porte les regles, et il est nomme plutot qu'ecrit
 * dans une requete.
 *
 * L'AUTORISATION N'EST PAS FAITE ICI, invariant 2 : chaque page appelle
 * `exigerAdministratrice` avant de rendre, et le layout ne protege rien. Ce
 * service est appele depuis des composants serveur deja gardes.
 */
import { prisma } from "@/lib/prisma";
import * as depot from "@/repositories/tableau-bord";

export type ComptagesAdministration = depot.ComptagesAdministration;

/**
 * En dessous de combien de pieces disponibles une variante est signalee.
 *
 * UN EXEMPLAIRE, ET C'EST LE CAS NOMINAL DU PROJET, non un cas limite : chaque
 * bijou etant fait main, la piece unique est la regle. Signaler « il en reste
 * un » est donc l'alerte utile, celle qui laisse le temps de refaire la piece
 * avant la rupture.
 *
 * CE SEUIL N'EST PAS PARAMETRABLE AUJOURD'HUI, et c'est deliberé. Le mettre en
 * base demanderait l'ecran de parametres commerciaux, qui est le sujet de
 * LS-98 : une constante nommee ici se deplace en une ligne le jour ou cet ecran
 * existe, une colonne posee trop tot devrait etre migree deux fois.
 */
export const SEUIL_STOCK_FAIBLE = 1;

/**
 * Les comptages alimentant la barre laterale et les tuiles du tableau de bord.
 *
 * UNE SEULE REQUETE, jouee une fois par rendu du layout. Voir le repository
 * pour la raison : la barre est rendue sur chaque navigation.
 */
export async function lireComptages(): Promise<ComptagesAdministration> {
  return depot.compterPourAdministration(prisma, SEUIL_STOCK_FAIBLE);
}
