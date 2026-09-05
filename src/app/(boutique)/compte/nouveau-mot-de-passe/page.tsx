/**
 * Choix du nouveau mot de passe, LS-55.
 *
 * SECONDE DES DEUX ETAPES : on y arrive par le lien recu, jamais par
 * navigation. Better Auth valide le jeton puis redirige ici en le portant en
 * parametre, ou en portant `error=INVALID_TOKEN` s'il est expire ou deja
 * consomme, verifie via Context7 sur la version 1.6.23.
 *
 * LE JETON N'AUTORISE RIEN PAR LUI-MEME, invariant 2. Il est transmis tel quel
 * a `resetPassword`, qui le verifie cote serveur : cette page ne le lit que
 * pour le passer, elle n'en tire aucune conclusion sur l'identite de qui la
 * consulte, et n'affiche donc NI adresse email NI nom.
 *
 * C'EST DELIBERE ET CELA MERITE D'ETRE DIT : afficher « bonjour Untel » ferait
 * de tout lien intercepte un moyen de confirmer a qui appartient l'adresse.
 *
 * AUCUNE SESSION EXIGEE, meme motif que l'ecran precedent.
 */
import Link from "next/link";

import { FormulaireNouveauMotDePasse } from "./formulaire-nouveau-mot-de-passe";
import styles from "../authentification.module.css";

export const metadata = {
  title: "Nouveau mot de passe",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PageNouveauMotDePasse({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametres = await searchParams;

  /*
   * `String()` PLUTOT QU'UN TRANSTYPAGE : Next.js rend un tableau quand le
   * parametre apparait deux fois dans l'URL, `?token=a&token=b`. Traiter cette
   * valeur comme une chaine produirait « a,b », un jeton invalide, donc un
   * refus correct mais dont le message accuserait le jeton plutot que la forme
   * de l'URL.
   */
  const brut = parametres.token;
  const jeton = typeof brut === "string" ? brut : null;
  const erreur = parametres.error;

  /*
   * L'ETAT D'ERREUR EST RENDU ICI, PAS DANS LE FORMULAIRE. Un lien expire ou
   * deja utilise n'a aucun champ a proposer : afficher le formulaire puis
   * refuser a la soumission ferait ressaisir un mot de passe pour rien.
   */
  if (jeton === null || erreur !== undefined) {
    return (
      <main id="contenu" tabIndex={-1} className={styles.page}>
        <h1 className={styles.titre}>Ce lien n&apos;est plus valable</h1>

        <p className={styles.introduction}>
          Un lien de réinitialisation ne fonctionne qu&apos;une fois et reste
          valable une heure. Celui-ci a déjà servi, ou son délai est passé.
        </p>

        <p className={styles.texte}>
          Vous pouvez en demander un nouveau, votre mot de passe actuel reste
          valable en attendant.
        </p>

        <p className={styles.bascule}>
          <Link href="/compte/mot-de-passe-oublie" className={styles.lien}>
            Demander un nouveau lien
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Choisir un nouveau mot de passe</h1>

      <FormulaireNouveauMotDePasse jeton={jeton} />
    </main>
  );
}
