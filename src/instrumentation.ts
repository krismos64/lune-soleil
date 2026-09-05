/**
 * Journalisation des erreurs serveur non rattrapees, LS-191.
 *
 * ------------------------------------------------------------------
 * POURQUOI ICI ET NON DANS `error.tsx`.
 *
 * Une frontiere d'erreur est un composant CLIENT, impose par Next.js. Elle ne
 * recoit de l'erreur que son `digest`, une empreinte : le message, la pile et
 * le chemin qui a echoue restent cote serveur et ne traversent jamais. Y
 * appeler `journaliserErreur` ecrirait donc une ligne qui ne dit rien.
 *
 * Pire, `src/lib/journal.ts` lit `process.env` et serait entraine dans le
 * paquet du navigateur, ce que `.claude/rules/securite.md` refuse deja pour
 * `mot-de-passe.ts` et pour la meme raison.
 *
 * `onRequestError` S'EXECUTE COTE SERVEUR, avec l'erreur COMPLETE et le chemin
 * de la requete. C'est le seul endroit ou la ligne de journal peut etre utile.
 * Verifie via Context7 sur la documentation de `instrumentation.ts`.
 * ------------------------------------------------------------------
 *
 * CE QUI RELIE LA LIGNE ET L'ECRAN : le `digest`. Next.js le calcule en hachant
 * le message et la pile, puis le passe au composant d'erreur. L'ecran
 * d'administration l'affiche, l'exploitante le cite, et cette ligne permet de
 * retrouver l'incident exact. Sans ce champ commun, les deux moities ne se
 * rejoignent pas.
 *
 * AUCUN MESSAGE BRUT N'EST ECRIT. `journaliserErreur` reduit l'erreur au nom de
 * sa classe, invariant 9 : le message d'une erreur Prisma porte souvent une
 * requete complete, parametres compris, et le depot est public.
 *
 * CE FICHIER NE DOIT JAMAIS LEVER. Une exception ici surviendrait pendant le
 * traitement d'une autre exception, et masquerait la premiere. Le `try` couvre
 * donc tout, y compris la lecture des champs de `request`.
 */
import { journaliserErreur } from "@/lib/journal";

export async function onRequestError(
  erreur: unknown,
  requete: { path: string; method: string },
): Promise<void> {
  try {
    /*
     * LE `digest` NE FIGURE PAS DANS LE TYPE, mais Next.js le pose sur l'erreur
     * avant d'appeler ce point d'entree : il est lu defensivement plutot que
     * par une assertion de type, qui affirmerait une garantie que rien ne donne.
     */
    const digest =
      typeof erreur === "object" &&
      erreur !== null &&
      "digest" in erreur &&
      typeof erreur.digest === "string"
        ? erreur.digest
        : undefined;

    journaliserErreur("erreur serveur non rattrapee", erreur, {
      chemin: requete.path,
      methode: requete.method,
      ...(digest !== undefined ? { digest } : {}),
    });
  } catch {
    /*
     * Silence delibere, et c'est le seul endroit du depot ou il se justifie :
     * l'appelant est le gestionnaire d'erreurs de Next.js, il n'y a personne au
     * dessus pour rattraper, et echouer ici remplacerait l'erreur d'origine par
     * la notre dans les traces.
     */
  }
}
