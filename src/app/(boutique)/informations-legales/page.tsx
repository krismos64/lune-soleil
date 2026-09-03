/**
 * Informations legales de la boutique, LS-28 et LS-123. Page publique.
 *
 * QUATRE SECTIONS SUR UNE SEULE PAGE, ancrees, et c'est ce que le pied de page
 * attend depuis LS-122 : `/informations-legales`, puis `#cgv`,
 * `#confidentialite` et `#retractation`. Quatre routes distinctes auraient
 * casse ces quatre liens, qui existaient avant la page.
 *
 * L'IDENTITE VIENT DE `lireIdentiteLegale`, JAMAIS D'UN TEXTE EN DUR. Ses quatre
 * champs communs avec la facture sont lus a la MEME source, `lireEmetteur` :
 * ecrire l'adresse ici en clair permettrait au site et aux factures d'annoncer
 * deux identites differentes, ce qu'aucun controle ne verrait.
 *
 * LES TARIFS VIENNENT DE `lireConfigurationLivraison`, meme motif : un seuil de
 * gratuite annonce ici et different au panier serait une information
 * precontractuelle FAUSSE, sanctionnee bien au-dela de l'ecart de prix.
 *
 * AUCUN TEXTE DE REMPLISSAGE, critere d'acceptation de LS-28. Ce qui n'est pas
 * connu est dit comme tel, jamais comble par une formule creuse : la section du
 * mediateur annonce une designation en cours plutot que d'inventer un nom.
 *
 * CE QUI N'EST PAS ICI, ET POURQUOI. Les conditions generales de vente ne sont
 * PAS publiees : elles exigent les coordonnees du mediateur, article L612-1, que
 * l'exploitante n'a pas encore choisi. Publier des CGV sans mediateur serait une
 * information incorrecte sur le droit de recours, ce que l'article L221-20
 * sanctionne par un delai de retractation porte a douze mois. La section `#cgv`
 * existe donc et dit son etat, ce qui vaut mieux qu'un lien mort dans le pied de
 * page.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { formaterMontant } from "@/lib/montant";
import {
  IdentiteLegaleNonConfigureeError,
  lireIdentiteLegale,
  lireMediateur,
} from "@/lib/identite-legale";
import {
  ConfigurationLivraisonInvalideError,
  lireConfigurationLivraison,
} from "@/lib/livraison";
import { VERSION_CGV } from "@/services/commande";
import styles from "./informations-legales.module.css";

export const metadata: Metadata = {
  title: "Informations légales",
  description:
    "Mentions légales, conditions de vente, confidentialité et droit de rétractation de la boutique Lune & Soleil.",
};

/**
 * La page lit la configuration a chaque affichage.
 *
 * UNE IDENTITE LEGALE MISE EN CACHE EST TROMPEUSE : un demenagement doit se voir
 * immediatement, et c'est precisement ce qui distingue les mentions legales de
 * l'instantane fige d'une facture.
 */
export const dynamic = "force-dynamic";

export default async function PageInformationsLegales() {
  /*
   * L'ABSENCE DE CONFIGURATION NE FAIT PAS TOMBER LA PAGE, et ce choix est
   * delibere. `lireIdentiteLegale` leve quand une variable manque : laisser
   * l'exception remonter rendrait une erreur 500 sur une page que la loi impose
   * d'afficher, et le pied de page y renvoie depuis chaque ecran.
   *
   * L'ETAT DEGRADE EST DONC EXPLICITE : la page se rend, nomme ce qui manque
   * sans divulguer aucune valeur, invariant 9, et reste utilisable pour ses
   * autres sections.
   */
  let identite: ReturnType<typeof lireIdentiteLegale> | null = null;

  try {
    identite = lireIdentiteLegale();
  } catch (erreur) {
    if (!(erreur instanceof IdentiteLegaleNonConfigureeError)) {
      throw erreur;
    }
  }

  const mediateur = lireMediateur();

  /*
   * LA CONFIGURATION DE LIVRAISON PEUT LEVER, ELLE AUSSI, et pour la meme
   * raison que l'identite : une page que la loi impose d'afficher ne doit pas
   * rendre 500 parce qu'une variable manque. Le bloc des tarifs disparait
   * alors, plutot que d'annoncer un montant invente.
   */
  let livraison: ReturnType<typeof lireConfigurationLivraison> | null = null;

  try {
    livraison = lireConfigurationLivraison();
  } catch (erreur) {
    if (!(erreur instanceof ConfigurationLivraisonInvalideError)) {
      throw erreur;
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.titre}>Informations légales</h1>

      <nav className={styles.sommaire} aria-label="Sections de cette page">
        <ul className={styles.listeSommaire}>
          <li>
            <a href="#mentions">Mentions légales</a>
          </li>
          <li>
            <a href="#cgv">Conditions de vente</a>
          </li>
          <li>
            <a href="#confidentialite">Confidentialité</a>
          </li>
          <li>
            <a href="#retractation">Rétractation</a>
          </li>
        </ul>
      </nav>

      {/*
       * `tabIndex={-1}` SUR CHAQUE ANCRE, motif « cible du lien d'evitement » :
       * sans lui la page defile jusqu'a la section mais le focus reste sur le
       * lien, donc la navigation au clavier repart du sommaire a chaque fois.
       */}
      <section
        id="mentions"
        tabIndex={-1}
        className={styles.section}
        aria-labelledby="titre-mentions"
      >
        <h2 id="titre-mentions" className={styles.titreSection}>
          Mentions légales
        </h2>

        {identite === null ? (
          <p className={styles.manquant}>
            Les informations d&apos;identification de l&apos;entreprise ne sont
            pas encore publiées sur ce site. Elles le seront avant toute vente.
          </p>
        ) : (
          <>
            <h3 className={styles.titreBloc}>Éditeur du site</h3>
            <dl className={styles.definitions}>
              <div className={styles.definition}>
                <dt>Dénomination</dt>
                <dd>{identite.raisonSociale}</dd>
              </div>
              <div className={styles.definition}>
                <dt>Forme juridique</dt>
                <dd>{identite.formeJuridique}</dd>
              </div>
              <div className={styles.definition}>
                <dt>Adresse</dt>
                <dd>{identite.adresse}</dd>
              </div>
              <div className={styles.definition}>
                <dt>Téléphone</dt>
                {/*
                 * LE TELEPHONE EST OBLIGATOIRE, article L221-5 : le 4° du I
                 * enumere les coordonnees « postales, telephoniques et
                 * electroniques » sans les presenter comme alternatives.
                 */}
                <dd>
                  <a href={`tel:${identite.telephone.replace(/\s/g, "")}`}>
                    {identite.telephone}
                  </a>
                </dd>
              </div>
              <div className={styles.definition}>
                <dt>Courriel</dt>
                <dd>
                  <a href={`mailto:${identite.emailContact}`}>
                    {identite.emailContact}
                  </a>
                </dd>
              </div>
              <div className={styles.definition}>
                <dt>SIRET</dt>
                <dd>{identite.siret}</dd>
              </div>
              <div className={styles.definition}>
                <dt>Immatriculation</dt>
                <dd>{identite.registre}</dd>
              </div>
              <div className={styles.definition}>
                <dt>Code d&apos;activité</dt>
                <dd>{identite.codeActivite}</dd>
              </div>
              <div className={styles.definition}>
                <dt>Numéro de TVA</dt>
                {/*
                 * LA FRANCHISE EN BASE SE MENTIONNE, elle ne se devine pas :
                 * l'absence de numero de TVA sans explication laisserait croire
                 * a un oubli. Le seuil est de 85 000 EUR pour la vente de
                 * biens, a surveiller pendant l'exploitation.
                 */}
                <dd>
                  Non applicable, TVA non applicable au titre de l&apos;article
                  293 B du Code général des impôts
                </dd>
              </div>
            </dl>

            <h3 className={styles.titreBloc}>Hébergement du site</h3>
            <dl className={styles.definitions}>
              <div className={styles.definition}>
                <dt>Hébergeur</dt>
                <dd>{identite.hebergeurNom}</dd>
              </div>
              <div className={styles.definition}>
                <dt>Adresse</dt>
                <dd>{identite.hebergeurAdresse}</dd>
              </div>
              <div className={styles.definition}>
                <dt>Téléphone</dt>
                <dd>{identite.hebergeurTelephone}</dd>
              </div>
            </dl>
          </>
        )}
      </section>

      <section
        id="cgv"
        tabIndex={-1}
        className={styles.section}
        aria-labelledby="titre-cgv"
      >
        <h2 id="titre-cgv" className={styles.titreSection}>
          Conditions générales de vente
        </h2>

        {/*
         * LES CGV NE SONT PAS PUBLIEES TANT QUE LE MEDIATEUR MANQUE, et cette
         * section le DIT plutot que de rester vide. Publier des conditions sans
         * dispositif de mediation serait une information incorrecte sur le
         * droit de recours, article L612-1, et l'article L221-20 sanctionne
         * l'information incorrecte par un delai de retractation porte a douze
         * mois : le risque depasse de loin l'inconvenient d'une section
         * incomplete avant l'ouverture.
         */}
        <p className={styles.manquant}>
          Les conditions générales de vente sont en cours de rédaction et seront
          publiées avant la première vente. Aucune commande n&apos;est possible
          sur ce site tant qu&apos;elles ne le sont pas.
        </p>

        <p className={styles.texte}>
          Version en préparation : {VERSION_CGV}. La version acceptée lors
          d&apos;une commande est conservée avec elle, sans être réécrite par
          une révision ultérieure.
        </p>

        <h3 className={styles.titreBloc}>Livraison</h3>
        <p className={styles.texte}>
          Les commandes sont expédiées en France métropolitaine par Mondial
          Relay, au choix en Point Relais, en Locker ou à domicile.
        </p>
        {livraison === null ? null : (
          <ul className={styles.liste}>
            <li>
              Point Relais et Locker :{" "}
              {formaterMontant(livraison.relaisCentimes)}
            </li>
            <li>À domicile : {formaterMontant(livraison.domicileCentimes)}</li>
            {/*
             * LE SEUIL NUL DESACTIVE LA FRANCHISE, il ne vaut pas zero : un
             * `formaterMontant(null)` annoncerait « 0,00 EUR », donc une
             * livraison toujours offerte, l'inverse exact de l'intention.
             */}
            {livraison.seuilFranchiseCentimes === null ? null : (
              <li>
                Livraison offerte à partir de{" "}
                {formaterMontant(livraison.seuilFranchiseCentimes)}{" "}
                d&apos;achat, quel que soit le mode
              </li>
            )}
          </ul>
        )}

        <h3 className={styles.titreBloc}>Médiation de la consommation</h3>
        {mediateur === null ? (
          <p className={styles.manquant}>
            L&apos;adhésion à un dispositif de médiation de la consommation est
            en cours. Les coordonnées du médiateur seront publiées ici avant
            l&apos;ouverture de la boutique.
          </p>
        ) : (
          <>
            <p className={styles.texte}>
              En cas de litige non résolu directement avec nous, vous pouvez
              recourir gratuitement au médiateur de la consommation suivant :
            </p>
            <dl className={styles.definitions}>
              <div className={styles.definition}>
                <dt>Médiateur</dt>
                <dd>{mediateur.nom}</dd>
              </div>
              <div className={styles.definition}>
                <dt>Adresse</dt>
                <dd>{mediateur.adresse}</dd>
              </div>
              <div className={styles.definition}>
                <dt>Saisine en ligne</dt>
                <dd>
                  <a
                    href={mediateur.siteSaisine}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {mediateur.siteSaisine}
                  </a>
                </dd>
              </div>
            </dl>
            <p className={styles.texte}>
              Le recours à la médiation est gratuit pour vous et suppose
              d&apos;avoir tenté au préalable de résoudre le litige avec nous.
            </p>
          </>
        )}
      </section>

      <section
        id="confidentialite"
        tabIndex={-1}
        className={styles.section}
        aria-labelledby="titre-confidentialite"
      >
        <h2 id="titre-confidentialite" className={styles.titreSection}>
          Confidentialité et données personnelles
        </h2>

        <p className={styles.manquant}>
          La politique de confidentialité complète, avec la liste des
          destinataires des données et les durées de conservation, est en cours
          de rédaction. Elle sera publiée avant l&apos;ouverture.
        </p>

        <h3 className={styles.titreBloc}>Vos droits</h3>
        <p className={styles.texte}>
          Vous pouvez accéder à vos données, les rectifier, en demander
          l&apos;effacement ou en obtenir une copie. Si vous avez un compte, ces
          démarches se font depuis{" "}
          <Link href="/compte/donnees">votre espace client</Link>. Sinon,
          écrivez à l&apos;adresse de contact ci-dessus.
        </p>
        <p className={styles.texte}>
          La suppression d&apos;un compte n&apos;efface pas les commandes et les
          factures qui s&apos;y rattachent : la loi impose de les conserver dix
          ans. Elles cessent en revanche d&apos;être liées à votre compte.
        </p>
      </section>

      <section
        id="retractation"
        tabIndex={-1}
        className={styles.section}
        aria-labelledby="titre-retractation"
      >
        <h2 id="titre-retractation" className={styles.titreSection}>
          Droit de rétractation
        </h2>

        {/*
         * CETTE SECTION EST LA SEULE COMPLETE DES QUATRE, et ce n'est pas un
         * hasard : elle ne depend d'aucune information manquante, et le code qui
         * la met en oeuvre est livre, LS-133 a LS-135. Les chiffres qu'elle
         * annonce sont ceux que `lib/retractation.ts` calcule reellement.
         */}
        <p className={styles.texte}>
          Vous disposez de <strong>quatorze jours</strong> à compter de la
          réception de votre commande pour changer d&apos;avis, sans avoir à
          vous justifier et sans pénalité. Ce délai court à compter du jour où
          vous recevez le bijou, et non de son expédition.
        </p>
        <p className={styles.texte}>
          Si ce délai expire un samedi, un dimanche ou un jour férié, il est
          prolongé jusqu&apos;au premier jour ouvrable suivant.
        </p>

        <h3 className={styles.titreBloc}>Comment vous rétracter</h3>
        <p className={styles.texte}>
          Un formulaire en ligne est à votre disposition pendant toute la durée
          du délai. Il est accessible depuis votre espace client, et par un lien
          personnel envoyé avec votre confirmation de commande si vous avez
          commandé sans créer de compte. Vous recevez un accusé de réception par
          courriel.
        </p>

        <h3 className={styles.titreBloc}>Remboursement</h3>
        <p className={styles.texte}>
          Nous vous remboursons la totalité de votre commande,{" "}
          <strong>frais de livraison initiaux compris</strong>, au tarif que
          vous avez réellement payé.
        </p>
        <p className={styles.texte}>
          Le remboursement intervient au plus tard quatorze jours après le
          premier de ces deux événements : la réception de votre retour, ou la
          preuve que vous nous avez transmise de son expédition. Un numéro de
          suivi suffit.
        </p>

        <h3 className={styles.titreBloc}>Frais de retour</h3>
        {/*
         * LA MENTION DES FRAIS DE RETOUR ACCOMPAGNE TOUJOURS CELLE DE LA
         * RETRACTATION, `legal.md` : l'article L221-23 ne les met a la charge du
         * client QUE s'il en a ete informe, et la charge de la preuve pese sur
         * le vendeur. L'oublier les fait revenir au vendeur, et l'article
         * L221-20 porte le delai a douze mois.
         */}
        <p className={styles.texte}>
          Les frais de retour sont à votre charge. Le bijou doit nous revenir
          dans un état permettant sa remise en vente.
        </p>

        <h3 className={styles.titreBloc}>
          Rétractation, garantie et retour : trois choses différentes
        </h3>
        <p className={styles.texte}>
          Le droit de rétractation ci-dessus vous permet de changer d&apos;avis
          sans motif. Il ne se confond pas avec la{" "}
          <strong>garantie légale de conformité</strong>, qui vous couvre
          pendant <strong>deux ans à compter de la remise</strong> du bijou si
          celui-ci présente un défaut. Dans ce dernier cas, les frais de retour
          sont à notre charge, et cette garantie ne peut pas être écartée.
        </p>
        <p className={styles.texte}>
          Pour signaler un défaut, écrivez-nous depuis la{" "}
          <Link href="/contact">page de contact</Link>.
        </p>
      </section>
    </main>
  );
}
