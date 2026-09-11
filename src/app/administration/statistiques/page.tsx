/**
 * Page Statistiques de l'administration, LS-64.
 *
 * COMPOSANT SERVEUR : il exige le rôle, lit les agrégats et rend. Aucune
 * interaction, donc aucune marque client : le filtre de période passe par un
 * lien, ce qui le rend partageable et lisible sans JavaScript.
 *
 * `exigerAdministratrice` EST APPELÉ AVANT TOUT RENDU. Aucune Server Action
 * n'existe ici, l'écran étant en lecture seule : il n'y a donc rien d'autre à
 * garder, et c'est ce qui distingue cet écran des autres.
 *
 * TROIS RÈGLES D'AFFICHAGE VIENNENT DE `STATISTIQUES.md` ET NE SE RELÂCHENT
 * PAS.
 *
 * LES TROIS MONTANTS S'AFFICHENT ENSEMBLE, le net jamais seul. Le brut répond à
 * « combien ai-je encaissé », question à laquelle l'e-reporting de LS-35 devra
 * répondre, et le net seul la rendrait impossible.
 *
 * LE NET PEUT ÊTRE NÉGATIF et s'affiche tel quel. Sur un mois à faible
 * activité, les remboursements peuvent dépasser les encaissements : c'est la
 * réalité comptable de ce mois-là.
 *
 * LE PANIER MOYEN DIT QU'IL NE PORTE QUE LE WEB, dans son étiquette. Une vente
 * de marché n'est pas une commande, et l'omettre ferait lire un chiffre pour un
 * autre.
 *
 * AUCUN `loading.tsx` DANS CE SEGMENT, règle C32 : la frontière est INTERNE,
 * `<Suspense>` dans la page, pour qu'une base injoignable rende 500 et non 200
 * avec une armature figée.
 */
import Link from "next/link";
import { Suspense } from "react";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ChargementAdministration } from "@/components/chargement-administration";
import { formaterMontant } from "@/lib/montant";
import {
  PERIODES_STATISTIQUES,
  reconnaitrePeriodeStatistique,
  type ValeurPeriodeStatistique,
} from "@/lib/periode-comptable";
import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import { lireStatistiques, partEnPourCent } from "@/services/statistiques";
import type { ModeLivraison } from "@/generated/prisma/client";

import styles from "./statistiques.module.css";

export const metadata = {
  title: "Statistiques",
  robots: { index: false, follow: false },
};

/**
 * La page lit la base à chaque affichage.
 *
 * DES STATISTIQUES MISES EN CACHE SONT TROMPEUSES : une vente confirmée pendant
 * que l'écran est ouvert doit se voir au rafraîchissement, et un chiffre
 * d'affaires figé est pire qu'absent.
 */
export const dynamic = "force-dynamic";

/**
 * Libellés des modes de livraison, exhaustivité garantie par le type.
 *
 * `Record<ModeLivraison, string>` ET NON `Record<string, string>` : ajouter une
 * valeur à l'enum sans écrire son libellé ne compile pas. Le piège « un enum
 * ajouté casse l'affichage » a déjà frappé ce dépôt, et il se ferme par le
 * typage, jamais par la vigilance.
 */
const LIBELLES_LIVRAISON: Record<ModeLivraison, string> = {
  DOMICILE: "À domicile",
  POINT_RELAIS: "Point relais",
  LOCKER: "Locker",
};

export default async function PageStatistiques({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
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

  const parametres = await searchParams;
  const periode = reconnaitrePeriodeStatistique(parametres.periode);

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <Link href="/administration" className={styles.retour} prefetch={false}>
        Retour au tableau de bord
      </Link>

      <h1 className={styles.titre}>Statistiques</h1>

      {/*
       * LE FILTRE EST UNE NAVIGATION ET NON UN FORMULAIRE. L'état vit dans
       * l'URL, donc le retour navigateur et le partage de lien fonctionnent,
       * règle de frontière avec le métier.
       */}
      <nav className={styles.filtres} aria-label="Période">
        <ul className={styles.listeFiltres}>
          {PERIODES_STATISTIQUES.map((choix) => (
            <li key={choix.valeur}>
              <Link
                href={{
                  pathname: "/administration/statistiques",
                  query: { periode: choix.valeur },
                }}
                className={styles.filtre}
                prefetch={false}
                aria-current={choix.valeur === periode ? "page" : undefined}
              >
                {choix.libelle}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Suspense fallback={<ChargementStatistiques />}>
        <Indicateurs periode={periode} />
      </Suspense>
    </main>
  );
}

/** Armature affichée pendant que les agrégats arrivent, LS-139. */
function ChargementStatistiques() {
  return (
    <ChargementAdministration
      annonce="Chargement des statistiques…"
      lignes={6}
    />
  );
}

/**
 * Les indicateurs, seule partie de cet écran qui lit la base.
 *
 * POURQUOI UN `<Suspense>` INTERNE ET NON UN `loading.tsx`, règle C32. Un
 * fichier de segment pose sa frontière sur la page ENTIÈRE : le streaming
 * démarre alors dès le premier `await`, et un statut ne se change plus une fois
 * les octets partis. Une base injoignable rendrait 200 avec l'armature figée.
 *
 * NE PAS AJOUTER `statistiques/loading.tsx`.
 */
async function Indicateurs({ periode }: { periode: ValeurPeriodeStatistique }) {
  const stats = await lireStatistiques(periode);

  /*
   * L'ÉTAT VIDE EST EXPLICITE ET NON DES ZÉROS MUETS, critère 10. Une période
   * sans activité affiche une phrase, pas six cartes à zéro et un graphique
   * plat : l'exploitante doit distinguer « rien vendu » d'un écran cassé.
   */
  if (stats.periodeVide) {
    return (
      <p className={styles.vide}>
        Aucune vente ni remboursement sur cette période. Les chiffres
        apparaîtront dès la première commande payée ou la première vente de
        marché saisie.
      </p>
    );
  }

  const partWeb = partEnPourCent(stats.brutWebCentimes, stats.brutCentimes);
  const partExterne = partEnPourCent(
    stats.brutExterneCentimes,
    stats.brutCentimes,
  );

  return (
    <>
      <section className={styles.section} aria-labelledby="titre-montants">
        <h2 id="titre-montants" className={styles.titreSection}>
          Montants
        </h2>

        {/*
         * LES TROIS MONTANTS SONT ENSEMBLE, le net jamais seul. Le brut répond
         * à « combien ai-je encaissé », le net à « qu'est-ce qui me reste », et
         * l'un sans l'autre laisse la moitié de la question sans réponse.
         */}
        <dl className={styles.cartes}>
          <div className={styles.carte}>
            <dt className={styles.etiquette}>Brut encaissé</dt>
            <dd className={styles.valeur}>
              {formaterMontant(stats.brutCentimes)}
            </dd>
            <dd className={styles.precision}>frais de livraison compris</dd>
          </div>

          <div className={styles.carte}>
            <dt className={styles.etiquette}>Remboursements</dt>
            <dd className={styles.valeur}>
              {formaterMontant(stats.remboursementsCentimes)}
            </dd>
            <dd className={styles.precision}>avoirs émis sur la période</dd>
          </div>

          <div className={styles.carte}>
            <dt className={styles.etiquette}>Net</dt>
            {/*
             * LE NET NÉGATIF S'AFFICHE TEL QUEL, jamais borné à zéro. Il se
             * distingue par une classe ET par son signe, jamais par la couleur
             * seule, WCAG 1.4.1.
             */}
            <dd
              className={`${styles.valeur} ${
                stats.netCentimes < 0 ? styles.valeurNegative : ""
              }`}
            >
              {formaterMontant(stats.netCentimes)}
            </dd>
            <dd className={styles.precision}>brut moins remboursements</dd>
          </div>

          <div className={styles.carte}>
            <dt className={styles.etiquette}>Frais de livraison facturés</dt>
            <dd className={styles.valeur}>
              {formaterMontant(stats.fraisPortCentimes)}
            </dd>
            <dd className={styles.precision}>déjà comptés dans le brut</dd>
          </div>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="titre-volumes">
        <h2 id="titre-volumes" className={styles.titreSection}>
          Volumes
        </h2>

        <dl className={styles.cartes}>
          <div className={styles.carte}>
            <dt className={styles.etiquette}>Commandes payées</dt>
            <dd className={styles.valeur}>{stats.commandesPayees}</dd>
          </div>

          <div className={styles.carte}>
            <dt className={styles.etiquette}>Bijoux vendus</dt>
            <dd className={styles.valeur}>{stats.bijouxVendus}</dd>
            <dd className={styles.precision}>web et marchés</dd>
          </div>

          <div className={styles.carte}>
            {/*
             * L'ÉTIQUETTE DIT « WEB », ET C'EST UNE EXIGENCE. Une vente de
             * marché n'est pas une commande : un panier moyen qui les
             * inclurait serait un chiffre sans signification.
             */}
            <dt className={styles.etiquette}>Panier moyen web</dt>
            <dd className={styles.valeur}>
              {stats.panierMoyenWebCentimes === null
                ? "—"
                : formaterMontant(stats.panierMoyenWebCentimes)}
            </dd>
            <dd className={styles.precision}>
              {stats.panierMoyenWebCentimes === null
                ? "aucune commande payée"
                : "ventes en ligne seulement"}
            </dd>
          </div>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="titre-canaux">
        <h2 id="titre-canaux" className={styles.titreSection}>
          Répartition par canal
        </h2>

        <dl className={styles.cartes}>
          <div className={styles.carte}>
            <dt className={styles.etiquette}>Ventes en ligne</dt>
            <dd className={styles.valeur}>
              {formaterMontant(stats.brutWebCentimes)}
            </dd>
            {partWeb !== null && (
              <dd className={styles.precision}>{partWeb} % du brut</dd>
            )}
          </div>

          <div className={styles.carte}>
            <dt className={styles.etiquette}>Ventes de marché</dt>
            <dd className={styles.valeur}>
              {formaterMontant(stats.brutExterneCentimes)}
            </dd>
            {partExterne !== null && (
              <dd className={styles.precision}>{partExterne} % du brut</dd>
            )}
          </div>
        </dl>
      </section>

      {stats.repartitionLivraison.length > 0 && (
        <section className={styles.section} aria-labelledby="titre-livraison">
          <h2 id="titre-livraison" className={styles.titreSection}>
            Modes de livraison choisis
          </h2>

          <ul className={styles.liste}>
            {stats.repartitionLivraison.map((part) => (
              <li key={part.mode} className={styles.ligne}>
                <span>{LIBELLES_LIVRAISON[part.mode]}</span>
                <span className={styles.nombre}>
                  {part.commandes} commande{part.commandes > 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats.meilleuresVentes.length > 0 && (
        <section className={styles.section} aria-labelledby="titre-meilleures">
          <h2 id="titre-meilleures" className={styles.titreSection}>
            Pièces les plus vendues
          </h2>

          <ul className={styles.liste}>
            {stats.meilleuresVentes.map((vente) => (
              <li key={vente.varianteId} className={styles.ligne}>
                <span className={styles.libellePiece}>
                  {vente.libelleProduit} ({vente.libelleVariante})
                </span>
                <span className={styles.nombre}>
                  {vente.quantite} vendu{vente.quantite > 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats.variantesInvendues.length > 0 && (
        <section className={styles.section} aria-labelledby="titre-invendues">
          <h2 id="titre-invendues" className={styles.titreSection}>
            Pièces jamais vendues
          </h2>

          {/*
           * « JAMAIS VENDUE » EST UNE PROPRIÉTÉ ABSOLUE, pas une propriété de
           * la période. La borner à un mois ferait apparaître comme invendue
           * une pièce vendue le mois précédent, ce qui inviterait à agir sur
           * une pièce qui se vend. L'étiquette le dit.
           */}
          <p className={styles.precision}>
            Toutes périodes confondues, hors pièces archivées.
          </p>

          <ul className={styles.liste}>
            {stats.variantesInvendues.map((variante) => (
              <li key={variante.varianteId} className={styles.ligne}>
                <span className={styles.libellePiece}>
                  {variante.libelleProduit} ({variante.libelleVariante})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
