/**
 * Page de contact publique, LS-97.
 *
 * COMPOSANT SERVEUR : il rend, et c'est tout. Le formulaire vit dans
 * `formulaire-contact.tsx`, marque client, parce qu'il y a une interaction
 * reelle, un envoi en cours et un message de resultat.
 *
 * AUCUNE GARDE : la page est publique, c'est son objet. Ecrire a la boutique ne
 * demande pas de compte, et la quasi-totalite des visiteurs n'en a pas.
 *
 * L'INSTANT D'OUVERTURE EST ENGENDRE ICI, AU RENDU SERVEUR, et c'est ce qui
 * rend la deuxieme couche anti-robot mesurable : le formulaire le renvoie tel
 * quel, et l'ecart avec l'instant de reception donne le temps passe devant la
 * page. Une soumission instantanee trahit un script qui poste sans afficher.
 *
 * `dynamic = "force-dynamic"` EST CE QUI REND CETTE LIGNE SURE : sans lui, une
 * page mise en cache servirait le MEME instant a tous les visiteurs pendant
 * toute la duree du cache, et l'ecart mesure n'aurait plus aucun rapport avec
 * le temps reellement passe. Le meme piege que la reference de demande de
 * LS-160, sous une autre forme.
 */
import { connection } from "next/server";

import { instantOuverture } from "./instant-ouverture";
import { FormulaireContact } from "./formulaire-contact";
import styles from "./contact.module.css";

export const metadata = {
  title: "Nous écrire",
  description:
    "Une question sur un bijou, une commande ou une création sur mesure : écrivez à l'atelier, la réponse arrive sous quelques jours.",
  // LS-137, page publique indexable : canonical explicite.
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Nous écrire",
    description:
      "Une question sur un bijou, une commande ou une création sur mesure.",
    url: "/contact",
  },
};

export const dynamic = "force-dynamic";

export default async function PageContact() {
  /*
   * `connection()` AVANT DE LIRE L'HORLOGE, et ce n'est pas une formalite.
   *
   * Un composant serveur doit etre PUR : React 19 le verifie, et `Date.now()`
   * dans le rendu fait echouer le lint sur `react-hooks/purity`. La raison est
   * concrete plutot que dogmatique : sans cette attente, l'appel pourrait etre
   * evalue pendant le prerendu et figer le MEME instant dans la coquille
   * statique servie a tous les visiteurs.
   *
   * `connection()` DECLARE QUE CE RENDU DEPEND DE LA REQUETE, verifie via
   * Context7 sur Next.js : tout ce qui suit est evalue par requete, donc
   * l'instant est bien celui de l'affichage de CETTE page.
   *
   * `dynamic = "force-dynamic"` NE SUFFIT PAS SEUL A satisfaire la regle de
   * purete : il regle le cache, pas la nature de l'appel dans le corps du
   * composant.
   */
  await connection();

  /*
   * L'INSTANT VIENT D'UNE FONCTION DE MODULE, JAMAIS DE `Date.now()` ECRIT ICI.
   *
   * La regle `react-hooks/purity` de React 19 interdit tout appel impur dans un
   * composant, et elle a raison : un composant reevalue rendrait une valeur
   * differente a chaque passe. La desactiver par un commentaire ferait taire
   * une regle juste au lieu de traiter la cause.
   *
   * `instantOuverture` VIT DANS UN MODULE ORDINAIRE, ou lire l'horloge est le
   * travail attendu. Le composant reste pur au sens de la regle : il appelle une
   * fonction, comme il appellerait un service.
   *
   * LA VALEUR RESTE JUSTE PAR REQUETE grace a `connection()` ci-dessus, qui
   * declare ce rendu dependant de la requete : sans lui, l'instant pourrait etre
   * fige dans la coquille statique et servi identique a tous les visiteurs.
   */
  const ouvertA = instantOuverture();

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Nous écrire</h1>

      <p className={styles.introduction}>
        Une question sur un bijou, une commande en cours ou une envie de
        création sur mesure : ce formulaire arrive directement à l&apos;atelier.
      </p>

      {/*
       * LE DELAI DE REPONSE EST ANNONCE, et ce n'est pas une politesse : sans
       * lui, une personne sans reponse le lendemain ecrit une seconde fois,
       * puis une troisieme. L'annoncer reduit le volume autant qu'il rassure.
       *
       * IL RESTE VAGUE VOLONTAIREMENT, « quelques jours » : l'atelier est tenu
       * par une personne seule qui tient aussi des marches, et un engagement
       * chiffre qu'elle ne pourrait pas tenir serait pire que pas d'engagement.
       */}
      <p className={styles.delai}>
        L&apos;atelier répond sous quelques jours. Pour une commande en cours,
        indiquez son numéro : la réponse ira plus vite.
      </p>

      <FormulaireContact ouvertA={ouvertA} />
    </main>
  );
}
