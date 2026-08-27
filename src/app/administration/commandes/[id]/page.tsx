/**
 * Detail d'une commande, LS-121. Etapes 10 a 12 du parcours 1.
 *
 * COMPOSANT SERVEUR : il exige le role, lit la base et rend. Les transitions
 * vivent dans `transitions.tsx`, marque client, qui ne requete rien lui-meme.
 *
 * `exigerAdministratrice` EST APPELE AVANT TOUT RENDU, et la Server Action porte
 * la MEME garde : proteger la page seule laisserait ouvert l'appel direct,
 * defaut de LS-89.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import { lireDetailCommande } from "@/services/administration-commandes";
import { EntreeInvalideError } from "@/lib/validation";
import {
  formaterDate,
  formaterMontant,
  formaterOrigine,
  LIBELLES_LIVRAISON,
  LIBELLES_PAIEMENT,
  LIBELLES_STATUT,
  traduireStatut,
} from "../affichage";
import { TransitionsCommande } from "./transitions";
import styles from "../commandes.module.css";

export const metadata = {
  title: "Détail de commande, administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Adresse figee, telle que la commande l'a copiee. A3, invariants 3 et 4. */
type AdresseFigee = {
  ligne1?: string;
  ligne2?: string;
  codePostal?: string;
  ville?: string;
  pays?: string;
  libelle?: string;
};

function lignesAdresse(valeur: unknown): string[] {
  if (valeur === null || typeof valeur !== "object") {
    return [];
  }

  const adresse = valeur as AdresseFigee;

  return [
    adresse.libelle,
    adresse.ligne1,
    adresse.ligne2,
    [adresse.codePostal, adresse.ville].filter(Boolean).join(" "),
    adresse.pays,
  ].filter(
    (ligne): ligne is string => typeof ligne === "string" && ligne !== "",
  );
}

export default async function PageDetailCommande({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const enTetes = await headers();

  try {
    await exigerAdministratrice(enTetes);
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      redirect("/administration/connexion");
    }
    throw erreur;
  }

  const { id } = await params;

  let commande;

  try {
    commande = await lireDetailCommande(id);
  } catch (erreur) {
    /*
     * UN IDENTIFIANT DIFFORME EST UN 404, PAS UNE ERREUR 500. Il vient de
     * l'URL, donc de n'importe qui : le traiter en panne remplirait le journal
     * technique au premier robot venu, et afficherait un ecran d'erreur la ou
     * « cette commande n'existe pas » est la reponse juste.
     */
    if (erreur instanceof EntreeInvalideError) {
      notFound();
    }
    throw erreur;
  }

  if (commande === null) {
    notFound();
  }

  const adresse = lignesAdresse(commande.adresseLivraison);
  const pointRelais = lignesAdresse(commande.pointRelaisAdresse);

  return (
    <main className={styles.page}>
      <Link href="/administration/commandes" className={styles.retour}>
        Retour aux commandes
      </Link>

      <div className={styles.enTeteDetail}>
        <h1 className={styles.titre}>{commande.numero}</h1>
        <span
          className={`${styles.badge} ${styles[`badge${commande.statut}`] ?? ""}`}
        >
          {LIBELLES_STATUT[commande.statut]}
        </span>
      </div>

      <p className={styles.introduction}>
        Passée le {formaterDate(commande.creeA)} par {commande.nomClient}.
      </p>

      <section className={styles.section} aria-labelledby="titre-articles">
        <h2 id="titre-articles" className={styles.titreSection}>
          Articles
        </h2>
        {/*
         * LES LIBELLES ET PRIX SONT LES COPIES FIGEES, jamais le catalogue
         * actuel, invariant 3 : une commande d'hier doit s'afficher avec le
         * prix d'hier, meme si la variante a change depuis, voire disparu.
         */}
        <ul className={styles.listeArticles}>
          {commande.lignes.map((ligne) => (
            <li key={ligne.referenceFigee} className={styles.article}>
              <span className={styles.articleLibelle}>
                {ligne.libelleProduitFige}, {ligne.libelleVarianteFige}
              </span>
              <span className={styles.articleReference}>
                {ligne.referenceFigee}
              </span>
              <span className={styles.articleMontant}>
                {ligne.quantite} × {formaterMontant(ligne.prixFigeCentimes)}
              </span>
            </li>
          ))}
        </ul>

        <dl className={styles.totaux}>
          <div className={styles.detail}>
            <dt>Sous-total</dt>
            <dd>{formaterMontant(commande.sousTotalCentimes)}</dd>
          </div>
          <div className={styles.detail}>
            <dt>Frais de port</dt>
            <dd>{formaterMontant(commande.fraisPortCentimes)}</dd>
          </div>
          <div className={`${styles.detail} ${styles.detailTotal}`}>
            <dt>Total</dt>
            <dd>{formaterMontant(commande.totalCentimes)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="titre-livraison">
        <h2 id="titre-livraison" className={styles.titreSection}>
          Livraison
        </h2>
        <p className={styles.mode}>
          {LIBELLES_LIVRAISON[commande.modeLivraison] ?? commande.modeLivraison}
        </p>
        {/*
         * LE POINT DE RETRAIT S'AFFICHE AVEC SON LIBELLE ET SON ADRESSE, copies
         * a la commande, ADR-025 : un point qui ferme ne doit pas rendre
         * illisible une commande passee.
         */}
        <address className={styles.adresse}>
          {(pointRelais.length > 0 ? pointRelais : adresse).map((ligne) => (
            <span key={ligne}>{ligne}</span>
          ))}
        </address>
        <p className={styles.contact}>
          {commande.emailNormalise}
          {commande.telephone === null ? "" : ` · ${commande.telephone}`}
        </p>
      </section>

      <section className={styles.section} aria-labelledby="titre-paiement">
        <h2 id="titre-paiement" className={styles.titreSection}>
          Paiement
        </h2>
        {/*
         * LE STATUT DE PAIEMENT EST UN AXE DISTINCT du statut de commande,
         * `payments.md`. Les afficher separement evite de laisser croire qu'une
         * commande annulee est remboursee, ce qui est un geste MANUEL distinct.
         */}
        {commande.paiements.length === 0 ? (
          <p className={styles.vide}>Aucune tentative de paiement.</p>
        ) : (
          <ul className={styles.listePaiements}>
            {commande.paiements.map((paiement, index) => (
              <li key={index} className={styles.paiement}>
                <span>
                  {LIBELLES_PAIEMENT[paiement.statut] ?? paiement.statut}
                </span>
                <span>{formaterMontant(paiement.montantCentimes)}</span>
                {paiement.montantRembourseCentimes > 0 ? (
                  <span className={styles.rembourse}>
                    dont {formaterMontant(paiement.montantRembourseCentimes)}{" "}
                    remboursé
                  </span>
                ) : null}
                {paiement.confirmeA === null ? null : (
                  <span className={styles.dateConfirmation}>
                    {formaterDate(paiement.confirmeA)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="titre-suivi">
        <h2 id="titre-suivi" className={styles.titreSection}>
          Suivi
        </h2>

        <TransitionsCommande
          commandeId={commande.id}
          statutActuel={commande.statut}
          transitionsPossibles={[...commande.transitionsPossibles]}
        />

        <h3 className={styles.titreHistorique}>Historique</h3>
        {/*
         * L'ORIGINE EST AFFICHEE, et c'est le point de l'historique, regle S9 :
         * savoir si une commande a ete avancee par une personne ou par une
         * tache est ce qu'on vient y chercher.
         */}
        {commande.historiques.length === 0 ? (
          /*
           * UN TITRE SUIVI DE RIEN SE LIT COMME UNE SECTION CASSEE, releve par
           * `ls-frontend-revue`. Le cas est frequent : toute commande en attente
           * de paiement n'a encore aucune transition.
           */
          <p className={styles.vide}>Aucune transition pour le moment.</p>
        ) : (
          <ol className={styles.historique}>
            {commande.historiques.map((entree, index) => (
              <li key={index} className={styles.entreeHistorique}>
                <span className={styles.dateHistorique}>
                  {formaterDate(entree.creeA)}
                </span>
                {/*
                 * LES STATUTS SONT TRADUITS ICI AUSSI, correction du 27 aout
                 * 2026 : c'etait le seul point de rendu qui affichait la valeur
                 * brute de l'enum, `EN_PREPARATION` sans accent au milieu d'un
                 * ecran entierement accentue. `affichage.ts` enonce pourtant la
                 * regle « jamais la valeur brute », et le detail la franchissait.
                 *
                 * LE REPLI SUR LA VALEUR BRUTE EST DELIBERE : ces colonnes sont
                 * typees `string` et non `StatutCommande`, un statut ajoute
                 * n'ayant pas de libelle s'afficherait donc tel quel plutot que
                 * de disparaitre.
                 */}
                <span>
                  {entree.statutPrecedent === null
                    ? traduireStatut(entree.statutNouveau)
                    : `${traduireStatut(entree.statutPrecedent)} → ${traduireStatut(entree.statutNouveau)}`}
                </span>
                <span className={styles.origine}>
                  {formaterOrigine(entree.origine)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
