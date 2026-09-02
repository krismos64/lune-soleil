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

  /*
   * LE MODE EXECUTE EST DISTINCT DE CELUI QUI A ETE PAYE, ADR-025. Il ne
   * s'affiche que s'il DIFFERE : le repeter a l'identique n'apprendrait rien et
   * ferait douter d'un ecart la ou il n'y en a pas.
   */
  const modeExecuteDifferent =
    commande.expedition !== null &&
    commande.expedition.mode !== commande.modeLivraison;

  /*
   * LA SECTION DE SUIVI A-T-ELLE UNE LIGNE A MONTRER. Ses quatre lignes sont
   * toutes conditionnelles : sans ce calcul, une expedition sans date, sans
   * numero et au mode identique affichait un titre suivi d'une liste vide.
   */
  const suiviADireQuelqueChose =
    modeExecuteDifferent ||
    commande.expedition?.expedieA !== null ||
    commande.expedition?.numeroSuivi !== null ||
    commande.expedition?.livreA !== null;

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
        {/*
         * CHAQUE LIGNE EST CONDITIONNELLE, PAS SEULEMENT `ligne2`. Le type
         * `AdresseFigee` declare TOUS ses champs optionnels, ce qui est
         * coherent avec un `Json` fige : n'en traiter qu'un laissait des `<br>`
         * inconditionnels, donc une ligne vide en tete ou en fin de bloc des
         * qu'un champ manquait. Releve par la revue frontend.
         *
         * LA LISTE EST CONSTRUITE PUIS RENDUE, plutot qu'une suite de ternaires
         * imbriques : aucun separateur ne peut survivre a la ligne qu'il
         * separait.
         */}
        <address className={styles.adresse}>
          {[
            adresse.nom,
            adresse.ligne1,
            adresse.ligne2,
            [adresse.codePostal, adresse.ville].filter(Boolean).join(" "),
            adresse.pays,
          ]
            .filter((ligne): ligne is string => Boolean(ligne?.trim()))
            .map((ligne, rang, toutes) => (
              <span key={ligne}>
                {ligne}
                {rang < toutes.length - 1 ? <br /> : null}
              </span>
            ))}
        </address>
      </section>

      {/*
       * LE SUIVI N'APPARAIT QUE S'IL EXISTE. `expedieA` peut etre nul meme
       * quand l'expedition existe, et `livreA` l'est TOUJOURS aujourd'hui :
       * aucun chemin ne l'ecrit, c'est LS-33 qui decidera comment le site
       * apprend qu'un colis est livre. Le champ est lu des maintenant pour que
       * cet ecran n'ait pas a changer ce jour-la.
       */}
      {/*
       * LA SECTION N'APPARAIT QUE SI ELLE A QUELQUE CHOSE A DIRE, et non des
       * que l'expedition existe. Ses champs sont tous nullables : `expedieA` et
       * `numeroSuivi` par le schema, `livreA` TOUJOURS aujourd'hui, aucun
       * chemin ne l'ecrivant avant LS-33. Une expedition declaree sans date ni
       * numero affichait un titre « Suivi » suivi d'une liste VIDE.
       *
       * LE MODE EXECUTE S'AFFICHE QUAND IL DIFFERE DE CELUI QUI A ETE PAYE,
       * ADR-025, et c'est ce que le commentaire du repository promettait sans
       * que le rendu le fasse. Un client rebascule de domicile vers Point
       * Relais voyait « A domicile », sans aucun moyen d'apprendre ou son colis
       * etait reellement parti. La commande n'etant jamais reecrite, seul cet
       * ecart peut le dire. Les deux releves par la revue frontend.
       */}
      {commande.expedition && suiviADireQuelqueChose && (
        <section className={styles.section} aria-labelledby="titre-suivi">
          <h2 id="titre-suivi">Suivi</h2>
          <dl className={styles.liste}>
            {modeExecuteDifferent && (
              <div className={styles.ligne}>
                <dt>Mode d&apos;expédition</dt>
                <dd>
                  {LIBELLES_LIVRAISON[commande.expedition.mode]}, au lieu de{" "}
                  {LIBELLES_LIVRAISON[commande.modeLivraison]}
                </dd>
              </div>
            )}
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
              /*
               * `.avoirs` ET NON `.articles` : cette derniere porte un
               * `flex-direction: column` concu pour trois `span` empiles
               * volontairement, et du texte coulant s'y serait brise en blocs.
               *
               * LA STRUCTURE SUIT CELLE DE LA FACTURE, un paragraphe descriptif
               * puis un paragraphe de lien : la premiere version melait les deux
               * dans le meme `li`, et le lecteur d'ecran entendait le numero
               * deux fois de suite. Les deux releves par la revue frontend.
               */
              <ul className={styles.avoirs}>
                {commande.facture.avoirs.map((avoir) => (
                  <li key={avoir.id} className={styles.avoir}>
                    <p className={styles.texte}>
                      Avoir {avoir.numero} de{" "}
                      {formaterMontant(avoir.montantCentimes)}, émis le{" "}
                      {formaterDate(avoir.emisA)}.
                    </p>
                    {avoir.cheminPdf ? (
                      <p className={styles.texte}>
                        <a
                          href={`/compte/commandes/${commande.id}/avoir/${avoir.id}`}
                          className={styles.lien}
                        >
                          Télécharger l&apos;avoir {avoir.numero}
                        </a>
                      </p>
                    ) : (
                      <p className={styles.texte}>
                        Le document de cet avoir est momentanément indisponible.
                      </p>
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
