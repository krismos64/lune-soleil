/**
 * Historique des commandes du client. LS-57, critere 1.
 *
 * COMPOSANT SERVEUR, `exigerSession` appele AVANT tout rendu, motif pose par
 * LS-70. Pas de middleware : celui de Next.js s'execute sur la peripherie et ne
 * peut pas relire la session en base, il ne verrait que la presence d'un cookie.
 *
 * PAS DE ROLE EXIGE, comme `/compte` : cette page sert les CLIENTS, et
 * l'administratrice est aussi titulaire d'un compte. Chacun ne voit que ses
 * propres commandes, l'identite venant de la session et jamais d'un parametre.
 */
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { formaterDate, LIBELLES_STATUT } from "@/lib/affichage-commande";
import { formaterMontant } from "@/lib/montant";
import { exigerSession } from "@/services/autorisation";
import { listerMesCommandes } from "@/services/espace-client-commandes";

import styles from "../compte.module.css";

export const metadata = {
  title: "Mes commandes, Lune & Soleil",
  robots: { index: false, follow: false },
};

/**
 * La page lit la session a chaque affichage. Sans cela, Next.js pourrait servir
 * un rendu mis en cache, donc l'historique d'une personne a une autre.
 */
export const dynamic = "force-dynamic";

export default async function PageMesCommandes() {
  const identite = await exigerSession(await headers());

  if (!identite) {
    redirect("/compte/connexion");
  }

  const commandes = await listerMesCommandes(identite.utilisateurId);

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Mes commandes</h1>

      <p className={styles.texte}>
        <Link href="/compte" className={styles.lien}>
          Retour à mon compte
        </Link>
      </p>

      {commandes.length === 0 ? (
        /*
         * L'ETAT VIDE DIT CE QU'IL FAUT FAIRE, jamais seulement « rien ». Une
         * commande passee sans compte n'apparait pas ici tant qu'elle n'est pas
         * rattachee, LS-56 : le texte le rappelle plutot que de laisser croire
         * a une perte.
         */
        <section className={styles.section} aria-labelledby="titre-vide">
          <h2 id="titre-vide">Aucune commande pour le moment</h2>
          <p className={styles.texte}>
            Les commandes passées avec ce compte apparaîtront ici. Si vous avez
            commandé sans être connecté, rattachez vos commandes depuis{" "}
            <Link href="/compte" className={styles.lien}>
              votre compte
            </Link>
            .
          </p>
        </section>
      ) : (
        <ul className={styles.commandes}>
          {commandes.map((commande) => (
            <li key={commande.id} className={styles.commande}>
              {/*
               * LE LIEN PORTE LE NUMERO, pas « voir le detail » : un lecteur
               * d'ecran qui parcourt les liens d'une page entend alors des
               * intitules distincts, et non dix fois le meme.
               */}
              <Link
                href={`/compte/commandes/${commande.id}`}
                className={styles.lienCommande}
              >
                Commande {commande.numero}
              </Link>
              <dl className={styles.liste}>
                <div className={styles.ligne}>
                  <dt>Date</dt>
                  <dd>{formaterDate(commande.creeA)}</dd>
                </div>
                <div className={styles.ligne}>
                  <dt>Statut</dt>
                  <dd>{LIBELLES_STATUT[commande.statut]}</dd>
                </div>
                <div className={styles.ligne}>
                  <dt>Total</dt>
                  {/*
                   * `formaterMontant` EST LE SEUL ENDROIT OU DES CENTIMES
                   * DEVIENNENT DES EUROS, LS-158 et invariant 1. Une division
                   * ecrite ici serait une neuvieme copie de la meme regle.
                   */}
                  <dd>{formaterMontant(commande.totalCentimes)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
