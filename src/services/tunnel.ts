/**
 * Assemblage du recapitulatif de commande, LS-115. Etape 3b du parcours 1.
 *
 * CE SERVICE PORTE LE CAS D'USAGE, les ecrans n'en portent aucun. Il reunit le
 * panier revalide, la saisie du tunnel et la configuration tarifaire pour
 * produire ce que l'ecran affiche, sans jamais rien ecrire en base : ADR-024
 * reserve l'ecriture a la transaction unique de LS-117.
 *
 * TOUT MONTANT VIENT D'ICI. Le cookie de tunnel n'en porte aucun, le navigateur
 * n'en fournit aucun. Un frais de port recu d'un formulaire serait un frais de
 * port choisi par le client.
 *
 * CE QUE LE RECAPITULATIF DOIT PORTER EST ETABLI PAR LS-86, aux sources :
 * L221-14 alinea 1 impose de rappeler les caracteristiques essentielles et le
 * prix. L'adresse n'est imposee par AUCUN texte, elle est affichee par decision
 * d'ergonomie du 25 aout 2026. Voir `.claude/rules/legal.md`, section
 * « Recapitulatif avant paiement et passation de commande ».
 */
import { calculerFraisPort, lireConfigurationLivraison } from "@/lib/livraison";
import type { SaisieTunnel } from "@/lib/tunnel-cookie";
import { revalider } from "@/services/panier";
import type { LignePanierRevalidee } from "@/services/panier";
import type { LignePanierCookie } from "@/lib/panier-cookie";

/**
 * Adresse a rappeler au recapitulatif, et laquelle selon le mode.
 *
 * EN POINT RELAIS, C'EST L'ADRESSE DU POINT ET NON CELLE DU CLIENT. Le colis
 * part au commerce partenaire : afficher une adresse personnelle qui ne servira
 * pas induit en erreur. Le nom du destinataire est rappele a cote parce que
 * c'est l'identite a presenter au retrait. Tranche par LS-86.
 */
export type AdresseRappelee = {
  /** `CLIENT` a domicile, `POINT_RETRAIT` pour les deux autres modes. */
  nature: "CLIENT" | "POINT_RETRAIT";
  /** Nom du point de retrait, ou `null` a domicile. */
  nomPoint: string | null;
  ligne1: string;
  ligne2?: string;
  codePostal: string;
  ville: string;
};

/** Ce que l'ecran de recapitulatif affiche. */
export type Recapitulatif = {
  lignes: LignePanierRevalidee[];
  nomClient: string;
  email: string;
  telephone: string | null;
  adresseRappelee: AdresseRappelee;
  mode: SaisieTunnel["mode"];
  totalArticlesCentimes: number;
  fraisPortCentimes: number;
  totalCentimes: number;
  /** `true` si la livraison est offerte, pour l'annoncer explicitement. */
  livraisonOfferte: boolean;
  /**
   * `true` si une ligne a change depuis l'affichage precedent.
   *
   * L'ECRAN DOIT ALORS DEMANDER CONFIRMATION avant de poursuivre. C'est la part
   * du critere 6 de LS-114 laissee ouverte : le mecanisme etait livre, le
   * moment de le declencher appartenait au tunnel.
   */
  aChange: boolean;
};

/**
 * Construit le recapitulatif a partir du panier et de la saisie.
 *
 * `totalPresenteCentimes` SERT UNIQUEMENT A DETECTER UN ECART, jamais a
 * calculer un montant. Il vient d'un formulaire, donc du client : le retenir
 * pour un calcul laisserait figer un prix a son avantage. Meme mecanique qu'en
 * LS-114.
 */
export async function construireRecapitulatif({
  lignesCookie,
  saisie,
  totalPresenteCentimes,
  configuration = lireConfigurationLivraison(),
}: {
  lignesCookie: LignePanierCookie[];
  saisie: SaisieTunnel;
  totalPresenteCentimes?: number;
  configuration?: ReturnType<typeof lireConfigurationLivraison>;
}): Promise<Recapitulatif> {
  const panier = await revalider(lignesCookie, totalPresenteCentimes);

  const fraisPortCentimes = calculerFraisPort({
    mode: saisie.mode,
    totalArticlesCentimes: panier.totalArticlesCentimes,
    configuration,
  });

  return {
    lignes: panier.lignes,
    nomClient: saisie.nomClient,
    email: saisie.email,
    telephone: saisie.telephone,
    adresseRappelee: rappelerAdresse(saisie),
    mode: saisie.mode,
    totalArticlesCentimes: panier.totalArticlesCentimes,
    fraisPortCentimes,
    /*
     * LE TOTAL EST UNE SOMME D'ENTIERS, invariant 1. Aucun arrondi n'intervient
     * puisque rien n'a jamais quitte le domaine des centimes.
     */
    totalCentimes: panier.totalArticlesCentimes + fraisPortCentimes,
    livraisonOfferte: fraisPortCentimes === 0,
    aChange: panier.aChange,
  };
}

/**
 * Quelle adresse rappeler, selon le mode. Tranche par LS-86.
 *
 * AUCUN TEXTE N'IMPOSE CE RAPPEL, ni L221-14, ni L221-5, ni L111-1. Il est
 * retenu par ergonomie : une adresse rappelee avant paiement evite les erreurs
 * de saisie et les colis non distribues. Ne pas transformer cette decision en
 * obligation legale dans un commentaire ou un ticket.
 */
function rappelerAdresse(saisie: SaisieTunnel): AdresseRappelee {
  if (saisie.pointRetrait !== null) {
    return {
      nature: "POINT_RETRAIT",
      nomPoint: saisie.pointRetrait.nom,
      ligne1: saisie.pointRetrait.ligne1,
      codePostal: saisie.pointRetrait.codePostal,
      ville: saisie.pointRetrait.ville,
    };
  }

  return {
    nature: "CLIENT",
    nomPoint: null,
    ligne1: saisie.adresse.ligne1,
    ...(saisie.adresse.ligne2 === undefined
      ? {}
      : { ligne2: saisie.adresse.ligne2 }),
    codePostal: saisie.adresse.codePostal,
    ville: saisie.adresse.ville,
  };
}
