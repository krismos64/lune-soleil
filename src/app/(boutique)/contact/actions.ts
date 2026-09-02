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

import { journaliserErreur } from "@/lib/journal";
import { lireProxiesDeConfiance } from "@/lib/proxies-de-confiance";
import { deposerMessage } from "@/services/message-contact";

/** Ce que l'interface recoit, jamais une exception. */
export type ResultatContact =
  | { statut: "ENREGISTRE" }
  | { statut: "INVALIDE"; message: string }
  | { statut: "TROP_DE_MESSAGES" }
  | { statut: "INDISPONIBLE" };

/**
 * L'adresse IP de l'appelant, ou `null`.
 *
 * ELLE N'EST PAS FIABLE PARTOUT, et ce nul est un etat normal et non une panne.
 * `getIp` de Better Auth ne lit QUE des en-tetes, jamais l'adresse du socket :
 * en production elle est juste parce que Nginx ecrase `X-Forwarded-For` par
 * `$remote_addr`, LS-91, mais en developpement ou derriere un intermediaire non
 * declare elle vaut nul.
 *
 * LE SERVICE TRAITE CE NUL EN NE PLAFONNANT PAS, plutot qu'en rangeant tout le
 * monde sous une meme cle : un compteur partage par tous serait un deni de
 * service offert au premier venu.
 *
 * LA LECTURE EST FAITE ICI ET NON DANS LE SERVICE, frontiere de `app/` : lire
 * un en-tete de requete est le travail de l'adaptateur.
 */
function adresseAppelante(enTetes: Headers): string | null {
  /*
   * `undefined` EST LA VALEUR NORMALE EN PRODUCTION, et non un oubli de
   * configuration : le module explique que l'ecrasement Nginx de LS-91 rend la
   * liste vide juste. Le repli sur un tableau vide dit « aucun proxy de
   * confiance », ce qui est exactement cela.
   */
  const proxies = lireProxiesDeConfiance() ?? [];
  const chaine = enTetes.get("x-forwarded-for");

  if (chaine === null) {
    return null;
  }

  const sauts = chaine
    .split(",")
    .map((saut) => saut.trim())
    .filter((saut) => saut !== "");

  /*
   * UN SEUL SAUT : c'est la forme que produit l'ecrasement Nginx de LS-91,
   * l'adresse publique reelle du client.
   */
  if (sauts.length === 1) {
    return sauts[0] ?? null;
  }

  /*
   * PLUSIEURS SAUTS : parcours de DROITE a GAUCHE, premier saut non declare de
   * confiance retenu, meme regle que `getIp`. Une chaine entierement composee
   * de proxies de confiance ne designe personne, donc `null`.
   *
   * L'EN-TETE EST FORGEABLE PAR L'APPELANT, et c'est pourquoi la valeur ne sert
   * qu'a PLAFONNER un volume, jamais a autoriser quoi que ce soit,
   * invariant 2. Au pire, un appelant qui fait varier son en-tete contourne son
   * propre plafond, ce que les deux autres couches encadrent deja.
   */
  for (let rang = sauts.length - 1; rang >= 0; rang -= 1) {
    const saut = sauts[rang];

    if (saut !== undefined && !proxies.includes(saut)) {
      return saut;
    }
  }

  return null;
}

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
