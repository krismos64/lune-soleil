/**
 * Page publique qui leve a dessein, LS-125.
 *
 * POURQUOI ELLE EXISTE. `(boutique)/error.tsx` couvre le panier, le tunnel, la
 * confirmation et l'espace client depuis LS-146, et RIEN NE L'EPROUVAIT : la
 * frontiere d'erreur la plus large du site public n'avait aucun test. Son
 * jumeau d'administration, lui, en a un depuis LS-191.
 *
 * CE QUE LA MESURE APPORTE, ET QU'UNE RELECTURE NE DONNE PAS. Un `error.tsx`
 * peut exister, etre juste, et ne jamais s'afficher : il ne rattrape que ce qui
 * leve SOUS lui dans l'arbre, et une frontiere plus proche gagne. Trois ecrans
 * portent deja la leur, catalogue, fiche produit et contact. Rien ne disait que
 * les autres tombaient bien sur celle du groupe plutot que sur la page
 * generique de Next.js, en anglais et sans navigation.
 *
 * `AUTORISER_ECHEC_RENDU` N'EST PAS UN SECRET et n'autorise aucun acces : elle
 * n'ouvre qu'une page qui leve. Elle est posee par `playwright.config.ts` pour
 * la suite de bout en bout, et par rien d'autre. La MEME variable que
 * l'administration, deliberement : deux variables pour le meme usage feraient
 * qu'un durcissement futur ne s'appliquerait qu'a l'une des deux routes.
 *
 * LE DEFAUT EST FERME : absente, la page n'existe pas. C'est l'inverse d'un
 * « si la variable dit non alors on bloque », qui laisserait la route ouverte
 * partout ou la variable est simplement oubliee.
 *
 * AUCUN `loading.tsx` NE DOIT COUVRIR CE SEGMENT, regle C32 : le streaming
 * commencerait avant `notFound()`, et la route rendrait 200 en production.
 */
import { notFound } from "next/navigation";

export const metadata = {
  title: "Echec de rendu",
  robots: { index: false, follow: false },
};

/**
 * JAMAIS DE CACHE. Une reponse mise en cache servirait la page levee, ou son
 * 404, sans jamais reevaluer la variable.
 */
export const dynamic = "force-dynamic";

export default async function EcranEchecRenduPublic() {
  if (process.env.AUTORISER_ECHEC_RENDU !== "1") {
    notFound();
  }

  /*
   * LE MESSAGE NE DOIT RIEN CONTENIR D'EXPLOITABLE. Il traverse
   * `onRequestError` et atterrit dans le journal : `journaliserErreur` le
   * reduit au nom de la classe, mais autant ne rien y mettre qui ressemble a
   * une trace reelle.
   */
  throw new Error("Echec de rendu provoque pour le test de LS-125");
}
