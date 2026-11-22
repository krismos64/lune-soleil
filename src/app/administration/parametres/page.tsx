/**
 * Parametres commerciaux de la boutique, LS-98, ADR-043.
 *
 * COMPOSANT SERVEUR : il exige le role, lit la base et rend. L'interaction vit
 * dans `formulaire-parametres.tsx`, marque client, qui ne requete rien.
 *
 * `exigerAdministratrice` EST APPELE AVANT TOUT RENDU, motif pose par LS-70. La
 * page ET la Server Action portent la garde : proteger la page seule laisserait
 * ouvert l'appel direct a l'action, defaut trouve en relecture de LS-89.
 *
 * AUCUN `loading.tsx` DANS CE SEGMENT, regle C32 : il envelopperait la page
 * dans une frontiere Suspense, et une lecture de base qui echoue rendrait 200
 * avec un chargement fige au lieu d'un vrai 500.
 *
 * ------------------------------------------------------------------
 * CE QUE CET ECRAN NE PERMET PAS DE CHANGER, ET POURQUOI C'EST ECRIT A L'ECRAN.
 *
 * ADR-043 laisse trois choses hors de la base : le nom commercial, qui est la
 * marque ; les trois modes de livraison, qu'ADR-025 fixe ; et la reserve de
 * franchise sur le domicile, qu'ADR-035 impose.
 *
 * Les TAIRE ferait chercher le reglage manquant a chaque ouverture. L'ecran dit
 * donc ce qu'il ne fait pas, et ou la decision vit.
 * ------------------------------------------------------------------
 */
import { formaterDate } from "@/lib/affichage-commande";
import {
  lireArticlesReductibles,
  lireEtatPromotion,
  lirePeriodeReglee,
} from "@/services/promotion";
import { Suspense } from "react";

import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import {
  ParametresAbsentsError,
  lireParametresBoutique,
} from "@/services/parametres";
import { ChargementAdministration } from "@/components/chargement-administration";
import {
  LIBELLES_THEMES,
  lireThemeSaisonnier,
} from "@/services/theme-saisonnier";
import {
  IconeAdministration,
  type NomIcone,
} from "@/components/icones-administration";
import { formaterMontant } from "@/lib/montant";
import { ChoixPromotion, PeriodePromotion } from "./choix-promotion";
import { ChoixTheme } from "./choix-theme";
import { FormulaireParametres } from "./formulaire-parametres";
import styles from "./parametres.module.css";

export const metadata = {
  title: "Paramètres, administration",
  robots: { index: false, follow: false },
};

/**
 * La page lit la base a chaque affichage.
 *
 * UN PARAMETRE MIS EN CACHE EST TROMPEUR ICI PLUS QU'AILLEURS : l'exploitante
 * enregistre un tarif et doit le voir. Un ecran fige lui ferait ressaisir la
 * meme valeur, ou croire que l'enregistrement a echoue.
 */
export const dynamic = "force-dynamic";

/** « 23 novembre » depuis un jour civil `AAAA-MM-JJ`, lu en UTC. */
function formaterJour(jour: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${jour}T00:00:00Z`));
}

/**
 * Les trois sections de l'écran, refonte du 22 novembre 2026. Une seule est
 * rendue à la fois : quatre formulaires empilés sur une page faisaient
 * chercher le bon. La section vient de l'adresse, `?section=…`, ce qui garde
 * le bouton retour et le lien partagé ; une valeur inconnue retombe sur la
 * livraison.
 */
const SECTIONS = ["livraison", "ambiance", "notifications"] as const;
type Section = (typeof SECTIONS)[number];

function sectionDe(valeur: string | undefined): Section {
  return (SECTIONS as readonly string[]).includes(valeur ?? "")
    ? (valeur as Section)
    : "livraison";
}

export default async function PageParametres({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
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

  const section = sectionDe((await searchParams).section);

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Paramètres</h1>

      <Suspense fallback={<ChargementParametres />}>
        <Reglages section={section} />
      </Suspense>
    </main>
  );
}

function ChargementParametres() {
  return (
    <ChargementAdministration annonce="Chargement des paramètres…" lignes={4} />
  );
}

async function Reglages({ section }: { section: Section }) {
  let parametres = null;
  const [theme, promotion, periode, articles] = await Promise.all([
    lireThemeSaisonnier(),
    lireEtatPromotion().then(
      ({ active }) => active,
      () => "INDISPONIBLE" as const,
    ),
    // Illisible n'est pas « aucune date » : le sommaire dit lequel des deux.
    lirePeriodeReglee().catch(() => "INDISPONIBLE" as const),
    // Sans la liste des articles, la portée « toute la boutique » reste
    // utilisable : l'écran ne tombe pas pour une liste illisible.
    lireArticlesReductibles().catch(() => null),
  ]);

  try {
    parametres = await lireParametresBoutique();
  } catch (erreur) {
    if (!(erreur instanceof ParametresAbsentsError)) {
      throw erreur;
    }
  }

  if (parametres === null) {
    return (
      <p className={styles.manquant}>
        Aucun paramètre n&apos;est enregistré pour cette boutique. Cela signale
        une base restaurée avant la migration qui les amorce. Rejouer les
        migrations rétablit les valeurs de référence.
      </p>
    );
  }

  const alertesActives = [
    parametres.alerteCommandePayee,
    parametres.alertePaiementAnnule,
    parametres.alerteStockFaible,
    parametres.alerteMessageRecu,
    parametres.alerteAvisAModerer,
  ].filter(Boolean).length;

  const entrees: {
    section: Section;
    icone: NomIcone;
    titre: string;
    etat: string;
  }[] = [
    {
      section: "livraison",
      icone: "expeditions",
      titre: "Livraison",
      etat: `Relais ${formaterMontant(parametres.tarifRelaisCentimes)}, domicile ${formaterMontant(parametres.tarifDomicileCentimes)}${
        parametres.seuilFranchiseCentimes === null
          ? ", aucune gratuité"
          : parametres.seuilFranchiseCentimes === 0
            ? ", relais toujours offert"
            : `, relais offert dès ${formaterMontant(parametres.seuilFranchiseCentimes)}`
      }`,
    },
    {
      section: "ambiance",
      icone: "theme",
      titre: "Ambiance et promotion",
      etat: `${theme === "AUCUN" ? "Aucune ambiance" : LIBELLES_THEMES[theme]}, ${
        promotion === "INDISPONIBLE"
          ? "promotion illisible pour le moment"
          : promotion === null
            ? "aucune promotion active"
            : `promotion ${promotion.libelle}${
                periode !== "INDISPONIBLE" && periode !== null
                  ? ` du ${formaterJour(periode.debut)} au ${formaterJour(periode.fin)}`
                  : ""
              }`
      }`,
    },
    {
      section: "notifications",
      icone: "alertes",
      titre: "Notifications",
      etat: `${alertesActives} sur 5 activées, vers ${parametres.emailAlertes}`,
    },
  ];

  return (
    <>
      {/*
       * LE SOMMAIRE EST LE CHOIX DE LA SECTION : chaque entrée dit l'état du
       * réglage et l'ouvre. `aria-current` marque la section affichée.
       */}
      <nav className={styles.sommaire} aria-label="Réglages de la boutique">
        <ul className={styles.listeSommaire}>
          {entrees.map((entree) => (
            <li key={entree.section}>
              <Link
                href={
                  entree.section === "livraison"
                    ? "/administration/parametres"
                    : `/administration/parametres?section=${entree.section}`
                }
                className={styles.entreeSommaire}
                aria-current={entree.section === section ? "page" : undefined}
                prefetch={false}
                scroll={false}
              >
                <span className={styles.iconeSommaire}>
                  <IconeAdministration nom={entree.icone} />
                </span>
                <span className={styles.textesSommaire}>
                  <span className={styles.titreSommaire}>{entree.titre}</span>
                  <span className={styles.etatSommaire}>{entree.etat}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {section === "livraison" ? (
        <>
          <p className={styles.introduction}>
            Un tarif changé vaut pour les commandes <strong>à venir</strong> :
            une commande déjà passée garde le sien.
          </p>
          <FormulaireParametres parametres={parametres} section="livraison" />
        </>
      ) : null}

      {section === "notifications" ? (
        <FormulaireParametres parametres={parametres} section="notifications" />
      ) : null}

      {section === "ambiance" ? (
        <>
          <ChoixTheme actif={theme} />

          <ChoixPromotion
            articles={articles}
            etat={
              promotion === null || promotion === "INDISPONIBLE"
                ? promotion
                : {
                    ...promotion,
                    activeDepuis: formaterDate(promotion.activeDepuis),
                  }
            }
          />

          <PeriodePromotion
            periode={periode === "INDISPONIBLE" ? null : periode}
          />
        </>
      ) : null}

      {/*
       * CE QUI NE SE RÈGLE PAS ICI, replié sous « En savoir plus » : utile la
       * première fois, encombrant ensuite. Le texte reste entier.
       */}
      <details className={styles.horsPerimetre}>
        <summary className={styles.titreSection}>
          En savoir plus : ce qui ne se règle pas ici
        </summary>

        <dl className={styles.definitions}>
          <div className={styles.definition}>
            <dt>Le nom de la boutique</dt>
            <dd>
              C&apos;est la marque. Le changer se décide, il ne se règle pas.
            </dd>
          </div>
          <div className={styles.definition}>
            <dt>Les modes de livraison</dt>
            <dd>
              Point Relais, Locker et domicile. En ajouter un touche le tunnel
              de commande et le transporteur.
            </dd>
          </div>
          <div className={styles.definition}>
            <dt>La gratuité au domicile</dt>
            <dd>
              La livraison offerte vaut en Point Relais et Locker uniquement. Le
              domicile coûte plus cher qu&apos;une commande au seuil ne le
              finance.
            </dd>
          </div>
          <div className={styles.definition}>
            <dt>Les coordonnées légales</dt>
            <dd>
              Dénomination, SIRET et adresse figurent sur chaque facture émise :
              elles se changent au déploiement, jamais en cours de vente.
            </dd>
          </div>
        </dl>
      </details>
    </>
  );
}
