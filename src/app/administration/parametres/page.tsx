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

export default async function PageParametres() {
  const enTetes = await headers();

  try {
    await exigerAdministratrice(enTetes);
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      redirect("/administration/connexion");
    }
    throw erreur;
  }

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Paramètres</h1>

      {/*
       * `<Suspense>` INTERNE ET JAMAIS UN `loading.tsx`, regle C32 : celui-ci
       * envelopperait la page entiere dans une frontiere, et une lecture de
       * base qui echoue rendrait 200 avec un chargement fige au lieu d'un vrai
       * 500. La garde de role reste au-dessus, la redirection devant pouvoir se
       * decider avant tout envoi.
       */}
      <Suspense fallback={<ChargementParametres />}>
        <Reglages />
      </Suspense>
    </main>
  );
}

/** Armature affichee pendant que les parametres arrivent, LS-139. */
function ChargementParametres() {
  return (
    <ChargementAdministration annonce="Chargement des paramètres…" lignes={4} />
  );
}

/** Les reglages, lus en base. */
async function Reglages() {
  /*
   * L'ABSENCE DE LIGNE NE FAIT PAS TOMBER L'ECRAN, et c'est delibere. La
   * migration l'amorce, ADR-043 : une ligne manquante signale une base
   * restauree avant cette migration. Rendre 500 laisserait l'exploitante sans
   * moyen de comprendre, alors que le message nomme la cause.
   */
  let parametres = null;
  /*
   * UNE LECTURE DE LA PROMOTION EN ÉCHEC NE FAIT PAS TOMBER L'ÉCRAN, revue
   * d'interface de LS-319 : tarifs et thème restent réglables, le bloc de la
   * promotion dit qu'il n'a pas pu se lire. Même principe que le thème, qui
   * retombe sur l'habillage ordinaire.
   */
  const [theme, promotion, periode, articles] = await Promise.all([
    lireThemeSaisonnier(),
    lireEtatPromotion().then(
      ({ active }) => active,
      () => "INDISPONIBLE" as const,
    ),
    lirePeriodeReglee().catch(() => null),
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

  return (
    <>
      {parametres === null ? (
        <p className={styles.manquant}>
          Aucun paramètre n&apos;est enregistré pour cette boutique. Cela
          signale une base restaurée avant la migration qui les amorce. Rejouer
          les migrations rétablit les valeurs de référence.
        </p>
      ) : (
        <>
          {/*
           * LE SOMMAIRE D'ÉTAT, LS-326 : ce que chaque réglage vaut en ce
           * moment, et le lien qui y mène. L'exploitante lit l'état de la
           * boutique sans parcourir cinq formulaires. Des ancres de la même
           * page : aucun rechargement, donc des balises `<a>` ordinaires.
           */}
          <nav className={styles.sommaire} aria-label="Réglages de la boutique">
            <ul className={styles.listeSommaire}>
              {(
                [
                  {
                    ancre: "#tarifs",
                    icone: "expeditions",
                    titre: "Livraison et alertes",
                    etat: `Relais ${formaterMontant(parametres.tarifRelaisCentimes)}, domicile ${formaterMontant(parametres.tarifDomicileCentimes)}${
                      parametres.seuilFranchiseCentimes === null
                        ? ", aucune gratuité"
                        : parametres.seuilFranchiseCentimes === 0
                          ? ", relais toujours offert"
                          : `, relais offert dès ${formaterMontant(parametres.seuilFranchiseCentimes)}`
                    }`,
                  },
                  {
                    ancre: "#theme-saisonnier",
                    icone: "theme",
                    titre: "Thème saisonnier",
                    etat:
                      theme === "AUCUN"
                        ? "Habillage ordinaire"
                        : `${LIBELLES_THEMES[theme]} est actif`,
                  },
                  {
                    ancre: "#promotion",
                    icone: "promotion",
                    titre: "Promotion",
                    etat:
                      promotion === "INDISPONIBLE"
                        ? "État illisible pour le moment"
                        : promotion === null
                          ? "Aucune promotion active"
                          : `${promotion.libelle} est active`,
                  },
                  {
                    ancre: "#periode-promotion",
                    icone: "connexions",
                    titre: "Période annoncée",
                    etat:
                      periode === null
                        ? "Aucune date annoncée"
                        : `Du ${formaterJour(periode.debut)} au ${formaterJour(periode.fin)}`,
                  },
                ] satisfies {
                  ancre: string;
                  icone: NomIcone;
                  titre: string;
                  etat: string;
                }[]
              ).map((entree) => (
                <li key={entree.ancre}>
                  <a href={entree.ancre} className={styles.entreeSommaire}>
                    <span className={styles.iconeSommaire}>
                      <IconeAdministration nom={entree.icone} />
                    </span>
                    <span className={styles.textesSommaire}>
                      <span className={styles.titreSommaire}>
                        {entree.titre}
                      </span>
                      <span className={styles.etatSommaire}>{entree.etat}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <p className={styles.introduction}>
            Un tarif changé vaut pour les commandes <strong>à venir</strong> :
            une commande déjà passée garde le sien.
          </p>

          <FormulaireParametres parametres={parametres} />

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

          <PeriodePromotion periode={periode} />

          <section
            className={styles.horsPerimetre}
            aria-labelledby="titre-hors-perimetre"
          >
            <h2 id="titre-hors-perimetre" className={styles.titreSection}>
              Ce qui ne se règle pas ici
            </h2>

            <dl className={styles.definitions}>
              <div className={styles.definition}>
                <dt>Le nom de la boutique</dt>
                <dd>
                  C&apos;est la marque. Le changer se décide, il ne se règle
                  pas.
                </dd>
              </div>
              <div className={styles.definition}>
                <dt>Les modes de livraison</dt>
                <dd>
                  Point Relais, Locker et domicile. En ajouter un touche le
                  tunnel de commande et le transporteur.
                </dd>
              </div>
              <div className={styles.definition}>
                <dt>La gratuité au domicile</dt>
                <dd>
                  La livraison offerte vaut en Point Relais et Locker
                  uniquement. Le domicile coûte plus cher qu&apos;une commande
                  au seuil ne le finance.
                </dd>
              </div>
              <div className={styles.definition}>
                <dt>Les coordonnées légales</dt>
                <dd>
                  Dénomination, SIRET et adresse figurent sur chaque facture
                  émise : elles se changent au déploiement, jamais en cours de
                  vente.
                </dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </>
  );
}
