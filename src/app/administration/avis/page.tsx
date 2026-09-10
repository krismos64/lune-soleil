/**
 * Rubrique Avis de l'administration, LS-61.
 *
 * COMPOSANT SERVEUR : il exige le role, lit la base et rend. La decision de
 * moderation vit dans `decision-avis.tsx`, marque client, qui ne requete rien.
 *
 * `exigerAdministratrice` EST APPELE AVANT TOUT RENDU, et la Server Action porte
 * la MEME garde : proteger la page seule laisserait ouvert l'appel direct,
 * defaut de LS-89.
 *
 * CET ECRAN EXISTE PARCE QU'UN AVIS EST RELU AVANT PUBLICATION, arbitrage de
 * l'exploitante du 3 septembre 2026, regle R4. La relecture n'est pas
 * facultative : sans cet ecran, un avis depose resterait `DEPOSE` a jamais et
 * la fiche produit n'en montrerait aucun.
 *
 * AUCUN ECRAN DE REPONSE PUBLIQUE N'EST CONSTRUIT ICI. `ReponseAvis` existe au
 * schema, mais l'usage n'est pas decide et le commentaire Jira du 3 septembre
 * 2026 demande explicitement de ne pas le construire sans arbitrage. Une story
 * a elle le portera si la reponse est retenue.
 */
import Link from "next/link";
import { Suspense } from "react";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ChargementAdministration } from "@/components/chargement-administration";
import { formaterDate } from "@/lib/affichage-commande";
import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import {
  DELAI_PUBLICATION_JOURS,
  listerAvisAModerer,
  listerAvisDecides,
} from "@/services/avis";
import type { AvisAModerer } from "@/repositories/avis";

import { DecisionAvis } from "./decision-avis";
import styles from "./avis.module.css";

export const metadata = {
  title: "Avis",
  robots: { index: false, follow: false },
};

/**
 * La page lit la base a chaque affichage.
 *
 * UNE FILE DE MODERATION MISE EN CACHE EST TROMPEUSE : un avis depose pendant
 * que l'ecran est ouvert doit se voir au rafraichissement, et une decision prise
 * depuis un autre onglet ne doit pas reapparaitre en attente.
 */
export const dynamic = "force-dynamic";

/**
 * Libelle affichable d'un statut, jamais la valeur brute de l'enum.
 *
 * `Record<StatutAvis, string>` ET NON `Record<string, string>` : la forme large
 * compilerait sans rien garantir, et ajouter une valeur a l'enum afficherait
 * `ARCHIVE` en majuscules sans qu'aucun controle ne rougisse. Le piege « un enum
 * ajoute casse l'affichage » a deja frappe ce depot, et il se ferme par le
 * typage, jamais par la vigilance.
 */
const LIBELLES: Record<AvisAModerer["statut"], string> = {
  DEPOSE: "En attente de relecture",
  PUBLIE: "Publié",
  REFUSE: "Refusé",
  RETIRE: "Retiré",
};

export default async function PageAvis() {
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
      <Link href="/administration" className={styles.retour} prefetch={false}>
        Retour au tableau de bord
      </Link>

      <h1 className={styles.titre}>Avis</h1>

      <p className={styles.introduction}>
        Chaque avis est relu avant publication. Le site annonce aux clients un
        délai de {DELAI_PUBLICATION_JOURS} jours au plus, article D111-10 du
        Code de la consommation.
      </p>

      <Suspense fallback={<ChargementAvis />}>
        <ListesAvis />
      </Suspense>
    </main>
  );
}

/** Armature affichee pendant que les avis arrivent, LS-139. */
function ChargementAvis() {
  return <ChargementAdministration annonce="Chargement des avis…" lignes={4} />;
}

/**
 * Les deux listes, seule partie de cet ecran qui lit la base.
 *
 * POURQUOI UN `<Suspense>` INTERNE ET NON UN `loading.tsx`, regle C32. Un
 * fichier de segment pose sa frontiere sur la page ENTIERE : le streaming
 * demarre alors des le premier `await`, et un statut ne se change plus une fois
 * les octets partis. Une base injoignable rendrait 200 avec l'armature figee,
 * au lieu du 500 que `error.tsx` doit servir.
 *
 * NE PAS AJOUTER `avis/loading.tsx`.
 */
async function ListesAvis() {
  const [aModerer, decides] = await Promise.all([
    listerAvisAModerer(),
    listerAvisDecides(),
  ]);

  return (
    <>
      <section className={styles.section} aria-labelledby="titre-a-relire">
        <h2 id="titre-a-relire" className={styles.titreSection}>
          À relire ({aModerer.length})
        </h2>

        {aModerer.length === 0 ? (
          <p className={styles.vide}>Aucun avis n&apos;attend de relecture.</p>
        ) : (
          <ul className={styles.liste}>
            {aModerer.map((avis) => (
              <li key={avis.id} className={styles.carte}>
                <CarteAvis avis={avis} />
                <DecisionAvis avisId={avis.id} dejaPublie={false} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="titre-decides">
        <h2 id="titre-decides" className={styles.titreSection}>
          Décisions prises ({decides.length})
        </h2>

        {decides.length === 0 ? (
          <p className={styles.vide}>
            Aucune décision prise pour l&apos;instant.
          </p>
        ) : (
          <ul className={styles.liste}>
            {decides.map((avis) => (
              <li key={avis.id} className={styles.carte}>
                <CarteAvis avis={avis} />

                {avis.motifDecision !== null && (
                  <p className={styles.motif}>
                    <strong>Motif :</strong> {avis.motifDecision}
                  </p>
                )}

                {/*
                 * UN AVIS PUBLIE PEUT ETRE RETIRE, regle R6 : il n'est jamais
                 * supprime, il change de statut avec son motif. Un avis deja
                 * refuse ou retire n'affiche aucun bouton, la decision etant
                 * prise et le rejouer n'ayant aucun sens.
                 */}
                {avis.statut === "PUBLIE" && (
                  <DecisionAvis avisId={avis.id} dejaPublie />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** L'avis lui-meme, commun aux deux listes. */
function CarteAvis({ avis }: { avis: AvisAModerer }) {
  return (
    <>
      <div className={styles.enTeteCarte}>
        <span className={styles.note}>{avis.note} sur 5</span>
        <span
          className={`${styles.badge} ${
            avis.statut === "PUBLIE" ? styles.badgePublie : ""
          }`}
        >
          {LIBELLES[avis.statut]}
        </span>
      </div>

      <p className={styles.piece}>
        {avis.libelleProduitFige} ({avis.libelleVarianteFige})
      </p>

      {/*
       * LES DEUX DATES SONT AFFICHEES, article D111-10 1°. La date de
       * l'EXPERIENCE vient de la remise du colis, celle du DEPOT de l'ecriture
       * de l'avis : les confondre afficherait une information fausse cote
       * public, et l'ecran de moderation est l'endroit ou l'ecart se verifie.
       */}
      <p className={styles.metadonnees}>
        Commande {avis.numeroCommande}. Expérience du{" "}
        {formaterDate(avis.experienceA)}, déposé le {formaterDate(avis.deposeA)}
        {avis.publieA !== null && (
          <> , publié le {formaterDate(avis.publieA)}</>
        )}
        {avis.modifieA !== null && (
          <> , modifié le {formaterDate(avis.modifieA)}</>
        )}
        .
      </p>

      {avis.commentaire === null ? (
        <p className={styles.sansCommentaire}>Note seule, sans commentaire.</p>
      ) : (
        <p className={styles.commentaire}>{avis.commentaire}</p>
      )}
    </>
  );
}
