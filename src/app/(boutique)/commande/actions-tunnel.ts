"use server";

/**
 * Adaptateurs d'entree du tunnel de commande, LS-115. Etape 3b du parcours 1.
 *
 * CE FICHIER EST UN ADAPTATEUR, PAS DE LA COUCHE METIER. Il lit une entree non
 * fiable, la valide avec Zod, ecrit le cookie signe, delegue le reste. Aucun
 * montant n'y est calcule : `services/tunnel.ts` porte le cas d'usage.
 *
 * AUCUNE ECRITURE EN BASE. Rien n'est commande ni reserve a ce stade, ADR-024
 * reservant la transaction unique a LS-117.
 *
 * AUCUNE GARDE D'AUTORISATION, ET C'EST CORRECT. Le tunnel est ouvert aux
 * visiteurs sans compte, LS-56, et ne touche aucune ressource appartenant a
 * quelqu'un : la saisie vit dans le cookie de celui qui la saisit. Il n'y a
 * donc rien a autoriser, invariant 2.
 */
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import {
  EntreeInvalideError,
  schemaAdressePostale,
  schemaChoixLivraison,
  schemaCoordonnees,
  valider,
} from "@/lib/validation";
import {
  DUREE_TUNNEL_SECONDES,
  NOM_COOKIE_TUNNEL,
  decoderSaisieTunnel,
  encoderSaisieTunnel,
  type SaisieTunnel,
} from "@/lib/tunnel-cookie";

/** Ce que l'interface recoit, jamais une exception. */
export type ResultatTunnel =
  | { statut: "OK"; etapeSuivante: string }
  | { statut: "INVALIDE"; message: string };

/** Saisie vide, point de depart d'un tunnel neuf. */
const SAISIE_VIDE: SaisieTunnel = {
  nomClient: "",
  email: "",
  telephone: null,
  adresse: { ligne1: "", codePostal: "", ville: "", pays: "FR" },
  mode: "DOMICILE",
  pointRetrait: null,
};

/** Lit la saisie du cookie, ou une saisie vide. */
export async function lireSaisie(): Promise<SaisieTunnel> {
  const magasin = await cookies();

  return (
    decoderSaisieTunnel(magasin.get(NOM_COOKIE_TUNNEL)?.value) ?? SAISIE_VIDE
  );
}

/**
 * Ecrit la saisie dans le cookie signe.
 *
 * MEMES ATTRIBUTS QUE LE PANIER, pour les memes raisons : `httpOnly` ferme la
 * modification cote client, `sameSite: "lax"` laisse revenir depuis un lien
 * externe, `secure` hors developpement seulement.
 */
async function ecrireSaisie(saisie: SaisieTunnel): Promise<void> {
  const magasin = await cookies();

  magasin.set(NOM_COOKIE_TUNNEL, encoderSaisieTunnel(saisie), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DUREE_TUNNEL_SECONDES,
  });
}

/** Traduit une erreur de validation en resultat, sans jamais divulguer la valeur. */
function enResultat(erreur: unknown): ResultatTunnel {
  if (erreur instanceof EntreeInvalideError) {
    // `details` nomme le champ, jamais la valeur recue, invariant 9.
    return { statut: "INVALIDE", message: erreur.details };
  }

  throw erreur;
}

/**
 * Etape 1, coordonnees du client.
 *
 * LES ARGUMENTS SONT `unknown`, deliberement. Une Server Action est un point
 * d'entree HTTP : son argument est deserialise depuis le reseau et le type
 * TypeScript ne survit pas au passage. Seul `valider` etablit la forme,
 * invariant 7.
 */
export async function enregistrerCoordonnees(
  entree: unknown,
): Promise<ResultatTunnel> {
  let coordonnees: ReturnType<typeof valider<typeof schemaCoordonnees>>;

  try {
    coordonnees = valider(schemaCoordonnees, entree);
  } catch (erreur) {
    return enResultat(erreur);
  }

  const saisie = await lireSaisie();

  await ecrireSaisie({
    ...saisie,
    nomClient: coordonnees.nomClient,
    email: coordonnees.email,
    /*
     * UNE CHAINE VIDE DEVIENT `null` ET NON `""`. `Commande.telephone` est
     * nullable : ecrire une chaine vide creerait un troisieme etat entre
     * « renseigne » et « absent », que rien en aval ne saurait interpreter.
     */
    telephone: coordonnees.telephone === "" ? null : coordonnees.telephone,
  });

  return { statut: "OK", etapeSuivante: "adresse" };
}

/** Etape 2, adresse de livraison. */
export async function enregistrerAdresse(
  entree: unknown,
): Promise<ResultatTunnel> {
  let adresse: ReturnType<typeof valider<typeof schemaAdressePostale>>;

  try {
    adresse = valider(schemaAdressePostale, entree);
  } catch (erreur) {
    return enResultat(erreur);
  }

  const saisie = await lireSaisie();

  /*
   * `ligne2` EST OMISE PLUTOT QUE POSEE A `undefined`. Le projet active
   * `exactOptionalPropertyTypes` : une propriete optionnelle explicitement
   * `undefined` n'est pas la meme chose qu'une propriete absente, et le type
   * refuse la premiere. Le motif est identique dans `normaliser`.
   */
  await ecrireSaisie({
    ...saisie,
    adresse: {
      ligne1: adresse.ligne1,
      ...(adresse.ligne2 === undefined ? {} : { ligne2: adresse.ligne2 }),
      codePostal: adresse.codePostal,
      ville: adresse.ville,
      pays: adresse.pays,
    },
  });

  return { statut: "OK", etapeSuivante: "livraison" };
}

/**
 * Etape 3, mode de livraison et point de retrait.
 *
 * LE `superRefine` DU SCHEMA PORTE L'EQUIVALENCE mode / point de retrait, dans
 * les DEUX sens : un DOMICILE porteur d'un point est refuse autant qu'un
 * POINT_RELAIS sans point. La contrainte `chk_commande_mode_point_relais` reste
 * la derniere ligne de defense, jamais le controle principal.
 *
 * AUCUN FRAIS DE PORT N'EST RECU ICI. Le montant est recalcule au rendu du
 * recapitulatif par `services/tunnel.ts` : un frais de port venu du navigateur
 * serait un frais de port choisi par le client.
 */
export async function enregistrerLivraison(
  entree: unknown,
): Promise<ResultatTunnel> {
  let choix: ReturnType<typeof valider<typeof schemaChoixLivraison>>;

  try {
    choix = valider(schemaChoixLivraison, entree);
  } catch (erreur) {
    return enResultat(erreur);
  }

  const saisie = await lireSaisie();

  await ecrireSaisie({
    ...saisie,
    mode: choix.mode,
    pointRetrait: choix.pointRetrait,
  });

  revalidatePath("/commande");

  return { statut: "OK", etapeSuivante: "recapitulatif" };
}

/**
 * Efface la saisie du tunnel.
 *
 * APPELEE A L'ABANDON ET APRES LA COMMANDE. Une adresse et un telephone n'ont
 * pas a survivre a l'usage qui les justifie, minimisation du RGPD. LS-117
 * l'appellera une fois la commande ecrite.
 */
export async function effacerSaisie(): Promise<void> {
  const magasin = await cookies();

  magasin.delete(NOM_COOKIE_TUNNEL);
}
