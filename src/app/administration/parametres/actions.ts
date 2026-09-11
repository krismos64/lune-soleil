"use server";

/**
 * Adaptateur d'entree des parametres commerciaux, LS-98, ADR-043.
 *
 * CE FICHIER NE DECIDE RIEN : il lit le `FormData`, convertit les euros saisis
 * en centimes entiers, delegue au service et traduit l'issue. La validation et
 * les regles vivent dans `services/parametres.ts`.
 *
 * ------------------------------------------------------------------
 * LA GARDE DE ROLE EST ICI **ET** DANS LE SERVICE, redondance deliberee.
 *
 * J'AVAIS ECARTE CELLE-CI, au motif qu'un second appel consommerait la fenetre
 * de reauthentification. C'ETAIT FAUX, verifie dans
 * `exigerReauthentificationRecente` : elle LIT la preuve enregistree sur la
 * session, elle ne l'ecrit jamais. Deux controles du depot l'ont refuse, et ils
 * avaient raison contre ce raisonnement.
 *
 * LE NOM DE LA COLONNE N'EST PAS CITE ICI, ET C'EST VOULU. Un test
 * d'architecture balaie `src/` a la recherche de ce nom pour attraper une
 * ecriture directe de la preuve hors de son module : il a attrape ce commentaire
 * a sa premiere execution. Un controle satisfait par un commentaire est un
 * motif connu du depot ; ici c'est l'inverse, un commentaire qui DECLENCHE un
 * controle, et le test a raison de ne pas savoir les distinguer.
 *
 * CE QUE CHAQUE GARDE FERME. Celle-ci ferme le point d'entree HTTP : une Server
 * Action est invocable DIRECTEMENT, sans passer par le rendu de l'ecran, defaut
 * trouve en relecture de LS-89. Celle du service ferme l'appel direct par un
 * futur appelant interne. Meme motif que `rembourser` et `demanderRemboursement`.
 * ------------------------------------------------------------------
 *
 * ------------------------------------------------------------------
 * LA CONVERSION EUROS VERS CENTIMES PASSE PAR `centimesDepuisEuros`.
 *
 * Elle est REUTILISEE et non recrite : son en-tete explique que la protection
 * reelle est le filtre a deux decimales, et qu'une seconde implementation par
 * multiplication resterait verte aux tests tout en perdant cette propriete.
 *
 * LE SEUIL VIDE VAUT `null`, ET NON ZERO. Un champ laisse vide DESACTIVE la
 * franchise ; zero la rendrait universelle. Les deux se saisissent, et l'ecran
 * le dit.
 * ------------------------------------------------------------------
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { EntreeInvalideError } from "@/lib/validation";
import { exigerRole } from "@/services/autorisation";
import { enregistrerParametres } from "@/services/parametres";
import { centimesDepuisEuros } from "@/services/variante-validation";

/**
 * Ce que l'interface recoit, jamais une exception.
 *
 * LES REFUS SONT DES VALEURS, pas des pannes. « Preuve d'identite trop
 * ancienne » est une situation prevue d'ADR-027, qui se presente avec un lien
 * de reauthentification plutot qu'avec une page d'erreur.
 */
export type ResultatParametres =
  | { statut: "SUCCES" }
  | { statut: "SESSION_ABSENTE" }
  | { statut: "REAUTHENTIFICATION_REQUISE" }
  /** Entree refusee, avec le message destine au formulaire. */
  | { statut: "INVALIDE"; message: string };

/** Lit un champ de montant en euros et le rend en centimes, ou `null`. */
function centimesDuChamp(donnees: FormData, nom: string): number | null {
  const brut = donnees.get(nom);

  return typeof brut === "string" ? centimesDepuisEuros(brut) : null;
}

/** Lit une case a cocher : absente vaut `false`, HTML ne postant que les cochees. */
function interrupteur(donnees: FormData, nom: string): boolean {
  return donnees.get(nom) !== null;
}

export async function enregistrer(
  _precedent: ResultatParametres | null,
  donnees: FormData,
): Promise<ResultatParametres> {
  const enTetes = await headers();

  /*
   * LE ROLE EST EXIGE AVANT TOUTE LECTURE DU FORMULAIRE. Analyser les champs
   * d'abord ne fuiterait rien, mais rendrait des messages de validation a qui
   * n'a aucun droit sur cet ecran, ce qui lui apprendrait sa forme.
   */
  const identite = await exigerRole(enTetes);

  if (identite === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  const tarifRelaisCentimes = centimesDuChamp(donnees, "tarifRelais");
  const tarifDomicileCentimes = centimesDuChamp(donnees, "tarifDomicile");

  /*
   * LES DEUX TARIFS SONT REFUSES ICI ET NON PAR ZOD, parce que la conversion
   * echoue AVANT lui : `centimesDepuisEuros` rend `null` sur « quatre euros »,
   * et un `null` transmis au schema produirait « un montant en centimes entiers
   * est attendu », message juste et incomprehensible pour qui a saisi des euros.
   */
  if (tarifRelaisCentimes === null || tarifDomicileCentimes === null) {
    return {
      statut: "INVALIDE",
      message:
        "Un tarif doit s'écrire en euros, avec deux décimales au plus : 4,10.",
    };
  }

  /*
   * LE CHAMP VIDE DESACTIVE LA FRANCHISE. Il faut donc distinguer « vide »,
   * legitime, de « mal ecrit », refuse : les confondre ferait desactiver la
   * franchise sur une faute de frappe, sans rien dire.
   */
  const seuilBrut = donnees.get("seuilFranchise");
  const seuilSaisi = typeof seuilBrut === "string" ? seuilBrut.trim() : "";
  const seuilFranchiseCentimes =
    seuilSaisi === "" ? null : centimesDepuisEuros(seuilSaisi);

  if (seuilSaisi !== "" && seuilFranchiseCentimes === null) {
    return {
      statut: "INVALIDE",
      message:
        "Le seuil doit s'écrire en euros, ou rester vide pour désactiver la livraison offerte.",
    };
  }

  const seuilStockBrut = donnees.get("seuilStockFaible");
  const seuilStockFaible =
    typeof seuilStockBrut === "string" ? Number(seuilStockBrut) : Number.NaN;

  const emailBrut = donnees.get("emailAlertes");

  try {
    const issue = await enregistrerParametres(enTetes, {
      tarifRelaisCentimes,
      tarifDomicileCentimes,
      seuilFranchiseCentimes,
      seuilStockFaible,
      emailAlertes: typeof emailBrut === "string" ? emailBrut.trim() : "",
      alerteCommandePayee: interrupteur(donnees, "alerteCommandePayee"),
      alertePaiementAnnule: interrupteur(donnees, "alertePaiementAnnule"),
      alerteStockFaible: interrupteur(donnees, "alerteStockFaible"),
      alerteMessageRecu: interrupteur(donnees, "alerteMessageRecu"),
      alerteAvisAModerer: interrupteur(donnees, "alerteAvisAModerer"),
    });

    if (issue.statut === "SESSION_ABSENTE") {
      return { statut: "SESSION_ABSENTE" };
    }

    if (issue.statut === "REAUTHENTIFICATION_REQUISE") {
      return { statut: "REAUTHENTIFICATION_REQUISE" };
    }

    if (issue.statut === "REFUSE_SEUIL_SOUS_TARIF") {
      return {
        statut: "INVALIDE",
        message:
          "La livraison offerte doit démarrer au-dessus du tarif en Point Relais, ou être fixée à zéro pour l'offrir toujours.",
      };
    }

    /*
     * `"layout"` EST OBLIGATOIRE ICI, regle C37. Le seuil de stock faible
     * alimente `variantesStockFaible`, une pastille de la barre laterale : sans
     * lui, l'ecran se rafraichit pendant que la barre garde son ancien compte.
     */
    revalidatePath("/administration/parametres", "layout");

    return { statut: "SUCCES" };
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE", message: erreur.message };
    }
    throw erreur;
  }
}
