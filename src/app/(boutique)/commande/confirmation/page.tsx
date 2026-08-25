/**
 * Commande enregistree, LS-117. Fin de l'etape 4 du parcours 1.
 *
 * CETTE PAGE N'EST PAS LA CONFIRMATION DE PAIEMENT, et le texte le dit
 * franchement. La commande existe en `EN_ATTENTE_PAIEMENT`, son stock est
 * reserve trente minutes, et rien n'est paye : la session de paiement se cree
 * APRES le commit, LS-118 et etape 5, ADR-024.
 *
 * Annoncer « merci pour votre achat » ici serait faux, et l'information
 * precontractuelle interdit d'affirmer une transaction qui n'a pas eu lieu.
 *
 * LE NUMERO VIENT DE L'URL, DONC DU NAVIGATEUR : il est AFFICHE et n'autorise
 * rien, invariant 2. Aucune donnee de commande n'est lue avec lui, precisement
 * pour qu'un numero devine ne revele rien. L'acces a la commande elle-meme
 * passera par un jeton signe, LS-57 et LS-118.
 */
import Link from "next/link";

import styles from "../commande.module.css";

export const metadata = {
  title: "Commande enregistrée, Lune & Soleil",
  description: "Votre commande est enregistrée, le paiement suit.",
  // La page n'a aucun contenu indexable et depend d'un parametre d'URL.
  robots: { index: false, follow: false },
};

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametres = await searchParams;
  const brut = parametres.numero;
  const numero = Array.isArray(brut) ? brut[0] : brut;

  return (
    <main className={styles.page}>
      <h1 className={styles.titre}>Votre commande est enregistrée</h1>

      {numero !== undefined && numero !== "" && (
        <p className={styles.donnee}>
          Numéro de commande : <strong>{numero}</strong>
        </p>
      )}

      <p className={styles.aide}>
        Les pièces de votre commande vous sont réservées pendant trente minutes.
        Le paiement en ligne sera disponible à la prochaine étape du
        développement : votre commande reste en attente de paiement jusque-là.
      </p>

      <Link href="/catalogue" className={styles.retourPanier}>
        Retourner au catalogue
      </Link>
    </main>
  );
}
