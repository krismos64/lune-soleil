/**
 * Connexion d'un client, LS-54.
 *
 * ELLE EST DISTINCTE DE `/administration/connexion`, et cette separation est le
 * defaut que cette story corrige. Jusqu'ici un client dont la session expirait
 * etait renvoye vers l'ecran de connexion de l'ADMINISTRATION, observation
 * deposee le 13 aout 2026 pendant LS-81 et LS-89. Ce n'etait pas une faille,
 * l'ecran refusant correctement quiconque n'est pas administratrice, mais un
 * parcours incoherent : la page annoncait un espace d'administration a
 * quelqu'un qui voulait consulter son compte.
 *
 * DEUX POPULATIONS, DEUX ECRANS, ET DEUX RAISONS :
 *
 *   - l'administration mene par la PASSKEY, ADR-021, le mot de passe etant le
 *     secours. Les clients n'ont que le mot de passe, ADR-023
 *   - l'ecran d'administration ne s'indexe pas et ne propose aucune
 *     inscription. Celui-ci renvoie vers la creation de compte
 *
 * PAS DE REDIRECTION DEPUIS UN PARAMETRE D'URL. La destination apres connexion
 * est un chemin fixe : accepter un `?suivant=` ferait de cet ecran un tremplin
 * de redirection ouverte vers un domaine tiers, apres une page qui inspire
 * confiance.
 */
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { lireIdentite } from "@/services/autorisation";

import { FormulaireConnexionClient } from "./formulaire-connexion-client";
import styles from "../authentification.module.css";

export const metadata = {
  title: "Se connecter, Lune & Soleil",
  description: "Accédez à vos commandes, vos factures et vos adresses.",
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

export default async function PageConnexionClient() {
  const identite = await lireIdentite(await headers());

  if (identite) {
    redirect("/compte");
  }

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Se connecter</h1>

      <FormulaireConnexionClient />

      <p className={styles.bascule}>
        Pas encore de compte ?{" "}
        <Link href="/compte/inscription" className={styles.lien}>
          En créer un
        </Link>
      </p>
    </main>
  );
}
