/**
 * Tableau de bord de l'administration, LS-70 puis LS-181.
 *
 * CE QU'ELLE ETAIT : un `h1` et la phrase « Connexion réussie ». Elle existait
 * pour etre la PREMIERE ROUTE PROTEGEE du projet, et pour que la protection
 * soit ecrite et testee avant que du contenu sensible n'arrive derriere. Ce
 * role est rempli depuis LS-70, et LS-181 lui donne son contenu.
 *
 * LE MOTIF A REPRENDRE SUR TOUTE ROUTE D'ADMINISTRATION : appeler
 * `exigerAdministratrice` AVANT de rendre quoi que ce soit. Pas de verification
 * dans un composant enfant, pas de rendu conditionnel sur un role lu cote
 * client : le composant serveur decide, ou il n'y a pas de protection.
 *
 * Deliberement PAS de middleware. Un middleware Next.js s'execute sur la
 * peripherie et ne peut pas relire la session en base : il ne verrait que la
 * presence d'un cookie, pas sa validite ni le role. Protection reelle ici.
 *
 * CE QUE CET ECRAN NE FAIT PAS : il n'agit sur rien. Aucune Server Action, aucun
 * formulaire, aucun changement d'etat. Il oriente vers les ecrans qui agissent,
 * et c'est ce qui le rend sur : un chiffre lu ici n'autorise aucune decision,
 * c'est la liste qui fait foi. Un tableau de bord qui agirait demanderait les
 * memes gardes que les ecrans qu'il resume, dupliquees a un second endroit.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import { lireComptages } from "@/services/tableau-bord";
import { formaterMontant } from "@/lib/montant";

import styles from "./tableau-bord.module.css";

export const metadata = {
  title: "Administration, Lune & Soleil",
  robots: { index: false, follow: false },
};

/**
 * La page lit la base a chaque affichage.
 *
 * UN TABLEAU DE BORD MIS EN CACHE EST TROMPEUR, et davantage qu'une liste : sa
 * raison d'etre est de dire ce qui attend MAINTENANT. Un paiement confirme
 * pendant que l'ecran est ouvert doit apparaitre au rafraichissement, sans quoi
 * l'exploitante croit sa journee finie.
 */
export const dynamic = "force-dynamic";

/**
 * La date du jour, en toutes lettres.
 *
 * `Europe/Paris` EST EXPLICITE, jamais l'heure du serveur. Les horodatages sont
 * persistes en UTC et convertis a l'affichage seulement, invariant 8 : un
 * serveur en UTC afficherait « mardi » a 1 h du matin un mercredi parisien.
 */
function dateDuJour(): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date());
}

/** Une tuile d'indicateur, avec son filet superieur colore. */
function Tuile({
  libelle,
  valeur,
  precision,
  ton,
}: {
  libelle: string;
  valeur: string;
  precision: string;
  /**
   * `urgent` porte le filet terracotta, `recette` le vert, sinon neutre.
   *
   * `| undefined` EST EXPLICITE, `exactOptionalPropertyTypes` etant actif : le
   * point d'interrogation seul autorise l'absence de la propriete, pas sa
   * presence a `undefined`, et un appelant qui calcule le ton par une ternaire
   * passe bien `undefined` plutot que d'omettre la cle.
   */
  ton?: "urgent" | "recette" | undefined;
}) {
  const classeTon =
    ton === "urgent"
      ? styles.tuileUrgente
      : ton === "recette"
        ? styles.tuileRecette
        : "";

  return (
    <div className={`${styles.tuile} ${classeTon}`}>
      <span className={styles.tuileLibelle}>{libelle}</span>
      <span className={styles.tuileValeur}>{valeur}</span>
      <span className={styles.tuilePrecision}>{precision}</span>
    </div>
  );
}

export default async function PageAdministration() {
  try {
    await exigerAdministratrice(await headers());
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      // Redirection et non page d'erreur : sans session, la reponse utile est
      // le formulaire de connexion. Le refus ne dit pas si le compte existe.
      redirect("/administration/connexion");
    }
    throw erreur;
  }

  const comptages = await lireComptages();

  /*
   * CE QUI ATTEND UN GESTE, dans l'ordre ou l'exploitante le traite. Une entree
   * dont le compte est nul ne s'affiche pas : un panneau « a traiter » qui
   * liste quatre lignes a zero apprend qu'il n'y a rien a faire, ce que
   * l'absence de lignes dit mieux et plus vite.
   */
  const aTraiter = [
    {
      chemin: "/administration/commandes",
      /*
       * LE SINGULIER ET LE PLURIEL SONT ECRITS TOUS LES DEUX, jamais un « (s) »
       * ni un pluriel systematique. « 1 commandes à préparer » se lit comme un
       * defaut, et sur une boutique de pieces uniques le cas a un exemplaire
       * est le plus frequent : c'est la forme qu'on verra le plus souvent.
       */
      libelle: (n: number) =>
        n > 1 ? "commandes à préparer" : "commande à préparer",
      nombre: comptages.commandesAPreparer,
      action: "Ouvrir",
    },
    {
      chemin: "/administration/expeditions",
      /* « Colis » est invariable, une ternaire y donnerait deux fois le même. */
      libelle: () => "colis à expédier",
      nombre: comptages.commandesPretesAExpedier,
      action: "Préparer",
    },
    {
      chemin: "/administration/retractations",
      libelle: (n: number) =>
        n > 1 ? "rétractations en cours" : "rétractation en cours",
      nombre: comptages.retractationsEnCours,
      action: "Traiter",
    },
    {
      chemin: "/administration/messages",
      libelle: (n: number) => (n > 1 ? "messages non lus" : "message non lu"),
      nombre: comptages.messagesNonLus,
      action: "Lire",
    },
    {
      chemin: "/administration/stocks",
      libelle: (n: number) =>
        n > 1 ? "variantes en stock faible" : "variante en stock faible",
      nombre: comptages.variantesStockFaible,
      action: "Contrôler",
    },
  ].filter((entree) => entree.nombre > 0);

  return (
    <main className={styles.page}>
      <p className={styles.surtitre}>{dateDuJour()}</p>
      <h1 className={styles.titre}>Tableau de bord</h1>
      <p className={styles.introduction}>
        Les actions à traiter sont regroupées avant les indicateurs.
      </p>

      <div className={styles.tuiles}>
        <Tuile
          libelle="À préparer"
          valeur={String(comptages.commandesAPreparer)}
          precision={
            comptages.commandesAPreparer > 0
              ? "Paiements confirmés"
              : "Rien en attente"
          }
          ton={comptages.commandesAPreparer > 0 ? "urgent" : undefined}
        />
        <Tuile
          libelle="Prêtes à expédier"
          valeur={String(comptages.commandesPretesAExpedier)}
          precision="Étiquette à générer"
        />
        <Tuile
          libelle="Stock faible"
          valeur={String(comptages.variantesStockFaible)}
          precision={
            comptages.variantesIndisponibles > 0
              ? `Dont ${comptages.variantesIndisponibles} indisponible${
                  comptages.variantesIndisponibles > 1 ? "s" : ""
                }`
              : "Aucune rupture"
          }
          ton={comptages.variantesIndisponibles > 0 ? "urgent" : undefined}
        />
        <Tuile
          libelle="Encaissé aujourd'hui"
          valeur={formaterMontant(comptages.encaisseDuJourCentimes)}
          /*
           * LES DEUX CANAUX SONT NOMMES, et ce n'est pas cosmetique : sans
           * cette mention, un montant superieur aux commandes du jour
           * ressemble a une erreur. La vente de marche est invisible ailleurs
           * dans cet ecran.
           */
          precision="Ventes en ligne et marchés"
          ton="recette"
        />
      </div>

      <section className={styles.panneau} aria-labelledby="a-traiter">
        <p className={styles.panneauSurtitre}>Priorité</p>
        <h2 className={styles.panneauTitre} id="a-traiter">
          À traiter maintenant
        </h2>

        {aTraiter.length === 0 ? (
          /*
           * L'ETAT VIDE EST UNE BONNE NOUVELLE ET LE DIT. `frontend-design.md`
           * exige un etat vide sur tout ecran ; ici il est aussi le cas le plus
           * frequent d'une petite boutique, pas une exception rare.
           */
          <p className={styles.vide}>
            Rien n&apos;attend de geste pour le moment.
          </p>
        ) : (
          <ul className={styles.liste}>
            {aTraiter.map((entree) => (
              <li key={entree.chemin} className={styles.entree}>
                <span className={styles.entreeNombre} aria-hidden="true">
                  {entree.nombre}
                </span>
                <span className={styles.entreeLibelle}>
                  {entree.nombre} {entree.libelle(entree.nombre)}
                </span>
                <Link href={entree.chemin} className={styles.entreeAction}>
                  {entree.action}
                  {/*
                   * LE NOM ACCESSIBLE DIT DE QUOI, jamais « Ouvrir » seul. Une
                   * liste de liens lus a la suite donnerait « Ouvrir, Préparer,
                   * Traiter » sans leur objet.
                   */}
                  <span className={styles.invisible}>
                    {" "}
                    : {entree.libelle(entree.nombre)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
