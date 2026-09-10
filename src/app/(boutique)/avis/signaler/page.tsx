/**
 * Signalement d'un doute sur l'authenticite d'un avis, LS-77.
 *
 * OBLIGATION LEGALE, article L111-7-2 du Code de la consommation, verifie a
 * Legifrance le 11 septembre 2026, version en vigueur depuis le 17 fevrier
 * 2024 : « Elle met en place une fonctionnalite GRATUITE qui permet aux
 * responsables des produits ou des services faisant l'objet d'un avis en ligne
 * de lui signaler un doute sur l'authenticite de cet avis, a condition que ce
 * signalement soit motive. »
 *
 * AUCUNE AUTHENTIFICATION N'EST EXIGEE, et c'est la lecture du texte : les
 * personnes qu'il vise ne sont pas des clients de la boutique et n'ont aucun
 * compte ici. Exiger un compte restreindrait un droit que la loi ouvre.
 *
 * L'AVIS SE DESIGNE PAR UN PARAMETRE D'URL, ET IL N'AUTORISE RIEN,
 * invariant 2 : le service verifie que l'avis existe ET qu'il est PUBLIE. Un
 * identifiant conforme prouve sa forme, jamais le droit d'agir dessus.
 *
 * `notFound()` SUR UN AVIS INTROUVABLE OU NON PUBLIE, jamais une page de refus :
 * accepter un signalement sur un avis `DEPOSE` confirmerait son existence a
 * quelqu'un qui n'a pas pu le lire, ce qui ferait de cet ecran un oracle sur la
 * file de moderation.
 *
 * AUCUN `loading.tsx` DANS CE SEGMENT, regle C32 : il envelopperait la page
 * dans une frontiere Suspense, le streaming commencerait avant `notFound()`, et
 * Next.js laisserait un 200 sur un identifiant inconnu.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { formaterDate } from "@/lib/affichage-commande";
import { lireAvisPourSignalement } from "@/services/avis";

import { FormulaireSignalement } from "./formulaire-signalement";
import { instantOuverture } from "./instant-ouverture";
import styles from "./signalement.module.css";

export const metadata = {
  title: "Signaler un avis",
  robots: { index: false, follow: false },
};

/**
 * JAMAIS DE CACHE. Un avis retire entre-temps doit cesser d'etre signalable,
 * et une reponse mise en cache continuerait de le proposer.
 */
export const dynamic = "force-dynamic";

export default async function PageSignalerAvis({
  searchParams,
}: {
  searchParams: Promise<{ avis?: string }>;
}) {
  const parametres = await searchParams;
  const avisId = parametres.avis;

  if (avisId === undefined || avisId === "") {
    notFound();
  }

  const avis = await lireAvisPourSignalement(avisId);

  if (avis === null) {
    notFound();
  }

  /*
   * L'INSTANT VIENT DU SERVEUR, jamais du navigateur. Il sert la deuxieme
   * couche anti-robot, et une horloge de visiteur ne serait comparable a rien.
   */
  const ouvertA = instantOuverture();

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Signaler un avis</h1>

      <p className={styles.introduction}>
        Ce formulaire est <strong>gratuit</strong>. Il permet aux personnes
        responsables d&apos;un produit de signaler un doute sur
        l&apos;authenticité d&apos;un avis publié, article L111-7-2 du Code de
        la consommation.
      </p>

      {/*
       * L'AVIS VISE EST RAPPELE, ET CE N'EST PAS DECORATIF. Sans lui, la
       * personne signale un identifiant d'URL sans voir ce qu'elle conteste, et
       * l'exploitante recevrait des signalements portant sur autre chose que ce
       * que le signalant croyait viser.
       */}
      <section className={styles.avisVise} aria-labelledby="titre-avis-vise">
        <h2 id="titre-avis-vise" className={styles.noteVisee}>
          Avis visé : {avis.note} sur 5
        </h2>
        <p className={styles.datesVisees}>
          {avis.libelleProduitFige}. Expérience du{" "}
          {formaterDate(avis.experienceA)}
          {avis.publieA !== null && (
            <>, publié le {formaterDate(avis.publieA)}</>
          )}
          .
        </p>
        {avis.commentaire !== null && (
          <p className={styles.commentaireVise}>{avis.commentaire}</p>
        )}
      </section>

      <FormulaireSignalement avisId={avis.id} ouvertA={ouvertA} />

      {/*
       * CE QUE LE SIGNALEMENT NE FAIT PAS, DIT AVANT L'ENVOI. Laisser croire
       * qu'un signalement retire l'avis produirait des signalements deposes
       * pour cette raison, et une deception a la lecture de la reponse.
       */}
      <p className={styles.introduction}>
        Un signalement n&apos;entraîne pas le retrait automatique de l&apos;avis
        : il est examiné, et la décision qui suit est motivée. Pour toute autre
        demande, écrivez-nous depuis la{" "}
        <Link href="/contact" className={styles.lien}>
          page Contact
        </Link>
        .
      </p>
    </main>
  );
}
