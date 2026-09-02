/**
 * Detail d'une commande, vu par son proprietaire. LS-57, critere 2.
 *
 * L'AUTORISATION EST DANS LA LECTURE, jamais dans un `if` apres coup :
 * `lireMaCommande` prend l'identifiant ET l'utilisateur de la session, et rend
 * `null` aussi bien pour une commande inexistante que pour celle d'un tiers.
 * L'ecran ne peut donc pas les distinguer, ni construire un oracle, invariant 2.
 *
 * `notFound()` ET NON UNE PAGE DE REFUS : un « acces refuse » revelerait que la
 * commande existe. Meme raison que le 404 uniforme des routes de document.
 *
 * AUCUN `loading.tsx` DANS CE SEGMENT, regle C32 : il envelopperait la page
 * dans une frontiere Suspense, le streaming commencerait avant `notFound()`, et
 * Next.js laisserait un 200 sur une commande inexistante.
 */
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  formaterDate,
  LIBELLES_LIVRAISON,
  LIBELLES_STATUT,
} from "@/lib/affichage-commande";
import { formaterMontant } from "@/lib/montant";
import { exigerSession } from "@/services/autorisation";
import { lireMaCommande } from "@/services/espace-client-commandes";

import styles from "../../compte.module.css";

export const metadata = {
  title: "Détail de ma commande, Lune & Soleil",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** L'adresse figee, telle qu'elle a ete recopiee au moment de la commande. */
type AdresseFigee = {
  nom?: string;
  ligne1?: string;
  ligne2?: string;
  codePostal?: string;
  ville?: string;
  pays?: string;
};

export default async function PageDetailCommande({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const identite = await exigerSession(await headers());

  if (!identite) {
    redirect("/compte/connexion");
  }

  const { id } = await params;
  const commande = await lireMaCommande(id, identite.utilisateurId);

  if (!commande) {
    notFound();
  }

  /*
   * L'ADRESSE EST UN `Json` EN BASE, donc `unknown` cote type. Elle est LUE et
   * non reconstruite : c'est la copie figee du moment de la commande,
   * invariant 3. Une adresse relue depuis le carnet montrerait celle
   * d'aujourd'hui sur un colis parti il y a six mois.
   */
  const adresse = (commande.adresseLivraison ?? {}) as AdresseFigee;

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Commande {commande.numero}</h1>

      <p className={styles.texte}>
        <Link href="/compte/commandes" className={styles.lien}>
          Retour à mes commandes
        </Link>
      </p>

      <section className={styles.section} aria-labelledby="titre-recapitulatif">
        <h2 id="titre-recapitulatif">Récapitulatif</h2>
        <dl className={styles.liste}>
          <div className={styles.ligne}>
            <dt>Date</dt>
            <dd>{formaterDate(commande.creeA)}</dd>
          </div>
          <div className={styles.ligne}>
            <dt>Statut</dt>
            <dd>{LIBELLES_STATUT[commande.statut]}</dd>
          </div>
          <div className={styles.ligne}>
            <dt>Livraison</dt>
            <dd>{LIBELLES_LIVRAISON[commande.modeLivraison]}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="titre-articles">
        <h2 id="titre-articles">Articles</h2>
        {/*
         * LES LIGNES VIENNENT DE `LigneCommande`, JAMAIS DU CATALOGUE,
         * invariant 3 : libelles et prix sont ceux du jour de la commande.
         */}
        <ul className={styles.articles}>
          {commande.lignes.map((ligne) => (
            <li key={ligne.id} className={styles.article}>
              <span>{ligne.libelleProduitFige}</span>{" "}
              <span className={styles.variante}>
                {ligne.libelleVarianteFige}
              </span>
              <span className={styles.quantite}>
                {ligne.quantite} × {formaterMontant(ligne.prixFigeCentimes)}
              </span>
            </li>
          ))}
        </ul>

        <dl className={styles.liste}>
          <div className={styles.ligne}>
            <dt>Sous-total</dt>
            <dd>{formaterMontant(commande.sousTotalCentimes)}</dd>
          </div>
          <div className={styles.ligne}>
            <dt>Frais de port</dt>
            <dd>{formaterMontant(commande.fraisPortCentimes)}</dd>
          </div>
          <div className={styles.ligne}>
            <dt>Total</dt>
            <dd>
              <strong>{formaterMontant(commande.totalCentimes)}</strong>
            </dd>
          </div>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="titre-adresse">
        <h2 id="titre-adresse">Adresse de livraison</h2>
        <address className={styles.adresse}>
          {adresse.nom}
          <br />
          {adresse.ligne1}
          {adresse.ligne2 ? (
            <>
              <br />
              {adresse.ligne2}
            </>
          ) : null}
          <br />
          {adresse.codePostal} {adresse.ville}
          <br />
          {adresse.pays}
        </address>
      </section>

      {/*
       * LE SUIVI N'APPARAIT QUE S'IL EXISTE. `expedieA` peut etre nul meme
       * quand l'expedition existe, et `livreA` l'est TOUJOURS aujourd'hui :
       * aucun chemin ne l'ecrit, c'est LS-33 qui decidera comment le site
       * apprend qu'un colis est livre. Le champ est lu des maintenant pour que
       * cet ecran n'ait pas a changer ce jour-la.
       */}
      {commande.expedition && (
        <section className={styles.section} aria-labelledby="titre-suivi">
          <h2 id="titre-suivi">Suivi</h2>
          <dl className={styles.liste}>
            {commande.expedition.expedieA && (
              <div className={styles.ligne}>
                <dt>Expédiée le</dt>
                <dd>{formaterDate(commande.expedition.expedieA)}</dd>
              </div>
            )}
            {commande.expedition.numeroSuivi && (
              <div className={styles.ligne}>
                <dt>Numéro de suivi</dt>
                <dd>{commande.expedition.numeroSuivi}</dd>
              </div>
            )}
            {commande.expedition.livreA && (
              <div className={styles.ligne}>
                <dt>Livrée le</dt>
                <dd>{formaterDate(commande.expedition.livreA)}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      <section className={styles.section} aria-labelledby="titre-documents">
        <h2 id="titre-documents">Documents</h2>

        {/*
         * TROIS ETATS DISTINCTS, ET LES CONFONDRE EFFACERAIT UNE ANOMALIE :
         *
         *   aucune facture      normal avant le paiement
         *   facture sans PDF    rendu en echec, regle F8, la facture EXISTE
         *   facture avec PDF    le cas nominal
         *
         * Le deuxieme se dit explicitement plutot que de disparaitre : un
         * client qui ne voit aucun document sur une commande payee croirait a
         * un oubli, et l'exploitante n'en saurait rien.
         */}
        {!commande.facture ? (
          <p className={styles.texte}>
            La facture sera disponible ici une fois le paiement confirmé.
          </p>
        ) : (
          <>
            <p className={styles.texte}>
              Facture {commande.facture.numero}, émise le{" "}
              {formaterDate(commande.facture.emiseA)}.
            </p>

            {commande.facture.cheminPdf ? (
              <p className={styles.texte}>
                <a
                  href={`/compte/commandes/${commande.id}/facture`}
                  className={styles.lien}
                >
                  Télécharger la facture {commande.facture.numero}
                </a>
              </p>
            ) : (
              <p className={styles.texte}>
                Le document de cette facture est momentanément indisponible.
                Contactez-nous pour en recevoir une copie.
              </p>
            )}

            {/*
             * L'AVOIR EST RATTACHE A SA FACTURE D'ORIGINE, invariant 4 : une
             * facture n'est jamais modifiee ni remplacee, une correction produit
             * un avoir. Sans ce lien affiche, un client rembourse verrait une
             * facture au montant plein sans explication.
             */}
            {commande.facture.avoirs.length > 0 && (
              <ul className={styles.articles}>
                {commande.facture.avoirs.map((avoir) => (
                  <li key={avoir.id} className={styles.article}>
                    Avoir {avoir.numero} de{" "}
                    {formaterMontant(avoir.montantCentimes)}, émis le{" "}
                    {formaterDate(avoir.emisA)}
                    {avoir.cheminPdf ? (
                      <>
                        {" "}
                        <a
                          href={`/compte/commandes/${commande.id}/avoir/${avoir.id}`}
                          className={styles.lien}
                        >
                          Télécharger l&apos;avoir {avoir.numero}
                        </a>
                      </>
                    ) : (
                      <> (document momentanément indisponible)</>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </main>
  );
}
