/**
 * Demande de reinitialisation du mot de passe, LS-55.
 *
 * PREMIERE DES DEUX ETAPES : celle-ci envoie le lien, `nouveau-mot-de-passe`
 * consomme le jeton. Les separer suit le parcours reel, l'une se fait sur
 * l'appareil qui a oublie, l'autre depuis la boite de messagerie.
 *
 * AUCUNE SESSION EXIGEE, et c'est la nature meme de cet ecran : on y arrive
 * precisement parce qu'on ne peut pas se connecter. Une garde de session le
 * rendrait inatteignable a ceux qui en ont besoin.
 *
 * L'ABSENCE DE GARDE N'EST PAS UNE ABSENCE DE PROTECTION. La route est plafonnee
 * a trois demandes par minute et par adresse IP, ADR-027, la reponse ne revele
 * jamais si l'adresse existe, et le jeton emis est a usage unique.
 */
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { lireIdentite } from "@/services/autorisation";

import { FormulaireDemandeReinitialisation } from "./formulaire-demande";
import styles from "../authentification.module.css";

export const metadata = {
  title: "Mot de passe oublié",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PageMotDePasseOublie() {
  const identite = await lireIdentite(await headers());

  /*
   * QUI EST DEJA CONNECTE N'A PAS BESOIN DE CET ECRAN. La redirection evite une
   * impasse : demander un lien par email alors qu'on est connecte, puis voir
   * toutes ses sessions tomber a la reinitialisation, se lit comme une panne.
   * Le changement de mot de passe depuis le compte est porte par LS-60.
   */
  if (identite) {
    redirect("/compte");
  }

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Mot de passe oublié</h1>

      <p className={styles.introduction}>
        Indiquez l&apos;adresse email de votre compte. Un lien vous sera envoyé
        pour choisir un nouveau mot de passe.
      </p>

      <FormulaireDemandeReinitialisation />

      <p className={styles.bascule}>
        <Link href="/compte/connexion" className={styles.lien}>
          Revenir à la connexion
        </Link>
      </p>
    </main>
  );
}
