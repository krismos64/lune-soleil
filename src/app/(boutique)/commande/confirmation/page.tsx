/**
 * Page de confirmation et d'attente de paiement, LS-117 puis LS-118. Etapes 5
 * et 6 du parcours 1.
 *
 * ELLE DIT CE QUE LA BASE SAIT, JAMAIS CE QUE LE NAVIGATEUR PRETEND,
 * invariant 5 : le retour du prestataire ne prouve rien, seul l'evenement signe
 * de LS-119 confirmera. Tant qu'il n'est pas arrive, cette page annonce une
 * commande enregistree et un paiement en cours de verification, jamais une
 * commande confirmee. Le parametre `retour` ne choisit que des FORMULATIONS,
 * toutes non affirmatives : il vient de l'URL et ne prouve rien non plus.
 *
 * LE DROIT DE LECTURE VIENT DU COOKIE SIGNE, invariant 2 : sans lui, la page
 * n'affiche aucune donnee de commande. Le numero d'URL, lui, est AFFICHE et
 * n'autorise rien, comme depuis LS-117.
 *
 * PAS DE `loading.tsx` SUR CETTE ROUTE, piege documente par LS-125 : le
 * streaming commencerait avant un futur `notFound()`, le statut resterait 200
 * et un brouillon deviendrait indexable. Les etats de chargement et d'erreur
 * appartiennent a LS-125, APRES que cette story a rendu la page dynamique.
 */
import Link from "next/link";
import { cookies } from "next/headers";

import {
  NOM_COOKIE_COMMANDE,
  decoderCommandeEnCours,
} from "@/lib/commande-cookie";
import {
  lireEtatCommande,
  type EtatCommandeEnCours,
} from "@/services/paiement";
import styles from "../commande.module.css";
import { FocusTitre } from "./focus-titre";
import { BoutonPayer } from "./bouton-payer";

export const metadata = {
  title: "Votre commande, Lune & Soleil",
  description: "État de votre commande et de son paiement.",
  // La page depend d'un cookie et d'un parametre d'URL, rien d'indexable.
  robots: { index: false, follow: false },
};

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametres = await searchParams;
  const brut = parametres.retour;
  const retour = Array.isArray(brut) ? brut[0] : brut;

  const magasin = await cookies();
  const commande = decoderCommandeEnCours(
    magasin.get(NOM_COOKIE_COMMANDE)?.value,
  );
  const etat =
    commande === null ? null : await lireEtatCommande(commande.commandeId);

  return (
    /*
     * `id="contenu"` ET `tabIndex={-1}`, comme les sept autres pages de la
     * boutique : cible du lien d'evitement, fiche memoire du meme nom.
     */
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <FocusTitre cible="contenu" />

      {etat === null ? (
        <SansCommande numeroUrl={lireNumeroUrl(parametres)} />
      ) : (
        <EtatCommande etat={etat} retour={retour} />
      )}
    </main>
  );
}

/** Le numero d'URL, AFFICHE et jamais utilise pour lire quoi que ce soit. */
function lireNumeroUrl(
  parametres: Record<string, string | string[] | undefined>,
): string | undefined {
  const brut = parametres.numero;
  const numero = Array.isArray(brut) ? brut[0] : brut;

  return numero === "" ? undefined : numero;
}

/**
 * Sans cookie valide : rien n'est consultable, et la page le dit sans jargon.
 *
 * LE CAS N'EST PAS RARE : cookie expire au-dela d'une heure, autre navigateur,
 * lien partage. Aucune donnee de commande n'est affichee, seul le numero que
 * l'URL portait deja, invariant 2.
 */
function SansCommande({ numeroUrl }: { numeroUrl: string | undefined }) {
  return (
    <>
      <h1 className={styles.titre}>Votre commande est enregistrée</h1>

      {numeroUrl !== undefined && (
        <p className={styles.donnee}>
          Numéro de commande : <strong>{numeroUrl}</strong>
        </p>
      )}

      <p className={styles.aide}>
        Le détail de la commande n&apos;est consultable que depuis le navigateur
        qui l&apos;a passée, pendant l&apos;heure qui suit. Pour toute question,
        écrivez-nous en indiquant votre numéro de commande.
      </p>

      <Link href="/catalogue" className={styles.retourPanier}>
        Retourner au catalogue
      </Link>
    </>
  );
}

/** L'etat reel de la commande, lu en base, et les mots qui vont avec. */
function EtatCommande({
  etat,
  retour,
}: {
  etat: EtatCommandeEnCours;
  retour: string | undefined;
}) {
  /*
   * ENCAISSEE VAUT CONFIRMATION, et c'est la SEULE source qui y a droit : ce
   * drapeau vient de la base, ecrit par l'evenement signe de LS-119, jamais du
   * retour navigateur.
   */
  if (etat.encaissee) {
    return (
      <>
        <h1 className={styles.titre}>Paiement enregistré</h1>
        <p className={styles.donnee}>
          Commande : <strong>{etat.numero}</strong>
        </p>
        <p className={styles.aide}>
          Votre paiement est enregistré et votre commande est confirmée.
        </p>
        <Link href="/catalogue" className={styles.retourPanier}>
          Retourner au catalogue
        </Link>
      </>
    );
  }

  if (etat.statut === "ANNULEE") {
    return (
      <>
        <h1 className={styles.titre}>Commande annulée</h1>
        <p className={styles.donnee}>
          Commande : <strong>{etat.numero}</strong>
        </p>
        <p className={styles.aide}>
          La réservation de vos pièces a expiré et cette commande a été annulée.
          Aucun paiement n&apos;a été enregistré. Vous pouvez repasser commande
          depuis le catalogue.
        </p>
        <Link href="/catalogue" className={styles.retourPanier}>
          Retourner au catalogue
        </Link>
      </>
    );
  }

  /*
   * RETOUR DU PRESTATAIRE APRES PAIEMENT : attente explicite, prototype
   * « paiement en verification ». PAS DE BOUTON DE PAIEMENT ICI : le proposer a
   * quelqu'un qui vient de payer, c'est l'inviter au double encaissement
   * qu'ADR-032 previent.
   */
  if (retour === "paiement") {
    return (
      <>
        <h1 className={styles.titre}>Paiement en cours de vérification</h1>
        <p className={styles.donnee}>
          Commande : <strong>{etat.numero}</strong>
        </p>
        <p className={styles.aide}>
          Nous vérifions votre paiement auprès de notre prestataire. Votre
          retour sur cette page ne vaut pas confirmation : celle-ci vient de
          cette vérification, dans quelques instants. Inutile de payer à nouveau
          ni de relancer la page.
        </p>
        <Link href="/catalogue" className={styles.retourPanier}>
          Retourner au catalogue
        </Link>
      </>
    );
  }

  let explication =
    "Son paiement n'est pas encore effectué. Vos pièces restent réservées trente minutes.";

  if (retour === "abandon") {
    explication =
      "Le paiement n'a pas été effectué. Vos pièces restent réservées trente minutes à compter de la dernière tentative : vous pouvez payer maintenant, ou laisser la réservation expirer sans frais.";
  } else if (retour === "indisponible") {
    explication =
      "Le paiement est momentanément indisponible. Votre commande est conservée et vos pièces restent réservées : réessayez dans quelques instants.";
  }

  return (
    <>
      <h1 className={styles.titre}>Votre commande est enregistrée</h1>
      <p className={styles.donnee}>
        Commande : <strong>{etat.numero}</strong>
      </p>
      <p className={styles.aide}>{explication}</p>

      <BoutonPayer
        libelle={
          retour === "abandon" || retour === "indisponible"
            ? "Réessayer le paiement"
            : "Payer ma commande"
        }
      />

      <Link href="/catalogue" className={styles.retourPanier}>
        Retourner au catalogue
      </Link>
    </>
  );
}
