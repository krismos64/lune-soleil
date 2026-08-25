"use server";

/**
 * Adaptateurs d'entree du tunnel de commande, LS-115. Etape 3b du parcours 1.
 *
 * CE FICHIER EST UN ADAPTATEUR, PAS DE LA COUCHE METIER. Il lit une entree non
 * fiable, la valide avec Zod, ecrit le cookie signe, delegue le reste. Aucun
 * montant n'y est calcule : `services/tunnel.ts` porte le cas d'usage.
 *
 * UNE SEULE ECRITURE EN BASE, `passerCommandeAction`, ajoutee par LS-117. Les
 * etapes 1 a 3b n'ecrivent toujours rien : elles remplissent le cookie signe, et
 * ADR-024 reserve toute ecriture a la transaction unique de l'etape 4.
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
import { NOM_COOKIE_PANIER, decoderPanier } from "@/lib/panier-cookie";
import { CommandeRefuseeError, passerCommande } from "@/services/commande";

/** Ce que l'interface recoit, jamais une exception. */
export type ResultatTunnel =
  | { statut: "OK"; etapeSuivante: string }
  | { statut: "INVALIDE"; message: string };

/**
 * Saisie vide, point de depart d'un tunnel neuf.
 *
 * `mode: null` ET NON `"DOMICILE"`. La premiere version posait le domicile par
 * defaut, ce qui confondait « non choisi » avec un choix legitime : le
 * recapitulatif affichait alors un mode et ses frais de port que personne
 * n'avait retenus. Releve par `ls-critical-reviewer` le 25 aout 2026.
 */
const SAISIE_VIDE: SaisieTunnel = {
  nomClient: "",
  email: "",
  telephone: null,
  adresse: { ligne1: "", codePostal: "", ville: "", pays: "FR" },
  mode: null,
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

/** Ce que l'ecran recoit apres une tentative de commande. */
export type ResultatCommande =
  | { statut: "OK"; commandeId: string; numero: string }
  /** Une piece n'est plus disponible : `varianteRefusee` designe la ligne. */
  | { statut: "REFUSE"; varianteRefusee: string }
  | { statut: "INVALIDE"; message: string };

/**
 * Etape 4, passation de la commande. LS-117.
 *
 * ADAPTATEUR ET NON COUCHE METIER : il lit les deux cookies signes, delegue a
 * `services/commande.ts`, efface la saisie, et traduit le refus en resultat.
 * Aucun montant ni identifiant ne vient du corps de la requete.
 *
 * AUCUN ARGUMENT, ET C'EST UNE GARANTIE. Tout ce dont la commande a besoin est
 * dans les cookies signes : un parametre serait une entree non fiable de plus a
 * valider, et la tentation d'y passer un total. Invariants 1 et 2.
 */
export async function passerCommandeAction(): Promise<ResultatCommande> {
  const magasin = await cookies();
  const lignesCookie = decoderPanier(magasin.get(NOM_COOKIE_PANIER)?.value);
  const saisie = await lireSaisie();

  /*
   * LES DEUX MEMES GARDES QUE LA PAGE, revalidees ici. L'ecran n'affiche le
   * bouton qu'a l'etape recapitulatif, mais une Server Action est un point
   * d'entree HTTP appelable directement : une garde qui ne vit que dans le
   * composant ne garde rien, motif rencontre en LS-113.
   */
  if (lignesCookie.length === 0) {
    return { statut: "INVALIDE", message: "Votre panier est vide." };
  }

  if (saisie.mode === null) {
    return {
      statut: "INVALIDE",
      message: "Choisissez un mode de livraison avant de commander.",
    };
  }

  try {
    const issue = await passerCommande({
      lignesCookie,
      saisie: { ...saisie, mode: saisie.mode },
    });

    /*
     * LES DEUX COOKIES SONT EFFACES APRES LE COMMIT, jamais avant. Avant, un
     * refus de stock laisserait le client sans panier ni saisie a recommencer.
     *
     * LA SAISIE PORTE UN NOM, UNE ADRESSE ET UN TELEPHONE : la minimisation du
     * RGPD interdit de les conserver au-dela de l'usage qui les justifie, et
     * cet usage vient de s'achever, la commande portant desormais sa propre
     * copie figee. C'est la dette de LS-115 que cette story leve.
     */
    await effacerSaisie();
    magasin.delete(NOM_COOKIE_PANIER);

    return {
      statut: "OK",
      commandeId: issue.commandeId,
      numero: issue.numero,
    };
  } catch (erreur) {
    if (erreur instanceof CommandeRefuseeError) {
      return { statut: "REFUSE", varianteRefusee: erreur.varianteRefusee };
    }

    /*
     * TOUTE AUTRE ERREUR REMONTE. Une panne de base ou un interblocage
     * persistant ne sont pas des refus metier : les traduire en message
     * tranquille ferait croire la piece vendue alors que le stock est intact.
     */
    throw erreur;
  }
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
