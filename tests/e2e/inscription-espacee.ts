/**
 * L'inscription des comptes de test, espacee au strict necessaire. LS-168.
 *
 * POURQUOI UN MODULE PARTAGE. Cinq preparations creent des comptes, et
 * `/sign-up/email` n'accepte que TROIS inscriptions par minute et par IP. Sur
 * une base neuve, celle de la CI a chaque execution, elles doivent donc se
 * coordonner : chacune espacant de son cote ne suffit pas, c'est le TOTAL qui
 * franchit le plafond.
 *
 * LE COMPTEUR EST DANS CE MODULE, et il fonctionne parce que le projet
 * `preparation` tourne sur UN SEUL travailleur depuis LS-168,
 * `playwright.config.ts` : les cinq fichiers partagent alors le meme processus,
 * donc la meme instance de ce module. Avec le parallelisme par defaut, chaque
 * fichier aurait son propre compteur et la coordination serait fictive.
 *
 * ------------------------------------------------------------------
 * CE N'EST PAS LE REESSAI ESPACE QUE LS-168 SUPPRIME PAR AILLEURS, et la
 * distinction est le coeur de la story.
 *
 * UN REESSAI attend APRES avoir echoue, a CHAQUE execution, sans jamais
 * supprimer la cause : les adresses etant horodatees, il y avait toujours
 * quelque chose a inscrire.
 *
 * CELUI-CI attend AVANT de depasser, et UNE SEULE FOIS dans la vie de la base :
 * les adresses etant fixes, des que les comptes existent les paliers de
 * connexion prennent le relais et plus aucune inscription n'a lieu. En regime
 * etabli ce module n'est jamais appele.
 * ------------------------------------------------------------------
 *
 * `verifier-fixtures-e2e.sh` EXEMPTE CE FICHIER de son interdiction d'attente
 * longue, et lui seul : c'est le seul endroit du dispositif ou une attente est
 * justifiee, parce qu'elle precede le depassement au lieu de le subir.
 */
import { expect, type Page } from "@playwright/test";

/**
 * La fenetre du plafond, et le nombre d'appels qu'elle accepte.
 *
 * LES DEUX VALEURS VIENNENT DE `src/lib/auth.ts`, `customRules` :
 * `"/sign-up/email": { window: 60, max: 3 }`. Les recopier ici est un risque de
 * derive assume et garde : `scripts/verifier-fixtures-e2e.sh` confronte ces
 * deux constantes a la configuration reelle.
 */
const FENETRE_MS = 60_000;
const PLACES_PAR_FENETRE = 3;

/**
 * UNE MARGE, parce que la fenetre est GLISSANTE et non un seau qui se vide d'un
 * coup. Better Auth compare l'horodatage du dernier appel : attendre exactement
 * soixante secondes laisse une course de quelques millisecondes.
 */
const MARGE_MS = 2_000;

/**
 * L'horodatage des inscriptions deja faites par cette execution.
 *
 * PARTAGE PAR LES CINQ PREPARATIONS, voir l'entete. Seules les inscriptions
 * REELLES y entrent : une preparation qui trouve son compte deja cree n'ajoute
 * rien et n'impose donc aucune attente aux suivantes.
 */
const inscriptions: number[] = [];

/**
 * Inscrit un compte de test, en attendant si la fenetre est pleine.
 *
 * ------------------------------------------------------------------
 * POURQUOI UN ESPACEMENT FIXE NE SUFFIT PAS, mesure du 7 septembre 2026.
 *
 * La premiere version attendait 21 secondes entre deux inscriptions, en
 * raisonnant « trois inscriptions couvrent 42 secondes, la fenetre en dure
 * 60 ». C'est l'inverse qu'il fallait conclure : 42 < 60 signifie que les TROIS
 * tombent dans la MEME fenetre, qui se trouve donc saturee, et la quatrieme est
 * refusee. Neuf comptes a creer sur une base neuve, trois places par minute.
 *
 * CE QUI COMPTE EST LE NOMBRE D'APPELS DANS LA FENETRE, pas le delai entre deux
 * appels consecutifs. On attend donc que la plus ancienne des trois dernieres
 * inscriptions sorte de la fenetre, et pas une seconde de plus.
 * ------------------------------------------------------------------
 *
 * L'ATTENTE EST POSEE AVANT L'APPEL ET NON APRES : attendre apres la derniere
 * inscription ferait perdre une minute pour rien.
 *
 * ELLE ECHOUE PLUTOT QUE DE RENDRE UN REFUS. Les comptes de test sont une
 * precondition, pas une mesure : laisser passer un echec ici ferait echouer les
 * tests plus loin, sur « le formulaire est introuvable », c'est-a-dire tres
 * loin de la cause.
 */
export async function inscrireEspace(
  page: Page,
  email: string,
  motDePasse: string,
  nom: string,
): Promise<void> {
  await attendreUnePlace(page);

  const reponse = await page.request.post("/api/auth/sign-up/email", {
    data: { email, password: motDePasse, name: nom },
  });

  expect(reponse.ok(), await reponse.text()).toBe(true);

  inscriptions.push(Date.now());
}

/**
 * Attend qu'une place se libere dans la fenetre glissante, s'il le faut.
 *
 * NE FAIT RIEN TANT QUE LA FENETRE N'EST PAS PLEINE, donc rien du tout en
 * regime etabli, ou aucune inscription n'a lieu.
 */
async function attendreUnePlace(page: Page): Promise<void> {
  const maintenant = Date.now();

  // Les inscriptions encore DANS la fenetre : elles seules comptent.
  const recentes = inscriptions.filter((t) => maintenant - t < FENETRE_MS);

  if (recentes.length < PLACES_PAR_FENETRE) {
    return;
  }

  /*
   * LA PLUS ANCIENNE DES PLACES OCCUPEES est celle qui se libere en premier.
   *
   * `Math.min` PLUTOT QUE `recentes[0]`, bien que le tableau soit trie par
   * construction : l'index rend `number | undefined` sous `noUncheckedIndexedAccess`,
   * et le convaincre par une assertion ferait porter la correction sur le
   * compilateur au lieu du code. `Math.min` sur un tableau dont on vient de
   * prouver qu'il compte au moins trois elements rend toujours un nombre.
   */
  const plusAncienne = Math.min(...recentes);
  const attente = FENETRE_MS - (maintenant - plusAncienne) + MARGE_MS;

  await page.waitForTimeout(attente);
}
