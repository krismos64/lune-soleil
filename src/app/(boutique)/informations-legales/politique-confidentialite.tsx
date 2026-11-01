/**
 * Politique de confidentialité, LS-28. Rendue dans la section `#confidentialite`,
 * AVANT le bloc des cookies que la page garde, LS-148.
 *
 * LA SOURCE EST `docs/architecture/REGISTRE-DES-TRAITEMENTS.md`, et cette page
 * en est la face publique au titre de l'article 13 du RGPD : finalités, bases
 * légales, destinataires, durées et droits. UNE DURÉE MODIFIÉE AU REGISTRE SE
 * REPORTE ICI, et l'inverse : deux durées différentes pour la même donnée
 * feraient de l'une une information fausse.
 *
 * LES DESTINATAIRES NOMMÉS SONT CEUX DU CODE ET DU DÉPLOIEMENT, relevés le
 * 1er novembre 2026 : OVHcloud héberge le site et envoie les emails (ADR-008),
 * Sendcloud reçoit les données d'expédition (ADR-035), Stripe encaisse
 * (Checkout), Backblaze garde une copie de sauvegarde CHIFFRÉE AVANT ENVOI
 * (ADR-037, LS-107). Le registre ne nommait ni Stripe ni Backblaze à cette
 * date : la page dit ce qui se passe réellement, le registre est à compléter.
 *
 * LA DURÉE DES SAUVEGARDES VIENT DE `copier-sauvegarde-hors-site.sh` : masquage
 * au-delà de quatorze jours, `daysFromHidingToDeleting` à trente, LS-223.
 *
 * AUCUN « AUCUN TRANSFERT HORS DE L'UNION » GLOBAL : Stripe et Backblaze sont
 * des sociétés dont le groupe est établi aux États-Unis, et l'affirmation
 * n'a pas été vérifiée pour eux. La page renvoie à leurs propres engagements.
 *
 * LE STOCKAGE BACKBLAZE EST AUX PAYS-BAS, point de terminaison
 * `s3.eu-central-003`, région EU Central d'Amsterdam, lu dans la console par
 * Christophe le 1er novembre 2026, LS-305. Un lieu de stockage et non une
 * absence de transfert : la société reste américaine.
 */
import Link from "next/link";

import styles from "./informations-legales.module.css";

export function PolitiqueConfidentialite() {
  return (
    <>
      <h3 className={styles.titreBloc}>Responsable du traitement</h3>
      <p className={styles.texte}>
        Le responsable du traitement de vos données est l&apos;atelier, dont
        l&apos;identité et les coordonnées figurent dans la rubrique{" "}
        <Link href="/informations-legales#mentions">Éditeur du site</Link>.
        Aucun délégué à la protection des données n&apos;est désigné, cette
        désignation n&apos;étant pas obligatoire pour l&apos;atelier.
      </p>

      <h3 className={styles.titreBloc}>Ce qui est collecté, et pourquoi</h3>
      <p className={styles.texte}>
        L&apos;atelier ne collecte que ce dont il a besoin pour vous vendre un
        bijou et vous le livrer. Les champs nécessaires à une commande sont
        signalés : sans eux, la commande ne peut pas être passée.
      </p>
      <ul className={styles.liste}>
        <li>
          <strong>Votre commande</strong> : nom, adresse email, téléphone,
          adresses de livraison et de facturation, bijoux commandés et montants.
          Pour exécuter le contrat de vente. Conservées trois ans après la fin
          de la relation commerciale, puis archivées tant que les délais légaux
          l&apos;exigent.
        </li>
        <li>
          <strong>Vos factures et avoirs</strong> : les mêmes informations,
          figées à l&apos;émission. Pour respecter les obligations comptables.
          Conservés dix ans, article L123-22 du Code de commerce.
        </li>
        <li>
          <strong>Votre compte</strong>, si vous en créez un : adresse email,
          nom, empreinte du mot de passe ou clé publique de passkey, sessions de
          connexion. Pour vous donner accès à votre espace client. Conservées
          jusqu&apos;à la suppression du compte ; un compte inutilisé pendant
          deux ans est supprimé.
        </li>
        <li>
          <strong>Votre carnet d&apos;adresses</strong> : les adresses que vous
          y enregistrez. Pour vous éviter de les ressaisir. Conservées
          jusqu&apos;à leur suppression par vous, et au plus tard jusqu&apos;à
          celle du compte.
        </li>
        <li>
          <strong>Votre rétractation</strong>, si vous l&apos;exercez : motif
          éventuel, décision, preuve d&apos;expédition du retour, montant
          remboursé. Pour respecter le Code de la consommation. Conservées cinq
          ans, délai de prescription de l&apos;article 2224 du Code civil.
        </li>
        <li>
          <strong>Votre avis</strong>, si vous en déposez un : note,
          commentaire, date de l&apos;expérience, et votre adresse email pour
          l&apos;invitation. Pour informer les autres acheteurs, intérêt
          légitime de l&apos;atelier. Vous pouvez le retirer vous-même depuis
          votre espace client. Conservation détaillée dans la rubrique{" "}
          <Link href="/informations-legales#avis">Avis de clients</Link>.
        </li>
        <li>
          <strong>Vos messages</strong> envoyés par la page de contact : nom,
          adresse email et contenu. Pour vous répondre, intérêt légitime de
          l&apos;atelier. Conservés trois ans.
        </li>
        <li>
          <strong>La sécurité du site</strong> : adresse IP, navigateur, adresse
          email saisie et issue des tentatives de connexion ; traces des actions
          d&apos;administration. Pour détecter les accès non autorisés, intérêt
          légitime de l&apos;atelier. Conservées six mois, et vingt-quatre
          heures pour les compteurs qui limitent les envois répétés.
        </li>
      </ul>
      <p className={styles.texte}>
        L&apos;atelier n&apos;envoie aucune prospection commerciale, ne vend
        aucune donnée et ne prend aucune décision automatisée à votre sujet.
      </p>

      <h3 className={styles.titreBloc}>Qui reçoit vos données</h3>
      <p className={styles.texte}>
        Seul l&apos;atelier consulte vos données. Quelques prestataires en
        reçoivent une partie, pour le seul service qu&apos;ils rendent :
      </p>
      <ul className={styles.liste}>
        <li>
          <strong>OVHcloud</strong>, en France, héberge le site et sa base de
          données, et achemine les emails envoyés par l&apos;atelier.
        </li>
        <li>
          <strong>Sendcloud</strong>, aux Pays-Bas, reçoit le nom,
          l&apos;adresse, l&apos;email, le téléphone et le point de retrait
          choisi, qu&apos;il transmet au transporteur{" "}
          <strong>Mondial Relay</strong> pour livrer votre colis et vous en
          informer.
        </li>
        <li>
          <strong>Stripe</strong> reçoit directement, sur sa page de paiement,
          les informations de paiement que vous y saisissez, et le montant de la
          commande. Stripe traite ces données selon sa propre{" "}
          <a
            href="https://stripe.com/fr/privacy"
            rel="noopener noreferrer"
            target="_blank"
          >
            politique de confidentialité
          </a>
          , qui décrit aussi ses transferts hors de l&apos;Union européenne.
        </li>
        <li>
          <strong>Backblaze</strong> conserve une copie de sauvegarde de la base
          de données, stockée aux Pays-Bas et chiffrée avant son envoi : le
          prestataire garde un fichier qu&apos;il ne peut pas lire. Chaque
          sauvegarde est retirée au bout de quatorze jours, puis effacée par
          Backblaze trente jours plus tard, soit quarante-quatre jours au plus.
        </li>
      </ul>
      <p className={styles.texte}>
        En cas de besoin, vos données peuvent aussi être communiquées à
        l&apos;expert-comptable de l&apos;atelier, à l&apos;administration
        fiscale sur sa demande, ou au médiateur de la consommation si vous le
        saisissez.
      </p>

      <h3 className={styles.titreBloc}>Vos droits</h3>
      <p className={styles.texte}>
        Vous pouvez accéder à vos données, les rectifier, en demander
        l&apos;effacement ou la limitation, en obtenir une copie dans un format
        lisible, et vous opposer aux traitements fondés sur l&apos;intérêt
        légitime de l&apos;atelier. Si vous avez un compte, ces démarches se
        font depuis <Link href="/compte/donnees">votre espace client</Link>.
        Sinon, écrivez à l&apos;adresse de la rubrique Éditeur du site.
        L&apos;atelier vous répond dans un délai d&apos;un mois.
      </p>
      <p className={styles.texte}>
        La suppression d&apos;un compte n&apos;efface pas les commandes et les
        factures qui s&apos;y rattachent : la loi impose de les conserver dix
        ans. Elles cessent en revanche d&apos;être liées à votre compte.
      </p>
      <p className={styles.texte}>
        Si vous estimez que vos droits ne sont pas respectés, vous pouvez
        adresser une réclamation à la CNIL, sur{" "}
        <a
          href="https://www.cnil.fr/fr/plaintes"
          rel="noopener noreferrer"
          target="_blank"
        >
          cnil.fr
        </a>
        .
      </p>
    </>
  );
}
