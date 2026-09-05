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
import { Suspense } from "react";

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
  title: "Administration",
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

  /*
   * L'EN-TETE EST RENDU TOUT DE SUITE, les comptages sous `<Suspense>`.
   */
  return (
    <main className={styles.page}>
      <p className={styles.surtitre}>{dateDuJour()}</p>
      <h1 className={styles.titre}>Tableau de bord</h1>
      <p className={styles.introduction}>
        Les actions à traiter sont regroupées avant les indicateurs.
      </p>

      <Suspense fallback={<ChargementIndicateurs />}>
        <IndicateursTableauBord />
      </Suspense>
    </main>
  );
}

/**
 * Armature affichee pendant que les comptages arrivent, LS-188.
 *
 * TROIS BARRES PAR TUILE, aux hauteurs des trois lignes qu'elles remplacent :
 * libelle, valeur et precision. Reprendre les hauteurs est ce qui evite que la
 * grille change de taille a l'arrivee des chiffres.
 */
function ChargementIndicateurs() {
  return (
    <>
      {/*
       * `role="status"` pour qu'un lecteur d'ecran apprenne que la page
       * travaille. `aria-live` n'est pas ajoute, `role="status"` le portant
       * implicitement en `polite`.
       *
       * ELLE EST VISUELLEMENT MASQUEE, `styles.invisible`, ET C'EST LE POINT.
       * Le rendu reel n'a AUCUNE ligne de texte entre l'introduction et la
       * grille : une phrase visible ici descendrait les quatre tuiles d'une
       * hauteur de ligne, puis les ferait remonter a l'arrivee des chiffres.
       * C'est le saut de mise en page que l'armature existe pour eviter, et le
       * critere 3 l'interdit nommement.
       *
       * L'ANNONCE RESTE ENTIERE POUR QUI ECOUTE. `invisible` est la technique
       * de masquage accessible du projet, deja employee dans ce fichier pour
       * les noms de liens : le texte sort du flux visuel sans sortir de l'arbre
       * d'accessibilite, contrairement a `display: none`.
       */}
      <p className={styles.invisible} role="status">
        Chargement des indicateurs…
      </p>

      {/*
       * `aria-hidden` SUR L'ARMATURE : annoncer quatre tuiles vides n'apprend
       * rien a qui ecoute, la phrase ci-dessus le fait mieux. C'est ce partage
       * qui rend l'armature purement decorative, donc dispensee de nom
       * accessible : le sens passe par le texte, la forme par les barres.
       */}
      <div className={styles.tuiles} aria-hidden="true">
        {[0, 1, 2, 3].map((rang) => (
          <div key={rang} className={styles.tuile}>
            <span className={styles.ardoiseLibelle} />
            <span className={styles.ardoiseValeur} />
            <span className={styles.ardoisePrecision} />
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Les indicateurs, seule partie de cet ecran qui lit la base.
 *
 * ------------------------------------------------------------------
 * POURQUOI UN `<Suspense>` INTERNE ET NON UN `loading.tsx`, ALORS QUE CETTE
 * PAGE N'APPELLE PAS `notFound()`.
 *
 * Un `loading.tsx` pose ici sa frontiere sur le SEGMENT RACINE de
 * l'administration, donc sur les SEIZE ecrans du sous-arbre, exactement comme
 * `error.tsx` les couvre tous depuis LS-191. Or deux d'entre eux appellent
 * `notFound()` : leur 404 devenait un 200.
 *
 * MESURE DU 5 SEPTEMBRE 2026, sur une route de diagnostic appelant `notFound()`
 * en PREMIERE instruction : 404 hors de `/administration`, 200 dedans, le seul
 * ecart etant la presence du `loading.tsx` racine.
 *
 * C32 S'APPLIQUE DONC A UN SEGMENT DES QU'UN DESCENDANT appelle `notFound()`,
 * et pas seulement quand la page du segment le fait elle-meme.
 *
 * NE PAS RETABLIR `administration/loading.tsx`. Le raisonnement qui l'avait
 * justifie disait que « ce fichier couvre le segment racine, pas ses
 * sous-dossiers, le plus proche l'emporte » : c'est vrai du REPLI affiche, faux
 * de la frontiere, qui enveloppe tout le sous-arbre.
 * ------------------------------------------------------------------
 */
async function IndicateursTableauBord() {
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
    <>
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
          /*
           * LA PRECISION S'ADAPTE AU CAS NUL, comme les trois autres tuiles.
           * « 0 / Étiquette à générer » se lit comme une consigne : sur une
           * boutique qui demarre, c'est ce que l'exploitante verrait en premier
           * alors qu'il n'y a rien a faire.
           */
          precision={
            comptages.commandesPretesAExpedier > 0
              ? "Étiquette à générer"
              : "Aucun colis en attente"
          }
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
          /*
           * LE FILET VERT NE S'ALLUME QUE SUR UNE RECETTE REELLE. Il marque une
           * bonne nouvelle : le poser sur « 0,00 € » en ferait un ornement
           * permanent, et un marqueur toujours allume ne marque plus rien. Meme
           * regle que les deux tons `urgent`, conditionnes a un compte non nul.
           */
          ton={comptages.encaisseDuJourCentimes > 0 ? "recette" : undefined}
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
    </>
  );
}
