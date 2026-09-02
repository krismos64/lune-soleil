/**
 * Creation d'un compte client, LS-54.
 *
 * COMPOSANT SERVEUR : il decide quoi rendre, le formulaire est un composant
 * client separe. Meme partage que l'ecran de connexion de l'administration.
 *
 * QUI EST DEJA CONNECTE N'A RIEN A FAIRE ICI, et la redirection se fait avant
 * tout rendu. Elle ne protege rien, elle evite une impasse : s'inscrire avec
 * une session ouverte creerait un second compte sans que la personne comprenne
 * pourquoi son historique a disparu.
 *
 * LA VERIFICATION VIENT DE LA SESSION, jamais d'un parametre d'URL.
 */
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { lireIdentite } from "@/services/autorisation";

import { FormulaireInscription } from "./formulaire-inscription";
import styles from "../authentification.module.css";

export const metadata = {
  title: "Créer un compte, Lune & Soleil",
  description:
    "Créez votre compte pour suivre vos commandes et retrouver vos factures.",
  /*
   * PAS D'INDEXATION. Un formulaire d'inscription n'apporte rien a un moteur de
   * recherche, et son referencement attire surtout les robots d'inscription
   * automatique que la limitation de debit doit ensuite absorber.
   */
  robots: { index: false, follow: true },
};

/**
 * La page lit la session a chaque affichage.
 *
 * Sans cela Next.js pourrait servir un rendu mis en cache, donc rediriger une
 * personne connectee sur la foi de la session d'une autre. Meme motif que
 * `/compte`.
 */
export const dynamic = "force-dynamic";

export default async function PageInscription() {
  const identite = await lireIdentite(await headers());

  if (identite) {
    redirect("/compte");
  }

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Créer un compte</h1>

      <p className={styles.introduction}>
        Un compte permet de suivre ses commandes, de retrouver ses factures et
        d&apos;enregistrer ses adresses de livraison.
      </p>

      {/*
       * DIT AVANT LE FORMULAIRE, pas apres : l'achat sans compte reste le
       * parcours de premier rang, LS-56. Quelqu'un qui croit devoir creer un
       * compte pour commander abandonne au lieu de revenir en arriere.
       */}
      <p className={styles.introduction}>
        La création d&apos;un compte n&apos;est pas obligatoire pour commander.
      </p>

      <FormulaireInscription />

      <p className={styles.bascule}>
        Vous avez déjà un compte ?{" "}
        <Link href="/compte/connexion" className={styles.lien}>
          Se connecter
        </Link>
      </p>
    </main>
  );
}
