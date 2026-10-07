/**
 * Page d'aide, LS-123 : livraison, retours et foire aux questions. Refondue en
 * motion design par LS-280, maquette `docs/prototypes/aide-animee/` validée
 * par Christophe le 7 octobre 2026, amendement d'ADR-045.
 *
 * COMPOSANT SERVEUR, ET AUCUN COMPOSANT CLIENT PROPRE. Tout le mouvement est
 * en CSS, borné à cinq secondes par `data-borne` que pose `AnimationsBornees`
 * depuis le layout de la boutique. Le contenu (titres, textes, tarifs, liens,
 * boutons) ne bouge jamais et ne part d'aucune opacité nulle : seul le décor
 * s'anime, ADR-045 point 5.
 *
 * DEUX DES TROIS LIENS DU PIED DE PAGE Y MÈNENT, `/aide` et `/aide#faq`. Les
 * ancres `#livraison`, `#retours` et `#faq` sont conservées, et chaque `h2`
 * commence par le mot que les tests du pied cherchent.
 *
 * LES TARIFS VIENNENT DE `resoudreConfigurationLivraison`, JAMAIS D'UN TEXTE EN
 * DUR. Un seuil de gratuité annoncé ici et différent au panier serait une
 * information précontractuelle FAUSSE, sanctionnée bien au-delà de l'écart de
 * prix. Configuration invalide : la page le dit au lieu de se taire.
 *
 * LES DÉLAIS D'EXPÉDITION NE SONT PAS ANNONCÉS, et leur absence est délibérée :
 * l'exploitante n'a pas répondu aux questions 38 à 42 de la fiche, LS-26.
 * Écrire « expédition sous 24 heures » sans pouvoir le tenir serait une pratique
 * commerciale trompeuse, articles L121-2 et suivants. Le type d'emballage
 * relève des mêmes questions : aucune étape du chemin du colis ne le décrit.
 *
 * LA FOIRE AUX QUESTIONS, LS-26, ne reprend que des faits établis, et le
 * délai d'expédition n'y figure pas pour la même raison. Le pied de page la
 * cite par l'ancre `#faq`, qui doit rester : une ancre absente retombe en haut
 * de page sans lever d'erreur, piège nommé par LS-123.
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import { DonneesStructurees } from "@/components/donnees-structurees";
import { MedaillonAube } from "@/components/medaillon-aube";
import { formaterMontant } from "@/lib/montant";
import {
  jsonLdQuestionsFrequentes,
  NOM_BOUTIQUE,
  openGraphDePage,
} from "@/lib/seo";
import {
  type ConfigurationLivraison,
  ConfigurationLivraisonInvalideError,
} from "@/lib/livraison";
import { resoudreConfigurationLivraison } from "@/services/parametres";
import styles from "./aide.module.css";
import { questionsFrequentes } from "./questions-frequentes";

export const metadata: Metadata = {
  title: "Livraison, retours et questions fréquentes",
  description: `Modes de livraison, tarifs, droit de rétractation et réponses aux questions fréquentes sur les bijoux ${NOM_BOUTIQUE}.`,
  // LS-137, page publique indexable : canonical explicite.
  alternates: { canonical: "/aide" },
  openGraph: openGraphDePage({
    titre: "Livraison, retours et questions fréquentes",
    description:
      "Modes de livraison, tarifs, droit de rétractation et réponses aux questions fréquentes.",
    chemin: "/aide",
  }),
};

/** Les tarifs se lisent à chaque affichage, jamais au chargement du module. */
export const dynamic = "force-dynamic";

/** Retard d'un élément de décor, lu par le CSS du module. */
const rang = (i: number): CSSProperties => ({ "--i": i }) as CSSProperties;

/**
 * LES QUATORZE PHASES DU CADRAN DE RÉTRACTATION, calculées au rendu serveur :
 * une par jour, du croissant à la pleine lune puis retour. Décor seulement, le
 * nombre est écrit en texte au centre.
 */
const RAYON_CADRAN = 128;
const RAYON_PHASE = 9;
const PHASES = Array.from({ length: 14 }, (_, i) => {
  const angle = ((-90 + i * (360 / 14)) * Math.PI) / 180;
  const x = 150 + RAYON_CADRAN * Math.cos(angle);
  const y = 150 + RAYON_CADRAN * Math.sin(angle);
  const croissante = i < 7;
  const eclairee = croissante ? (i + 1) / 7 : (14 - i) / 7;
  const r = RAYON_PHASE;
  const dx = r * (1 - 2 * eclairee);
  const bord = croissante ? 1 : 0;
  const interieur = dx > 0 === (bord === 1) ? 0 : 1;
  const f = (n: number) => n.toFixed(2);
  return {
    x: f(x),
    y: f(y),
    pleine: i === 6,
    chemin: `M${f(x)} ${f(y - r)} A${r} ${r} 0 0 ${bord} ${f(x)} ${f(y + r)} A${f(Math.abs(dx))} ${r} 0 0 ${interieur} ${f(x)} ${f(y - r)}Z`,
  };
});

function Fleche({ vers }: { vers: "droite" | "bas" }) {
  return (
    <svg className={styles.fleche} viewBox="0 0 20 20" aria-hidden="true">
      <path
        d={vers === "bas" ? "M10 4v12m-5-5 5 5 5-5" : "M4 10h12m-5-5 5 5-5 5"}
      />
    </svg>
  );
}

export default async function PageAide() {
  let livraison: ConfigurationLivraison | null = null;

  try {
    livraison = await resoudreConfigurationLivraison();
  } catch (erreur) {
    if (!(erreur instanceof ConfigurationLivraisonInvalideError)) {
      throw erreur;
    }
  }

  const themes = questionsFrequentes(livraison);
  const franchise =
    livraison?.seuilFranchiseCentimes == null
      ? null
      : formaterMontant(livraison.seuilFranchiseCentimes);

  return (
    /* `id="contenu"` : cible du lien d'évitement, voir la page sœur. */
    <main id="contenu" tabIndex={-1} className={styles.page}>
      {/*
       * EN-TÊTE D'AUBE, dégradé de ciel permis par l'amendement LS-280.
       * L'aquarelle reste immobile : elle peut être l'élément du LCP, et une
       * opacité de départ le retarderait. Seuls l'anneau, les rayons, les
       * astres et la poussière d'or s'animent.
       */}
      <section className={styles.heros}>
        <div className={styles.herosGrille}>
          <div className={styles.herosTexte}>
            <p className={styles.surtitre}>Livraison et aide</p>
            <h1 className={styles.titre}>
              Votre bijou, de l&apos;atelier{" "}
              <span className={styles.dore}>jusqu&apos;à vous.</span>
            </h1>
            <p className={styles.accroche}>
              Trois façons de recevoir votre commande en France métropolitaine,
              Corse comprise, et quatorze jours après réception pour changer
              d&apos;avis.
            </p>

            <nav aria-label="Sections de cette page">
              <ul className={styles.portes}>
                <li>
                  <a href="#livraison">
                    <svg viewBox="0 0 40 40" aria-hidden="true">
                      <path d="M6 14 20 7l14 7v14l-14 7-14-7Z" />
                      <path d="m6 14 14 7 14-7M20 21v14M13 10.5l14 7" />
                    </svg>
                    <span>
                      <strong>Livraison</strong>
                      <small>Modes et tarifs</small>
                    </span>
                    <Fleche vers="bas" />
                  </a>
                </li>
                <li>
                  <a href="#retours">
                    <svg viewBox="0 0 40 40" aria-hidden="true">
                      <path d="M30 14a11 11 0 1 0 1.5 9" />
                      <path d="M31 7v7h-7" />
                    </svg>
                    <span>
                      <strong>Retours</strong>
                      <small>Changer d&apos;avis, un défaut</small>
                    </span>
                    <Fleche vers="bas" />
                  </a>
                </li>
                <li>
                  <a href="#faq">
                    <svg viewBox="0 0 40 40" aria-hidden="true">
                      <path d="M7 9h26v17H18l-7 6v-6H7Z" />
                      <path d="M17 15a3 3 0 1 1 4 2.8c-.7.3-1 .8-1 1.5M20 22.5v.1" />
                    </svg>
                    <span>
                      <strong>Questions</strong>
                      <small>Les réponses fréquentes</small>
                    </span>
                    <Fleche vers="bas" />
                  </a>
                </li>
              </ul>
            </nav>
          </div>

          <div className={styles.decor}>
            <MedaillonAube
              image="/habillage/aide-colis-aube.jpg"
              cadrage="76% 62%"
              taille="(min-width: 768px) 330px, 160px"
            />
          </div>
        </div>
      </section>

      <section
        id="livraison"
        tabIndex={-1}
        className={styles.section}
        aria-labelledby="titre-livraison"
      >
        <div className={styles.enveloppe}>
          <div className={styles.enteteSection}>
            {/*
             * LE MOT DE SECTION EST DANS LE `h2`, et non dans un paragraphe au
             * dessus : les tests du pied cherchent un titre « Livraison », et
             * le moteur y lit le mot que la page cible. La virgule cachée fait
             * entendre une pause entre les deux parties.
             */}
            <h2 id="titre-livraison" className={styles.titreSection}>
              <span className={styles.surtitre}>
                Livraison<span className={styles.cache}>, </span>
              </span>
              Choisir où recevoir votre colis
            </h2>
            <p className={styles.texte}>
              Les commandes sont expédiées en France métropolitaine, Corse
              comprise, par Mondial Relay. Le mode se choisit au moment de la
              commande.
            </p>
          </div>

          {livraison === null ? (
            /*
             * CONFIGURATION INVALIDE : la page le dit. Un silence laisserait
             * croire qu'aucun tarif n'existe, et un montant de repli serait une
             * information précontractuelle fausse.
             */
            <p className={styles.attente}>
              Les tarifs de livraison ne peuvent pas être affichés pour le
              moment. Écrivez-nous depuis la{" "}
              <Link href="/contact">page de contact</Link> si vous avez besoin
              de les connaître avant de commander.
            </p>
          ) : (
            <>
              <ul className={styles.modes} data-borne="">
                <li className={styles.mode}>
                  <span className={styles.modeIcone} aria-hidden="true">
                    <svg viewBox="0 0 34 34">
                      <path
                        className={styles.trait}
                        pathLength={1}
                        d="M5 13h24l-2-6H7Z M7 13v15h20V13"
                      />
                      <path
                        className={styles.trait}
                        style={rang(1)}
                        pathLength={1}
                        d="M14 28v-8h6v8M5 13c0 2 2 3 4 3s4-1 4-3c0 2 2 3 4 3s4-1 4-3c0 2 2 3 4 3s4-1 4-3"
                      />
                    </svg>
                  </span>
                  <h3 className={styles.modeTitre}>Point Relais</h3>
                  <p className={styles.prix}>
                    {formaterMontant(livraison.relaisCentimes)}
                  </p>
                  <p className={styles.modeTexte}>
                    À retirer dans un commerce partenaire.
                  </p>
                  {franchise === null ? null : (
                    <p className={styles.pastille}>Offerte dès {franchise}</p>
                  )}
                </li>
                <li className={styles.mode}>
                  <span className={styles.modeIcone} aria-hidden="true">
                    <svg viewBox="0 0 34 34">
                      <path
                        className={styles.trait}
                        pathLength={1}
                        d="M6 5h22v24H6Z"
                      />
                      <path
                        className={styles.trait}
                        style={rang(1)}
                        pathLength={1}
                        d="M17 5v24M6 13h22M6 21h22M14 9h-2m10 0h-2m-6 8h-2m10 0h-2m-6 8h-2"
                      />
                    </svg>
                  </span>
                  <h3 className={styles.modeTitre}>Locker</h3>
                  <p className={styles.prix}>
                    {formaterMontant(livraison.relaisCentimes)}
                  </p>
                  <p className={styles.modeTexte}>
                    Une consigne accessible en libre-service.
                  </p>
                  {franchise === null ? null : (
                    <p className={styles.pastille}>Offerte dès {franchise}</p>
                  )}
                </li>
                <li className={styles.mode}>
                  <span className={styles.modeIcone} aria-hidden="true">
                    <svg viewBox="0 0 34 34">
                      <path
                        className={styles.trait}
                        pathLength={1}
                        d="M4 16 17 5l13 11M8 13v16h18V13"
                      />
                      <path
                        className={styles.trait}
                        style={rang(1)}
                        pathLength={1}
                        d="M14 29v-8h6v8"
                      />
                    </svg>
                  </span>
                  <h3 className={styles.modeTitre}>À domicile</h3>
                  <p className={styles.prix}>
                    {formaterMontant(livraison.domicileCentimes)}
                  </p>
                  <p className={styles.modeTexte}>Remis à votre adresse.</p>
                </li>
              </ul>

              {/*
               * LS-249 : EN POINT RELAIS ET LOCKER SEULEMENT, comme le calcul
               * facturé, `calculerFraisPort` et ADR-035. Le domicile, jamais
               * offert, a déjà été annoncé gratuit sur cette page.
               */}
              {franchise === null ? null : (
                <div className={styles.franchise} data-borne="">
                  <svg viewBox="0 0 44 44" aria-hidden="true">
                    <path
                      className={styles.trait}
                      pathLength={1}
                      d="M7 18h30v20H7Z M5 12h34v6H5Z"
                    />
                    <path
                      className={styles.trait}
                      style={rang(1)}
                      pathLength={1}
                      d="M22 12v26M22 12c-3-6-11-7-10-2 1 3 7 2 10 2 3 0 9 1 10-2 1-5-7-4-10 2"
                    />
                  </svg>
                  <p>
                    <strong>
                      Livraison offerte en Point Relais et Locker dès{" "}
                      {franchise} d&apos;achat.
                    </strong>{" "}
                    La livraison à domicile reste payante.
                  </p>
                </div>
              )}
            </>
          )}

          <div className={styles.parcours}>
            <h3 className={styles.parcoursTitre}>Le chemin de votre colis</h3>
            {/*
             * AUCUNE ÉTAPE NE PORTE DE DURÉE, questions 38 à 42 sans réponse.
             * Le trait entre deux jalons et le colis qui le parcourt sont des
             * décors `aria-hidden` qui ne passent sur aucun texte. Le trait
             * est un ÉLÉMENT et non un `::after` : `[data-borne="attente"] *`
             * n'atteint pas un pseudo-élément, qui se dessinait donc hors de
             * l'écran, revue de LS-280.
             */}
            <div className={styles.piste} data-borne="">
              <ol className={styles.etapes}>
                <li className={styles.etape} style={rang(0)}>
                  <span className={styles.jalon} aria-hidden="true">
                    1
                  </span>
                  <span className={styles.liaison} aria-hidden="true" />
                  <div>
                    <p className={styles.etapeTitre}>Vous commandez</p>
                    <p className={styles.etapeTexte}>
                      Le mode de livraison se choisit au panier.
                    </p>
                  </div>
                </li>
                <li className={styles.etape} style={rang(1)}>
                  <span className={styles.jalon} aria-hidden="true">
                    2
                  </span>
                  <span className={styles.liaison} aria-hidden="true" />
                  <div>
                    <p className={styles.etapeTitre}>L&apos;atelier prépare</p>
                    <p className={styles.etapeTexte}>
                      Votre commande est préparée pour l&apos;expédition.
                    </p>
                  </div>
                </li>
                <li className={styles.etape} style={rang(2)}>
                  <span className={styles.jalon} aria-hidden="true">
                    3
                  </span>
                  <span className={styles.liaison} aria-hidden="true" />
                  <div>
                    <p className={styles.etapeTitre}>Mondial Relay achemine</p>
                    <p className={styles.etapeTexte}>
                      Le transporteur vous informe directement de
                      l&apos;avancement.
                    </p>
                  </div>
                </li>
                <li className={styles.etape} style={rang(3)}>
                  <span className={styles.jalon} aria-hidden="true">
                    4
                  </span>
                  <div>
                    <p className={styles.etapeTitre}>Vous recevez</p>
                    <p className={styles.etapeTexte}>
                      En Point Relais, en Locker ou chez vous.
                    </p>
                  </div>
                </li>
              </ol>
              <div className={styles.voyage} aria-hidden="true">
                <svg viewBox="0 0 40 40">
                  <path d="M6 14 20 7l14 7v14l-14 7-14-7Z" />
                  <path d="m6 14 14 7 14-7M20 21v14" />
                </svg>
              </div>
            </div>
          </div>

          {/*
           * AUCUN DÉLAI D'EXPÉDITION N'EST ANNONCÉ, et c'est ce paragraphe qui le
           * dit plutôt que de laisser un silence. Les questions 38 à 42 de la
           * fiche exploitante sont sans réponse.
           */}
          <p className={styles.noteAttente}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="8" />
              <path d="M10 5v5l3 2" />
            </svg>
            <span>
              Le délai de préparation avant expédition sera précisé ici avant
              l&apos;ouverture de la boutique.
            </span>
          </p>
        </div>
      </section>

      <section
        id="retours"
        tabIndex={-1}
        className={`${styles.section} ${styles.retours}`}
        aria-labelledby="titre-retours"
      >
        <div className={styles.enveloppe}>
          <div className={styles.enteteSection}>
            <h2 id="titre-retours" className={styles.titreSection}>
              <span className={styles.surtitre}>
                Retours<span className={styles.cache}>, </span>
              </span>
              Changer d&apos;avis, ou signaler un défaut
            </h2>
          </div>

          <div className={styles.retoursGrille}>
            <div className={styles.cadran} data-borne="">
              <svg viewBox="0 0 300 300" aria-hidden="true">
                <circle
                  className={styles.cadranAnneau}
                  cx="150"
                  cy="150"
                  r={RAYON_CADRAN}
                  pathLength={1}
                />
                {PHASES.map((phase, i) => (
                  <g key={i} className={styles.phase} style={rang(i)}>
                    <circle
                      className={styles.phaseFond}
                      cx={phase.x}
                      cy={phase.y}
                      r={RAYON_PHASE}
                    />
                    <path
                      className={
                        phase.pleine ? styles.phasePleine : styles.phaseLumiere
                      }
                      d={phase.chemin}
                    />
                  </g>
                ))}
              </svg>
              <p className={styles.cadranTexte}>
                <span className={styles.quatorze}>14</span>
                <span>jours pour changer d&apos;avis, dès la réception</span>
              </p>
            </div>

            <div className={styles.cas} data-borne="">
              <article className={styles.carteCas}>
                <h3 className={styles.casTitre}>
                  <svg viewBox="0 0 34 34" aria-hidden="true">
                    <path
                      className={styles.trait}
                      pathLength={1}
                      d="M26 11a10 10 0 1 0 1.5 8"
                    />
                    <path
                      className={styles.trait}
                      style={rang(1)}
                      pathLength={1}
                      d="M27 5v6h-6"
                    />
                  </svg>
                  Vous changez d&apos;avis
                </h3>
                <ul className={styles.puces}>
                  <li>
                    <strong>Quatorze jours</strong> à compter de la réception,
                    sans avoir à vous justifier.
                  </li>
                  <li>Les frais de retour sont à votre charge.</li>
                  <li>
                    Nous vous remboursons la totalité de votre commande, frais
                    de livraison initiaux compris.
                  </li>
                  <li>
                    Un formulaire en ligne, depuis votre espace client, ou par
                    le lien personnel reçu avec votre confirmation de commande
                    si vous avez commandé sans compte.
                  </li>
                </ul>
                <div className={styles.actions}>
                  {/*
                   * AUCUNE PAGE PUBLIQUE DE RÉTRACTATION : le formulaire vit
                   * sur la commande, dans l'espace client, ou derrière le lien
                   * signé de l'email, LS-134. La maquette pointait vers
                   * `/retractation`, qui rend 404 : relevé par
                   * `verifier-atteignabilite-boutique.sh`.
                   */}
                  <Link
                    href="/compte/commandes"
                    className={styles.boutonPrincipal}
                  >
                    Mes commandes <Fleche vers="droite" />
                  </Link>
                  <Link
                    href="/informations-legales#retractation"
                    className={styles.lien}
                  >
                    Détail du droit de rétractation
                  </Link>
                </div>
              </article>

              <article className={styles.carteCas}>
                <h3 className={styles.casTitre}>
                  <svg viewBox="0 0 34 34" aria-hidden="true">
                    <path
                      className={styles.trait}
                      pathLength={1}
                      d="M17 4 6 8v8c0 7 5 12 11 14 6-2 11-7 11-14V8Z"
                    />
                    <path
                      className={styles.trait}
                      style={rang(1)}
                      pathLength={1}
                      d="m12 17 4 4 7-8"
                    />
                  </svg>
                  Le bijou présente un défaut
                </h3>
                <ul className={styles.puces}>
                  <li>
                    Ce n&apos;est pas un changement d&apos;avis : la{" "}
                    <strong>garantie légale de conformité</strong> vous couvre
                    pendant deux ans.
                  </li>
                  <li>Les frais de retour sont alors à notre charge.</li>
                </ul>
                <div className={styles.actions}>
                  <Link href="/contact" className={styles.boutonSecondaire}>
                    Écrire à l&apos;atelier <Fleche vers="droite" />
                  </Link>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      {/*
       * QUESTIONS FRÉQUENTES, LS-26. Le ciel de nuit, dégradé permis par
       * l'amendement LS-280, porte le titre et la sortie vers le contact ; les
       * questions viennent dessous, sur fond clair, pour être lues.
       *
       * DES `<details>` NATIFS : ouverts et fermés sans script, au clavier, et
       * annoncés comme tels par un lecteur d'écran. Le seul mouvement est la
       * rotation du chevron, micro-interaction d'ADR-045.
       *
       * LE TEXTE ET LE BALISAGE `FAQPage` VIENNENT DE LA MÊME SOURCE,
       * `questionsFrequentes` : aucune réponse balisée ne peut différer de la
       * réponse affichée.
       */}
      <section
        id="faq"
        tabIndex={-1}
        className={styles.faq}
        aria-labelledby="titre-faq"
      >
        <DonneesStructurees
          balisage={jsonLdQuestionsFrequentes(
            themes.flatMap((theme) => theme.questions),
          )}
        />
        <div className={styles.faqNuit}>
          <div className={styles.faqImage} aria-hidden="true">
            <Image
              src="/habillage/aide-nuit-colline.jpg"
              alt=""
              fill
              sizes="100vw"
            />
          </div>
          <div className={styles.etoiles} aria-hidden="true" data-borne="">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} style={rang(i)} />
            ))}
          </div>
          <div className={styles.enveloppe}>
            <h2 id="titre-faq" className={styles.titreFaq}>
              <span className={styles.surtitreNuit}>
                Questions fréquentes<span className={styles.cache}>, </span>
              </span>
              Ce qu&apos;il faut savoir avant de commander
            </h2>
            <p className={styles.texteFaq}>
              Livraison, paiement, retours et entretien. Une autre question ?
              L&apos;atelier répond sous 24 heures au maximum.
            </p>
            <Link href="/contact" className={styles.boutonNuit}>
              Poser une question <Fleche vers="droite" />
            </Link>
          </div>
        </div>

        <div className={styles.faqCorps}>
          <div className={styles.enveloppe}>
            {themes.map((theme) => (
              <div key={theme.titre} className={styles.theme}>
                <h3 className={styles.themeTitre}>{theme.titre}</h3>
                <div className={styles.questions}>
                  {theme.questions.map((entree) => (
                    <details
                      key={entree.id}
                      id={entree.id}
                      className={styles.question}
                    >
                      <summary className={styles.questionIntitule}>
                        <span>{entree.question}</span>
                        <svg
                          className={styles.chevron}
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                        >
                          <path d="m5 8 5 5 5-5" />
                        </svg>
                      </summary>
                      <div className={styles.reponse}>
                        <p>{entree.reponse}</p>
                        {entree.lien ? (
                          <Link href={entree.lien.href} className={styles.lien}>
                            {entree.lien.libelle}
                          </Link>
                        ) : null}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
