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

  /*
   * L'ABSENCE DE LIGNE NE FAIT PAS TOMBER L'ECRAN, et c'est delibere. La
   * migration l'amorce, ADR-043 : une ligne manquante signale une base
   * restauree avant cette migration. Rendre 500 laisserait l'exploitante sans
   * moyen de comprendre, alors que le message nomme la cause.
   */
  let parametres = null;

  try {
    parametres = await lireParametresBoutique();
  } catch (erreur) {
    if (!(erreur instanceof ParametresAbsentsError)) {
      throw erreur;
    }
  }

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Paramètres</h1>

      {parametres === null ? (
        <p className={styles.manquant}>
          Aucun paramètre n&apos;est enregistré pour cette boutique. Cela
          signale une base restaurée avant la migration qui les amorce. Rejouer
          les migrations rétablit les valeurs de référence.
        </p>
      ) : (
        <>
          <p className={styles.introduction}>
            Ces valeurs s&apos;appliquent aux commandes <strong>à venir</strong>
            . Une commande déjà passée garde le tarif qu&apos;elle portait, et
            un changement ne la réécrit jamais.
          </p>

          <FormulaireParametres parametres={parametres} />

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
    </main>
  );
}
