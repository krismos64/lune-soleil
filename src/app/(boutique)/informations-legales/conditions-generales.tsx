/**
 * Conditions générales de vente, LS-28. Rendues dans la section `#cgv`.
 *
 * RÉDIGÉES D'APRÈS LES TEXTES LUS SUR LÉGIFRANCE LE 1ER NOVEMBRE 2026, arbitrage
 * de Christophe du même jour : rédaction sur les sources officielles, validation
 * par lui-même sur le texte publié. Articles lus : L111-1, L211-2, D211-2 et son
 * annexe, L216-1 à L216-7, L217-3 à L217-14, L221-5, L221-28, annexe à R221-1,
 * articles 1641, 1644 et 1648 du Code civil.
 *
 * DEUX TEXTES SONT IMPOSÉS MOT POUR MOT ET VIVENT DANS `lib/textes-imposes.ts` :
 * - l'ENCADRÉ DES GARANTIES, D211-2, « conformément aux modèles annexés au
 *   présent code », modèle A de l'annexe, en vigueur depuis le 1er octobre 2022.
 *   Il est repris en entier, ses deux paragraphes sur le contenu numérique
 *   compris : le modèle n'en prévoit aucune variante sans eux ;
 * - le FORMULAIRE TYPE DE RÉTRACTATION, L221-5 7°, annexe à R221-1, en vigueur
 *   depuis le 28 mai 2022. Seul le crochet « le professionnel insère ici » est
 *   rempli, par l'identité lue à la même source que la facture.
 *
 * AUCUN MONTANT NI DÉLAI ÉCRIT EN DUR : tarifs par `livraison`, délai
 * d'expédition par `DELAI_EXPEDITION_JOURS_MAX`, durée de réservation par
 * `DUREE_RESERVATION_MINUTES`, mention de TVA par `MENTION_FRANCHISE_TVA`. Un
 * chiffre recopié ici divergerait du tunnel au premier réglage, et une
 * information précontractuelle fausse est sanctionnée bien au-delà de l'écart.
 */
import Link from "next/link";

import { formaterMontant } from "@/lib/montant";
import { NOM_BOUTIQUE } from "@/lib/seo";
import { type IdentiteLegale, MEDIATEUR } from "@/lib/identite-legale";
import { denominationLegale } from "@/services/facture";
import { MENTION_FRANCHISE_TVA } from "@/lib/validation";
import {
  type ConfigurationLivraison,
  DELAI_EXPEDITION_JOURS_MAX,
} from "@/lib/livraison";
import { MENTION_TUNNEL } from "@/lib/mentions-retractation";
import {
  ENCADRE_GARANTIES_LEGALES,
  FORMULAIRE_RETRACTATION,
} from "@/lib/textes-imposes";
import { VERSION_CGV } from "@/services/commande";
import { DUREE_RESERVATION_MINUTES } from "@/services/reservation";
import styles from "./informations-legales.module.css";

export function ConditionsGenerales({
  identite,
  livraison,
}: {
  identite: IdentiteLegale | null;
  livraison: ConfigurationLivraison | null;
}) {
  return (
    <>
      <p className={styles.texte}>
        Version {VERSION_CGV}. La version acceptée lors d&apos;une commande est
        conservée avec elle, sans être réécrite par une révision ultérieure.
      </p>

      <h3 className={styles.titreBloc}>Objet</h3>
      <p className={styles.texte}>
        Ces conditions s&apos;appliquent à toute commande passée sur ce site par
        une personne agissant en qualité de consommateur. Le vendeur est
        l&apos;atelier {NOM_BOUTIQUE}, dont l&apos;identité et les coordonnées
        figurent dans la rubrique{" "}
        <Link href="/informations-legales#mentions">Éditeur du site</Link>.
        Elles sont accessibles avant chaque commande, et valider une commande
        vaut acceptation de la version en vigueur à ce moment.
      </p>

      <h3 className={styles.titreBloc}>Les bijoux</h3>
      <p className={styles.texte}>
        Les bijoux sont faits main, et la plupart sont des pièces uniques. Leurs
        caractéristiques essentielles figurent sur la fiche de chacun : la
        description, les matières et, lorsqu&apos;elles sont indiquées, les
        dimensions.
      </p>
      {/*
       * LA PHOTO PORTÉE GÉNÉRÉE EST DITE ICI, ADR-047 ET ADR-048. Elle ne porte
       * aucune mention visible sur la fiche, choix nommé en risque par les deux
       * ADR : les conditions de vente sont le seul texte lu avant l'achat qui
       * puisse le dire sans changer la galerie.
       */}
      <p className={styles.texte}>
        Les photographies montrent la pièce vendue. Sur certaines fiches, une
        photo du bijou porté est une illustration : le bijou y est reproduit
        d&apos;après sa photographie réelle, qui figure toujours sur la même
        fiche, et la description de l&apos;image le précise. Les couleurs
        peuvent paraître légèrement différentes selon l&apos;écran.
      </p>

      <h3 className={styles.titreBloc}>Prix</h3>
      <p className={styles.texte}>
        Les prix sont indiqués en euros, toutes taxes comprises.{" "}
        {MENTION_FRANCHISE_TVA}. Les frais de livraison s&apos;y ajoutent ; leur
        montant dépend du mode choisi, il est indiqué avant la validation et
        rappelé au récapitulatif. Le prix appliqué est celui affiché au moment
        de la validation de la commande, et il ne change plus ensuite.
      </p>

      <h3 className={styles.titreBloc}>Commande</h3>
      <ol className={styles.liste}>
        <li>Vous ajoutez un ou plusieurs bijoux à votre panier.</li>
        <li>
          Vous choisissez le mode de livraison et indiquez vos coordonnées.
        </li>
        <li>
          Un récapitulatif reprend les bijoux, leur prix, les frais de
          livraison, le total et l&apos;adresse de livraison. Vous pouvez
          revenir en arrière pour corriger votre saisie.
        </li>
        <li>
          Vous validez par le bouton « Commander avec obligation de paiement »,
          puis vous payez sur la page sécurisée du prestataire de paiement.
        </li>
      </ol>
      <p className={styles.texte}>
        Les bijoux de votre commande vous sont réservés pendant{" "}
        {DUREE_RESERVATION_MINUTES} minutes pour vous laisser le temps de payer.
        Sans paiement dans ce délai, la réservation est levée et la commande
        n&apos;aboutit pas. Si un bijou n&apos;est plus disponible au moment de
        la validation, la commande est refusée avant tout paiement.
      </p>
      <p className={styles.texte}>
        La commande est confirmée lorsque le prestataire de paiement confirme le
        paiement. Un email de confirmation vous est alors envoyé : il récapitule
        la commande et donne accès à votre facture et au formulaire de
        rétractation.
      </p>

      <h3 className={styles.titreBloc}>Paiement</h3>
      <p className={styles.texte}>
        Le paiement s&apos;effectue en ligne au moment de la commande, sur la
        page de paiement sécurisée de Stripe, par carte bancaire ou par les
        autres moyens que cette page propose. L&apos;atelier n&apos;a jamais
        accès à vos données bancaires et ne les conserve pas.
      </p>

      <h3 className={styles.titreBloc}>Livraison</h3>
      <p className={styles.texte}>
        Les commandes sont livrées en France métropolitaine, Corse comprise, par
        Mondial Relay, au choix en Point Relais, en Locker ou à domicile.
      </p>
      {livraison === null ? null : (
        <ul className={styles.liste}>
          <li>
            Point Relais et Locker : {formaterMontant(livraison.relaisCentimes)}
          </li>
          <li>À domicile : {formaterMontant(livraison.domicileCentimes)}</li>
          {/*
           * LE SEUIL NUL DESACTIVE LA FRANCHISE, il ne vaut pas zero : un
           * `formaterMontant(null)` annoncerait « 0,00 EUR », donc une
           * livraison toujours offerte, l'inverse exact de l'intention.
           */}
          {livraison.seuilFranchiseCentimes === null ? null : (
            <li>
              {/*
               * LS-249 : en Point Relais et Locker seulement, comme le calcul
               * facture, ADR-035. « Quel que soit le mode » faisait promettre
               * par les conditions generales une gratuite du domicile que la
               * commande ne donne jamais.
               */}
              Livraison offerte en Point Relais et Locker à partir de{" "}
              {formaterMontant(livraison.seuilFranchiseCentimes)} d&apos;achat.
              La livraison à domicile reste payante.
            </li>
          )}
        </ul>
      )}
      {/*
       * LE DÉLAI DE LIVRAISON EST CELUI DE L216-1 ALINÉA 3, et non un délai
       * d'acheminement inventé : `livraison.ts` n'annonce que l'expédition, le
       * transporteur ne s'engageant sur aucune durée. À défaut d'autre date, la
       * loi fixe « au plus tard trente jours après la conclusion du contrat ».
       */}
      <p className={styles.texte}>
        L&apos;atelier expédie votre commande dans un délai de{" "}
        {DELAI_EXPEDITION_JOURS_MAX} jours au plus après la confirmation du
        paiement. Sauf autre date convenue avec vous, le bijou vous est livré
        sans retard injustifié et au plus tard trente jours après la conclusion
        du contrat, article L216-1 du Code de la consommation.
      </p>
      <p className={styles.texte}>
        Si le bijou ne vous est pas livré dans ce délai, vous pouvez demander à
        l&apos;atelier de le livrer dans un délai supplémentaire raisonnable,
        puis résoudre le contrat s&apos;il ne l&apos;a pas fait. Vous pouvez le
        résoudre immédiatement si l&apos;atelier refuse de livrer ou s&apos;il
        est manifeste qu&apos;il ne livrera pas, article L216-6. Les sommes
        versées vous sont alors remboursées au plus tard quatorze jours après,
        article L216-7.
      </p>
      <p className={styles.texte}>
        Le bijou voyage aux risques de l&apos;atelier : le risque de perte ou
        d&apos;endommagement ne vous est transféré qu&apos;au moment où vous, ou
        une personne que vous désignez, en prenez physiquement possession,
        article L216-2. Si le colis vous parvient abîmé, écrivez à
        l&apos;atelier.
      </p>

      <h3 className={styles.titreBloc}>Droit de rétractation</h3>
      {/*
       * EMPLACEMENT 2 DE `legal.md` : le droit, son délai et les frais de
       * retour se disent ICI, et pas seulement par renvoi. Le détail vit dans
       * la section `#retractation`, source unique de son calcul et de ses
       * modalités, pour ne pas écrire deux fois la même règle.
       */}
      <p className={styles.texte}>
        {MENTION_TUNNEL.droit} {MENTION_TUNNEL.fraisRetour} Les bijoux vendus
        sur ce site ne sont ni confectionnés sur mesure ni personnalisés : le
        droit de rétractation s&apos;applique à chacun d&apos;eux. Les
        conditions, le délai et le remboursement sont détaillés dans la rubrique{" "}
        <Link href="/informations-legales#retractation">
          Droit de rétractation
        </Link>
        , et le formulaire en ligne reste accessible pendant tout le délai.
      </p>
      <p className={styles.texte}>
        Vous pouvez aussi utiliser le modèle de formulaire ci-dessous, ou toute
        autre déclaration dénuée d&apos;ambiguïté.
      </p>
      <div className={styles.encadre}>
        <p className={styles.encadreTitre}>{FORMULAIRE_RETRACTATION.titre}</p>
        <p className={styles.texte}>{FORMULAIRE_RETRACTATION.avertissement}</p>
        <p className={styles.texte}>
          {FORMULAIRE_RETRACTATION.destinataire(
            identite === null
              ? `l'atelier ${NOM_BOUTIQUE}, aux coordonnées de la rubrique Éditeur du site`
              : `${NOM_BOUTIQUE}, ${denominationLegale(identite.raisonSociale)}, ${identite.adresse}, ${identite.emailContact}`,
          )}
        </p>
        {FORMULAIRE_RETRACTATION.lignes.map((ligne) => (
          <p key={ligne} className={styles.texte}>
            {ligne}
          </p>
        ))}
        <p className={styles.texte}>{FORMULAIRE_RETRACTATION.note}</p>
      </div>

      <h3 className={styles.titreBloc}>Garanties légales</h3>
      <p className={styles.texte}>
        L&apos;atelier est tenu de la garantie légale de conformité et de la
        garantie des vices cachés. Pour les mettre en œuvre, écrivez à
        l&apos;atelier depuis la <Link href="/contact">page de contact</Link> ou
        à l&apos;adresse de la rubrique Éditeur du site, en décrivant le défaut
        et en joignant si possible une photographie. Aucune garantie commerciale
        ne s&apos;y ajoute.
      </p>
      {/*
       * TEXTE IMPOSÉ, D211-2 et modèle A de son annexe, `textes-imposes.ts`.
       * Rendu tel quel, un paragraphe par entrée, sans rien y retirer.
       */}
      <div className={styles.encadre}>
        {ENCADRE_GARANTIES_LEGALES.map((paragraphe) => (
          <p key={paragraphe} className={styles.texte}>
            {paragraphe}
          </p>
        ))}
      </div>

      <h3 className={styles.titreBloc}>Service client</h3>
      <p className={styles.texte}>
        Pour toute question sur une commande, écrivez à l&apos;atelier depuis la{" "}
        <Link href="/contact">page de contact</Link>, ou par email et téléphone
        aux coordonnées de la rubrique Éditeur du site. L&apos;atelier répond
        sous 24 heures.
      </p>

      <h3 className={styles.titreBloc}>Médiation de la consommation</h3>
      <p className={styles.texte}>
        En cas de litige non résolu directement avec l&apos;atelier, vous pouvez
        recourir gratuitement au médiateur de la consommation suivant :
      </p>
      {/*
       * LE MÉDIATEUR VIENT DE `MEDIATEUR`, écrit dans le code depuis le
       * 20 octobre 2026, LS-19. Téléphone et email s'ajoutent au nom, à
       * l'adresse et au site : la convention, article 3-2, demande les trois
       * moyens de saisine, articles L616-1 et R616-1.
       */}
      <dl className={styles.definitions}>
        <div className={styles.definition}>
          <dt>Médiateur</dt>
          <dd>{MEDIATEUR.nom}</dd>
        </div>
        <div className={styles.definition}>
          <dt>Adresse</dt>
          <dd>{MEDIATEUR.adresse}</dd>
        </div>
        <div className={styles.definition}>
          <dt>Téléphone</dt>
          <dd>{MEDIATEUR.telephone}</dd>
        </div>
        <div className={styles.definition}>
          <dt>Email</dt>
          <dd>
            <a href={`mailto:${MEDIATEUR.email}`}>{MEDIATEUR.email}</a>
          </dd>
        </div>
        <div className={styles.definition}>
          <dt>Saisine en ligne</dt>
          <dd>
            <a
              href={MEDIATEUR.siteSaisine}
              rel="noopener noreferrer"
              target="_blank"
            >
              {MEDIATEUR.siteSaisine}
            </a>
          </dd>
        </div>
      </dl>
      <p className={styles.texte}>
        Le recours à la médiation est gratuit pour vous et suppose d&apos;avoir
        tenté au préalable de résoudre le litige avec l&apos;atelier.
      </p>

      <h3 className={styles.titreBloc}>Données personnelles</h3>
      <p className={styles.texte}>
        Les données nécessaires à votre commande sont traitées comme le décrit
        la rubrique{" "}
        <Link href="/informations-legales#confidentialite">
          Confidentialité et données personnelles
        </Link>
        .
      </p>

      <h3 className={styles.titreBloc}>Droit applicable</h3>
      <p className={styles.texte}>
        Ces conditions sont soumises au droit français. Elles ne privent pas le
        consommateur des droits que lui reconnaissent les dispositions
        impératives du Code de la consommation.
      </p>
    </>
  );
}
