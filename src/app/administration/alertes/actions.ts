"use server";

/**
 * Adaptateur d'entree des alertes critiques, LS-98.
 *
 * CE FICHIER NE DECIDE RIEN : il exige le role, delegue au service et traduit
 * l'issue. La regle E7, une alerte s'acquitte et ne se supprime jamais, vit
 * dans `services/alerte.ts` et dans le schema.
 *
 * L'ACTEUR VIENT DE LA SESSION, jamais d'un parametre, invariant 2. Cette
 * signature n'accepte aucun identifiant d'utilisateur : `exigerRole` rend
 * l'identite, et c'est elle qui alimente `acquitteeParId`. Un identifiant venant
 * d'un `FormData` permettrait d'attribuer un acquittement a n'importe qui.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { exigerRole } from "@/services/autorisation";
import { acquitter } from "@/services/alerte";

/** Ce que l'interface recoit, jamais une exception. */
export type ResultatAcquittement =
  | { statut: "SUCCES" }
  | { statut: "SESSION_ABSENTE" }
  /**
   * L'alerte etait deja traitee, ou n'existe pas.
   *
   * CE N'EST PAS UN ECHEC : un double clic tombe ici, et l'ecran le presente
   * comme un fait sans gravite. Les deux cas se confondent deliberement, pour
   * ne pas reveler l'existence d'un identifiant a qui le devine.
   */
  | { statut: "DEJA_TRAITEE" };

export async function acquitterAction(
  alerteId: string,
): Promise<ResultatAcquittement> {
  const enTetes = await headers();

  const identite = await exigerRole(enTetes);

  if (identite === null) {
    return { statut: "SESSION_ABSENTE" };
  }

  const issue = await acquitter({
    alerteId,
    acquitteeParId: identite.utilisateurId,
  });

  if (issue.statut === "DEJA_TRAITEE") {
    return { statut: "DEJA_TRAITEE" };
  }

  /*
   * `"layout"` EST OBLIGATOIRE ICI, regle C37. Le compte des alertes ouvertes
   * alimente `alertesOuvertes`, une pastille de la barre laterale : sans lui,
   * la liste se vide pendant que la barre continue d'annoncer l'ancien nombre.
   */
  revalidatePath("/administration/alertes", "layout");

  return { statut: "SUCCES" };
}
