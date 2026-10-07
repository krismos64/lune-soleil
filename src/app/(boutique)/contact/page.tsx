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
import Link from "next/link";
import { connection } from "next/server";

import { openGraphDePage } from "@/lib/seo";

import { instantOuverture } from "./instant-ouverture";
import { FormulaireContact } from "./formulaire-contact";
import styles from "./contact.module.css";

export const metadata = {
  title: "Écrire à l'atelier",
  description:
    "Une question sur un bijou, une commande ou une création sur mesure : écrivez à l'atelier, la réponse arrive sous quelques jours.",
  // LS-137, page publique indexable : canonical explicite.
  alternates: { canonical: "/contact" },
  openGraph: openGraphDePage({
    titre: "Écrire à l'atelier",
    description:
      "Une question sur un bijou, une commande ou une création sur mesure.",
    chemin: "/contact",
  }),
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
      {/*
       * L'EN-TÊTE ANIMÉ, LS-268, amendement d'ADR-045 : une enveloppe se trace
       * puis se scelle d'une lune. Le titre et l'introduction sont visibles
       * au premier rendu, sans script et en mouvement réduit ; seul le dessin
       * s'anime, borné à cinq secondes par `data-borne`.
       *
       * « ÉCRIRE À L'ATELIER » ET NON « NOUS ÉCRIRE », arbitrage de
       * Christophe du 4 octobre 2026 : un « nous » de marque décrirait une
       * entreprise que l'exploitante, qui exerce seule, n'est pas, LS-264.
       */}
      <section className={styles.tete} data-borne="">
        <svg className={styles.lettre} viewBox="0 0 120 84" aria-hidden="true">
          <path
            className={styles.trait}
            pathLength={1}
            d="M8 20 H112 V78 H8 Z"
          />
          <path
            className={`${styles.trait} ${styles.traitSecond}`}
            pathLength={1}
            d="M8 78 L48 46 M112 78 L72 46"
          />
          <path className={styles.rabat} d="M8 20 L60 56 L112 20" />
          <g className={styles.sceau}>
            <circle cx="60" cy="56" r="11" />
            <path d="M63 49 C57 48 53 53 54 57 C55 62 60 64 64 62 C60 62 58 59 58 56 C58 53 60 50 63 49Z" />
          </g>
        </svg>
        <h1 className={styles.titre}>Écrire à l&apos;atelier</h1>
        <p className={styles.introduction}>
          Une question sur un bijou, une commande en cours ou une envie de
          création sur mesure : ce formulaire arrive directement à
          l&apos;atelier.
        </p>
      </section>

      <div className={styles.corps}>
        <section
          className={styles.carteFormulaire}
          aria-labelledby="titre-message"
        >
          <h2 className={styles.sousTitre} id="titre-message">
            Votre demande
          </h2>
          <FormulaireContact ouvertA={ouvertA} />
        </section>

        {/*
         * AVANT D'ÉCRIRE : le délai de réponse, puis deux chemins qui
         * répondent souvent sans attendre. Les encarts glissent sans jamais
         * disparaître, ADR-045 point 5.
         *
         * LE DÉLAI RESTE VAGUE VOLONTAIREMENT, « quelques jours » : l'atelier
         * est tenu par une personne seule qui tient aussi des marchés, et un
         * engagement chiffré qu'elle ne pourrait pas tenir serait pire que pas
         * d'engagement. L'annoncer évite qu'une personne sans réponse le
         * lendemain écrive une seconde fois.
         */}
        <aside
          className={styles.cote}
          aria-label="Avant d'écrire"
          data-borne=""
        >
          <div className={styles.repere}>
            <svg viewBox="0 0 44 44" aria-hidden="true">
              <circle cx="22" cy="22" r="16" />
              <path d="M22 12v10l7 4" />
            </svg>
            <div>
              <p className={styles.repereTitre}>Réponse sous quelques jours</p>
              <p className={styles.repereTexte}>
                Pour une commande en cours, indiquez son numéro : la réponse ira
                plus vite.
              </p>
            </div>
          </div>
          <Link href="/aide" className={styles.repere}>
            <svg viewBox="0 0 44 44" aria-hidden="true">
              <path d="M6 14h22v16H6zM28 20h6l4 5v5H28z" />
              <circle cx="13" cy="32" r="3" />
              <circle cx="33" cy="32" r="3" />
            </svg>
            <div>
              <p className={styles.repereTitre}>Livraison et aide</p>
              <p className={styles.repereTexte}>
                {/*
                 * LS-280 : « Délais » annonçait une information que l'aide ne
                 * publie pas, questions 38 à 42 sans réponse.
                 */}
                Modes de livraison, tarifs et retours : la réponse y est souvent
                déjà.
              </p>
            </div>
          </Link>
          <Link href="/compte" className={styles.repere} prefetch={false}>
            <svg viewBox="0 0 44 44" aria-hidden="true">
              <circle cx="22" cy="16" r="6" />
              <path d="M10 36c2-7 6-10 12-10s10 3 12 10" />
            </svg>
            <div>
              <p className={styles.repereTitre}>Votre espace client</p>
              <p className={styles.repereTexte}>
                Suivre une commande ou retrouver une facture sans attendre de
                réponse.
              </p>
            </div>
          </Link>
        </aside>
      </div>
    </main>
  );
}
