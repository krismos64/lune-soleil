/**
 * Ecran d'attente de verification d'adresse, LS-54.
 *
 * POURQUOI CET ECRAN EXISTE. LS-82 a leve le blocage technique de l'envoi, et
 * son commentaire de cloture nommait ce qui manquait encore : « le parcours
 * autour, ecran d'attente, renvoi du lien, message quand l'email n'arrive
 * pas ». C'est ce fichier et son formulaire.
 *
 * IL N'EST PAS BLOQUANT, arbitrage de Christophe du 2 septembre 2026.
 * `requireEmailVerification` reste a `false` : un compte non verifie se
 * connecte et navigue normalement, critere 3. La verification conditionne le
 * RATTACHEMENT des commandes passees sans compte, parcours 6, jamais l'acces au
 * compte lui-meme.
 *
 * CONSEQUENCE SUR CE QUE L'ECRAN DIT. Il explique un benefice a venir plutot
 * que d'annoncer un acces refuse. Ecrire « vous devez confirmer pour
 * continuer » serait faux, et un message faux sur un ecran de securite apprend
 * a ne plus le lire.
 *
 * UNE SESSION EST EXIGEE. On n'y arrive qu'apres inscription, et sans session
 * l'ecran ne saurait ni quelle adresse afficher ni vers qui renvoyer le lien.
 */
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { exigerSession } from "@/services/autorisation";

import { BoutonRenvoiVerification } from "./bouton-renvoi";
import styles from "../authentification.module.css";

export const metadata = {
  title: "Confirmez votre adresse",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PageVerification() {
  const identite = await exigerSession(await headers());

  if (!identite) {
    // Vers la connexion CLIENT, jamais celle de l'administration : c'est le
    // defaut que cette story corrige.
    redirect("/compte/connexion");
  }

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Votre compte est créé</h1>

      <p className={styles.introduction}>
        Un message vient de partir vers <strong>{identite.email}</strong>. Le
        lien qu&apos;il contient confirme que cette adresse est bien la vôtre.
      </p>

      <section className={styles.section} aria-labelledby="titre-utilite">
        <h2 id="titre-utilite">À quoi sert cette confirmation</h2>
        <p className={styles.texte}>
          Elle permet de rattacher à votre compte les commandes que vous auriez
          passées sans être connecté, avec cette même adresse. Sans elle, ces
          commandes restent accessibles par le lien reçu par email, mais
          n&apos;apparaissent pas dans votre espace.
        </p>
        <p className={styles.texte}>
          Vous pouvez utiliser la boutique et commander dès maintenant, la
          confirmation n&apos;est pas obligatoire.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="titre-sans-message">
        <h2 id="titre-sans-message">Le message n&apos;arrive pas</h2>
        <p className={styles.texte}>
          Regardez d&apos;abord dans le dossier des indésirables : les messages
          d&apos;une boutique récente y arrivent souvent les premières fois.
          Vous pouvez ensuite en demander un nouveau.
        </p>

        {/*
         * L'ADRESSE VIENT DE LA SESSION ET TRAVERSE LE RENDU SERVEUR. Le
         * composant client ne la choisit pas : sans cela le bouton enverrait un
         * message a n'importe quelle adresse depuis notre domaine.
         */}
        <BoutonRenvoiVerification adresse={identite.email} />
      </section>

      <p className={styles.bascule}>
        <Link href="/compte" className={styles.lien}>
          Aller à mon compte
        </Link>
      </p>
    </main>
  );
}
