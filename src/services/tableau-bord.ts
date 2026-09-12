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
import { nomAffichable } from "@/lib/nom-affiche";
import {
  ParametresAbsentsError,
  lireParametresBoutique,
} from "@/services/parametres";
import * as depot from "@/repositories/tableau-bord";
import * as depotUtilisateur from "@/repositories/utilisateur";

export type ComptagesAdministration = depot.ComptagesAdministration;

/**
 * En dessous de combien de pieces disponibles une variante est signalee.
 *
 * UN EXEMPLAIRE, ET C'EST LE CAS NOMINAL DU PROJET, non un cas limite : chaque
 * bijou etant fait main, la piece unique est la regle. Signaler « il en reste
 * un » est donc l'alerte utile, celle qui laisse le temps de refaire la piece
 * avant la rupture.
 *
 * IL EST PARAMETRABLE DEPUIS LE 11 SEPTEMBRE 2026, LS-98 et ADR-043. Le
 * commentaire precedent annonçait ce jour : « une constante nommee ici se
 * deplace en une ligne le jour ou cet ecran existe ». C'est ce qui a ete fait.
 *
 * LA CONSTANTE RESTE COMME VALEUR DE REPLI, et ce n'est pas une redondance.
 * `lireComptages` est appelee par le LAYOUT, donc sur chaque navigation de
 * l'administration : une lecture de parametres qui echoue y ferait tomber
 * l'ecran entier, barre comprise, sur un comptage de pastille. Le repli rend la
 * barre moins juste, jamais inutilisable.
 *
 * UN REPLI A 1 ET NON A ZERO : il signale trop, jamais trop peu. Un repli a
 * zero eteindrait l'alerte de stock faible en silence, exactement le defaut que
 * `chk_parametre_seuil_stock_positif` refuse en base.
 */
export const SEUIL_STOCK_FAIBLE_PAR_DEFAUT = 1;

/**
 * Les comptages alimentant la barre laterale et les tuiles du tableau de bord.
 *
 * UNE SEULE REQUETE, jouee une fois par rendu du layout. Voir le repository
 * pour la raison : la barre est rendue sur chaque navigation.
 */
export async function lireComptages(): Promise<ComptagesAdministration> {
  /*
   * LE SEUIL VIENT DE LA BASE, ADR-043, ET SON ECHEC NE FAIT PAS TOMBER LA
   * BARRE. Cette fonction est appelee par le layout : laisser remonter
   * l'exception rendrait TOUTE l'administration inaccessible parce qu'une
   * pastille ne sait pas quoi compter.
   */
  let seuil = SEUIL_STOCK_FAIBLE_PAR_DEFAUT;

  try {
    seuil = (await lireParametresBoutique()).seuilStockFaible;
  } catch (erreur) {
    if (!(erreur instanceof ParametresAbsentsError)) {
      throw erreur;
    }
  }

  return depot.compterPourAdministration(prisma, seuil);
}

/**
 * Le nom affiche en pied de barre de l'administration.
 *
 * LE NOM DU COMPTE PLUTOT QUE L'ADRESSE. La barre affichait la partie locale
 * de l'email, ce qui donnait « contact » : la boite de la boutique identifie
 * une fonction, pas la personne qui est derriere l'ecran.
 *
 * `nomAffichable` PORTE DEJA LE REPLI et ses cas limites, dont un nom reduit a
 * `"..."` que `trim` seul laisserait passer. Le reecrire ici ferait diverger
 * deux definitions du meme affichage, celle de l'espace client et celle-ci.
 *
 * LE NOM N'EST PAS DANS LA SESSION, ET CE N'EST PAS UN OUBLI :
 * `IdentiteAppelant` exclut deliberement les champs d'affichage pour qu'aucun
 * d'eux ne se retrouve a fonder une autorisation. La vue relit, comme le fait
 * deja l'espace client.
 */
export async function lireNomAffiche(
  utilisateurId: string,
  email: string,
): Promise<string> {
  const compte = await depotUtilisateur.lireNomCompte(prisma, utilisateurId);

  return nomAffichable(compte?.nom ?? null, email);
}
