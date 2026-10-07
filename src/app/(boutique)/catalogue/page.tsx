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
import { Suspense, type CSSProperties } from "react";

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { openGraphDePage } from "@/lib/seo";
import { rangPhotoPrioritaire } from "@/lib/photo-prioritaire";
import { cheminCatalogue, lireNumeroPage } from "@/lib/url-catalogue";
import {
  lireCataloguePublic,
  PageCatalogueInexistanteError,
  pageCatalogueExiste,
} from "@/services/catalogue";
import { MedaillonAube } from "@/components/medaillon-aube";
import { ReactionPointeur } from "@/components/reaction-pointeur";
import { ArmatureCatalogue } from "./armature-catalogue";
import { CarteProduit } from "./carte-produit";
import { FocusPagination } from "./focus-pagination";
import styles from "./catalogue.module.css";
import { BandeauApercuTheme } from "@/components/bandeau-apercu-theme";
import { BoutonPauseAnimations } from "@/components/bouton-pause-animations";
import {
  BandePapierCadeau,
  BandeSucreOrge,
  BoulesSuspendues,
  FloconIcone,
  MargesNeigeuses,
  NeigeContinue,
} from "@/components/decor-noel";
import { GuirlandeBoules } from "@/components/guirlande-boules";
import { estThemeDeNoel } from "@/lib/theme-saisonnier";
import {
  attributTheme,
  PARAMETRE_APERCU_THEME,
  themeDeLaPage,
} from "../theme-de-la-page";

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
  /*
   * ------------------------------------------------------------------
   * CETTE LECTURE FIGE LE STATUT DE LA PAGE A 200 QUAND LA BASE EST MORTE,
   * et ce n'est PAS un oubli : deux corrections ont ete essayees, mesurees sur
   * la production, et la seconde a ete annulee. LS-139, 9 septembre 2026.
   *
   * LE MECANISME. Next.js 16 diffuse les metadonnees SEPAREMENT sur une page
   * dynamique, sans bloquer le rendu de l'UI, verifie par Context7. La reponse
   * est donc engagee avant que cette fonction ait fini, et un statut ne se
   * change plus une fois les octets partis.
   *
   * MESURE, base de production reellement arretee, meme URL, seul l'agent
   * changeant :
   *
   *   navigateur -> 200      Twitterbot -> 500      Googlebot -> 200
   *
   * Le 500 de Twitterbot vient de `htmlLimitedBots` : le streaming des
   * metadonnees y est desactive, donc la lecture bloque le rendu et son echec
   * fixe le statut. C'est cet ecart qui a designe la cause.
   *
   * CE QUI A ETE ESSAYE ET ANNULE : envelopper cette lecture dans un
   * `try/catch` avec repli sur les metadonnees par defaut. La mesure a montre
   * l'inverse de l'effet voulu : `generateMetadata` REUSSIT alors, donc la page
   * rend son titre et continue, et Twitterbot est passe de 500 a 200. Le seul
   * chemin qui produisait un statut honnete disparaissait.
   *
   * NE PAS REESSAYER CE REPLI. La question de fond, statut honnete contre
   * canonical par filtre de LS-137, demande un arbitrage tracé : retirer ce
   * `generateMetadata` dynamique alignerait le catalogue sur l'accueil, qui
   * rend un vrai 500 parce qu'il n'en a AUCUN, au prix du canonical par
   * categorie que LS-137 a pose deliberement.
   *
   * CE QUI RESTE VRAI ENTRE-TEMPS : un visiteur sans JavaScript voit un
   * chargement qui n'aboutit jamais, et une supervision qui lit le code HTTP
   * conclut que tout va bien. `error.tsx` s'affiche apres hydratation.
   * ------------------------------------------------------------------
   */
  const { categorieRetenue: categorie } =
    await lireCataloguePublic(slugDemande);

  /*
   * LS-241 : CHAQUE PAGE PORTE SA PROPRE CANONICAL, jamais celle de la page 1,
   * et un titre distinct. Pointer la page 2 vers la page 1 dirait aux moteurs
   * que les pieces de la page 2 n'existent pas ; deux titres identiques
   * seraient signales en doublon. Un numero invalide retombe sur 1 ici, le
   * corps de la page en faisant un 404.
   */
  const page = lireNumeroPage(parametres.page) ?? 1;
  const base = categorie ? categorie.nom : "Le catalogue";
  const titre = page > 1 ? `${base}, page ${page}` : base;
  const description = categorie
    ? `${categorie.nom} : bijoux artisanaux faits main, créés à l'unité.`
    : "Bijoux artisanaux faits main, créés à l'unité. Chaque pièce est unique.";
  const chemin = cheminCatalogue({ categorie: categorie?.slug, page });

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
 * Le contenu qui LIT LA BASE, sous la frontiere Suspense de la page.
 *
 * IL EST SEPARE DE LA COQUE POUR UNE RAISON DE STATUT HTTP, LS-139, et non par
 * gout du decoupage. Tant que ce travail vivait dans la fonction de page sous
 * un `loading.tsx` de segment, une base injoignable rendait **200** avec l'etat
 * de chargement fige : la frontiere enveloppait la page entiere, donc le
 * streaming demarrait avant l'echec. Mesure en arretant la base de production.
 *
 * ICI LA FRONTIERE EST INTERNE : la coque ci-dessous s'est deja rendue quand ce
 * composant suspend, et une erreur levee ici remonte a `error.tsx` du segment
 * apres que le statut a ete fixe par le rendu de la coque.
 */
async function ContenuCatalogue({
  slugCategorie,
  page,
  noel,
}: {
  slugCategorie: string | undefined;
  page: number;
  noel: boolean;
}) {
  /*
   * LS-241 : LA PAGE A ETE VERIFIEE AVANT LA FRONTIERE, et ce rattrapage ne sert
   * qu'a la course ou une piece est retiree entre les deux lectures. Il rend
   * alors un 404 « doux », servi en 200 avec `noindex` par Next.js.
   */
  let catalogue: Awaited<ReturnType<typeof lireCataloguePublic>>;

  try {
    catalogue = await lireCataloguePublic(slugCategorie, page);
  } catch (erreur) {
    if (erreur instanceof PageCatalogueInexistanteError) {
      notFound();
    }
    throw erreur;
  }

  const { produits, categories, categorieRetenue, pagination } = catalogue;
  const total = pagination?.total ?? produits.length;

  /*
   * LE NOM VIENT DU SERVICE, ET NON D'UNE RECHERCHE DANS `categories`. La
   * premiere version le cherchait la, et il valait `undefined` exactement quand
   * il etait le plus utile : `categories` ne porte que les categories AYANT du
   * publie, donc jamais celle qu'on filtre quand elle vient d'etre videe.
   * L'ecran disait alors « aucune piece dans cette categorie » sans dire
   * laquelle.
   */
  const nomCategorieRetenue = categorieRetenue?.nom;
  const rangPrioritaire = rangPhotoPrioritaire(produits);

  return (
    <>
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
                href={cheminCatalogue({})}
                className={styles.filtre}
                aria-current={categorieRetenue === null ? "page" : undefined}
              >
                {noel ? <FloconIcone className={styles.floconFiltre} /> : null}
                Tout voir
              </Link>
            </li>
            {categories.map((categorie) => (
              <li key={categorie.id}>
                <Link
                  href={cheminCatalogue({ categorie: categorie.slug })}
                  className={styles.filtre}
                  aria-current={
                    categorieRetenue?.slug === categorie.slug
                      ? "page"
                      : undefined
                  }
                >
                  {noel ? (
                    <FloconIcone className={styles.floconFiltre} />
                  ) : null}
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
          : `${total} ${total === 1 ? "pièce" : "pièces"}${
              nomCategorieRetenue ? ` dans ${nomCategorieRetenue}` : ""
            }${
              pagination && pagination.pages > 1
                ? `, page ${pagination.page} sur ${pagination.pages}`
                : ""
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
        <ul className={styles.grille} data-inclinaison="">
          {produits.map((produit, rang) => (
            /*
             * LA PREMIÈRE CARTE AVEC PHOTO EST PRIORITAIRE, LS-285 : sa photo
             * est l'élément du LCP du catalogue, à 320 px comme à 1280.
             */
            <CarteProduit
              key={produit.id}
              produit={produit}
              noel={noel}
              prioritaire={rang === rangPrioritaire}
            />
          ))}
        </ul>
      )}

      {/*
       * LS-241 : DES LIENS ET NON DES BOUTONS, pour que les moteurs suivent les
       * pages et que le retour du navigateur fonctionne. Absente sur une page
       * unique, ou elle n'aurait rien a proposer.
       */}
      {pagination && pagination.pages > 1 ? (
        <nav className={styles.pagination} aria-label="Pagination du catalogue">
          <FocusPagination />
          {pagination.page > 1 ? (
            <Link
              href={cheminCatalogue({
                categorie: categorieRetenue?.slug,
                page: pagination.page - 1,
              })}
              className={styles.lienPagination}
              rel="prev"
            >
              Page précédente
            </Link>
          ) : null}
          <span className={styles.positionPagination}>
            Page {pagination.page} sur {pagination.pages}
          </span>
          {pagination.page < pagination.pages ? (
            <Link
              href={cheminCatalogue({
                categorie: categorieRetenue?.slug,
                page: pagination.page + 1,
              })}
              className={styles.lienPagination}
              rel="next"
            >
              Page suivante
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}

/**
 * La coque, rendue AU-DESSUS de toute frontiere Suspense.
 *
 * SANS APERÇU, ELLE NE LIT QUE CE QUI NE PEUT PAS LEVER, et c'est ce qui rend
 * son statut honnête : le thème saisonnier, ADR-046, retombe sur l'habillage
 * ordinaire en cas d'échec. Elle se rend donc entièrement avant que
 * `ContenuCatalogue` suspende, et une base injoignable fait lever SOUS une
 * frontière déjà établie, où `error.tsx` prend le relais. Un aperçu lit en
 * plus la session, qui peut lever ici : un vrai 500, statut honnête lui aussi.
 *
 * `searchParams` EST ATTENDU ICI, ce qui est sans effet sur le statut : c'est
 * une promesse du framework, resolue sans acces reseau ni base.
 */
export default async function PageCatalogue({
  searchParams,
}: {
  searchParams: Promise<{ [cle: string]: string | string[] | undefined }>;
}) {
  const parametres = await searchParams;

  /*
   * UN PARAMETRE REPETE, `?categorie=a&categorie=b`, ARRIVE EN TABLEAU. Le
   * passer tel quel au service produirait une requete sur `[object Object]` :
   * seule la premiere valeur est retenue, ce qui est le comportement le moins
   * surprenant pour une URL bricolee a la main.
   */
  const brut = parametres.categorie;
  const slugCategorie = Array.isArray(brut) ? brut[0] : brut;

  /*
   * LS-241 : LE NUMERO DE PAGE SE VERIFIE ICI, AVANT LA FRONTIERE SUSPENSE.
   * Une fois le streaming engage, le statut est fige a 200, verifie via
   * Context7 : `?page=999` doit rendre un vrai 404, sans quoi un robot
   * indexerait des pages vides. Seule une page au-dela de la premiere coute une
   * lecture, un comptage.
   */
  const page = lireNumeroPage(parametres.page);

  if (page === null || !(await pageCatalogueExiste(slugCategorie, page))) {
    notFound();
  }

  /*
   * LE THÈME SAISONNIER, ADR-046. Sans aperçu, sa lecture ne lève jamais :
   * un thème illisible rend l'habillage ordinaire. Avec un aperçu, la
   * lecture de session peut lever ici, et la page répond un vrai 500, statut
   * honnête au sens de C32.
   */
  const { theme, enApercu } = await themeDeLaPage(
    parametres[PARAMETRE_APERCU_THEME],
  );
  const noel = estThemeDeNoel(theme);

  return (
    <main
      id="contenu"
      tabIndex={-1}
      className={noel ? styles.page : `${styles.page} ${styles.ordinaire}`}
      data-theme={attributTheme(theme)}
    >
      {enApercu ? <BandeauApercuTheme theme={theme} /> : null}
      {noel ? (
        /*
         * LE BANDEAU DE NOËL, LS-277 : le titre et l'accroche restent les
         * mêmes et dans le flux, rendus par le serveur ; seul le décor
         * s'ajoute, dans une zone à part qui ne chevauche jamais le texte.
         * À la largeur du contenu et non en `100vw`, qui compte la barre de
         * défilement et ferait déborder la page.
         */
        <div className={styles.bandeauNoel}>
          <div className={styles.decorBandeau} aria-hidden="true" data-borne="">
            <NeigeContinue />
            <BoulesSuspendues zone="bandeau" />
          </div>
          <div className={styles.texteBandeau}>
            <GuirlandeBoules />
            <p className={styles.rubanNoel}>
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="M10 2v16M3 6l14 8M17 6 3 14" />
              </svg>
              Fêtes de fin d&apos;année
            </p>
            <h1 className={styles.titre}>Le catalogue</h1>
            <p className={styles.accroche}>
              Chaque bijou est fait main et créé à l&apos;unité. Chacun peut
              devenir un cadeau.
            </p>
          </div>
          <BandeSucreOrge className={styles.sucreBandeau} />
        </div>
      ) : (
        /*
         * EN-TÊTE D'AUBE, LS-283, amendement d'ADR-045. Plus court que celui
         * de l'aide, critique de Codex : le catalogue doit montrer les
         * bijoux, le médaillon reste à côté du titre et ne repousse pas la
         * grille. Titre et accroche inchangés, rendus par le serveur et
         * immobiles.
         */
        <section className={styles.tete}>
          <div className={styles.teteTexte}>
            <p className={styles.surtitre}>Les créations</p>
            <h1 className={styles.titre}>Le catalogue</h1>
          </div>
          <div className={styles.medaillon}>
            <MedaillonAube
              image="/habillage/catalogue-ecrin-aube.jpg"
              cadrage="74% 62%"
              taille="(min-width: 768px) 200px, 88px"
            />
          </div>
          <p className={styles.accroche}>
            Chaque bijou est fait main et créé à l&apos;unité.
          </p>
        </section>
      )}
      {noel ? <BandePapierCadeau /> : null}

      <div className={noel ? styles.zoneGrilleNoel : undefined}>
        {noel ? <MargesNeigeuses /> : null}
        <Suspense fallback={<ArmatureCatalogue />}>
          <ContenuCatalogue
            slugCategorie={slugCategorie}
            page={page}
            noel={noel}
          />
        </Suspense>
      </div>

      {/*
       * BANDE DE NUIT, LS-283 : une sortie pour qui n'a pas trouvé sa pièce.
       * Elle ne promet aucun service : l'atelier ne fait pas de création sur
       * mesure, arbitrage de Christophe du 7 octobre 2026, LS-284. Hors thème de Noël seulement :
       * l'habillage de LS-277 reste tel qu'il a été validé.
       */}
      {noel ? null : (
        <section className={styles.nuit} aria-labelledby="titre-nuit">
          <div className={styles.nuitImage} aria-hidden="true">
            <Image
              src="/habillage/aide-nuit-colline.jpg"
              alt=""
              fill
              sizes="(min-width: 1152px) 1152px, 100vw"
            />
          </div>
          <div className={styles.nuitEtoiles} aria-hidden="true" data-borne="">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} style={{ "--i": i } as CSSProperties} />
            ))}
          </div>
          <div className={styles.nuitTexte}>
            <h2 id="titre-nuit" className={styles.nuitTitre}>
              Une question sur une pièce ?
            </h2>
            <p className={styles.nuitAccroche}>
              Une matière, une taille, une commande en cours : écrivez à
              l&apos;atelier, chaque message y arrive directement.
            </p>
            <Link href="/contact" className={styles.nuitBouton}>
              Écrire à l&apos;atelier
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M4 10h12m-5-5 5 5-5 5" />
              </svg>
            </Link>
          </div>
        </section>
      )}

      {/* Inclinaison des cartes au survol, ordinateur seulement, LS-262. */}
      <ReactionPointeur />
      {noel ? <BoutonPauseAnimations /> : null}
    </main>
  );
}
