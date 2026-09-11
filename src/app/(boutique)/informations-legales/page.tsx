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

import { DELAI_PUBLICATION_JOURS } from "@/services/avis";

import { formaterMontant } from "@/lib/montant";
import { NOM_BOUTIQUE, openGraphDePage } from "@/lib/seo";
import {
  IdentiteLegaleNonConfigureeError,
  lireIdentiteLegale,
  lireMediateur,
} from "@/lib/identite-legale";
import { EmetteurNonConfigureError } from "@/services/facture";
import { MENTION_FRANCHISE_TVA } from "@/lib/validation";
import {
  type ConfigurationLivraison,
  ConfigurationLivraisonInvalideError,
} from "@/lib/livraison";
import { resoudreConfigurationLivraison } from "@/services/parametres";
import { VERSION_CGV } from "@/services/commande";
import styles from "./informations-legales.module.css";

export const metadata: Metadata = {
  title: "Informations légales",
  description: `Mentions légales, conditions de vente, confidentialité et droit de rétractation de la boutique ${NOM_BOUTIQUE}.`,
  // LS-137, page publique indexable : canonical explicite.
  alternates: { canonical: "/informations-legales" },
  openGraph: openGraphDePage({
    titre: "Informations légales",
    description:
      "Mentions légales, conditions de vente, confidentialité et droit de rétractation.",
    chemin: "/informations-legales",
  }),
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
    /*
     * DEUX CLASSES D'ERREUR, ET N'EN ATTRAPER QU'UNE RENDAIT 500.
     * `lireIdentiteLegale` commence par appeler `lireEmetteur`, qui leve
     * `EmetteurNonConfigureError`, une classe DISTINCTE : il suffisait qu'une
     * seule variable `FACTURE_*` manque pour que la page entiere tombe, y
     * compris la section retractation qui n'en depend pas. Motif
     * « configuration corrigee a moitie », releve par `ls-frontend-revue` le
     * 3 septembre 2026.
     */
    if (
      !(erreur instanceof IdentiteLegaleNonConfigureeError) &&
      !(erreur instanceof EmetteurNonConfigureError)
    ) {
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
  let livraison: ConfigurationLivraison | null = null;

  try {
    livraison = await resoudreConfigurationLivraison();
  } catch (erreur) {
    if (!(erreur instanceof ConfigurationLivraisonInvalideError)) {
      throw erreur;
    }
  }

  return (
    /*
     * `id="contenu"` EST LA CIBLE DU LIEN D'EVITEMENT de l'en-tete, et
     * `tabIndex={-1}` porte le focus avec le defilement : sans lui la page
     * defile mais le focus reste sur le lien. Les vingt autres pages du groupe
     * le portent, ces deux-ci l'avaient oublie.
     */
    <main id="contenu" tabIndex={-1} className={styles.page}>
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
          <li>
            <a href="#avis">Avis de clients</a>
          </li>
          <li>
            <a href="#accessibilite">Accessibilité</a>
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
                {/*
                 * LA MENTION VIENT DE LA CONSTANTE CANONIQUE, celle que la
                 * facture imprime. La reecrire produisait deux formulations a
                 * garder d'accord, et la variante disait « Non applicable »
                 * deux fois dans la meme phrase, sous un terme qui l'annoncait
                 * deja. Releve par `ls-frontend-revue` le 3 septembre 2026.
                 */}
                <dd>{MENTION_FRANCHISE_TVA}</dd>
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
        {/*
         * NE PAS ECRIRE « aucune commande n'est possible » : le tunnel est
         * livre et fonctionnel, et l'affirmation etait FAUSSE. Un texte de page
         * legale qui se trompe sur les conditions de la vente releve
         * exactement de l'information incorrecte que ce ticket cherche a
         * eviter. Releve par `ls-frontend-revue` le 3 septembre 2026.
         */}
        <p className={styles.manquant}>
          Les conditions générales de vente sont en cours de rédaction et seront
          publiées avant l&apos;ouverture commerciale de la boutique.
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

        {/*
         * LES COOKIES, LS-148. Ce bloc est COMPLET et ne porte pas la mention
         * `manquant` : l'analyse est faite et tranchée, `.claude/rules/legal.md`
         * section « Cookies et traceurs, article 82 ».
         *
         * AUCUNE BANNIERE N'EST DUE, les quatre traceurs figurant NOMMEMENT
         * dans la liste des exemptions publiee par la CNIL. Mais l'absence
         * d'obligation de consentement ne dispense pas d'INFORMER, et c'est ce
         * que ce bloc fait.
         *
         * LE CHIFFRE ET LES NOMS SONT CEUX DU CODE, releves et non supposes :
         * `ls_panier`, `ls_tunnel`, `ls_commande` et le cookie de session. Les
         * citer permet a un visiteur de les retrouver dans son navigateur.
         *
         * NE PAS Y AJOUTER UN TRACEUR SANS REJOUER L'ANALYSE. Une mesure
         * d'audience, un chat, une carte distante ou un lecteur video embarque
         * feraient tomber l'exemption et imposeraient une banniere.
         */}
        <h3 className={styles.titreBloc}>Cookies</h3>
        <p className={styles.texte}>
          Ce site ne dépose <strong>aucun cookie publicitaire</strong>, aucun
          traceur de mesure d&apos;audience et aucun outil tiers. Rien
          n&apos;est déposé lorsque vous vous contentez de naviguer.
        </p>
        <p className={styles.texte}>
          Quatre cookies apparaissent uniquement quand vous en avez besoin.
          L&apos;un retient le contenu de votre panier, un autre conserve votre
          saisie pendant la commande, un troisième vous permet de retrouver une
          commande passée depuis ce navigateur, et le dernier vous garde
          connecté si vous avez un compte.
        </p>
        <p className={styles.texte}>
          Ces quatre cookies sont <strong>strictement nécessaires</strong> au
          service que vous demandez. À ce titre, la loi ne soumet pas leur dépôt
          à votre consentement, et c&apos;est pourquoi aucune bannière ne vous
          est présentée. Vous pouvez les supprimer à tout moment depuis les
          réglages de votre navigateur, au prix de la perte de votre panier.
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
          commandé sans créer de compte. Un accusé de réception vous est envoyé
          par courriel.
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

        <h3 className={styles.titreBloc}>Délai pour nous renvoyer le bijou</h3>
        {/*
         * SECOND DELAI DE QUATORZE JOURS, article L221-23, et il conditionne le
         * remboursement du client. Il manquait : la page detaillait le delai
         * pour se retracter sans dire qu'un autre court ensuite. Releve par
         * `ls-frontend-revue` le 3 septembre 2026.
         */}
        <p className={styles.texte}>
          Une fois votre décision déclarée, vous disposez de{" "}
          <strong>quatorze jours</strong> pour nous renvoyer le bijou.
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

      {/*
       * RUBRIQUE EXIGEE PAR L'ARTICLE D111-10 2°, LS-61. Le texte impose une
       * rubrique « specifique facilement accessible » portant deux choses, et
       * deux seulement : l'existence ou non d'une contrepartie, et les delais
       * maximums de publication ET de conservation d'un avis.
       *
       * ELLE EST DISTINCTE DES MENTIONS AFFICHEES PRES DE CHAQUE AVIS, qui
       * relevent du 1° du meme article et vivent sur la fiche produit. Les deux
       * obligations sont cumulatives : porter l'une ne dispense pas de l'autre.
       *
       * LE DELAI DE CONSERVATION EST SANS LIMITE, ADR-028, ET CETTE ABSENCE SE
       * PUBLIE. Une rubrique muette sur ce point est precisement le manquement
       * que l'article vise : « sans limite de duree » est une reponse, le
       * silence n'en est pas une.
       *
       * LE DELAI DE PUBLICATION VIENT DE `services/avis.ts`, jamais d'un chiffre
       * ecrit ici : le meme nombre est annonce dans l'email d'invitation et sur
       * l'ecran de depot, et trois valeurs recopiees divergeraient au premier
       * changement.
       */}
      <section
        id="avis"
        tabIndex={-1}
        className={styles.section}
        aria-labelledby="titre-avis-legal"
      >
        <h2 id="titre-avis-legal" className={styles.titreSection}>
          Avis de clients
        </h2>

        <h3 className={styles.titreBloc}>Comment un avis est recueilli</h3>
        <p className={styles.texte}>
          Un avis ne peut être déposé qu&apos;après une commande{" "}
          <strong>réellement livrée</strong>, par un lien personnel envoyé après
          la remise du colis. Il n&apos;existe aucun autre moyen d&apos;en
          déposer un : c&apos;est ce qui rend ces avis vérifiés.
        </p>

        <h3 className={styles.titreBloc}>Aucune contrepartie</h3>
        <p className={styles.texte}>
          <strong>Aucune contrepartie</strong> d&apos;aucune sorte n&apos;est
          accordée en échange d&apos;un avis : ni réduction, ni cadeau, ni
          avantage sur une commande suivante.
        </p>

        <h3 className={styles.titreBloc}>Délai de publication</h3>
        <p className={styles.texte}>
          Chaque avis est relu avant d&apos;être publié. Cette relecture prend
          au plus <strong>{DELAI_PUBLICATION_JOURS} jours</strong> à compter du
          dépôt.
        </p>
        <p className={styles.texte}>
          Un avis peut ne pas être publié, par exemple s&apos;il ne porte pas
          sur la pièce achetée, s&apos;il contient des données personnelles ou
          des propos injurieux. La personne qui l&apos;a déposé en est informée,
          et le motif de la décision est conservé.
        </p>

        <h3 className={styles.titreBloc}>Durée de conservation</h3>
        <p className={styles.texte}>
          Un avis publié le reste <strong>sans limite de durée</strong>. Il
          n&apos;est retiré que sur décision motivée, et un avis retiré
          n&apos;est jamais supprimé : sa trace et son motif sont conservés.
        </p>

        <h3 className={styles.titreBloc}>Classement des avis</h3>
        <p className={styles.texte}>
          Les avis sont affichés du <strong>plus récent au plus ancien</strong>.
          Aucun autre critère n&apos;entre dans leur ordre d&apos;affichage, et
          aucun avis n&apos;est mis en avant.
        </p>
      </section>

      {/*
       * ACCESSIBILITE, LS-123. SECTION VOLONTAIRE ET NON OBLIGATOIRE, et la
       * nuance est la raison d'etre de ce commentaire.
       *
       * AUCUN TEXTE N'IMPOSE CETTE PAGE A LUNE & SOLEIL, verifie aux sources le
       * 11 septembre 2026 :
       *
       * | Texte | Seuil | Cette boutique |
       * |---|---|---|
       * | article 47 de la loi 2005-102, decret 2019-768 | 250 M EUR de CA | tres en dessous |
       * | directive 2019/882, applicable au commerce en ligne depuis le 28 juin 2025 | exemption microentreprise, moins de 10 salaries ET 2 M EUR | les deux conditions remplies |
       *
       * ECRIRE « DECLARATION D'ACCESSIBILITE » SERAIT DONC FAUX. Ce terme
       * designe un document reglementaire au contenu impose, avec taux de
       * conformite au RGAA, audit date et schema pluriannuel. Publier ce mot
       * sans ce contenu annoncerait une conformite qui n'a pas ete auditee.
       *
       * CE QUI EST ECRIT ICI EST DONC UN ENGAGEMENT, et chaque phrase porte un
       * fait MESURE plutot qu'une intention : les contrastes et les audits
       * automatises sont comptes par les controles du depot, jamais recopies.
       *
       * LE TAUX DE CONFORMITE RGAA N'EST PAS ANNONCE, deliberement : aucun
       * audit RGAA n'a ete conduit, et un pourcentage invente serait la forme
       * la plus exposee de l'allegation trompeuse sur une page legale.
       */}
      <section
        id="accessibilite"
        tabIndex={-1}
        className={styles.section}
        aria-labelledby="titre-accessibilite"
      >
        <h2 id="titre-accessibilite" className={styles.titreSection}>
          Accessibilité
        </h2>

        <h3 className={styles.titreBloc}>Notre engagement</h3>
        <p className={styles.texte}>
          Ce site est conçu pour rester utilisable au clavier, avec une loupe ou
          un lecteur d&apos;écran. Cet engagement est{" "}
          <strong>volontaire</strong> : la réglementation sur
          l&apos;accessibilité numérique vise les organismes publics et les
          grandes entreprises, et ne s&apos;applique pas à une activité de cette
          taille.
        </p>

        <h3 className={styles.titreBloc}>
          Ce qui est vérifié à chaque mise à jour
        </h3>
        <ul className={styles.liste}>
          <li>
            chaque page est contrôlée automatiquement sur les critères WCAG 2.2
            de niveau AA, et une anomalie bloque la mise en ligne
          </li>
          <li>
            l&apos;affichage est mesuré à quatre largeurs d&apos;écran, à partir
            de 320 pixels, sans défilement horizontal
          </li>
          <li>
            le contraste de chaque couleur de texte est calculé sur le fond
            réellement employé
          </li>
          <li>
            un lien « Aller au contenu » ouvre chaque page, et la navigation se
            fait entièrement au clavier
          </li>
        </ul>

        <h3 className={styles.titreBloc}>Ce qui n&apos;a pas été fait</h3>
        <p className={styles.texte}>
          <strong>Aucun audit RGAA n&apos;a été conduit</strong>, et aucun taux
          de conformité n&apos;est donc annoncé. Les vérifications décrites
          ci-dessus sont automatisées : elles ne remplacent pas l&apos;essai par
          une personne qui utilise réellement une technologie d&apos;assistance.
        </p>

        <h3 className={styles.titreBloc}>Signaler une difficulté</h3>
        <p className={styles.texte}>
          {/*
           * AUCUNE CLASSE SUR CE LIEN, et c'est voulu : `.texte a` le style
           * deja, comme les autres liens de cette page. Une classe `.lien`
           * avait ete ecrite ici et n'existe pas dans le module CSS, donc elle
           * etait inerte et le lien serait reste de la couleur par defaut.
           */}
          Si une page vous résiste, écrivez-nous depuis la{" "}
          <Link href="/contact">page de contact</Link> en indiquant
          l&apos;adresse concernée et ce qui a bloqué. Une autre façon
          d&apos;obtenir la même information ou de passer commande vous sera
          proposée.
        </p>
      </section>
    </main>
  );
}
