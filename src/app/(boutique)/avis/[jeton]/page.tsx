/**
 * Depot d'un avis par lien signe, LS-61, parcours 7.
 *
 * QUI L'APPELLE : le client dont la commande vient d'etre livree, depuis le
 * lien recu par email. Ce qui protege cette page n'est ni son chemin ni
 * l'identifiant qu'elle porte, c'est la SIGNATURE du jeton, verifiee cote
 * serveur, invariant 2.
 *
 * ELLE SERT LES CLIENTS AVEC OU SANS COMPTE, indifferemment : l'avis est ancre
 * sur la ligne de commande, jamais sur le compte, decision G. Un acheteur sans
 * compte doit pouvoir deposer son avis, sinon la preuve d'achat structurelle ne
 * couvrirait qu'une partie des acheteurs.
 *
 * CE QU'ELLE NE DECIDE PAS : aucune regle n'est ecrite ici. Elle lit le jeton,
 * delegue a `services/avis.ts` et traduit l'issue en ecran.
 *
 * `notFound()` SUR TOUT REFUS D'ACCES, jamais une page de refus : un « acces
 * refuse » revelerait qu'une commande existe. Meme regle que la route de
 * facture, qui rend 404 et non 403.
 *
 * AUCUN `loading.tsx` DANS CE SEGMENT, regle C32 : il envelopperait la page
 * dans une frontiere Suspense, le streaming commencerait avant `notFound()`, et
 * Next.js laisserait un 200 sur un jeton invalide.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { DELAI_PUBLICATION_JOURS, lireEtatDepot } from "@/services/avis";

import { FormulaireAvis } from "./formulaire-avis";
import type { PieceANoter } from "./formulaire-avis";
import styles from "./avis.module.css";

export const metadata = {
  title: "Donner mon avis",
  robots: { index: false, follow: false },
};

/**
 * JAMAIS DE CACHE. Une reponse mise en cache servirait l'ecran apres revocation
 * ou consommation du jeton, ce qui viderait les regles L9 et L10 de leur effet.
 */
export const dynamic = "force-dynamic";

export default async function PageDepotAvis({
  params,
}: {
  params: Promise<{ jeton: string }>;
}) {
  const { jeton } = await params;

  const etat = await lireEtatDepot(jeton);

  if (etat.statut === "INDISPONIBLE") {
    notFound();
  }

  const aide = (
    <p>
      Une question ? Écrivez-nous depuis la page{" "}
      <Link href="/contact" className={styles.lien}>
        Contact
      </Link>
      .
    </p>
  );

  if (etat.statut === "DEJA_DEPOSE") {
    return (
      <main id="contenu" tabIndex={-1} className={styles.page}>
        <h1 className={styles.titre}>Donner mon avis</h1>
        <div className={styles.information}>
          <p>Un avis a déjà été déposé pour cette commande.</p>
          <p>
            Chaque avis est relu avant publication, sous{" "}
            {DELAI_PUBLICATION_JOURS} jours au plus.
          </p>
          {aide}
        </div>
      </main>
    );
  }

  /*
   * LE LIEN REMPLACE S'EXPLIQUE, IL NE SE TAIT PAS, critere 4. Ce cas
   * correspond a un client LEGITIME dont le lien a ete remplace par un envoi
   * plus recent : lui rendre un 404 le laisserait sans recours alors qu'un
   * email l'attend dans sa boite, et lui dire « avis deja depose » lui ferait
   * croire qu'il a ecrit quelque chose.
   */
  if (etat.statut === "LIEN_REMPLACE") {
    return (
      <main id="contenu" tabIndex={-1} className={styles.page}>
        <h1 className={styles.titre}>Donner mon avis</h1>
        <div className={styles.information}>
          <p>Ce lien a été remplacé par un envoi plus récent.</p>
          <p>
            Ouvrez le dernier message reçu à propos de cette commande, il porte
            le lien à utiliser.
          </p>
          {aide}
        </div>
      </main>
    );
  }

  const pieces: PieceANoter[] = etat.pieces.map((piece) => ({
    ligneCommandeId: piece.ligneCommandeId,
    libelleProduitFige: piece.libelleProduitFige,
    libelleVarianteFige: piece.libelleVarianteFige,
    dejaNotee: piece.avisExistant !== null,
  }));

  const toutesNotees = pieces.every((piece) => piece.dejaNotee);

  if (toutesNotees) {
    return (
      <main id="contenu" tabIndex={-1} className={styles.page}>
        <h1 className={styles.titre}>Donner mon avis</h1>
        <div className={styles.information}>
          <p>
            Toutes les pièces de la commande {etat.numeroCommande} ont déjà reçu
            un avis. Merci pour votre retour.
          </p>
          {aide}
        </div>
      </main>
    );
  }

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Donner mon avis</h1>

      <p className={styles.introduction}>
        Votre commande {etat.numeroCommande} vous a été remise. Si vous le
        souhaitez, dites-nous ce que vous pensez de votre achat.
      </p>

      <FormulaireAvis
        jeton={jeton}
        pieces={pieces}
        delaiPublicationJours={DELAI_PUBLICATION_JOURS}
      />
    </main>
  );
}
