/**
 * L'etat de depart de l'etape adresse du tunnel, avec le carnet. LS-299.
 *
 * UNE FONCTION PURE, hors du composant : la regle de preselection se teste
 * sans navigateur ni carnet partage entre les largeurs de la suite de bout en
 * bout, ou poser une adresse par defaut ferait se marcher dessus deux fichiers.
 */
import type { SaisieTunnel } from "@/lib/tunnel-cookie";

/**
 * Une adresse du carnet telle que le tunnel la propose.
 *
 * LES SEULS CHAMPS DE L'ETAPE ADRESSE, minimisation : ni nom, ni telephone. Ils
 * partent dans la charge du composant client, et rien de ce qui n'est ni
 * affiche ni saisi a cette etape n'a a sortir du serveur.
 */
export type AdresseProposee = {
  id: string;
  libelle: string | null;
  ligne1: string;
  ligne2: string | null;
  codePostal: string;
  ville: string;
  estParDefaut: boolean;
};

/** Les quatre champs de l'etape adresse. */
export type ChampsAdresseTunnel = {
  ligne1: string;
  ligne2: string;
  codePostal: string;
  ville: string;
};

export const CHAMPS_ADRESSE_VIDES: ChampsAdresseTunnel = {
  ligne1: "",
  ligne2: "",
  codePostal: "",
  ville: "",
};

/** Les champs que remplit une adresse du carnet. */
export function champsDeLAdresse(
  adresse: AdresseProposee,
): ChampsAdresseTunnel {
  return {
    ligne1: adresse.ligne1,
    ligne2: adresse.ligne2 ?? "",
    codePostal: adresse.codePostal,
    ville: adresse.ville,
  };
}

/**
 * L'adresse du carnet dont les champs sont exactement ceux-ci, ou `""`.
 *
 * LA LISTE DIT CE QUI PARTIRA, releve par la revue frontend : apres une
 * retouche, ou au retour a l'etape, elle ne doit ni nommer une adresse que les
 * champs ne portent plus, ni annoncer « une autre adresse » sur une adresse du
 * carnet. Elle se deduit donc des champs, jamais d'un choix passe.
 */
export function adresseCorrespondante(
  champs: ChampsAdresseTunnel,
  carnet: readonly AdresseProposee[],
): string {
  const trouvee = carnet.find((adresse) => {
    const candidate = champsDeLAdresse(adresse);

    return (
      candidate.ligne1 === champs.ligne1 &&
      candidate.ligne2 === champs.ligne2 &&
      candidate.codePostal === champs.codePostal &&
      candidate.ville === champs.ville
    );
  });

  return trouvee?.id ?? "";
}

/**
 * Le libelle d'une adresse dans la liste.
 *
 * « PAR DEFAUT » EN TETE ET NON EN FIN : un `<select>` ferme coupe son texte a
 * 320 px, et la mention placee en dernier disparaissait. Le complement figure
 * aussi, deux adresses d'un meme immeuble ne differant parfois que par lui.
 */
export function libelleProposition(adresse: AdresseProposee): string {
  const lieu = [
    adresse.ligne1,
    adresse.ligne2,
    `${adresse.codePostal} ${adresse.ville}`,
  ]
    .filter((partie): partie is string => partie !== null && partie !== "")
    .join(", ");
  const nom = adresse.libelle ? `${adresse.libelle} : ${lieu}` : lieu;

  return adresse.estParDefaut ? `Par défaut, ${nom}` : nom;
}

/**
 * L'etat de depart : les champs et l'adresse choisie dans la liste.
 *
 * LA SAISIE DEJA ENREGISTREE L'EMPORTE sur l'adresse par defaut : un client qui
 * revient a cette etape retrouve ce qu'il avait tape, et la liste nomme
 * l'adresse du carnet qu'elle reproduit, s'il y en a une. L'adresse par defaut
 * n'est preselectionnee que sur un formulaire vide, et un carnet sans adresse
 * par defaut, legitime selon A7, laisse le formulaire vide.
 */
export function etatInitialAdresse(
  saisie: SaisieTunnel,
  carnet: readonly AdresseProposee[],
): { champs: ChampsAdresseTunnel; choix: string } {
  const parDefaut = carnet.find((adresse) => adresse.estParDefaut);

  if (saisie.adresse.ligne1 === "" && parDefaut !== undefined) {
    return { champs: champsDeLAdresse(parDefaut), choix: parDefaut.id };
  }

  const champs: ChampsAdresseTunnel = {
    ligne1: saisie.adresse.ligne1,
    ligne2: saisie.adresse.ligne2 ?? "",
    codePostal: saisie.adresse.codePostal,
    ville: saisie.adresse.ville,
  };

  return { champs, choix: adresseCorrespondante(champs, carnet) };
}
