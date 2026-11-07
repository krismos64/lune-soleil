/**
 * Page « Avis clients », LS-313.
 *
 * LE BESOIN. Les pièces sont uniques : vendue puis archivée, une pièce perd sa
 * fiche, et son avis disparaissait du site. Cette page garde tous les avis
 * publiés, chacun avec le nom de la pièce figée à la vente.
 *
 * CE QUI EST GARANTI AILLEURS ET SEULEMENT REPRIS ICI :
 *
 *   - le filtre public, statut `PUBLIE` seul, règle R4, dans le repository ;
 *   - les mentions de l'article D111-10 1° près des avis,
 *     `MentionAvisVerifies` et les deux dates de chaque avis ;
 *   - la rubrique du 2°, sur `/informations-legales#avis`, liée ici.
 *
 * AUCUNE DONNÉE STRUCTURÉE D'AVIS : Google refuse les avis qu'une entreprise
 * publie sur elle-même. La page sert les visiteurs et les moteurs de réponse,
 * pas les étoiles, qui restent sur les fiches actives, LS-310.
 *
 * CONTENU IMMOBILE, ADR-045 : une page de lecture, aucune animation.
 */
import type { Metadata } from "next";
import Link from "next/link";

import {
  ListeAvisBoutique,
  MentionAvisVerifies,
} from "@/components/avis-boutique";
import { NOM_BOUTIQUE, openGraphDePage } from "@/lib/seo";
import { lireAvisDeLaBoutique, resumerAvis } from "@/services/avis";

import styles from "./avis-boutique-page.module.css";

const DESCRIPTION = `Les avis vérifiés laissés par les clients de ${NOM_BOUTIQUE} après la livraison de leurs bijoux faits main.`;

export const metadata: Metadata = {
  title: "Avis clients",
  description: DESCRIPTION,
  // Page publique indexable : canonical explicite, LS-137.
  alternates: { canonical: "/avis" },
  openGraph: openGraphDePage({
    titre: "Avis clients",
    description: DESCRIPTION,
    chemin: "/avis",
  }),
};

/**
 * Lu à chaque affichage : une décision de modération doit se voir aussitôt,
 * comme sur l'accueil, et le volume ne justifie aucun cache.
 */
export const dynamic = "force-dynamic";

export default async function PageAvisClients() {
  const avis = await lireAvisDeLaBoutique();
  const synthese = resumerAvis(avis);

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1>Avis clients</h1>

      <p className={styles.introduction}>
        Chaque pièce de l&apos;atelier est unique : une fois vendue, elle ne
        revient pas au catalogue. Les avis de ceux qui l&apos;ont reçue restent
        ici.
      </p>

      {avis.length === 0 ? (
        /*
         * ÉTAT VIDE, SANS INVENTION : aucun faux avis, jamais, et aucune
         * mention d'avis à afficher, l'article D111-10 ne visant que
         * l'affichage d'avis.
         */
        <p className={styles.vide}>
          Aucun avis n&apos;est encore publié. Les avis sont proposés aux
          clients après la livraison de leur commande.
        </p>
      ) : (
        <>
          {synthese.moyenne !== null && (
            <p className={styles.synthese}>
              <strong>
                {synthese.moyenne.toLocaleString("fr-FR", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}{" "}
                sur 5
              </strong>{" "}
              pour {synthese.nombre} avis
              {synthese.nombre > 1 ? " publiés" : " publié"}.
            </p>
          )}

          <MentionAvisVerifies className={styles.mention} />

          <p className={styles.rubrique}>
            <Link href="/informations-legales#avis" className={styles.lien}>
              Comment les avis sont collectés, contrôlés et conservés
            </Link>
          </p>

          <ListeAvisBoutique avis={avis} niveauTitre="h2" />
        </>
      )}
    </main>
  );
}
