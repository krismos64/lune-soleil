/**
 * Liste du catalogue pour l'administration, LS-183.
 *
 * LE DEFAUT QU'ELLE FERME. Aucun ecran ne listait les produits : `/nouveau` en
 * cree un, `/[id]` en edite un, et il fallait CONNAITRE l'identifiant pour
 * ouvrir le second, c'est-a-dire un UUID. Modifier un prix supposait d'aller le
 * chercher en base.
 *
 * PERSONNE NE L'AVAIT VU parce que chaque story a livre SA fonction, et que
 * l'inventaire de `PROTOTYPE.md` cite pour la rubrique Catalogue des stories de
 * METIER, jamais d'ecran. « Catalogue, phase 2, epic LS-3 » est vrai du metier
 * et faux de l'ecran. Motif « verifier la couverture du backlog ».
 *
 * COMPOSANT SERVEUR : il exige le role, lit la base et rend. Aucune interaction
 * ici, la liste n'etant que de la lecture ; l'editeur porte les actions.
 *
 * `exigerAdministratrice` EST APPELE AVANT TOUT RENDU, motif pose par LS-70.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { StatutProduit } from "@/generated/prisma/enums";
import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import {
  listerProduitsAdministration,
  STATUTS_VIVANTS,
} from "@/services/catalogue";
import { formaterMontant } from "@/lib/montant";

import styles from "./catalogue.module.css";

export const metadata = {
  title: "Catalogue, administration",
  robots: { index: false, follow: false },
};

/**
 * La page lit la base a chaque affichage.
 *
 * UNE LISTE DE PRODUITS MISE EN CACHE EST TROMPEUSE : un produit publie depuis
 * un autre onglet doit apparaitre au rafraichissement, sans quoi l'exploitante
 * le republie ou le croit perdu.
 */
export const dynamic = "force-dynamic";

/**
 * Le prefixe des medias, meme source que les autres ecrans.
 *
 * `Media.chemin` SE TERMINE DEJA PAR UNE BARRE, verifie en base le 4 septembre
 * 2026 : la concatenation n'en ajoute donc AUCUNE. L'editeur de produit en
 * ajoute une et produit une double barre, qui rend 308 au lieu de 200 : defaut
 * reel, porte par LS-187, et cet ecran emploie la forme correcte en attendant
 * la fonction commune que ce ticket livrera.
 */
const PREFIXE_MEDIAS = process.env.MEDIA_PREFIXE_PUBLIC ?? "/medias";

/**
 * Les filtres proposes, dans l'ordre du cycle de vie d'un produit.
 *
 * `TOUS` VAUT « LE CATALOGUE VIVANT » ET NON « ABSOLUMENT TOUT », arbitrage de
 * Christophe du 4 septembre 2026 : les archives ont leur propre entree. Une
 * liste qui montrerait tout par defaut grossirait sans fin, et l'exploitante
 * chercherait ses produits courants parmi ceux qu'elle a retires.
 */
type Filtre = {
  valeur: string;
  libelle: string;
  statuts: readonly StatutProduit[];
};

/**
 * LE DEFAUT EST NOMME ET NON `FILTRES[0]`. Indexer un tableau rend
 * `Filtre | undefined` sous `noUncheckedIndexedAccess`, ce qui obligerait a
 * traiter partout une absence qui ne peut pas se produire. Le nommer dit aussi
 * lequel est le defaut, ce qu'une position ne dit pas.
 */
const FILTRE_PAR_DEFAUT: Filtre = {
  valeur: "TOUS",
  libelle: "Tous",
  statuts: STATUTS_VIVANTS,
};

const FILTRES: readonly Filtre[] = [
  FILTRE_PAR_DEFAUT,
  { valeur: "ACTIF", libelle: "Publiés", statuts: ["ACTIF"] },
  { valeur: "BROUILLON", libelle: "Brouillons", statuts: ["BROUILLON"] },
  { valeur: "ARCHIVE", libelle: "Archivés", statuts: ["ARCHIVE"] },
];

/** Ce que chaque statut affiche, libelle et classe de badge. */
const BADGES: Record<StatutProduit, { libelle: string; classe: string }> = {
  ACTIF: { libelle: "Publié", classe: "badgeActif" },
  BROUILLON: { libelle: "Brouillon", classe: "badgeBrouillon" },
  ARCHIVE: { libelle: "Archivé", classe: "badgeArchive" },
};

export default async function PageCatalogue({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  try {
    await exigerAdministratrice(await headers());
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      redirect("/administration/connexion");
    }
    throw erreur;
  }

  const parametres = await searchParams;

  /*
   * UN FILTRE INCONNU RETOMBE SUR LE DEFAUT, jamais sur une erreur. Le
   * parametre vient d'une URL, donc d'une entree non fiable : un lien perime ou
   * une saisie a la main doit rendre l'ecran ordinaire, pas un 500.
   */
  const filtreActif =
    FILTRES.find((filtre) => filtre.valeur === parametres.statut) ??
    FILTRE_PAR_DEFAUT;

  const produits = await listerProduitsAdministration(filtreActif.statuts);

  return (
    <main className={styles.page}>
      <p className={styles.surtitre}>Catalogue</p>

      <div className={styles.enTete}>
        <h1 className={styles.titre}>Produits</h1>

        {/*
         * « NOUVEAU PRODUIT » EST UN BOUTON D'ACTION ICI, et non plus une
         * rubrique de la barre, arbitrage de Christophe du 4 septembre 2026 :
         * c'est la forme du prototype, et creer un produit se fait depuis
         * l'ecran qui les liste. La route existe toujours, elle s'atteint d'ici.
         */}
        <Link href="/administration/produits/nouveau" className={styles.action}>
          Nouveau produit
        </Link>
      </div>

      <p className={styles.introduction}>
        {produits.length === 0
          ? "Aucun produit dans cette vue."
          : `${produits.length} ${produits.length > 1 ? "produits" : "produit"}, du plus récemment modifié au plus ancien.`}
      </p>

      {/*
       * LES FILTRES SONT DES LIENS ET NON DES BOUTONS. L'etat est dans l'URL,
       * ce qui fait fonctionner le retour navigateur et le partage de lien,
       * exigence de `frontend-design.md`.
       */}
      <nav aria-label="Filtrer par état" className={styles.filtres}>
        <ul className={styles.listeFiltres}>
          {FILTRES.map((filtre) => {
            const courant = filtre.valeur === filtreActif.valeur;

            return (
              <li key={filtre.valeur}>
                <Link
                  href={
                    filtre.valeur === "TOUS"
                      ? "/administration/produits"
                      : `/administration/produits?statut=${filtre.valeur}`
                  }
                  className={styles.filtre}
                  /*
                   * `aria-current="page"` PORTE L'INFORMATION, la couleur ne
                   * fait que l'appuyer : `frontend-design.md` interdit qu'une
                   * information passe par la seule couleur, et le style s'ancre
                   * donc sur l'ATTRIBUT plutot que sur une classe.
                   */
                  aria-current={courant ? "page" : undefined}
                >
                  {filtre.libelle}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {produits.length === 0 ? (
        /*
         * L'ETAT VIDE DIT POURQUOI, et il differe selon le filtre : « aucun
         * archive » est une bonne nouvelle, « aucun produit » sur une boutique
         * qui demarre est une invitation a en creer un.
         */
        <p className={styles.vide}>
          {filtreActif.valeur === "TOUS"
            ? "Le catalogue est vide. Créez un premier produit pour commencer."
            : "Aucun produit ne correspond à ce filtre."}
        </p>
      ) : (
        <ul className={styles.liste}>
          {produits.map((produit) => {
            const badge = BADGES[produit.statut];

            return (
              <li key={produit.id} className={styles.carte}>
                {/*
                 * LA VIGNETTE EST DECORATIVE ICI, `alt` vide et `aria-hidden` :
                 * le lien voisin porte deja le nom du produit, et faire lire le
                 * texte alternatif donnerait deux fois la meme information.
                 * C'est l'inverse de la boutique, ou l'image EST le contenu.
                 */}
                <div className={styles.cadreImage} aria-hidden="true">
                  {produit.mediaChemin ? (
                    /*
                     * AUCUN `width` NI `height`, ET C'EST DELIBERE, lecon deja
                     * apprise sur l'ecran des medias : le traitement ne
                     * contraint QUE la largeur, `resize({ width })`, la hauteur
                     * suivant le ratio de la source. Declarer 320 par 320
                     * affirmerait un carre que le fichier ne respecte pas, et
                     * produirait un decalage de mise en page au chargement de
                     * chaque vignette, sur une liste qui en empile autant qu'il
                     * y a de produits.
                     *
                     * LA PLACE EST RESERVEE PAR LE CSS : `.cadreImage` fixe
                     * 64 par 64 et `object-fit: cover` recadre, ce qui stabilise
                     * la carte sans rien affirmer du ratio reel.
                     */
                    // eslint-disable-next-line @next/next/no-img-element -- fichiers servis par Nginx depuis un volume, hors de la portee de l'optimiseur de Next.js
                    <img
                      src={`${PREFIXE_MEDIAS}/${produit.mediaChemin}320.jpeg`}
                      alt=""
                      className={styles.image}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className={styles.imageAbsente} />
                  )}
                </div>

                <div className={styles.corps}>
                  <p className={styles.categorie}>{produit.categorieNom}</p>

                  {/*
                   * LE LIEN PORTE LE NOM, ce qui en fait le nom accessible :
                   * une liste de liens « Modifier » serait indiscernable a
                   * l'oreille. Le geste est le meme, l'annonce est juste.
                   */}
                  <h2 className={styles.nom}>
                    <Link
                      href={`/administration/produits/${produit.id}`}
                      className={styles.lien}
                    >
                      {produit.nom}
                    </Link>
                  </h2>

                  <p className={styles.prix}>
                    {/*
                     * PAS DE PRIX N'EST PAS UN PRIX DE ZERO. Un produit vient
                     * de naitre sans variante, `creerProduit` n'en ecrivant
                     * aucune : afficher « 0,00 € » annoncerait un prix decide.
                     */}
                    {produit.prixMinimumCentimes === null
                      ? "Aucun prix"
                      : formaterMontant(produit.prixMinimumCentimes)}
                  </p>

                  {/*
                   * LE NOMBRE DE VARIANTES DIT CE QUI MANQUE. Zero variante est
                   * la raison la plus frequente pour laquelle un brouillon
                   * n'est pas publiable, et le voir ici evite d'ouvrir la fiche
                   * pour le decouvrir.
                   */}
                  <p className={styles.variantes}>
                    {produit.variantesVivantes === 0
                      ? "Aucune déclinaison"
                      : `${produit.variantesVivantes} ${
                          produit.variantesVivantes > 1
                            ? "déclinaisons"
                            : "déclinaison"
                        }`}
                  </p>
                </div>

                {/*
                 * LE BADGE PORTE SON SENS DANS SON TEXTE, jamais dans sa seule
                 * couleur : « Publié », « Brouillon », « Archivé » se lisent en
                 * vision monochrome comme a l'oreille.
                 */}
                <span className={`${styles.badge} ${styles[badge.classe]}`}>
                  {badge.libelle}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
