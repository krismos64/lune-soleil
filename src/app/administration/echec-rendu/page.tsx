import { notFound } from "next/navigation";

/**
 * Ecran qui echoue a dessein, pour traverser la frontiere d'erreur. LS-191.
 *
 * ------------------------------------------------------------------
 * POURQUOI DU CODE DE TEST DANS `src/app/`, ET CE QUI LE JUSTIFIE.
 *
 * Le critere 6 de LS-191 exige qu'un test provoque une erreur REELLE et
 * verifie que la barre de navigation survit : « une frontiere qu'aucun test ne
 * traverse est une intention, pas une garantie ».
 *
 * Trois voies ont ete examinees, deux ecartees. Faire lever un ecran existant
 * depuis l'exterieur n'est pas possible : aucun n'accepte d'entree qui le
 * ferait echouer, et c'est tant mieux. Couper la base pendant la suite
 * casserait tous les autres fichiers, l'ordre d'execution n'etant pas garanti.
 * Reste cette page, qui est le seul moyen de faire passer une erreur par la
 * VRAIE frontiere, sous le VRAI layout, avec la barre reellement rendue.
 *
 * Arbitrage de Christophe, 5 septembre 2026.
 * ------------------------------------------------------------------
 *
 * ELLE EST INTROUVABLE EN PRODUCTION, et c'est ce qui rend sa presence
 * acceptable. `notFound()` s'execute AVANT le `throw` : en production la route
 * rend un 404 ordinaire et l'erreur n'est jamais atteinte.
 *
 * L'ORDRE DES DEUX INSTRUCTIONS EST LA GARDE ELLE-MEME. Les inverser rendrait
 * la page capable de lever en production, ou n'importe qui pourrait declencher
 * une erreur serveur a volonte. `scripts/verifier-route-echec.sh` verifie cet
 * ordre, et `tests/e2e/erreur-administration.spec.ts` verifie le 404 rendu
 * lorsque la variable de garde est absente.
 *
 * ELLE N'EST DANS AUCUNE BARRE DE NAVIGATION, et le contrôle de navigation
 * l'exclut nommement : un ecran atteignable au clic serait un piege pour
 * l'exploitante.
 *
 * ELLE N'APPELLE PAS `exigerAdministratrice`, contrairement a tous les autres
 * ecrans de ce dossier. Elle ne lit aucune donnee et n'en affiche aucune : il
 * n'y a rien a proteger, et l'appeler ferait echouer le test pour une raison
 * qui n'est pas celle qu'il mesure. `verifier-gardes-administration.sh`
 * l'exclut pour ce motif, la garde de rôle portant sur les Server Actions et
 * sur les ecrans qui LISENT.
 */
export default async function EcranEchecRendu() {
  /*
   * `AUTORISER_ECHEC_RENDU` N'EST PAS UN SECRET et n'autorise aucun acces : elle
   * n'ouvre qu'une page qui leve. Elle est posee par `playwright.config.ts`
   * pour la suite de bout en bout, et par rien d'autre.
   *
   * LE DEFAUT EST FERME : absente, la page n'existe pas. C'est l'inverse d'un
   * « si la variable dit non alors on bloque », qui laisserait la route ouverte
   * partout ou la variable est simplement oubliee.
   */
  if (process.env.AUTORISER_ECHEC_RENDU !== "1") {
    notFound();
  }

  /*
   * LE MESSAGE NE DOIT RIEN CONTENIR D'EXPLOITABLE. Il traverse `onRequestError`
   * et atterrit dans le journal : `journaliserErreur` le reduit au nom de la
   * classe, mais autant ne rien y mettre qui ressemble a une trace reelle.
   */
  throw new Error("Echec de rendu provoque pour le test de LS-191");
}
