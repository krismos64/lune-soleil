/**
 * Declaration de retractation depuis l'espace client. LS-134, parcours 5.
 *
 * OBLIGATION LEGALE, article L221-21 : la fonctionnalite doit permettre
 * d'exercer GRATUITEMENT le droit de retractation, et rester accessible pendant
 * tout le delai. Un formulaire a telecharger ne suffit pas.
 *
 * L'ETAT EST LU AVANT D'AFFICHER LE FORMULAIRE, arbitrage du 3 septembre 2026 :
 * une demande hors delai s'explique sur un ecran d'information plutot que de se
 * faire refuser apres saisie. Le client comprend pourquoi au lieu de buter sur
 * un refus une fois son texte ecrit.
 *
 * `notFound()` ET NON UNE PAGE DE REFUS, comme le detail de commande : un
 * « acces refuse » revelerait que la commande existe.
 *
 * AUCUN `loading.tsx` DANS CE SEGMENT, regle C32 : il envelopperait la page
 * dans une frontiere Suspense, le streaming commencerait avant `notFound()`, et
 * Next.js laisserait un 200 sur une commande inexistante.
 */
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { exigerSession } from "@/services/autorisation";
import { lireEtatRetractation } from "@/services/retractation";
import { lireMaCommande } from "@/services/espace-client-commandes";

import { FormulaireRetractation } from "./formulaire-retractation";
import styles from "./retractation.module.css";

export const metadata = {
  title: "Me rétracter",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PageRetractation({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const identite = await exigerSession(await headers());

  if (identite === null) {
    redirect("/compte/connexion");
  }

  const { id } = await params;
  const commande = await lireMaCommande(id, identite.utilisateurId);

  if (commande === null) {
    notFound();
  }

  const etat = await lireEtatRetractation({
    voie: "SESSION",
    utilisateurId: identite.utilisateurId,
    commandeId: id,
  });

  const retour = (
    <Link href={`/compte/commandes/${id}`} className={styles.retour}>
      Retour au détail de la commande
    </Link>
  );

  if (etat.statut === "INDISPONIBLE") {
    notFound();
  }

  if (etat.statut === "DEJA_DEPOSEE") {
    return (
      <main id="contenu" tabIndex={-1} className={styles.page}>
        <h1 className={styles.titre}>Me rétracter</h1>
        <div className={styles.information}>
          <p>
            Une demande de rétractation a déjà été enregistrée pour cette
            commande.
          </p>
          <p>
            Un accusé de réception vous a été adressé par email. Écrivez-nous
            depuis la page Contact si vous avez une question sur son avancement.
          </p>
        </div>
        {retour}
      </main>
    );
  }

  /*
   * LE DELAI EXPIRE S'EXPLIQUE, IL NE SE TAIT PAS. L'article L221-20 sanctionne
   * l'information incorrecte sur ce droit : dire la date exacte et proposer le
   * contact vaut mieux qu'une page absente, qui laisserait le client sans
   * reponse sur un droit qu'il croit avoir.
   */
  if (etat.statut === "EXPIREE") {
    return (
      <main id="contenu" tabIndex={-1} className={styles.page}>
        <h1 className={styles.titre}>Me rétracter</h1>
        <div className={styles.information}>
          <p>
            Le délai de rétractation de cette commande s&apos;est terminé le{" "}
            {etat.jourLimite}.
          </p>
          <p>
            Ce délai est de 14 jours à compter de la réception de votre
            commande, article L221-18 du Code de la consommation.
          </p>
          <p>
            Si votre situation vous semble particulière, écrivez-nous depuis la
            page{" "}
            <Link href="/contact" className={styles.lien}>
              Contact
            </Link>
            , nous la regarderons.
          </p>
        </div>
        {retour}
      </main>
    );
  }

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Me rétracter</h1>

      <FormulaireRetractation
        commandeId={id}
        numero={commande.numero}
        jourLimite={etat.statut === "OUVERTE" ? etat.jourLimite : null}
      />

      {retour}
    </main>
  );
}
