/**
 * Page d'aide, LS-123 : livraison, retours et foire aux questions.
 *
 * DEUX DES TROIS LIENS DU PIED DE PAGE Y MENAIENT DEJA, `/aide` et `/aide#faq`,
 * et rendaient 404 depuis LS-122. Le critere 1 de LS-123 exige qu'aucun lien du
 * pied ne soit mort.
 *
 * ELLE EST LIVREE AVANT `/notre-univers`, ET CE N'EST PAS ARBITRAIRE. Ce qu'elle
 * annonce repose sur des faits DEJA CONNUS : les tarifs viennent d'ADR-025 et de
 * la configuration, les delais de retractation du code livre par LS-133 a
 * LS-135. `/notre-univers` porte au contraire l'histoire de la marque et les
 * matieres, que seule l'exploitante detient, LS-25 : l'ecrire reviendrait a
 * inventer.
 *
 * LES TARIFS VIENNENT DE `lireConfigurationLivraison`, JAMAIS D'UN TEXTE EN DUR.
 * Un seuil de gratuite annonce ici et different au panier serait une information
 * precontractuelle FAUSSE, sanctionnee bien au-dela de l'ecart de prix.
 *
 * LES DELAIS D'EXPEDITION NE SONT PAS ANNONCES, et leur absence est deliberee :
 * l'exploitante n'a pas repondu aux questions 38 a 42 de la fiche, LS-26.
 * Ecrire « expedition sous 24 heures » sans pouvoir le tenir serait une pratique
 * commerciale trompeuse, articles L121-2 et suivants.
 *
 * LA FOIRE AUX QUESTIONS EST VIDE POUR LA MEME RAISON. Sa section existe parce
 * que le pied de page la cite par une ancre, et une ancre absente retombe en
 * haut de page sans lever d'erreur, piege nomme par LS-123.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { formaterMontant } from "@/lib/montant";
import { openGraphDePage } from "@/lib/seo";
import {
  ConfigurationLivraisonInvalideError,
  lireConfigurationLivraison,
} from "@/lib/livraison";
import styles from "./aide.module.css";

export const metadata: Metadata = {
  title: "Livraison, retours et questions fréquentes",
  description:
    "Modes de livraison, tarifs, droit de rétractation et réponses aux questions fréquentes sur les bijoux Lune & Soleil.",
  // LS-137, page publique indexable : canonical explicite.
  alternates: { canonical: "/aide" },
  openGraph: openGraphDePage({
    titre: "Livraison, retours et questions fréquentes",
    description:
      "Modes de livraison, tarifs, droit de rétractation et réponses aux questions fréquentes.",
    chemin: "/aide",
  }),
};

/** Les tarifs se lisent a chaque affichage, jamais au chargement du module. */
export const dynamic = "force-dynamic";

export default async function PageAide() {
  let livraison: ReturnType<typeof lireConfigurationLivraison> | null = null;

  try {
    livraison = lireConfigurationLivraison();
  } catch (erreur) {
    if (!(erreur instanceof ConfigurationLivraisonInvalideError)) {
      throw erreur;
    }
  }

  return (
    /* `id="contenu"` : cible du lien d'evitement, voir la page soeur. */
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Livraison, retours et questions</h1>

      <nav className={styles.sommaire} aria-label="Sections de cette page">
        <ul className={styles.listeSommaire}>
          <li>
            <a href="#livraison">Livraison</a>
          </li>
          <li>
            <a href="#retours">Retours</a>
          </li>
          <li>
            <a href="#faq">Questions fréquentes</a>
          </li>
        </ul>
      </nav>

      <section
        id="livraison"
        tabIndex={-1}
        className={styles.section}
        aria-labelledby="titre-livraison"
      >
        <h2 id="titre-livraison" className={styles.titreSection}>
          Livraison
        </h2>

        <p className={styles.texte}>
          Les commandes sont expédiées en France métropolitaine par Mondial
          Relay. Trois modes sont proposés au moment de la commande.
        </p>

        {livraison === null ? null : (
          <ul className={styles.liste}>
            <li>
              <strong>Point Relais</strong> :{" "}
              {formaterMontant(livraison.relaisCentimes)}, à retirer dans un
              commerce partenaire
            </li>
            <li>
              <strong>Locker</strong> :{" "}
              {formaterMontant(livraison.relaisCentimes)}, consigne accessible
              en libre-service
            </li>
            <li>
              <strong>À domicile</strong> :{" "}
              {formaterMontant(livraison.domicileCentimes)}
            </li>
            {livraison.seuilFranchiseCentimes === null ? null : (
              <li>
                <strong>Livraison offerte</strong> à partir de{" "}
                {formaterMontant(livraison.seuilFranchiseCentimes)}{" "}
                d&apos;achat, quel que soit le mode choisi
              </li>
            )}
          </ul>
        )}

        <p className={styles.texte}>
          Le suivi du colis est assuré par Mondial Relay, qui vous informe
          directement de son avancement.
        </p>

        {/*
         * AUCUN DELAI D'EXPEDITION N'EST ANNONCE, et c'est ce paragraphe qui le
         * dit plutot que de laisser un silence. Les questions 38 a 42 de la
         * fiche exploitante sont sans reponse : annoncer un delai qui ne peut
         * pas etre tenu serait une pratique commerciale trompeuse.
         */}
        <p className={styles.attente}>
          Le délai de préparation avant expédition sera précisé ici avant
          l&apos;ouverture de la boutique.
        </p>
      </section>

      <section
        id="retours"
        tabIndex={-1}
        className={styles.section}
        aria-labelledby="titre-retours"
      >
        <h2 id="titre-retours" className={styles.titreSection}>
          Retours et changement d&apos;avis
        </h2>

        <p className={styles.texte}>
          Vous disposez de <strong>quatorze jours</strong> à compter de la
          réception pour changer d&apos;avis, sans avoir à vous justifier. Les
          frais de retour sont à votre charge, et nous vous remboursons la
          totalité de votre commande, frais de livraison initiaux compris.
        </p>

        <p className={styles.texte}>
          Un formulaire en ligne vous permet de déclarer votre rétractation,
          avec ou sans compte.{" "}
          <Link href="/informations-legales#retractation">
            Détail du droit de rétractation
          </Link>
          .
        </p>

        <p className={styles.texte}>
          Si un bijou présente un défaut, il ne s&apos;agit pas d&apos;un
          changement d&apos;avis : la garantie légale de conformité vous couvre
          pendant deux ans, et les frais de retour sont alors à notre charge.
          Écrivez-nous depuis la <Link href="/contact">page de contact</Link>.
        </p>
      </section>

      <section
        id="faq"
        tabIndex={-1}
        className={styles.section}
        aria-labelledby="titre-faq"
      >
        <h2 id="titre-faq" className={styles.titreSection}>
          Questions fréquentes
        </h2>

        {/*
         * LA SECTION EXISTE VIDE PARCE QUE LE PIED DE PAGE LA CITE PAR UNE
         * ANCRE. Une ancre absente ne leve aucune erreur : le navigateur
         * retombe en haut de page, et le lien parait fonctionner. C'est le
         * premier des deux pieges nommes par LS-123.
         *
         * SON CONTENU APPARTIENT A LS-26, qui attend les reponses de
         * l'exploitante sur l'entretien des bijoux et les delais.
         */}
        <p className={styles.attente}>
          Les réponses aux questions les plus fréquentes, sur l&apos;entretien
          des bijoux et les délais, seront publiées ici avant l&apos;ouverture.
          En attendant, écrivez-nous depuis la{" "}
          <Link href="/contact">page de contact</Link>.
        </p>
      </section>
    </main>
  );
}
