"use server";

/**
 * Adaptateurs d'entree du panier, LS-114.
 *
 * CE FICHIER EST UN ADAPTATEUR, PAS DE LA COUCHE METIER. Il lit une entree non
 * fiable, la valide, ecrit le cookie, delegue le reste. Aucun prix n'y est
 * calcule, aucune regle de gestion n'y vit.
 *
 * `cookies()` EST ASYNCHRONE EN NEXT.JS 16, verifie via Context7, et n'est
 * modifiable QUE dans une Server Action ou un gestionnaire de route. C'est la
 * raison pour laquelle l'ajout au panier passe par une action et non par un
 * composant serveur.
 *
 * AUCUNE DE CES ACTIONS NE TOUCHE LE STOCK. Ajouter au panier n'immobilise
 * rien : la reservation a lieu a l'etape 4 du parcours 1, dans la transaction
 * de LS-117. Un panier de dix exemplaires d'une piece unique est donc accepte
 * ici, et refuse a la reservation.
 */
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  EntreeInvalideError,
  schemaIdentifiant,
  valider,
} from "@/lib/validation";
import {
  DUREE_COOKIE_SECONDES,
  LIGNES_MAXIMUM,
  NOM_COOKIE_PANIER,
  decoderPanier,
  encoderPanier,
  type LignePanierCookie,
} from "@/lib/panier-cookie";

/** Ce que l'interface recoit, jamais une exception. */
export type ResultatPanier =
  | { statut: "OK"; nombreArticles: number }
  | { statut: "INVALIDE"; message: string }
  | { statut: "PLEIN"; message: string };

/**
 * Quantite acceptee sur une ligne.
 *
 * LE PLAFOND N'EST PAS UNE REGLE DE STOCK. Il borne une entree non fiable pour
 * qu'un nombre absurde ne traverse pas la pile, la disponibilite reelle etant
 * verifiee par la revalidation puis par la reservation. Vingt suffit largement
 * a un bijou fait main.
 */
const schemaQuantitePanier = z
  .number()
  .int("Une quantite entiere est attendue.")
  .min(1, "La quantite minimale est de 1.")
  .max(20, "La quantite maximale par ligne est de 20.");

/** Lit le panier du cookie. Rend un panier vide sur tout cookie douteux. */
async function lirePanier(): Promise<LignePanierCookie[]> {
  const magasin = await cookies();

  return decoderPanier(magasin.get(NOM_COOKIE_PANIER)?.value);
}

/**
 * Ecrit le panier dans le cookie.
 *
 * `httpOnly` MEME SI LE CONTENU N'EST PAS SECRET. Un panier lisible par script
 * n'expose rien de sensible, mais le rendre inaccessible au JavaScript de page
 * ferme la voie a une modification cote client qui donnerait l'illusion de
 * fonctionner jusqu'a la revalidation.
 *
 * `sameSite: "lax"` ET NON `strict`. Un visiteur qui revient depuis un lien
 * externe, courriel ou reseau social, doit retrouver son panier : `strict` le
 * lui viderait sans raison compréhensible.
 *
 * `secure` UNIQUEMENT HORS DEVELOPPEMENT. En production le site est servi en
 * HTTPS ; l'exiger en local casserait le cookie sur `http://localhost`.
 */
async function ecrirePanier(lignes: LignePanierCookie[]): Promise<void> {
  const magasin = await cookies();

  if (lignes.length === 0) {
    /*
     * UN PANIER VIDE SUPPRIME LE COOKIE plutot que d'ecrire `[]`. Rien a garder,
     * et cela evite de transmettre un cookie a chaque requete pour rien.
     */
    magasin.delete(NOM_COOKIE_PANIER);
    return;
  }

  magasin.set(NOM_COOKIE_PANIER, encoderPanier(lignes), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DUREE_COOKIE_SECONDES,
  });
}

/**
 * Ajoute une variante au panier, ou augmente sa quantite.
 *
 * `entree` EST DE TYPE `unknown`, deliberement. Une Server Action est un point
 * d'entree HTTP : son argument est deserialise depuis le reseau, et le type
 * TypeScript ne survit pas au passage. Seul `valider` etablit la forme,
 * invariant 7.
 *
 * L'IDENTIFIANT DE VARIANTE N'AUTORISE RIEN, invariant 2. Sa forme est
 * etablie ici, son existence par la revalidation. Un identifiant inconnu
 * produit une ligne signalee, jamais un acces a autre chose.
 */
export async function ajouterAuPanier(
  varianteIdBrut: unknown,
  quantiteBrute: unknown,
): Promise<ResultatPanier> {
  let varianteId: string;
  let quantite: number;

  try {
    varianteId = valider(schemaIdentifiant, varianteIdBrut);
    quantite = valider(schemaQuantitePanier, quantiteBrute);
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      // `details` nomme le champ, jamais la valeur recue, invariant 9.
      return { statut: "INVALIDE", message: erreur.details };
    }
    throw erreur;
  }

  const lignes = await lirePanier();
  const existante = lignes.find((ligne) => ligne.varianteId === varianteId);

  if (existante === undefined && lignes.length >= LIGNES_MAXIMUM) {
    return {
      statut: "PLEIN",
      message: `Un panier ne peut pas porter plus de ${LIGNES_MAXIMUM} pièces différentes.`,
    };
  }

  if (existante === undefined) {
    lignes.push({ varianteId, quantite });
  } else {
    /*
     * LE PLAFOND S'APPLIQUE AU CUMUL et non a chaque ajout. Sans ce
     * `Math.min`, vingt ajouts successifs de vingt donneraient quatre cents.
     */
    existante.quantite = Math.min(existante.quantite + quantite, 20);
  }

  await ecrirePanier(lignes);

  /*
   * LE LAYOUT PORTE LE COMPTEUR : sans revalidation, l'en-tete afficherait
   * l'ancien nombre jusqu'a la navigation suivante.
   */
  revalidatePath("/", "layout");

  return {
    statut: "OK",
    nombreArticles: lignes.reduce((total, ligne) => total + ligne.quantite, 0),
  };
}

/**
 * Change la quantite d'une ligne existante.
 *
 * UNE LIGNE ABSENTE N'EST PAS UNE ERREUR. Le cas se produit sur un double envoi
 * du formulaire, ou quand deux onglets modifient le meme panier : le premier
 * retire la ligne, le second la modifie. Rendre `OK` sur un panier deja correct
 * vaut mieux qu'une erreur qui n'apprend rien au visiteur.
 */
export async function changerQuantite(
  varianteIdBrut: unknown,
  quantiteBrute: unknown,
): Promise<ResultatPanier> {
  let varianteId: string;
  let quantite: number;

  try {
    varianteId = valider(schemaIdentifiant, varianteIdBrut);
    quantite = valider(schemaQuantitePanier, quantiteBrute);
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE", message: erreur.details };
    }
    throw erreur;
  }

  const lignes = await lirePanier();
  const ligne = lignes.find((candidate) => candidate.varianteId === varianteId);

  if (ligne !== undefined) {
    ligne.quantite = quantite;
    await ecrirePanier(lignes);
    revalidatePath("/", "layout");
  }

  return {
    statut: "OK",
    nombreArticles: lignes.reduce(
      (total, courante) => total + courante.quantite,
      0,
    ),
  };
}

/**
 * Retire une ligne du panier.
 *
 * IDEMPOTENT PAR CONSTRUCTION : retirer une ligne absente laisse le panier
 * inchange et rend `OK`. Deux clics sur le meme bouton ne doivent pas produire
 * un message d'erreur.
 */
export async function retirerDuPanier(
  varianteIdBrut: unknown,
): Promise<ResultatPanier> {
  let varianteId: string;

  try {
    varianteId = valider(schemaIdentifiant, varianteIdBrut);
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE", message: erreur.details };
    }
    throw erreur;
  }

  const restantes = (await lirePanier()).filter(
    (ligne) => ligne.varianteId !== varianteId,
  );

  await ecrirePanier(restantes);
  revalidatePath("/", "layout");

  return {
    statut: "OK",
    nombreArticles: restantes.reduce(
      (total, ligne) => total + ligne.quantite,
      0,
    ),
  };
}
