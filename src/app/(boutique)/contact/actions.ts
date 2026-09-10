"use server";

/**
 * Adaptateur d'entree du formulaire de contact, LS-97.
 *
 * CE FICHIER NE DECIDE RIEN : il lit le `FormData`, releve l'adresse IP et
 * delegue. Les trois couches anti-robot, la validation et l'ordre d'ecriture
 * vivent dans `services/message-contact.ts`.
 *
 * IL N'Y A AUCUNE GARDE DE ROLE ICI, ET C'EST VOULU. Ce formulaire est PUBLIC :
 * exiger une session fermerait le seul moyen d'ecrire a la boutique a qui n'a
 * pas de compte, c'est-a-dire a la quasi-totalite des visiteurs.
 *
 * L'ABSENCE DE GARDE N'EST PAS UNE ABSENCE DE PROTECTION. Une entree publique
 * est non fiable par definition, invariant 7 : elle est validee cote serveur,
 * bornee en longueur, et le volume est plafonne par adresse. Ce sont ces trois
 * choses qui remplacent la garde, jamais la confiance dans l'appelant.
 */

import { headers } from "next/headers";

import { adresseAppelante } from "@/lib/adresse-appelante";

import { journaliserErreur } from "@/lib/journal";
import { deposerMessage } from "@/services/message-contact";

/** Ce que l'interface recoit, jamais une exception. */
export type ResultatContact =
  | { statut: "ENREGISTRE" }
  | { statut: "INVALIDE"; message: string }
  | { statut: "TROP_DE_MESSAGES" }
  | { statut: "INDISPONIBLE" };

/**
 * Enregistre un message de contact.
 *
 * `ouvertA` VIENT DU FORMULAIRE, ET SON RENVOI EST DELIBERE. C'est l'instant ou
 * la page a ete rendue : le comparer a maintenant donne le temps passe devant
 * le formulaire, et une soumission instantanee trahit un script.
 *
 * IL N'EST PAS FIABLE, un appelant pouvant l'anti-dater. C'est la limite
 * acceptee de cette couche, ecrite dans le service, et la raison pour laquelle
 * elle n'est pas seule.
 */
export async function envoyerMessage(
  formulaire: FormData,
): Promise<ResultatContact> {
  const nom = formulaire.get("nom");
  const email = formulaire.get("email");
  const sujet = formulaire.get("sujet");
  const corps = formulaire.get("corps");
  const piege = formulaire.get("site");
  const ouvertA = formulaire.get("ouvertA");

  if (
    typeof nom !== "string" ||
    typeof email !== "string" ||
    typeof sujet !== "string" ||
    typeof corps !== "string" ||
    typeof piege !== "string" ||
    typeof ouvertA !== "string"
  ) {
    return { statut: "INVALIDE", message: "Demande non valide." };
  }

  try {
    return await deposerMessage({
      saisie: {
        nom,
        email,
        sujet,
        corps,
        piege,
        /*
         * `Number.parseInt` REND `NaN` SUR UNE VALEUR ABSURDE, et le service le
         * traite comme une soumission immediate : c'est le repli sur : un
         * horodatage illisible ne doit pas OUVRIR la porte.
         */
        ouvertA: Number.parseInt(ouvertA, 10),
      },
      adresseIp: adresseAppelante(await headers()),
    });
  } catch (erreur) {
    /*
     * LA CAUSE VA AU JOURNAL, JAMAIS A L'ECRAN, invariant 9. Elle porterait le
     * contenu du message, donc des donnees personnelles saisies par une
     * personne qui ne s'attend pas a les voir affichees.
     */
    journaliserErreur("message de contact impossible", erreur, {});

    return { statut: "INDISPONIBLE" };
  }
}
