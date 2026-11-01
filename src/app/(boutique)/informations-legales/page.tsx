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
 * L'HÉBERGEUR FAIT EXCEPTION depuis le 19 octobre 2026, LS-28 : il vient de
 * `HEBERGEUR`, écrit dans `identite-legale.ts` avec ses sources. Il ne figure
 * sur aucune facture, donc aucune seconde source ne peut le contredire.
 *
 * LES TARIFS VIENNENT DE `lireConfigurationLivraison`, meme motif : un seuil de
 * gratuite annonce ici et different au panier serait une information
 * precontractuelle FAUSSE, sanctionnee bien au-dela de l'ecart de prix.
 *
 * AUCUN TEXTE DE REMPLISSAGE, critere d'acceptation de LS-28. Ce qui n'est pas
 * connu est dit comme tel, jamais comble par une formule creuse.
 *
 * LE MÉDIATEUR VIENT DE `MEDIATEUR`, écrit dans `identite-legale.ts` depuis le
 * 20 octobre 2026, LS-19 : le CM2C, convention signée ce jour-là.
 *
 * LES CONDITIONS GÉNÉRALES ET LA POLITIQUE DE CONFIDENTIALITÉ sont publiées
 * depuis le 1er novembre 2026, LS-28, rédigées d'après les textes officiels et
 * validées par Christophe : `conditions-generales.tsx` et
 * `politique-confidentialite.tsx`, chacun portant ses sources en en-tête.
 */
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";

import { DELAI_PUBLICATION_JOURS } from "@/services/avis";

import { NOM_BOUTIQUE, openGraphDePage } from "@/lib/seo";
import {
  HEBERGEUR,
  IdentiteLegaleNonConfigureeError,
  lireIdentiteLegale,
} from "@/lib/identite-legale";
import {
  EmetteurNonConfigureError,
  denominationLegale,
} from "@/services/facture";
import { MENTION_FRANCHISE_TVA } from "@/lib/validation";
import {
  type ConfigurationLivraison,
  ConfigurationLivraisonInvalideError,
} from "@/lib/livraison";
import { resoudreConfigurationLivraison } from "@/services/parametres";
import { MedaillonAube } from "@/components/medaillon-aube";
import { ConditionsGenerales } from "./conditions-generales";
import { PolitiqueConfidentialite } from "./politique-confidentialite";
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

/**
 * LES ICÔNES DES SIX RUBRIQUES, LS-282 : décor `aria-hidden`, le nom de la
 * rubrique restant porté par son texte. Dans un titre de section, `trace`
 * fait dessiner le tracé à son entrée dans l'écran, borné par le `data-borne`
 * du titre ; dans le sommaire, elles restent immobiles.
 */
const TRACES_ICONES = {
  mentions: ["M5 8h24v18H5Z", "M10 14h6M10 19h9M22 13a2 2 0 1 0 0 .1"],
  cgv: ["M9 4h12l5 5v21H9Z", "M21 4v5h5M13 15h9M13 20h9M13 25h6"],
  confidentialite: ["M9 15h16v14H9Z", "M12 15v-4a5 5 0 0 1 10 0v4M17 21v3"],
  retractation: ["M26 11a10 10 0 1 0 1.5 8", "M27 5v6h-6"],
  avis: [
    "M17 5l3.6 7.4 8.1 1.2-5.9 5.7 1.4 8.1L17 23.6l-7.2 3.8 1.4-8.1-5.9-5.7 8.1-1.2Z",
  ],
  accessibilite: [
    "M17 3a14 14 0 1 0 .1 0",
    "M17 9.5v.1M10 13l7 1.5 7-1.5M17 14.5V20l-3.5 7M17 20l3.5 7",
  ],
} satisfies Record<string, string[]>;

function IconeSection({
  nom,
  trace = false,
}: {
  nom: keyof typeof TRACES_ICONES;
  trace?: boolean;
}) {
  return (
    <svg
      className={trace ? styles.iconeTitre : styles.iconeSommaire}
      viewBox="0 0 34 34"
      aria-hidden="true"
    >
      {TRACES_ICONES[nom].map((d, i) => (
        <path
          key={i}
          className={trace ? styles.trait : undefined}
          style={{ "--i": i } as CSSProperties}
          pathLength={trace ? 1 : undefined}
          d={d}
        />
      ))}
    </svg>
  );
}

/**
 * Le SIREN, neuf premiers chiffres du SIRET, groupés par trois.
 *
 * DÉRIVÉ ET NON SAISI : une seconde variable d'environnement pourrait porter un
 * numéro différent du SIRET, ce qu'aucun contrôle ne verrait.
 */
function sirenDepuisSiret(siret: string): string {
  const chiffres = siret.replace(/\D/g, "").slice(0, 9);
  return chiffres.replace(/(\d{3})(?=\d)/g, "$1 ");
}

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
      {/*
       * EN-TÊTE D'AUBE, LS-282, amendement d'ADR-045 : dégradé de ciel et
       * médaillon animé à l'entrée. Le titre et l'introduction sont rendus
       * par le serveur, immobiles. Sous 768 px le médaillon disparaît, pour
       * que les rubriques arrivent avant tout décor, critique de Codex.
       */}
      <section className={styles.tete}>
        <div className={styles.teteGrille}>
          <div>
            <p className={styles.surtitre}>Le cadre de vos achats</p>
            <h1 className={styles.titre}>Informations légales</h1>
            <p className={styles.introduction}>
              Les rubriques qui encadrent vos achats : l&apos;éditeur du site,
              les conditions de vente, vos données, la rétractation, les avis et
              l&apos;accessibilité.
            </p>
          </div>
          <div className={styles.medaillon}>
            <MedaillonAube
              image="/habillage/legales-lettre-aube.jpg"
              taille="240px"
              cadrage="68% 62%"
            />
          </div>
        </div>
      </section>

      {/*
       * LE SOMMAIRE ACCOMPAGNE LA LECTURE : liste compacte au-dessus du texte
       * jusqu'à 1100 px, colonne collante au-delà. Les libellés et les ancres
       * sont ceux d'avant LS-282, seule une icône décorative s'y ajoute.
       */}
      <div className={styles.corps}>
        <nav className={styles.sommaire} aria-label="Sections de cette page">
          <ul className={styles.listeSommaire}>
            <li>
              <a href="#mentions">
                <IconeSection nom="mentions" />
                Mentions légales
              </a>
            </li>
            <li>
              <a href="#cgv">
                <IconeSection nom="cgv" />
                Conditions de vente
              </a>
            </li>
            <li>
              <a href="#confidentialite">
                <IconeSection nom="confidentialite" />
                Confidentialité
              </a>
            </li>
            <li>
              <a href="#retractation">
                <IconeSection nom="retractation" />
                Rétractation
              </a>
            </li>
            <li>
              <a href="#avis">
                <IconeSection nom="avis" />
                Avis de clients
              </a>
            </li>
            <li>
              <a href="#accessibilite">
                <IconeSection nom="accessibilite" />
                Accessibilité
              </a>
            </li>
          </ul>
        </nav>

        <div className={styles.contenu}>
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
            <h2
              id="titre-mentions"
              className={styles.titreSection}
              data-borne=""
            >
              <IconeSection nom="mentions" trace />
              Mentions légales
            </h2>

            {identite === null ? (
              <p className={styles.manquant}>
                Les informations d&apos;identification de l&apos;entreprise ne
                sont pas encore publiées sur ce site. Elles le seront avant
                toute vente.
              </p>
            ) : (
              <>
                <h3 className={styles.titreBloc}>Éditeur du site</h3>
                {/*
                 * « L'ATELIER » EST DEFINI ICI, LS-287 : les sections de
                 * retractation, de garantie et de mediation designent le vendeur
                 * par ce mot depuis LS-286, et une page legale ne laisse pas un
                 * terme sans referent.
                 */}
                {/*
                 * LA DENOMINATION PORTE « EI », LS-297, article R526-27 du Code
                 * de commerce, la meme fonction que la facture : le site et les
                 * documents ne peuvent pas ecrire deux identites differentes.
                 * Le nom de l'exploitante n'apparait qu'ici et sur les
                 * documents comptables, arbitrage de Christophe du 29 octobre
                 * 2026 ; la marque partout ailleurs.
                 */}
                <p className={styles.texte}>
                  Dans ces pages, « l&apos;atelier » désigne{" "}
                  {denominationLegale(identite.raisonSociale)}, éditeur de ce
                  site et vendeur des bijoux sous le nom commercial{" "}
                  {NOM_BOUTIQUE}.
                </p>
                <dl className={styles.definitions}>
                  <div className={styles.definition}>
                    <dt>Nom commercial</dt>
                    <dd>{NOM_BOUTIQUE}</dd>
                  </div>
                  <div className={styles.definition}>
                    <dt>Dénomination</dt>
                    <dd>{denominationLegale(identite.raisonSociale)}</dd>
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
                  {/*
                   * LE NUMÉRO D'INSCRIPTION EST EXIGÉ PAR L'ARTICLE 1-1 I 1° de
                   * la LCEN, version de la loi SREN du 21 mai 2024, lue le
                   * 1er novembre 2026. Au RNE, ce numéro est le SIREN, les neuf
                   * premiers chiffres du SIRET : il en est DÉRIVÉ et non saisi,
                   * deux valeurs saisies pouvant diverger.
                   */}
                  <div className={styles.definition}>
                    <dt>Immatriculation</dt>
                    <dd>
                      {identite.registre}, SIREN{" "}
                      {sirenDepuisSiret(identite.siret)}
                    </dd>
                  </div>
                  {/*
                   * CODE APRM ET NON CODE NAF : la nomenclature d'activités
                   * française de l'artisanat porte six caractères, quatre
                   * chiffres et deux lettres. Le libellé le dit, pour qu'il ne
                   * se lise pas comme un code NAF mal recopié.
                   */}
                  <div className={styles.definition}>
                    <dt>Code d&apos;activité artisanale (APRM)</dt>
                    <dd>{identite.codeActivite}</dd>
                  </div>
                  {/*
                   * ARTICLE 1-1 I 3° DE LA LCEN : le nom du directeur de la
                   * publication. L'exploitante édite seule le site ; l'accord
                   * au féminin désigne une personne réelle, exception admise
                   * par `frontend-design.md`. Son nom figure déjà à la ligne
                   * Dénomination, la loi l'exigeant ici aussi.
                   */}
                  <div className={styles.definition}>
                    <dt>Directrice de la publication</dt>
                    <dd>{identite.raisonSociale}</dd>
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
              </>
            )}

            {/*
             * L'HÉBERGEUR VIENT DE `HEBERGEUR`, écrit dans le code depuis le
             * 19 octobre 2026, LS-28 : hors de la condition sur l'identité, il
             * s'affiche même quand l'éditeur n'est pas configuré.
             */}
            <h3 className={styles.titreBloc}>Hébergement du site</h3>
            <dl className={styles.definitions}>
              <div className={styles.definition}>
                <dt>Hébergeur</dt>
                <dd>{HEBERGEUR.nom}</dd>
              </div>
              <div className={styles.definition}>
                <dt>Adresse</dt>
                <dd>{HEBERGEUR.adresse}</dd>
              </div>
              <div className={styles.definition}>
                <dt>Téléphone</dt>
                <dd>{HEBERGEUR.telephone}</dd>
              </div>
            </dl>

            {/*
             * LE CRÉDIT DE DÉVELOPPEMENT, LS-290, ICI ET NULLE PART AILLEURS : le
             * pied de page sert l'acheteur, pas le prestataire. Hors de la
             * condition sur l'identité, il ne dépend d'aucune configuration.
             *
             * AUCUN `rel`, arbitrage du 19 octobre 2026 : un choix libre de
             * l'exploitante, sans contrepartie. Une remise ou une clause du
             * contrat liée à ce lien imposerait `rel="sponsored"`.
             *
             * `<a>` ET NON `Link`, la cible est hors du site. Même onglet, comme
             * le lien Facebook du pied : aucune fenêtre ne s'ouvre sans être
             * annoncée.
             */}
            <h3 className={styles.titreBloc}>Conception et développement</h3>
            <p className={styles.texte}>
              Site conçu et développé par{" "}
              <a href="https://christophe-dev-freelance.fr">
                Christophe Mostefaoui, développeur web freelance
              </a>
              .
            </p>
          </section>

          <section
            id="cgv"
            tabIndex={-1}
            className={styles.section}
            aria-labelledby="titre-cgv"
          >
            <h2 id="titre-cgv" className={styles.titreSection} data-borne="">
              <IconeSection nom="cgv" trace />
              Conditions générales de vente
            </h2>

            <ConditionsGenerales identite={identite} livraison={livraison} />
          </section>

          <section
            id="confidentialite"
            tabIndex={-1}
            className={styles.section}
            aria-labelledby="titre-confidentialite"
          >
            <h2
              id="titre-confidentialite"
              className={styles.titreSection}
              data-borne=""
            >
              <IconeSection nom="confidentialite" trace />
              Confidentialité et données personnelles
            </h2>

            <PolitiqueConfidentialite />

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
              Ce site ne dépose <strong>aucun cookie publicitaire</strong>,
              aucun traceur de mesure d&apos;audience et aucun outil tiers. Rien
              n&apos;est déposé lorsque vous vous contentez de naviguer.
            </p>
            <p className={styles.texte}>
              Quatre cookies apparaissent uniquement quand vous en avez besoin.
              L&apos;un retient le contenu de votre panier, un autre conserve
              votre saisie pendant la commande, un troisième vous permet de
              retrouver une commande passée depuis ce navigateur, et le dernier
              vous garde connecté si vous avez un compte.
            </p>
            <p className={styles.texte}>
              Ces quatre cookies sont <strong>strictement nécessaires</strong>{" "}
              au service que vous demandez. À ce titre, la loi ne soumet pas
              leur dépôt à votre consentement, et c&apos;est pourquoi aucune
              bannière ne vous est présentée. Vous pouvez les supprimer à tout
              moment depuis les réglages de votre navigateur, au prix de la
              perte de votre panier.
            </p>
          </section>

          <section
            id="retractation"
            tabIndex={-1}
            className={styles.section}
            aria-labelledby="titre-retractation"
          >
            <h2
              id="titre-retractation"
              className={styles.titreSection}
              data-borne=""
            >
              <IconeSection nom="retractation" trace />
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
              vous justifier et sans pénalité. Ce délai court à compter du jour
              où vous recevez le bijou, et non de son expédition.
            </p>
            <p className={styles.texte}>
              Si ce délai expire un samedi, un dimanche ou un jour férié, il est
              prolongé jusqu&apos;au premier jour ouvrable suivant.
            </p>

            <h3 className={styles.titreBloc}>Comment vous rétracter</h3>
            <p className={styles.texte}>
              Un formulaire en ligne est à votre disposition pendant toute la
              durée du délai. Il est accessible depuis votre espace client, et
              par un lien personnel envoyé avec votre confirmation de commande
              si vous avez commandé sans créer de compte. Un accusé de réception
              vous est envoyé par courriel.
            </p>

            <h3 className={styles.titreBloc}>Remboursement</h3>
            <p className={styles.texte}>
              L&apos;atelier vous rembourse la totalité de votre commande,{" "}
              <strong>frais de livraison initiaux compris</strong>, au tarif que
              vous avez réellement payé.
            </p>
            {/*
             * L221-24 ALINÉA 3, lu le 1er novembre 2026 : même moyen de
             * paiement, sauf accord exprès, sans frais. Un remboursement Stripe
             * revient sur le moyen débité, ce qui rend la phrase vraie.
             */}
            <p className={styles.texte}>
              Il est effectué avec le même moyen de paiement que celui utilisé
              pour la commande, sauf accord exprès de votre part pour un autre
              moyen, et sans frais pour vous.
            </p>
            {/*
             * L221-24, VERSION EN VIGUEUR DEPUIS LE 1ER JUILLET 2016, lue sur
             * Legifrance le 7 octobre 2026, LS-287. L'alinea 1 fixe quatorze
             * jours A COMPTER DE L'INFORMATION de la decision ; l'alinea 2 permet
             * seulement de DIFFERER jusqu'au premier de deux faits. La phrase
             * precedente faisait partir quatorze jours de ce premier fait, et
             * promettait ainsi jusqu'a quatorze jours de plus que la loi.
             */}
            <p className={styles.texte}>
              Le remboursement intervient au plus tard quatorze jours après que
              l&apos;atelier a été informé de votre décision. L&apos;atelier
              peut toutefois attendre d&apos;avoir reçu le bijou, ou une preuve
              de son expédition si elle arrive avant : un numéro de suivi
              suffit.
            </p>

            <h3 className={styles.titreBloc}>Délai pour renvoyer le bijou</h3>
            {/*
             * SECOND DELAI DE QUATORZE JOURS, article L221-23, et il conditionne le
             * remboursement du client. Il manquait : la page detaillait le delai
             * pour se retracter sans dire qu'un autre court ensuite. Releve par
             * `ls-frontend-revue` le 3 septembre 2026.
             */}
            <p className={styles.texte}>
              Une fois votre décision déclarée, vous disposez de{" "}
              <strong>quatorze jours</strong> pour renvoyer le bijou à
              l&apos;atelier,{" "}
              {/*
               * LE RENVOI NE VISE QUE CE QUI EST AFFICHE, revue de LS-288 : sans
               * identite, la rubrique « Editeur du site » n'existe pas, et la
               * consigne reprend celle de l'accuse de reception.
               */}
              {identite === null
                ? "dont l'adresse vous est communiquée sur simple réponse à l'accusé de réception de votre demande."
                : "à l'adresse indiquée sous « Éditeur du site » et rappelée dans l'accusé de réception de votre demande."}
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
              Les frais de retour sont à votre charge.
            </p>

            <h3 className={styles.titreBloc}>État du bijou retourné</h3>
            {/*
             * L221-23, ALINEA 3, VERSION EN VIGUEUR DEPUIS LE 28 MAI 2022, lue
             * sur Legifrance le 7 octobre 2026, LS-287 : la responsabilite du
             * consommateur n'est engagee qu'en cas de depreciation due a des
             * manipulations AUTRES que celles necessaires pour etablir la nature,
             * les caracteristiques et le bon fonctionnement du bien. La phrase
             * precedente, « dans un etat permettant sa remise en vente », posait
             * une condition que la loi ne pose pas : elle pouvait se lire comme
             * une condition d'exercice du droit de retractation.
             */}
            <p className={styles.texte}>
              Vous pouvez examiner le bijou comme vous le feriez en boutique.
              Votre responsabilité n&apos;est engagée qu&apos;en cas de
              dépréciation résultant de manipulations autres que celles
              nécessaires pour établir sa nature, ses caractéristiques et son
              bon fonctionnement.
            </p>

            <h3 className={styles.titreBloc}>
              Rétractation, garantie et retour&nbsp;: trois choses différentes
            </h3>
            <p className={styles.texte}>
              Le droit de rétractation ci-dessus vous permet de changer
              d&apos;avis sans motif. Il ne se confond pas avec la{" "}
              <strong>garantie légale de conformité</strong>, qui vous couvre
              pendant <strong>deux ans à compter de la remise</strong> du bijou
              si celui-ci présente un défaut. Dans ce dernier cas, les frais de
              retour sont à la charge de l&apos;atelier, et cette garantie ne
              peut pas être écartée.
            </p>
            <p className={styles.texte}>
              Pour signaler un défaut, écrivez à l&apos;atelier depuis la{" "}
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
            <h2
              id="titre-avis-legal"
              className={styles.titreSection}
              data-borne=""
            >
              <IconeSection nom="avis" trace />
              Avis de clients
            </h2>

            <h3 className={styles.titreBloc}>Comment un avis est recueilli</h3>
            <p className={styles.texte}>
              Un avis ne peut être déposé qu&apos;après une commande{" "}
              <strong>réellement livrée</strong>, par un lien personnel envoyé
              après la remise du colis. Il n&apos;existe aucun autre moyen
              d&apos;en déposer un : c&apos;est ce qui rend ces avis vérifiés.
            </p>

            <h3 className={styles.titreBloc}>Aucune contrepartie</h3>
            <p className={styles.texte}>
              <strong>Aucune contrepartie</strong> d&apos;aucune sorte
              n&apos;est accordée en échange d&apos;un avis : ni réduction, ni
              cadeau, ni avantage sur une commande suivante.
            </p>

            <h3 className={styles.titreBloc}>Délai de publication</h3>
            <p className={styles.texte}>
              Chaque avis est relu avant d&apos;être publié. Cette relecture
              prend au plus <strong>{DELAI_PUBLICATION_JOURS} jours</strong> à
              compter du dépôt.
            </p>
            <p className={styles.texte}>
              Un avis peut ne pas être publié, par exemple s&apos;il ne porte
              pas sur la pièce achetée, s&apos;il contient des données
              personnelles ou des propos injurieux. L&apos;atelier envoie alors
              le motif de sa décision par email à l&apos;adresse de la commande,
              et le conserve.
            </p>
            {/*
             * D111-11 2°, LS-306 : « la possibilité, le cas échéant, de
             * contacter le consommateur auteur de l'avis ». Formulation
             * arbitrée par Christophe le 1er novembre 2026.
             */}
            <p className={styles.texte}>
              L&apos;atelier peut vous écrire, à l&apos;adresse email de votre
              commande, pour vérifier un avis avant de le publier.
            </p>

            {/*
             * LA MODIFICATION EXISTE DEPUIS LS-225 et la page ne le disait pas :
             * un avis déposé ou publié se modifie depuis `/compte/avis`, et la
             * modification le renvoie en relecture, règle R10.
             */}
            <h3 className={styles.titreBloc}>Modifier son avis</h3>
            <p className={styles.texte}>
              Tant que votre avis est en attente de relecture ou publié, vous
              pouvez le modifier depuis{" "}
              <Link href="/compte/avis">
                vos avis, dans l&apos;espace client
              </Link>
              . La modification le soumet à une nouvelle relecture avant sa
              publication.
            </p>

            {/*
             * LE RETRAIT PAR L'AUTEUR, LS-305, règle R19 : la page le
             * promettait sans qu'aucun chemin ne le permette. Aucune ligne
             * n'est supprimée, l'avis est anonymisé, arbitrage LS-246.
             */}
            <h3 className={styles.titreBloc}>Retirer son avis</h3>
            <p className={styles.texte}>
              Vous pouvez retirer votre avis à tout moment depuis le même
              espace, quel que soit son état. Il n&apos;est plus affiché, son
              commentaire est effacé et il n&apos;est plus rattaché à votre
              compte, et sa note est effacée. Il ne reste que la trace
              qu&apos;un avis a existé sur cet achat et a été retiré, à sa date
              : elle empêche un second avis sur le même achat et prouve que
              votre demande a été respectée. Ce retrait est définitif. Un avis
              déposé sans compte y apparaît dès que vous créez un compte avec
              l&apos;adresse email de la commande, une fois cette adresse
              confirmée.
            </p>

            <h3 className={styles.titreBloc}>Durée de conservation</h3>
            <p className={styles.texte}>
              Un avis publié le reste <strong>sans limite de durée</strong>. Il
              n&apos;est retiré que sur décision motivée de l&apos;atelier, ou
              par vous. Quand l&apos;atelier refuse ou retire un avis, son texte
              et le motif de la décision sont conservés{" "}
              <strong>cinq ans</strong>, pour pouvoir justifier la décision si
              elle est contestée, par vous ou lors d&apos;un contrôle. Cette
              durée est celle de la prescription de l&apos;article 2224 du Code
              civil. Vous pouvez retirer cet avis vous-même entre-temps. Texte
              et note sont ensuite effacés et l&apos;avis détaché de votre
              compte.
            </p>

            <h3 className={styles.titreBloc}>Classement des avis</h3>
            <p className={styles.texte}>
              Les avis sont affichés du{" "}
              <strong>plus récent au plus ancien</strong>. Aucun autre critère
              n&apos;entre dans leur ordre d&apos;affichage, et aucun avis
              n&apos;est mis en avant.
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
            <h2
              id="titre-accessibilite"
              className={styles.titreSection}
              data-borne=""
            >
              <IconeSection nom="accessibilite" trace />
              Accessibilité
            </h2>

            <h3 className={styles.titreBloc}>
              L&apos;engagement de l&apos;atelier
            </h3>
            <p className={styles.texte}>
              Ce site est conçu pour rester utilisable au clavier, avec une
              loupe ou un lecteur d&apos;écran. Cet engagement est{" "}
              <strong>volontaire</strong>. Depuis le 28 juin 2025, la
              réglementation européenne sur l&apos;accessibilité s&apos;applique
              aussi au commerce en ligne, mais elle exempte les
              microentreprises, celles de moins de dix salariés dont le chiffre
              d&apos;affaires annuel ne dépasse pas deux millions d&apos;euros,
              dont l&apos;atelier fait partie.
            </p>

            <h3 className={styles.titreBloc}>
              Ce qui est vérifié à chaque mise à jour
            </h3>
            <ul className={styles.liste}>
              <li>
                chaque page est contrôlée automatiquement sur les critères WCAG
                2.2 de niveau AA, et une anomalie bloque la mise en ligne
              </li>
              <li>
                l&apos;affichage est mesuré à quatre largeurs d&apos;écran, à
                partir de 320 pixels, sans défilement horizontal
              </li>
              <li>
                le contraste de chaque couleur de texte est calculé sur le fond
                réellement employé
              </li>
              <li>
                un lien « Aller au contenu » ouvre chaque page, et la navigation
                se fait entièrement au clavier
              </li>
            </ul>

            <h3 className={styles.titreBloc}>Ce qui n&apos;a pas été fait</h3>
            <p className={styles.texte}>
              <strong>Aucun audit RGAA n&apos;a été conduit</strong>, et aucun
              taux de conformité n&apos;est donc annoncé. Les vérifications
              décrites ci-dessus sont automatisées : elles ne remplacent pas
              l&apos;essai par une personne qui utilise réellement une
              technologie d&apos;assistance.
            </p>

            <h3 className={styles.titreBloc}>Signaler une difficulté</h3>
            <p className={styles.texte}>
              {/*
               * AUCUNE CLASSE SUR CE LIEN, et c'est voulu : `.texte a` le style
               * deja, comme les autres liens de cette page. Une classe `.lien`
               * avait ete ecrite ici et n'existe pas dans le module CSS, donc elle
               * etait inerte et le lien serait reste de la couleur par defaut.
               */}
              Si une page vous résiste, écrivez à l&apos;atelier depuis la{" "}
              <Link href="/contact">page de contact</Link> en indiquant
              l&apos;adresse concernée et ce qui a bloqué. Une autre façon
              d&apos;obtenir la même information ou de passer commande vous sera
              proposée.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
