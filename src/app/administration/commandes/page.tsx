/**
 * Liste des commandes, LS-121. Etapes 10 a 12 du parcours 1.
 *
 * COMPOSANT SERVEUR : il exige le role, lit la base et rend. Aucune interaction
 * ici, la liste n'etant que de la lecture ; le detail porte les actions.
 *
 * `exigerAdministratrice` EST APPELE AVANT TOUT RENDU, motif pose par LS-70. La
 * page ET chaque Server Action portent la garde : proteger la page seule
 * laisserait ouvert l'appel direct a une action, defaut trouve en LS-89.
 */
import { Suspense } from "react";

import { ChargementAdministration } from "@/components/chargement-administration";

import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { StatutCommande } from "@/generated/prisma/enums";
import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import { listerCommandes } from "@/services/administration-commandes";
import { formaterMontant } from "@/lib/montant";
import { formaterDate, LIBELLES_STATUT } from "@/lib/affichage-commande";
import styles from "./commandes.module.css";

export const metadata = {
  title: "Commandes",
  robots: { index: false, follow: false },
};

/**
 * La page lit la base a chaque affichage.
 *
 * UNE LISTE DE COMMANDES MISE EN CACHE EST TROMPEUSE : un paiement confirme
 * pendant que l'ecran est ouvert doit se voir au rafraichissement, sans quoi
 * l'exploitante prepare un colis pour une commande annulee, ou l'inverse.
 */
export const dynamic = "force-dynamic";

/** Les filtres proposes, dans l'ordre du cycle de vie d'une commande. */
const FILTRES: { valeur: StatutCommande | "TOUTES"; libelle: string }[] = [
  { valeur: "TOUTES", libelle: "Toutes" },
  { valeur: "EN_ATTENTE_PAIEMENT", libelle: "En attente de paiement" },
  { valeur: "CONFIRMEE", libelle: "Confirmées" },
  { valeur: "EN_PREPARATION", libelle: "En préparation" },
  { valeur: "EXPEDIEE", libelle: "Expédiées" },
  { valeur: "LIVREE", libelle: "Livrées" },
  { valeur: "ANNULEE", libelle: "Annulées" },
];

export default async function PageCommandes({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
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

  /*
   * LE FILTRE VIENT DE L'URL, DONC IL N'EST PAS FIABLE, invariant 7. Il est
   * confronte a la liste connue plutot que passe tel quel : une valeur
   * inattendue affiche toutes les commandes, ce qui est le repli le moins
   * surprenant, et n'atteint jamais la requete.
   */
  const filtreDemande = FILTRES.find(
    (filtre) => filtre.valeur === parametres.statut,
  );
  const filtreActif = filtreDemande?.valeur ?? "TOUTES";

  return (
    <main className={styles.page}>
      <h1 className={styles.titre}>Commandes</h1>
      <p className={styles.introduction}>
        Les commandes en attente de paiement sont visibles : leur accumulation
        soudaine signale une panne du paiement.
      </p>

      <nav aria-label="Filtrer par statut" className={styles.filtres}>
        <ul className={styles.listeFiltres}>
          {FILTRES.map((filtre) => (
            <li key={filtre.valeur}>
              <Link
                href={
                  filtre.valeur === "TOUTES"
                    ? "/administration/commandes"
                    : `/administration/commandes?statut=${filtre.valeur}`
                }
                className={styles.filtre}
                aria-current={
                  filtre.valeur === filtreActif ? "page" : undefined
                }
              >
                {filtre.libelle}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Suspense fallback={<ChargementCommandes />}>
        <ListeCommandes filtreActif={filtreActif} />
      </Suspense>
    </main>
  );
}

/**
 * Armature affichee pendant que la liste arrive, LS-188.
 */
function ChargementCommandes() {
  return (
    <ChargementAdministration annonce="Chargement des commandes…" lignes={5} />
  );
}

/**
 * La liste elle-meme, seule partie de cet ecran qui lit la base.
 *
 * ------------------------------------------------------------------
 * POURQUOI UN `<Suspense>` INTERNE ET NON UN `loading.tsx`, ALORS QUE CETTE
 * PAGE N'APPELLE PAS `notFound()`.
 *
 * Un `loading.tsx` pose ici sa frontiere sur le segment `commandes/`, donc AUSSI
 * sur `commandes/[id]` un dossier plus bas, qui appelle `notFound()` deux fois :
 * son 404 devenait un 200.
 *
 * C32 S'APPLIQUE A UN SEGMENT DES QU'UN DESCENDANT appelle `notFound()`, et pas
 * seulement quand la page du segment le fait elle-meme. Mesure du 5 septembre
 * 2026, LS-188 : 404 hors du sous-arbre couvert, 200 dedans.
 *
 * NE PAS RETABLIR `commandes/loading.tsx`.
 * ------------------------------------------------------------------
 */
async function ListeCommandes({
  filtreActif,
}: {
  filtreActif: StatutCommande | "TOUTES";
}) {
  const commandes = await listerCommandes(
    filtreActif === "TOUTES" ? {} : { statut: filtreActif },
  );

  return (
    <>
      {commandes.length === 0 ? (
        /*
         * L'ETAT VIDE EST UN ETAT, pas un incident : il dit ce qui manque et
         * pourquoi, plutot que de laisser une page blanche que l'exploitante
         * prendrait pour une panne.
         */
        <p className={styles.vide}>
          {filtreActif === "TOUTES"
            ? "Aucune commande pour le moment."
            : "Aucune commande dans cet état."}
        </p>
      ) : (
        <ul className={styles.listeCommandes}>
          {commandes.map((commande) => (
            <li key={commande.id} className={styles.carte}>
              <div className={styles.enTeteCarte}>
                <Link
                  href={`/administration/commandes/${commande.id}`}
                  className={styles.numero}
                >
                  {commande.numero}
                </Link>
                <span
                  className={`${styles.badge} ${styles[`badge${commande.statut}`] ?? ""}`}
                >
                  {LIBELLES_STATUT[commande.statut]}
                </span>
              </div>

              <p className={styles.client}>{commande.nomClient}</p>

              <dl className={styles.details}>
                <div className={styles.detail}>
                  <dt>Total</dt>
                  <dd>{formaterMontant(commande.totalCentimes)}</dd>
                </div>
                <div className={styles.detail}>
                  <dt>Passée le</dt>
                  <dd>{formaterDate(commande.creeA)}</dd>
                </div>
                <div className={styles.detail}>
                  <dt>Paiement</dt>
                  {/*
                   * L'ENCAISSEMENT EST UN AXE DISTINCT DU STATUT, et l'ecran le
                   * montre separement : entre l'evenement signe et la mise a
                   * jour du statut existe une fenetre ou une commande est
                   * encaissee sans etre encore confirmee.
                   */}
                  <dd>{commande.encaissee ? "Encaissé" : "Non encaissé"}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
