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
  fraicheurSuivi,
  LIBELLES_LIVRAISON,
  LIBELLES_STATUT,
} from "@/lib/affichage-commande";
import { formaterMontant } from "@/lib/montant";
import { exigerSession } from "@/services/autorisation";
import { lireMaCommande } from "@/services/espace-client-commandes";
import { commandePeutOuvrirUneRetractation } from "@/services/retractation";

import { FriseEtapes } from "./frise-etapes";
import styles from "../../compte.module.css";

export const metadata = {
  title: "Détail de ma commande",
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
   * LS-134. LE LIEN NE S'AFFICHE QUE SUR UNE COMMANDE QUI PORTE UN CONTRAT,
   * jamais sur une commande non payee ou annulee. CE N'EST PAS UNE EXCLUSION
   * AU SENS DE L221-28, regle L3 : il ne s'agit pas de juger le PRODUIT, mais
   * de constater qu'il n'y a rien a retracter.
   *
   * LE PREDICAT VIENT DU SERVICE ET N'EST PAS RECOPIE ICI : une liste de
   * statuts dupliquee dans un composant divergerait au premier statut ajoute,
   * et l'ecran masquerait un droit ouvert. Il n'autorise rien, la garde qui
   * compte etant dans le service.
   */
  const etatRetractationAffichable = commandePeutOuvrirUneRetractation(
    commande.statut,
  );

  /*
   * LE MODE EXECUTE EST DISTINCT DE CELUI QUI A ETE PAYE, ADR-025. Il ne
   * s'affiche que s'il DIFFERE : le repeter a l'identique n'apprendrait rien et
   * ferait douter d'un ecart la ou il n'y en a pas.
   */
  const modeExecuteDifferent =
    commande.expedition !== null &&
    commande.expedition.mode !== commande.modeLivraison;

  /*
   * LA FRAICHEUR DU SUIVI, LS-58 critere 4. Elle vient du module d'affichage
   * partage avec l'administration : recopier le seuil ici en ferait diverger
   * les deux ecrans au premier ajustement, et le client verrait « a jour » ce
   * que l'exploitante voit « bloque ».
   *
   * `null` QUAND AUCUN COLIS N'EST PARTI, ce qui n'est pas la meme chose qu'un
   * suivi jamais lu : sans expedition, il n'y a rien a synchroniser.
   */
  const fraicheur =
    commande.expedition === null ? null : fraicheurSuivi(commande.expedition);

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      {/*
       * LE SUR-TITRE DE RUBRIQUE, forme du prototype, LS-180. Il n'est PAS un
       * titre au sens du document : c'est un `p` qui precede le `h1`, et le
       * passer en `h2` ferait ouvrir la page sur un niveau 2.
       *
       * `aria-hidden` LE RETIRE DE L'ARBRE D'ACCESSIBILITE : lu a voix haute,
       * il redirait ce que le `h1` juste dessous porte deja.
       */}
      <p className={styles.surTitre} aria-hidden="true">
        Historique
      </p>
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
       * LA FRISE PRECEDE LE SUIVI DETAILLE, LS-190. Elle repond a « ou en est ma
       * commande » d'un coup d'oeil, la ou la liste qui suit porte les valeurs
       * exactes : numero de suivi, mode execute, fraicheur. L'ordre suit celui
       * du prototype, et l'une ne remplace pas l'autre.
       *
       * ELLE NE RECOIT QUE CE QUE LA PAGE A DEJA LU, aucune requete de plus :
       * la frise DERIVE, elle ne va rien chercher.
       */}
      <FriseEtapes
        commande={{
          statut: commande.statut,
          creeA: commande.creeA,
          expedition: commande.expedition,
        }}
      />

      {/*
       * LE SUIVI N'APPARAIT QUE SI UN COLIS EST PARTI. Une commande en attente
       * de paiement ou en preparation n'a pas d'expedition, et un titre suivi
       * d'une liste vide se lit comme une section cassee, releve par la revue
       * frontend sur cet ecran.
       *
       * LA CONDITION S'EST SIMPLIFIEE EN LS-58. Elle testait auparavant que la
       * section avait « quelque chose a dire », ses quatre lignes etant toutes
       * conditionnelles. Elle en porte desormais une INCONDITIONNELLE, l'etat de
       * la livraison, qui se dit y compris quand il est negatif : le calcul
       * n'avait plus d'objet.
       *
       * `livreA` EST DESORMAIS RENSEIGNE, par la synchronisation horaire de
       * LS-131. Ce commentaire disait le contraire jusqu'au 10 septembre 2026,
       * « TOUJOURS nul, aucun chemin ne l'ecrivant avant LS-33 » : ADR-042 a
       * tranche, deux statuts le renseignent, `Delivered` au domicile et
       * `Shipment collected by customer` en point de service.
       */}
      {commande.expedition && (
        <section className={styles.section} aria-labelledby="titre-suivi">
          <h2 id="titre-suivi">Suivi de la livraison</h2>
          <dl className={styles.liste}>
            {/*
             * LE MODE EXECUTE S'AFFICHE QUAND IL DIFFERE DE CELUI QUI A ETE
             * PAYE, ADR-025. Un client rebascule de domicile vers Point Relais
             * voyait « A domicile » sans aucun moyen d'apprendre ou son colis
             * etait reellement parti : la commande n'etant jamais reecrite,
             * seul cet ecart peut le dire. Releve par la revue frontend.
             */}
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
                {/*
                 * AUCUNE CLASSE PROPRE : `.ligne dd` porte deja
                 * `overflow-wrap: anywhere`, pose pour les adresses email qui
                 * n'ont pas de point de coupure naturel. Un numero de suivi de
                 * quinze caracteres sans espace est exactement le meme cas, et
                 * lui ajouter une classe dupliquerait la regle.
                 */}
                <dd>{commande.expedition.numeroSuivi}</dd>
              </div>
            )}
            {/*
             * LE LIBELLE DU TRANSPORTEUR, LS-58 critere 1. Il repond a « ou en
             * est mon colis » sans qu'aucun email ne soit necessaire, motif de
             * l'arbitrage du 28 juillet 2026.
             *
             * IL N'ANNONCE PAS UNE LIVRAISON, meme quand il en a l'air. « En
             * attente de retrait » dit que le colis attend au relais, et la
             * ligne suivante reste la seule a constater la remise.
             */}
            {commande.expedition.statutTransporteur && (
              <div className={styles.ligne}>
                <dt>Dernier statut connu</dt>
                <dd>{commande.expedition.statutTransporteur}</dd>
              </div>
            )}
            {/*
             * L'ETAT DE LA LIVRAISON SE DIT TOUJOURS, y compris quand elle n'a
             * pas eu lieu. Une ligne absente se lirait comme un oubli
             * d'affichage, quand ce qui est en jeu est le point de depart du
             * delai de retractation de quatorze jours, article L221-18 : le
             * client doit pouvoir lire que son delai n'a PAS commence a courir.
             *
             * SEULE LA REMISE AU DESTINATAIRE COMPTE, ADR-042 : ni la mise en
             * distribution, ni l'avis de passage, ni la disponibilite au relais
             * ne renseignent `livreA`.
             */}
            <div className={styles.ligne}>
              <dt>Réception</dt>
              <dd>
                {commande.expedition.livreA
                  ? formaterDate(commande.expedition.livreA)
                  : "Pas encore constatée"}
              </dd>
            </div>
          </dl>

          {/*
           * LE SUIVI ARRETE SE SIGNALE PLUTOT QUE DE PASSER POUR A JOUR,
           * critere 4. Sans cette mention, un dernier statut vieux de trois
           * jours s'affiche exactement comme un statut lu il y a dix minutes,
           * et le client patiente devant une information qu'il croit fraiche.
           *
           * LE TEXTE NE PROMET AUCUN DELAI ET N'ACCUSE PERSONNE : le site sait
           * seulement qu'il n'a plus de nouvelles, ce qui n'etablit ni un
           * retard ni une perte.
           */}
          {fraicheur === "bloque" && commande.expedition.synchroniseA && (
            <p className={styles.suiviArrete}>
              Le transporteur n&apos;a pas donné de nouvelle information depuis
              le {formaterDate(commande.expedition.synchroniseA)}. Si cette
              situation dure, contactez la boutique.
            </p>
          )}

          {/*
           * AUCUN NUMERO DE SUIVI, ET LE CLIENT DOIT LE SAVOIR. Point tranche
           * le 10 septembre 2026 apres la revue frontend, qui a releve que cet
           * etat etait MUET cote client alors que chaque autre decision de cet
           * ecran porte sa justification.
           *
           * CE N'EST PAS UN ETAT TRANSITOIRE. `listerASuivre` filtre sur
           * `numeroSuivi: { not: null }`, donc une expedition sans numero n'est
           * JAMAIS synchronisee : sa reception ne sera pas constatee
           * automatiquement, et le delai de retractation ne demarrera pas tout
           * seul. Un client qui l'ignore croit son delai en cours.
           *
           * LE TEXTE DIT CE QUE LE CLIENT PEUT FAIRE, et rien de plus : il ne
           * peut pas corriger le numero, seule l'exploitante le peut, donc le
           * message invite a la contacter plutot que d'exposer une mecanique
           * interne. Il n'affirme aucun droit ni aucun delai, la page de
           * retractation faisant autorite sur ce point.
           */}
          {commande.expedition.numeroSuivi === null && (
            <p className={styles.suiviArrete}>
              Aucun numéro de suivi n&apos;est associé à cette commande, son
              acheminement ne peut donc pas être suivi automatiquement. Pour
              connaître sa position, contactez la boutique.
            </p>
          )}
        </section>
      )}

      {/*
       * PANNEAU « DOCUMENTS ET ACTIONS », LS-190. Il rassemble ce que l'ecran
       * portait en TROIS endroits : la facture et ses avoirs, la retractation,
       * et le contact qui n'y figurait pas du tout.
       *
       * UN SEUL `h2` POUR LES TROIS GROUPES, et les sous-groupes ne portent PAS
       * de titre de niveau 3 : ce sont trois actions de meme rang, pas une
       * hierarchie. Le lecteur d'ecran annonce « Documents et actions » puis
       * parcourt trois paragraphes, ce qui est la structure reelle.
       *
       * LE FOND EST MESURE, jamais suppose, critere 1 et regle C31 : le detail
       * des paires et le refus de `--ls-text-muted` vivent dans
       * `compte.module.css`, a cote de la declaration qui les applique.
       */}
      <section
        className={styles.panneauActions}
        aria-labelledby="titre-documents-actions"
      >
        <h2 id="titre-documents-actions">Documents et actions</h2>

        <div className={styles.groupeActions}>
          <h3 className={styles.titreGroupe}>Facture</h3>
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
                          Le document de cet avoir est momentanément
                          indisponible.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/*
         * LE LIEN EST VISIBLE ET PERMANENT, article L221-21 : la fonctionnalite
         * doit rester accessible pendant TOUT le delai, et un lien qui
         * disparaitrait au mauvais moment serait un defaut d'information que
         * l'article L221-20 sanctionne par un delai porte a douze mois.
         *
         * IL S'AFFICHE AUSSI QUAND LE DELAI EST EXPIRE OU LA DEMANDE DEJA
         * DEPOSEE : c'est la page cible qui explique la situation. Le masquer
         * laisserait le client sans reponse sur un droit qu'il croit avoir.
         *
         * LA GARDE N'EST PAS DANS CE COMPOSANT, elle est dans le service : un
         * ecran qui n'affiche pas un bouton ne protege rien, la Server Action
         * restant joignable par HTTP.
         */}
        {etatRetractationAffichable && (
          <div className={styles.groupeActions}>
            <h3 className={styles.titreGroupe}>Me rétracter</h3>
            {/*
             * LA MENTION DES FRAIS DE RETOUR ACCOMPAGNE CELLE DE LA
             * RETRACTATION, PARTOUT OU ELLE APPARAIT, `frontend-design.md` :
             * l'annoncer sans elle expose au delai de douze mois de L221-20. Ce
             * bloc est le PREMIER endroit ou le droit est annonce, et le seul
             * atteint par un client qui ne clique pas le lien. Omission relevee
             * par la revue frontend du 3 septembre 2026.
             */}
            <p className={styles.texte}>
              Vous disposez de 14 jours après réception pour changer
              d&apos;avis, sans avoir à vous justifier. Les frais de retour sont
              à votre charge.
            </p>
            <p className={styles.texte}>
              <Link
                href={`/compte/commandes/${commande.id}/retractation`}
                className={styles.lien}
              >
                Déclarer ma rétractation
              </Link>
            </p>
          </div>
        )}

        {/*
         * LE CONTACT EST LE TROISIEME GROUPE, ET IL EST NOUVEAU SUR CET ECRAN.
         * Un client qui voulait ecrire au sujet de SA commande n'avait aucun
         * point d'entree depuis son detail : il devait retrouver la page de
         * contact par la navigation, sans que rien ne rattache son message a
         * cette commande.
         *
         * IL EST TOUJOURS AFFICHE, sans condition : c'est le seul groupe du
         * panneau qui ne depend d'aucun etat, et une commande sans facture ni
         * retractation possible garde ainsi un panneau utile plutot qu'un bloc
         * qui n'annonce qu'une attente.
         */}
        <div className={styles.groupeActions}>
          <h3 className={styles.titreGroupe}>Nous contacter</h3>
          <p className={styles.texte}>
            Indiquez le numéro {commande.numero} dans votre message, nous
            retrouverons votre commande.
          </p>
          <p className={styles.texte}>
            <Link href="/contact" className={styles.lien}>
              Nous écrire
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
