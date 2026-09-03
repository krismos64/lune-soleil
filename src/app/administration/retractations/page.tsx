/**
 * Rubrique Retractations de l'administration, LS-135. Parcours 5, etapes 6 a 9.
 *
 * COMPOSANT SERVEUR : il exige le role, lit la base et rend. Les gestes vivent
 * dans `traitement-demande.tsx`, marque client, qui ne requete rien.
 *
 * `exigerAdministratrice` EST APPELE AVANT TOUT RENDU, et les cinq Server
 * Actions portent la MEME garde : proteger la page seule laisserait ouvert
 * l'appel direct, defaut de LS-89.
 *
 * L'ECRAN EXISTE PARCE QU'UNE DEMANDE DEPOSEE N'ETAIT VISIBLE PAR PERSONNE.
 * LS-134 a livre la face client, declaration et accuse de reception, sans
 * qu'aucun ecran ne permette de la traiter : les demandes s'accumulaient en
 * base pendant que le delai de remboursement de l'article L221-24 courait.
 *
 * L'ORDRE EST LE PLUS ANCIEN D'ABORD, inverse de celui des messages. Une
 * retractation porte un DELAI LEGAL, donc la plus ancienne est la plus urgente,
 * quand un message recent est le plus interessant.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";

import type { StatutRetractation } from "@/generated/prisma/enums";
import { formaterDate } from "@/lib/affichage-commande";
import { formaterMontant } from "@/lib/montant";
import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import {
  LIMITE_LISTE_DEMANDES,
  listerDemandesRetractation,
} from "@/services/traitement-retractation";
import { TraitementDemande } from "./traitement-demande";
import styles from "./retractations.module.css";

export const metadata = {
  title: "Rétractations, administration",
  robots: { index: false, follow: false },
};

/**
 * La page lit la base a chaque affichage.
 *
 * UNE LISTE MISE EN CACHE EST TROMPEUSE ICI PLUS QU'AILLEURS : une demande
 * deposee pendant que l'ecran est ouvert doit se voir au rafraichissement, et
 * un remboursement parti depuis un autre onglet ne doit pas reapparaitre comme
 * a traiter.
 */
export const dynamic = "force-dynamic";

/**
 * Libelle affichable d'un statut, jamais la valeur brute de l'enum.
 *
 * LA TABLE EST EXHAUSTIVE PAR SON TYPE. `Record<string, string>` compilerait
 * sans rien garantir : une valeur ajoutee a l'enum afficherait
 * `REMBOURSEMENT_EN_COURS` en majuscules a l'exploitante, sans qu'aucun
 * controle ne rougisse. Motif « un enum ajoute casse l'affichage », deja
 * rencontre sur les messages et les commandes.
 *
 * ELLE EST TYPEE SUR L'ENUM PRISMA et non sur une liste locale : `tsc` refuse
 * le fichier tant qu'un libelle manque.
 */
const LIBELLES: Record<StatutRetractation, string> = {
  DEPOSEE: "Déposée",
  ACCUSEE: "Accusée",
  RETOUR_ATTENDU: "Retour attendu",
  EXPEDITION_PROUVEE: "Expédition prouvée",
  REMBOURSEMENT_EN_COURS: "Remboursement en cours",
  REMBOURSEE: "Remboursée",
  REFUSEE: "Refusée",
};

export default async function PageRetractations() {
  const enTetes = await headers();

  try {
    await exigerAdministratrice(enTetes);
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      redirect("/administration/connexion");
    }
    throw erreur;
  }

  const { demandes, tronquee } = await listerDemandesRetractation();

  /*
   * LES DEMANDES A TRAITER SONT COMPTEES A PART. Une demande remboursee ou
   * refusee reste affichee, la trace important pour un litige, mais elle ne
   * demande plus rien : les confondre dans un compte unique ferait lire
   * « 12 demandes » a qui n'en a que deux a traiter.
   */
  const aTraiter = demandes.filter(
    (demande) =>
      demande.statut !== "REMBOURSEE" && demande.statut !== "REFUSEE",
  ).length;

  /*
   * LA REFERENCE DE DEMANDE EST ENGENDREE ICI, UNE FOIS PAR RENDU DE PAGE, et
   * c'est le coeur de la protection contre le double remboursement, LS-160 et
   * ADR-032. Deux clics l'envoient a l'identique, donc le second sort en « deja
   * demande » sans appeler le prestataire.
   *
   * NE PAS L'ENGENDRER DANS LE COMPOSANT CLIENT. Un `crypto.randomUUID()` cote
   * navigateur changerait a chaque remontage, et un rafraichissement produirait
   * une reference neuve pour la MEME intention : le second envoi partirait
   * reellement. Le defaut a coute 4000 centimes rendus pour 2000 le
   * 1er septembre 2026.
   *
   * UNE REFERENCE PAR DEMANDE, jamais une pour la page : deux retractations
   * distinctes sont deux intentions distinctes, et les faire partager une
   * reference ferait avaler la seconde par l'idempotence du prestataire.
   */
  const references = new Map(
    demandes.map((demande) => [demande.id, randomUUID()]),
  );

  return (
    <main className={styles.page}>
      <h1 className={styles.titre}>Rétractations</h1>

      <p className={styles.introduction}>
        {demandes.length === 0
          ? "Aucune demande de rétractation."
          : `${demandes.length} demande${demandes.length > 1 ? "s" : ""}, dont ${aTraiter} à traiter.`}
      </p>

      {tronquee ? (
        /*
         * LE PLAFOND EST DIT, motif de LS-163 : une liste qui tronque en
         * silence fait afficher un compte faux, et l'exploitante croit avoir
         * tout traite alors que des demandes plus recentes sont invisibles.
         */
        <p className={styles.avertissement} role="status">
          Seules les {LIMITE_LISTE_DEMANDES} demandes les plus anciennes sont
          affichées. D&apos;autres existent au-delà.
        </p>
      ) : null}

      {demandes.length === 0 ? (
        /*
         * L'ETAT VIDE DIT POURQUOI ET NON SEULEMENT QU'IL EST VIDE : aucune
         * rétractation est le cas normal la plupart du temps, et sans cette
         * phrase l'écran se lit comme cassé.
         */
        <p className={styles.vide}>
          Les demandes déposées depuis le site arrivent ici. Le remboursement
          est dû dès que le colis revient ou que le client fournit une preuve
          d&apos;expédition, au premier des deux.
        </p>
      ) : (
        <ul className={styles.liste}>
          {demandes.map((demande) => (
            <li key={demande.id} className={styles.carte}>
              <div className={styles.enTeteCarte}>
                <span
                  className={`${styles.badge} ${styles[`badge${demande.statut}`] ?? ""}`}
                >
                  {/*
                   * AUCUN REPLI `?? demande.statut` : il masquerait le trou au
                   * lieu de le signaler, en affichant une valeur brute d'enum a
                   * l'exploitante. Le libelle est garanti par `tsc`.
                   *
                   * LA CLASSE DE BADGE GARDE SON REPLI, elle : les modules CSS
                   * sont types `Record<string, string>` par le chargeur, donc
                   * `tsc` ne peut rien garantir de ce cote.
                   */}
                  {LIBELLES[demande.statut]}
                </span>
                <span className={styles.date}>
                  Déposée le {formaterDate(demande.deposeeA)}
                </span>
              </div>

              <h2 className={styles.commande}>
                Commande {demande.numeroCommande}
              </h2>

              <p className={styles.client}>
                {demande.nomClient}
                {" · "}
                {formaterMontant(demande.totalCentimes)}
              </p>

              {/*
               * LES DEUX FAITS DE L'ARTICLE L221-24 SONT AFFICHES COTE A COTE,
               * et jamais comme une progression : ils sont INDEPENDANTS, le
               * remboursement etant du au premier qui survient. Les presenter
               * en etapes numerotees suggererait qu'il faut attendre les deux.
               */}
              <dl className={styles.faits}>
                <div className={styles.fait}>
                  <dt className={styles.faitTitre}>Preuve d&apos;expédition</dt>
                  <dd className={styles.faitValeur}>
                    {demande.preuveExpeditionA === null
                      ? "Non fournie"
                      : `${demande.preuveExpeditionRetour ?? ""} le ${formaterDate(demande.preuveExpeditionA)}`}
                  </dd>
                </div>
                <div className={styles.fait}>
                  <dt className={styles.faitTitre}>Colis reçu</dt>
                  <dd className={styles.faitValeur}>
                    {demande.recueA === null
                      ? "Pas encore"
                      : formaterDate(demande.recueA)}
                  </dd>
                </div>
              </dl>

              {demande.motifClient === null ? null : (
                <details className={styles.detail}>
                  <summary className={styles.resume}>
                    Motif indiqué par le client
                  </summary>
                  <p className={styles.corps}>{demande.motifClient}</p>
                </details>
              )}

              {demande.motifDecision === null ? null : (
                <p className={styles.motifDecision}>
                  Motif du refus : {demande.motifDecision}
                </p>
              )}

              {demande.montantRembourseCentimes === null ? null : (
                <p className={styles.rembourse}>
                  Remboursé :{" "}
                  {formaterMontant(demande.montantRembourseCentimes)}
                </p>
              )}

              <TraitementDemande
                demandeId={demande.id}
                statut={demande.statut}
                colisRecu={demande.recueA !== null}
                preuveFournie={demande.preuveExpeditionA !== null}
                montantDuCentimes={demande.totalCentimes}
                referenceDemande={references.get(demande.id) ?? ""}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
