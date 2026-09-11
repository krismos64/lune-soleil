/**
 * Alertes critiques de l'exploitation, LS-98.
 *
 * ------------------------------------------------------------------
 * CET ECRAN FERME UN TROU, il n'ajoute pas une fonction.
 *
 * SEPT services levent des alertes, `confirmation.ts`,
 * `document-comptable.ts`, `webhook-paiement.ts`, `traitement-retractation.ts`,
 * `avoir.ts`, `envoi-email.ts` et `suivi-livraison.ts`. AUCUN code ne les
 * lisait avant le 11 septembre 2026.
 *
 * CE QUI SE SIGNALAIT DANS LE VIDE : `DOUBLE_ENCAISSEMENT`,
 * `MONTANT_DIVERGENT`, `FACTURE_NON_EMISE`, `ENVOI_EMAIL_BLOQUE`. Tout le
 * mecanisme existait, gravite, cible, index d'unicite et colonnes
 * d'acquittement compris : il manquait l'ecran, ce qui rendait le reste inerte.
 * ------------------------------------------------------------------
 *
 * COMPOSANT SERVEUR : il exige le role, lit la base et rend. L'interaction vit
 * dans `carte-alerte.tsx`, marque client.
 *
 * AUCUN `loading.tsx` DANS CE SEGMENT, regle C32.
 */
import { Suspense } from "react";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import {
  ALERTES_ACQUITTEES_AFFICHEES,
  type AlerteLue,
  lireAlertes,
} from "@/services/alerte";
import { ChargementAdministration } from "@/components/chargement-administration";
import { CarteAlerte } from "./carte-alerte";
import styles from "./alertes.module.css";

export const metadata = {
  title: "Alertes, administration",
  robots: { index: false, follow: false },
};

/**
 * La page lit la base a chaque affichage.
 *
 * UNE ALERTE MISE EN CACHE EST PIRE QU'AILLEURS : un incident survenu il y a
 * trente secondes doit apparaitre, et une alerte acquittee doit disparaitre de
 * la file. Un ecran fige ferait traiter deux fois le meme incident.
 */
export const dynamic = "force-dynamic";

/** Le format d'horodatage, en Europe/Paris, invariant 8. */
const FORMAT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

export default async function PageAlertes() {
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
      <h1 className={styles.titre}>Alertes</h1>

      <p className={styles.introduction}>
        Le site signale ici ce qu&apos;il ne sait pas régler seul. Acquitter une
        alerte dit qu&apos;elle a été vue et traitée : elle quitte la liste sans
        jamais être supprimée.
      </p>

      {/*
       * `<Suspense>` INTERNE ET JAMAIS UN `loading.tsx`, regle C32 : celui-ci
       * envelopperait la page entiere dans une frontiere, le streaming
       * commencerait avant que le code decide, et une lecture de base qui
       * echoue rendrait 200 avec un chargement fige au lieu d'un vrai 500.
       *
       * LA GARDE DE ROLE RESTE AU-DESSUS de cette frontiere : la redirection
       * doit pouvoir se decider avant tout envoi.
       */}
      <Suspense fallback={<ChargementAlertes />}>
        <ListesAlertes />
      </Suspense>
    </main>
  );
}

/** Armature affichee pendant que les alertes arrivent, LS-139. */
function ChargementAlertes() {
  return (
    <ChargementAdministration annonce="Chargement des alertes…" lignes={3} />
  );
}

/** Les deux files, lues en base. */
async function ListesAlertes() {
  const { ouvertes, acquittees } = await lireAlertes();

  return (
    <>
      <section className={styles.section} aria-labelledby="titre-ouvertes">
        <h2 id="titre-ouvertes" className={styles.titreSection}>
          À traiter ({ouvertes.length})
        </h2>

        {ouvertes.length === 0 ? (
          <p className={styles.vide}>
            Aucune alerte n&apos;attend de traitement.
          </p>
        ) : (
          <ul className={styles.liste}>
            {ouvertes.map((alerte) => (
              <li key={alerte.id} className={styles.carte}>
                <Detail alerte={alerte} />
                <CarteAlerte alerteId={alerte.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="titre-acquittees">
        <h2 id="titre-acquittees" className={styles.titreSection}>
          Déjà traitées ({acquittees.length})
        </h2>

        {acquittees.length === 0 ? (
          <p className={styles.vide}>
            Aucune alerte traitée pour l&apos;instant.
          </p>
        ) : (
          <>
            <ul className={styles.liste}>
              {acquittees.map((alerte) => (
                <li key={alerte.id} className={styles.carte}>
                  <Detail alerte={alerte} />
                </li>
              ))}
            </ul>

            {/*
             * LA BORNE EST DITE, jamais silencieuse. Une liste tronquee sans
             * mention laisse croire que l'historique est complet, et une alerte
             * plus ancienne paraitrait n'avoir jamais existe.
             */}
            {acquittees.length === ALERTES_ACQUITTEES_AFFICHEES && (
              <p className={styles.borne}>
                Les {ALERTES_ACQUITTEES_AFFICHEES} plus récentes sont affichées.
                Les précédentes restent enregistrées.
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}

/**
 * Le contenu d'une alerte, commun aux deux listes.
 *
 * LE TYPE TECHNIQUE EST AFFICHE, `DOUBLE_ENCAISSEMENT` et non « problème de
 * paiement ». Il sert a chercher dans les journaux et a en parler : le
 * traduire en langage courant ferait perdre le seul terme qui relie l'ecran a
 * la trace serveur.
 */
function Detail({ alerte }: { alerte: AlerteLue }) {
  return (
    <div className={styles.detail}>
      <p className={styles.enTete}>
        <span
          className={
            alerte.gravite === "CRITIQUE"
              ? styles.critique
              : styles.avertissement
          }
        >
          {alerte.gravite === "CRITIQUE" ? "Critique" : "Avertissement"}
        </span>
        <span className={styles.type}>{alerte.type}</span>
      </p>

      <p className={styles.message}>{alerte.message}</p>

      <dl className={styles.meta}>
        <div className={styles.metaLigne}>
          <dt>Signalée le</dt>
          <dd>{FORMAT.format(alerte.creeA)}</dd>
        </div>

        {alerte.idCible !== null && (
          <div className={styles.metaLigne}>
            <dt>Concerne</dt>
            <dd>
              {alerte.typeCible} {alerte.idCible}
            </dd>
          </div>
        )}

        {alerte.acquitteeA !== null && (
          <div className={styles.metaLigne}>
            <dt>Traitée le</dt>
            <dd>
              {FORMAT.format(alerte.acquitteeA)}
              {alerte.acquitteePar !== null && ` par ${alerte.acquitteePar}`}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
