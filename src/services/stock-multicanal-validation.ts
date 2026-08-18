/**
 * Validation des entrees du stock multicanal, LS-106. Invariant 7.
 *
 * TOUTE ENTREE NON FIABLE PASSE PAR ICI, y compris celle d'une administratrice
 * authentifiee : une session prouve l'identite, jamais la validite de ce qui est
 * saisi. Un identifiant venant d'un `FormData` n'autorise rien par lui-meme,
 * invariant 2.
 *
 * `strictObject` REFUSE LES CLES INCONNUES, comme partout dans ce projet. Un
 * champ surnumeraire venant d'un formulaire trafique doit faire echouer la
 * validation, pas etre ignore en silence.
 */
import { z } from "zod";

import { centimesDepuisEuros } from "@/services/variante-validation";

/** Identifiant technique : un UUID, jamais une chaine libre. */
const identifiant = z.uuid({ message: "Identifiant invalide." });

/**
 * Prix saisi en euros, converti en centimes entiers, invariant 1.
 *
 * LA CONVERSION EST CELLE DE LS-101, reutilisee et non recopiee : sa protection
 * tient au filtre a deux decimales, qui ferme la notation scientifique et les
 * valeurs negatives que `Number()` accepterait.
 */
const prixEnEuros = z
  .string()
  .trim()
  .min(1, { message: "Le prix encaissé est obligatoire." })
  .transform((saisie, contexte) => {
    const centimes = centimesDepuisEuros(saisie);
    if (centimes === null) {
      contexte.addIssue({
        code: "custom",
        message: "Prix invalide. Deux décimales au maximum, par exemple 42,50.",
      });
      return z.NEVER;
    }
    return centimes;
  });

/**
 * Bascule de la vente web, invariant 6.
 *
 * AUCUNE QUANTITE ICI, ET C'EST LE POINT. Suspendre la vente web ne touche pas
 * au stock : un schema qui accepterait une quantite laisserait croire le
 * contraire au prochain lecteur.
 */
export const schemaBasculeVenteWeb = z.strictObject({
  varianteId: identifiant,
});

/**
 * Enregistrement d'une vente externe, parcours 2.
 *
 * LE PRIX EST OBLIGATOIRE, S12 et `chk_mouvement_vente_externe_prix`. Sans lui
 * le chiffre d'affaires des marches n'existe pas, et il ne se reconstitue pas
 * apres coup depuis le catalogue, invariant 3.
 *
 * LE CANAL EST OBLIGATOIRE AUSSI, mais pour une autre raison : « vendu sur un
 * marche » sans dire lequel rend le journal inexploitable des la deuxieme
 * saison. Il reste du texte libre, l'exploitante nommant ses marches comme elle
 * l'entend.
 */
export const schemaVenteExterne = z
  .strictObject({
    varianteId: identifiant,
    quantite: z
      .number()
      .int({ message: "La quantité doit être un nombre entier." })
      .positive({ message: "La quantité doit être supérieure à zéro." }),
    prixUnitaireEuros: prixEnEuros,
    canal: z
      .string()
      .trim()
      .min(1, { message: "Le canal de vente est obligatoire." })
      .max(120, { message: "Le canal ne peut pas dépasser 120 caractères." }),
  })
  /*
   * LA CLE CHANGE DE NOM EN SORTIE, convention de LS-101. Le `transform` du
   * champ convertit la VALEUR, il ne renomme pas la CLE : sans cette seconde
   * etape, le service recevrait un `prixUnitaireEuros` portant en realite des
   * centimes. Un nom qui ment sur son unite est exactement la forme de defaut
   * que l'invariant 1 cherche a empecher, et il survivrait a toute relecture.
   */
  .transform(({ prixUnitaireEuros, ...reste }) => ({
    ...reste,
    prixUnitaireFigeCentimes: prixUnitaireEuros,
  }));

/**
 * Ajustement d'inventaire.
 *
 * LA QUANTITE CONSTATEE, ET NON L'ECART. L'exploitante compte ce qu'elle a sous
 * les yeux : lui demander de calculer l'ecart deplacerait sur elle une
 * soustraction que le service fait sans se tromper. Zero est une valeur
 * legitime, une piece peut avoir disparu.
 *
 * LE MOTIF EST OBLIGATOIRE. Un ajustement sans explication est inexploitable en
 * controle : « il manque deux pieces » sans dire pourquoi ne se distingue pas
 * d'une erreur de saisie six mois plus tard.
 */
export const schemaAjustementInventaire = z.strictObject({
  varianteId: identifiant,
  quantiteConstatee: z
    .number()
    .int({ message: "La quantité doit être un nombre entier." })
    .min(0, { message: "La quantité ne peut pas être négative." }),
  motif: z
    .string()
    .trim()
    .min(1, { message: "Le motif est obligatoire." })
    .max(500, { message: "Le motif ne peut pas dépasser 500 caractères." }),
});

/** Correction d'un mouvement par compensation, S14 et S15. */
export const schemaCorrectionMouvement = z.strictObject({
  mouvementId: identifiant,
  motif: z
    .string()
    .trim()
    .min(1, { message: "Le motif de la correction est obligatoire." })
    .max(500, { message: "Le motif ne peut pas dépasser 500 caractères." }),
});
