/**
 * Retractation par lien signe, SANS COMPTE. LS-134, article L221-21.
 *
 * QUI L'APPELLE : le client qui a achete sans creer de compte, depuis le lien
 * recu par email. Ce qui protege cette page n'est ni son chemin ni l'identifiant
 * qu'elle porte, c'est la SIGNATURE du jeton, verifiee cote serveur,
 * invariant 2.
 *
 * POURQUOI ELLE EXISTE, ET LE DEFAUT QU'ELLE CORRIGE. La revue critique du
 * 3 septembre 2026 a montre que l'ecran de `/compte` ne couvre QUE les clients
 * ayant un compte : un acheteur sans compte n'avait aucune fonctionnalite en
 * ligne pour se retracter, ce qui est le manquement meme a l'article L221-21
 * que cette story doit fermer, avec les douze mois de L221-20 en face.
 *
 * CE QU'ELLE NE DECIDE PAS : aucune regle n'est ecrite ici. Elle lit le jeton,
 * delegue a `services/retractation.ts` et traduit l'issue en ecran.
 *
 * `notFound()` SUR TOUT REFUS D'ACCES, jamais une page de refus : un « acces
 * refuse » revelerait qu'une commande existe. Meme regle que la route de
 * facture, qui rend 404 et non 403.
 *
 * AUCUN `loading.tsx` DANS CE SEGMENT, regle C32 : il envelopperait la page
 * dans une frontiere Suspense, le streaming commencerait avant `notFound()`, et
 * Next.js laisserait un 200 sur un jeton invalide.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { lireEtatRetractation } from "@/services/retractation";

import { FormulaireRetractationJeton } from "./formulaire-jeton";
import styles from "../../compte/commandes/[id]/retractation/retractation.module.css";

export const metadata = {
  title: "Me rétracter, Lune & Soleil",
  robots: { index: false, follow: false },
};

/**
 * JAMAIS DE CACHE. Une reponse mise en cache servirait l'ecran apres revocation
 * ou consommation du jeton, ce qui viderait les regles L9 et L10 de leur effet.
 */
export const dynamic = "force-dynamic";

export default async function PageRetractationParJeton({
  params,
}: {
  params: Promise<{ jeton: string }>;
}) {
  const { jeton } = await params;

  const etat = await lireEtatRetractation({
    voie: "JETON",
    valeurJeton: jeton,
  });

  if (etat.statut === "INDISPONIBLE") {
    notFound();
  }

  const aide = (
    <p>
      Une question ? Écrivez-nous depuis la page{" "}
      <Link href="/contact" className={styles.lien}>
        Contact
      </Link>
      .
    </p>
  );

  if (etat.statut === "DEJA_DEPOSEE") {
    return (
      <main id="contenu" tabIndex={-1} className={styles.page}>
        <h1 className={styles.titre}>Me rétracter</h1>
        <div className={styles.information}>
          <p>
            Une demande de rétractation a déjà été enregistrée pour cette
            commande.
          </p>
          {aide}
        </div>
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
          {aide}
        </div>
      </main>
    );
  }

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Me rétracter</h1>

      <FormulaireRetractationJeton
        jeton={jeton}
        jourLimite={etat.statut === "OUVERTE" ? etat.jourLimite : null}
      />
    </main>
  );
}
