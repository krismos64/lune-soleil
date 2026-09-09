/**
 * Catalogue public, LS-104. Premier ecran public reel du projet.
 *
 * COMPOSANT SERVEUR PUR, aucun `"use client"` dans cet ecran ni dans ses
 * enfants. Les filtres passent par l'URL et non par un etat React : chaque
 * catalogue filtre est alors partageable, indexable, et fonctionne sans
 * JavaScript. Le bouton retour du navigateur retrouve le filtre precedent
 * gratuitement, ce qu'un `useState` obligerait a reimplementer.
 *
 * `searchParams` EST UNE PROMESSE en Next.js 16, verifie via Context7 : elle
 * s'attend, elle ne se lit pas directement.
 *
 * AUCUNE PAGINATION, ni `LIMIT`. Le dimensionnement du catalogue, 10 a 40
 * references, l'exclut, et `frontend-design.md` interdit d'introduire un plafond
 * que le schema ne porte pas.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { openGraphDePage } from "@/lib/seo";
import { lireCataloguePublic } from "@/services/catalogue";
import { verifierSante } from "@/services/sante";
import { CarteProduit } from "./carte-produit";
import styles from "./catalogue.module.css";

/**
 * LS-137. `generateMetadata` ET NON UN OBJET FIGE, parce que le filtre vit dans
 * l'URL.
 *
 * LE DEFAUT QU'IL EVITE. Un canonical fige a `/catalogue` sur toutes les URL
 * filtrees dirait aux moteurs que `?categorie=colliers` EST le catalogue
 * complet : la page filtree disparaitrait de l'index au profit de la page nue,
 * en emportant les mots-cles de la categorie.
 *
 * CHAQUE FILTRE PORTE DONC SON PROPRE CANONICAL, et reste indexable : la barre
 * de filtres etant une liste de liens, ces URL sont explorees, partageables et
 * legitimes. C'est le choix de LS-104 d'avoir mis l'etat dans l'URL plutot que
 * dans un `useState`.
 *
 * UN SLUG INCONNU RETOMBE SUR `/catalogue`, exactement comme le fait le corps de
 * la page : `lireCataloguePublic` ignore un filtre qui ne correspond a rien, et
 * poser le canonical sur `?categorie=nimportequoi` creerait autant d'URL
 * canoniques que de slugs inventes.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [cle: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const parametres = await searchParams;
  const brut = parametres.categorie;
  const slugDemande = Array.isArray(brut) ? brut[0] : brut;

  /*
   * LE MEME SERVICE QUE LE CORPS DE LA PAGE, et non une lecture parallele.
   *
   * `lireCataloguePublic` porte deja la resolution du slug ET la regle du slug
   * inconnu. Ajouter ici une seconde lecture donnerait deux endroits ou cette
   * regle vit, et rien ne les garderait d'accord : le titre pourrait annoncer
   * une categorie que la page n'a pas filtree.
   *
   * CE SECOND APPEL TOUCHE REELLEMENT LA BASE, et c'est assume : ni le service
   * ni le client Prisma ne sont enveloppes dans `cache()`, donc `generateMetadata`
   * et le corps de la page font chacun leur lecture. Le catalogue tient en 10 a
   * 40 references, la requete est indexee, et deux lectures d'un tel volume ne
   * justifient pas d'introduire une couche de memoisation que le projet n'a nulle
   * part ailleurs. A revoir si le catalogue change d'ordre de grandeur.
   */
  const { categorieRetenue: categorie } =
    await lireCataloguePublic(slugDemande);

  const titre = categorie ? categorie.nom : "Le catalogue";
  const description = categorie
    ? `${categorie.nom} : bijoux artisanaux faits main, créés à l'unité.`
    : "Bijoux artisanaux faits main, créés à l'unité. Chaque pièce est unique.";
  const chemin = categorie
    ? `/catalogue?categorie=${categorie.slug}`
    : "/catalogue";

  return {
    title: titre,
    description,
    alternates: { canonical: chemin },
    openGraph: openGraphDePage({ titre, description, chemin }),
  };
}

/**
 * La page lit la base a chaque affichage.
 *
 * UN CATALOGUE MIS EN CACHE MONTRERAIT UNE PIECE DEJA VENDUE, ou masquerait une
 * nouveaute publiee il y a une minute. La disponibilite change a chaque
 * reservation : c'est la donnee la plus volatile de l'ecran.
 */
export const dynamic = "force-dynamic";

/**
 * Base injoignable : cette page doit rendre un VRAI 500, LS-139.
 *
 * CE QUE L'INCIDENT 1 A MESURE, en arretant reellement `lune-soleil-db` le
 * 9 septembre 2026. Sans cette sonde, `/catalogue` repondait **200** avec
 * « Chargement des pieces… » comme etat FINAL : le HTML pesait 39 462 octets
 * contre 45 748 au nominal, et se terminait sur deux erreurs serialisees
 * `E{"digest":...}` sans que le contenu n'arrive jamais.
 *
 * POURQUOI `error.tsx` NE SUFFISAIT PAS, alors qu'il existe et qu'il est juste.
 * `loading.tsx` enveloppe la page entiere dans une frontiere Suspense : le
 * streaming commence donc AVANT que la lecture echoue, et un statut ne se
 * change plus une fois les octets partis. Next.js transmet bien l'erreur, mais
 * seulement au client : la frontiere ne s'affiche qu'APRES hydratation.
 * Documentation de Next.js 16 verifiee par Context7, « response headers are set
 * at this point, preventing later status code changes ».
 *
 * CE QUE LE 200 COUTAIT REELLEMENT, et c'est ce qui tranche :
 *
 *   - un visiteur SANS JavaScript reste devant un chargement qui n'aboutit
 *     jamais, sans jamais apprendre qu'il y a une panne
 *   - un MOTEUR indexe « Chargement des pieces… » en 200 sur la page
 *     commerciale principale, et le SEO est prioritaire sur ce projet
 *   - une SUPERVISION qui lit le code HTTP conclut que tout va bien
 *
 * LA SONDE EST AU-DESSUS DE TOUT `await` DE DONNEES, c'est ce qui la rend
 * efficace : elle s'execute avant que le fallback ne demarre le flux. Le motif
 * est celui que la fiche produit a deja tranche dans l'autre sens, en RETIRANT
 * son `loading.tsx` faute d'en avoir besoin. Ici le fichier sert un vrai
 * besoin, les filtres d'URL, donc c'est le controle qui remonte.
 *
 * `verifierSante` PLUTOT QU'UN `try/catch` AUTOUR DE LA LECTURE. Elle ne leve
 * jamais, elle est bornee par un delai, et un `SELECT 1` mesure la base sans
 * dependre d'une table metier. Un `catch` autour de `lireCataloguePublic`
 * arriverait trop tard : la lecture est deja sous la frontiere Suspense.
 */
async function exigerBaseDisponible(): Promise<void> {
  const etat = await verifierSante();

  if (!etat.operationnel) {
    /*
     * LEVER, ET NON `notFound()`. Le catalogue existe, il est momentanement
     * illisible : un 404 dirait aux moteurs de le desindexer, ce qui est faux
     * et durable, quand un 500 dit « reviens plus tard ». `error.tsx` de ce
     * segment rend le message, il est deja ecrit et n'a pas a changer.
     *
     * LE MESSAGE NE DIT PAS CE QUI A ECHOUE, meme raison que dans `error.tsx` :
     * il part dans le journal, pas a l'ecran, et « base indisponible »
     * renseignerait sur l'infrastructure sans aider le visiteur.
     */
    throw new Error("catalogue indisponible, base injoignable");
  }
}

export default async function PageCatalogue({
  searchParams,
}: {
  searchParams: Promise<{ [cle: string]: string | string[] | undefined }>;
}) {
  await exigerBaseDisponible();

  const parametres = await searchParams;

  /*
   * UN PARAMETRE REPETE, `?categorie=a&categorie=b`, ARRIVE EN TABLEAU. Le
   * passer tel quel au service produirait une requete sur `[object Object]` :
   * seule la premiere valeur est retenue, ce qui est le comportement le moins
   * surprenant pour une URL bricolee a la main.
   */
  const brut = parametres.categorie;
  const slugCategorie = Array.isArray(brut) ? brut[0] : brut;

  const { produits, categories, categorieRetenue } =
    await lireCataloguePublic(slugCategorie);

  /*
   * LE NOM VIENT DU SERVICE, ET NON D'UNE RECHERCHE DANS `categories`. La
   * premiere version le cherchait la, et il valait `undefined` exactement quand
   * il etait le plus utile : `categories` ne porte que les categories AYANT du
   * publie, donc jamais celle qu'on filtre quand elle vient d'etre videe.
   * L'ecran disait alors « aucune piece dans cette categorie » sans dire
   * laquelle.
   */
  const nomCategorieRetenue = categorieRetenue?.nom;

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Le catalogue</h1>
      <p className={styles.accroche}>
        Chaque bijou est fait main et créé à l&apos;unité.
      </p>

      {/*
       * LA BARRE DE FILTRES EST UNE LISTE DE LIENS, et non un formulaire. Un
       * lien est atteignable au clavier, annonce son etat courant, et emmene sur
       * une URL partageable sans qu'aucun script ne s'execute.
       *
       * `aria-current` PLUTOT QU'UNE SEULE CLASSE CSS, LS-85 : la couleur dit a
       * l'oeil quel filtre est actif, `aria-current` le dit a qui ecoute.
       */}
      {categories.length > 0 && (
        <nav className={styles.filtres} aria-label="Filtrer par catégorie">
          <ul className={styles.listeFiltres}>
            <li>
              <Link
                href="/catalogue"
                className={styles.filtre}
                aria-current={categorieRetenue === null ? "page" : undefined}
              >
                Tout voir
              </Link>
            </li>
            {categories.map((categorie) => (
              <li key={categorie.id}>
                <Link
                  href={`/catalogue?categorie=${categorie.slug}`}
                  className={styles.filtre}
                  aria-current={
                    categorieRetenue?.slug === categorie.slug
                      ? "page"
                      : undefined
                  }
                >
                  {categorie.nom}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/*
       * LE COMPTE EST ANNONCE DANS UNE REGION LIVE, LS-85. Une navigation entre
       * filtres remplace la grille sans changer le titre de la page : sans cette
       * region, un lecteur d'ecran ne dirait rien de ce qui vient de se passer.
       */}
      <p className={styles.compte} role="status" aria-live="polite">
        {produits.length === 0
          ? nomCategorieRetenue
            ? `Aucune pièce dans ${nomCategorieRetenue}.`
            : "Aucune pièce à afficher."
          : `${produits.length} ${produits.length === 1 ? "pièce" : "pièces"}${
              nomCategorieRetenue ? ` dans ${nomCategorieRetenue}` : ""
            }.`}
      </p>

      {produits.length === 0 ? (
        /*
         * L'ETAT VIDE N'EST JAMAIS UNE GRILLE VIDE, `PROTOTYPE.md`. Un texte
         * court dit ce qui se passe, et une action permet d'en sortir sans avoir
         * a comprendre l'URL.
         *
         * LE MESSAGE DISTINGUE LES DEUX CAS, et la nuance compte : « rien dans
         * cette categorie » se corrige en effaçant le filtre, « boutique vide »
         * ne se corrige pas et proposer d'effacer un filtre inexistant serait
         * une fausse piste.
         */
        <div className={styles.etatVide}>
          {categorieRetenue ? (
            <>
              <p className={styles.texteVide}>
                Aucune pièce dans {nomCategorieRetenue ?? "cette catégorie"}{" "}
                pour le moment.
              </p>
              <Link href="/catalogue" className={styles.actionVide}>
                Voir tout le catalogue
              </Link>
            </>
          ) : (
            <p className={styles.texteVide}>
              Le catalogue s&apos;étoffe, les premières pièces arrivent bientôt.
            </p>
          )}
        </div>
      ) : (
        <ul className={styles.grille}>
          {produits.map((produit) => (
            <CarteProduit key={produit.id} produit={produit} />
          ))}
        </ul>
      )}
    </main>
  );
}
