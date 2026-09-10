"use server";

/**
 * Adaptateur d'entree du signalement d'avis, LS-77, article L111-7-2.
 *
 * CE FICHIER NE DECIDE RIEN : il lit le `FormData`, resout l'adresse IP et
 * delegue. Les trois couches anti-robot et la validation vivent dans
 * `services/avis.ts`, ou elles sont exerçables par un test.
 *
 * IL NE LIT AUCUNE SESSION, ET C'EST LA LOI QUI LE VEUT. Le texte ouvre la
 * fonctionnalite aux « responsables des produits ou des services », qui ne sont
 * pas des clients de la boutique et n'ont aucun compte : exiger une
 * authentification restreindrait un droit que l'article ouvre.
 *
 * AUCUNE REVALIDATION, meme motif que le contact : rien de ce que cette action
 * ecrit n'est affiche sur la page publique, le signalement n'etant lu que par
 * l'exploitante.
 */
import { headers } from "next/headers";

import { journaliserErreur } from "@/lib/journal";
import { adresseAppelante } from "@/lib/adresse-appelante";
import { signalerAvis } from "@/services/avis";
import type { IssueSignalement } from "@/services/avis";

/**
 * Enregistre un signalement de doute sur l'authenticite d'un avis.
 *
 * `ouvertA` ARRIVE DU FORMULAIRE, DONC IL N'EST PAS FIABLE : un appelant peut
 * l'anti-dater. C'est la limite acceptee de la deuxieme couche, documentee dans
 * le service, et la raison pour laquelle elle n'est pas seule.
 *
 * UN CHAMP ABSENT DEVIENT UNE CHAINE VIDE plutot que `undefined` : le schema
 * Zod refuse alors proprement, la ou `undefined` produirait un message parlant
 * d'un champ requis dont l'appelant n'a jamais entendu parler.
 */
export async function envoyerSignalement(
  donnees: FormData,
): Promise<IssueSignalement> {
  const texte = (cle: string): string => {
    const valeur = donnees.get(cle);

    return typeof valeur === "string" ? valeur : "";
  };

  const ouvertA = Number(texte("ouvertA"));

  try {
    return await signalerAvis({
      saisie: {
        avisId: texte("avisId"),
        qualite: texte("qualite"),
        email: texte("email"),
        motif: texte("motif"),
        /*
         * LE CHAMP PIEGE S'APPELLE `site`, NOM BANAL ET CREDIBLE, comme celui
         * du contact. Un champ nomme `piege` serait ignore par tout script un
         * peu serieux.
         */
        piege: texte("site"),
        ouvertA,
      },
      adresseIp: adresseAppelante(await headers()),
    });
  } catch (erreur) {
    /*
     * UNE PANNE NE FAIT PAS PERDRE LE SIGNALEMENT SANS LE DIRE. L'interface
     * invite a reessayer plutot que d'afficher un ecran blanc qui laisserait
     * croire que le signalement est parti, ce qui serait grave sur un canal que
     * la loi impose d'ouvrir.
     */
    journaliserErreur("Signalement d'avis indisponible", erreur);

    return {
      statut: "INVALIDE",
      message:
        "Le signalement n'a pas pu être enregistré. Réessayez dans un instant.",
    };
  }
}
