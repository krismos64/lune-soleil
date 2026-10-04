/**
 * Page d'accueil publique, LS-122.
 *
 * COMPOSANT SERVEUR. Textes, liens et données sont rendus ici ; les effets
 * animés de LS-260 vivent dans de petits composants client qui ne produisent
 * aucun texte, ADR-045 point 2. La page reste lisible et complète sans
 * script et en mouvement réduit.
 *
 * ELLE LIT LA BASE A CHAQUE AFFICHAGE, pour la meme raison que le catalogue de
 * LS-104 : la disponibilite change a chaque reservation, et une mise en cache
 * afficherait « En stock » sur une piece unique deja vendue.
 */
import Image from "next/image";
import Link from "next/link";

import { DonneesStructurees } from "@/components/donnees-structurees";
import { jsonLdOrganisation, NOM_BOUTIQUE, openGraphDePage } from "@/lib/seo";
import { lireCataloguePublic } from "@/services/catalogue";
import { CarteProduit } from "./catalogue/carte-produit";
import { BandeauReassurance } from "@/components/bandeau-reassurance";
import { EmblemeAnime } from "@/components/embleme-anime";
import { PoussiereOr } from "@/components/poussiere-or";
import { ReactionPointeur } from "@/components/reaction-pointeur";
import { SceneCycle } from "@/components/scene-cycle";
import { lireSeuilFranchise } from "@/services/parametres";
import styles from "./page.module.css";
import {
  attributTheme,
  PARAMETRE_APERCU_THEME,
  themeDeLaPage,
} from "./theme-de-la-page";

/**
 * LS-137. Le titre est ABSOLU et non modelé.
 *
 * Le gabarit du layout racine ajoute « , Lune-soleil » à chaque titre, ce qui
 * donnerait ici « Lune-soleil, bijoux artisanaux faits main, Lune-soleil ».
 * `absolute` court-circuite le gabarit, et c'est le cas prévu pour l'accueil.
 */
export const metadata = {
  title: {
    absolute: `${NOM_BOUTIQUE}, bijoux artisanaux faits main`,
  },
  description:
    "Des bijoux faits main, créés à l'unité et en petite série. Livraison en France métropolitaine, Corse comprise.",
  alternates: { canonical: "/" },
  openGraph: openGraphDePage({
    titre: `${NOM_BOUTIQUE}, bijoux artisanaux faits main`,
    description:
      "Des bijoux faits main, créés à l'unité et en petite série. Livraison en France métropolitaine, Corse comprise.",
    chemin: "/",
  }),
};

export const dynamic = "force-dynamic";

/** Nombre de créations mises en avant sur l'accueil. */
const NOMBRE_MIS_EN_AVANT = 4;

/**
 * Mentions du bandeau défilant, LS-260 : des faits déjà affirmés ailleurs sur
 * le site, aucun argument neuf.
 */
const MENTIONS_DEFILANTES = [
  "Fait main",
  "À l'unité",
  "Petites séries",
  "Livraison en France métropolitaine",
  "Corse comprise",
] as const;

export default async function PageAccueil({
  searchParams,
}: {
  searchParams: Promise<{ [cle: string]: string | string[] | undefined }>;
}) {
  /*
   * LE MEME SERVICE QUE LE CATALOGUE, sans filtre. `listerProduitsPublies` trie
   * deja par `publie_a DESC NULLS LAST`, ce que le critere 3 demande : refaire
   * un tri ici donnerait deux sources de verite pour la meme notion de
   * nouveaute.
   *
   * LA COUPE SE FAIT ICI ET NON EN SQL. Le dimensionnement du catalogue, 10 a 40
   * references, ne justifie pas un `LIMIT`, et `frontend-design.md` interdit
   * d'introduire un plafond que le schema ne porte pas.
   */
  const parametres = await searchParams;
  const [{ produits, categories }, seuilFranchise, theme] = await Promise.all([
    lireCataloguePublic(),
    lireSeuilFranchise(),
    themeDeLaPage(parametres[PARAMETRE_APERCU_THEME]),
  ]);
  const noel = theme === "NOEL";
  const misEnAvant = produits.slice(0, NOMBRE_MIS_EN_AVANT);

  /*
   * `id` ET `tabIndex={-1}` SUR LE `main` PORTENT LA CIBLE DU LIEN D'EVITEMENT.
   *
   * `tabIndex={-1}` rend l'element focalisable AU PROGRAMME sans l'ajouter au
   * parcours de tabulation. Sans lui, `focus()` echoue en silence et le focus
   * retombe sur `body` : la page defile, mais la tabulation suivante repart du
   * haut, exactement ce que le lien d'evitement doit eviter. Defaut mesure sur
   * le rendu, pas suppose. Les trois autres pages publiques portent le meme
   * attribut sur leur propre `main`.
   */
  return (
    <main id="contenu" tabIndex={-1} data-theme={attributTheme(theme)}>
      {/*
       * LS-137. `Organization` est posée ICI SEULEMENT, et non sur chaque page :
       * les moteurs rattachent l'organisation au domaine, la répéter partout
       * n'ajoute rien et multiplie les occasions de divergence.
       */}
      <DonneesStructurees balisage={jsonLdOrganisation()} />

      {/*
       * HÉROS ANIMÉ, LS-260, maquette validée le 4 octobre 2026.
       *
       * LE TEXTE EST VISIBLE AU PREMIER RENDU, ADR-045 point 5 : titre,
       * accroche et boutons ne partent d'aucune opacité nulle, et le titre
       * reste le plus grand élément peint, donc le LCP. Seuls l'emblème et la
       * poussière d'or s'animent.
       *
       * LA BANNIÈRE DU 23 SEPTEMBRE 2026 N'EST PLUS ICI, arbitrage de
       * Christophe du 4 octobre : l'emblème la remplace. Le fichier reste dans
       * `public/habillage/`.
       *
       * LES DEUX MOTS DORÉS n'emploient que les arrêts `--ls-or-sombre` et
       * `--ls-or-moyen`, 5,51:1 et 4,15:1 sur le fond, au-dessus du seuil de
       * 3:1 du grand texte, ADR-045.
       */}
      <section className={styles.hero} data-borne="">
        <PoussiereOr />
        <div className={styles.heroGrille}>
          <div className={styles.heroTexte}>
            {/*
             * THÈME DE NOËL, ADR-046 : un ruban et une accroche écrits ici,
             * jamais saisis. Aucun ne parle de prix, de date ni de livraison.
             */}
            {noel ? (
              <p className={styles.ruban}>
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M10 2v16M3 6l14 8M17 6 3 14" />
                </svg>
                Fêtes de fin d&apos;année
              </p>
            ) : null}
            <p className={styles.surtitre}>Bijoux faits main</p>
            <h1 className={styles.titre}>
              La <span className={styles.motDore}>lumière</span> d&apos;un
              bijou, le <span className={styles.motDore}>geste</span> d&apos;une
              main.
            </h1>
            <p className={styles.accroche}>
              {noel
                ? "Une pièce faite main, choisie pour quelqu'un : rien ne se ressemble tout à fait, et c'est ce qui fait le cadeau."
                : "Des pièces délicates en petite série, pensées pour accompagner le quotidien sans jamais se ressembler tout à fait."}
            </p>
            <div className={styles.actions}>
              <Link href="/catalogue" className={styles.actionPrincipale}>
                Découvrir les créations
              </Link>
              <Link href="/atelier" className={styles.actionSecondaire}>
                Entrer dans l&apos;atelier
              </Link>
            </div>
          </div>
          <EmblemeAnime saison={noel ? "noel" : undefined} />
        </div>
      </section>

      {/*
       * BANDEAU DE REASSURANCE, LS-236 : les six elements de
       * `frontend-design.md`, dans un composant partage avec `/notre-univers`.
       * Il remplace le bandeau a trois elements, qui taisait la gratuite
       * faute de configuration et l'origine faute de confirmation : les deux
       * sont acquises, ADR-043 et le 3 septembre 2026.
       */}
      <BandeauReassurance seuilFranchiseCentimes={seuilFranchise} />

      {/*
       * DERNIERES CREATIONS.
       *
       * `CarteProduit` EST REUTILISEE TELLE QUELLE, avec la grille du catalogue.
       * La dupliquer ici ferait diverger deux rendus du meme objet des la
       * premiere correction, et c'est ce composant qui porte deja les trois
       * sources d'image, le badge de disponibilite et le prix en centimes.
       *
       * RESERVE ASSUMEE : la carte rend un `h2`, place ici sous le `h2` de la
       * section. La hierarchie reste lisible mais n'est pas ideale. La corriger
       * demanderait de parametrer le niveau de titre dans un composant ecrit par
       * LS-104, donc d'elargir cette story : signale plutot que fait.
       */}
      {misEnAvant.length > 0 && (
        <section className={styles.section}>
          <div className={styles.enteteSection}>
            <div>
              <p className={styles.surtitreSection}>Nouveautés</p>
              <h2 className={styles.titreSection}>
                {noel ? "À offrir, ou à garder" : "Les dernières créations"}
              </h2>
            </div>
            <Link href="/catalogue" className={styles.lienSection}>
              Voir toute la collection
            </Link>
          </div>

          <ul className={styles.grille} data-inclinaison="">
            {misEnAvant.map((produit) => (
              <CarteProduit key={produit.id} produit={produit} />
            ))}
          </ul>
        </section>
      )}

      {/*
       * SCÈNE DU MATIN À LA NUIT, LS-260. Les trois phrases sont rendues ici ;
       * `SceneCycle` ne fait que les montrer une à une au défilement. Elles ne
       * disent rien qui ne soit établi : fait main, à l'unité ou en petite
       * série, la même allégation que l'accroche et les métadonnées.
       */}
      <SceneCycle titre="Du matin à la nuit">
        <div data-phrase="">
          <h2>Au matin, une idée.</h2>
          <p>Une forme, une couleur, un souvenir à porter.</p>
        </div>
        <div data-phrase="">
          <h2>En plein jour, le geste.</h2>
          <p>
            Chaque pièce est façonnée à la main, à l&apos;unité ou en petite
            série.
          </p>
        </div>
        <div data-phrase="">
          <h2>À la nuit, l&apos;éclat.</h2>
          <p>
            Un bijou qui garde un peu de lumière, quelle que soit l&apos;heure.
          </p>
        </div>
      </SceneCycle>

      {/*
       * ENTREE PAR CATEGORIE.
       *
       * `categories` NE PORTE QUE CE QUI A DU PUBLIE, `listerCategoriesPubliees`
       * le garantit. Proposer une entree vers une categorie vide fabriquerait
       * l'etat vide au lieu de l'eviter, ce que LS-104 avait deja tranche.
       *
       * LA NUMEROTATION EST DECORATIVE, `aria-hidden` : « 01 » n'apporte rien a
       * qui ecoute, et serait lu « zero un » avant chaque nom de categorie.
       */}
      {categories.length > 0 && (
        <section className={styles.sectionCategories}>
          <div className={styles.introCategories}>
            <p className={styles.surtitreSection}>Choisir simplement</p>
            <h2 className={styles.titreSection}>
              Quel bijou vous appelle aujourd&apos;hui ?
            </h2>
          </div>

          <ul className={styles.listeCategories}>
            {categories.map((categorie, index) => (
              <li key={categorie.id}>
                <Link
                  href={`/catalogue?categorie=${categorie.slug}`}
                  className={styles.lienCategorie}
                >
                  <span className={styles.rangCategorie} aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.nomCategorie}>{categorie.nom}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*
       * BANDEAU DÉFILANT, LS-260. Décor : `aria-hidden`, chaque mention
       * figurant déjà ailleurs dans la page en texte lisible. Son animation
       * n'existe qu'une fois le script actif, cinq secondes au plus par
       * entrée dans l'écran, et aucune sans script, ADR-045 point 4. La suite
       * est écrite deux fois pour que la boucle se raccorde sans saut.
       */}
      <div className={styles.defilant} aria-hidden="true" data-borne="">
        <div className={styles.piste}>
          {[0, 1].map((tour) =>
            MENTIONS_DEFILANTES.map((mention) => (
              <span key={`${tour}-${mention}`}>{mention}</span>
            )),
          )}
        </div>
      </div>

      {/*
       * SCEAU, LS-260 : le logo réel et le texte éditorial conservé, arbitrage
       * de Christophe du 4 octobre 2026.
       *
       * LE TEXTE NE DIT NI LE LIEU NI LE NOMBRE DE CREATRICES. Le recit appartient
       * a LS-25, valide par l'exploitante, et une allegation d'origine non
       * confirmee serait une pratique commerciale trompeuse. Ce bloc annonce la
       * page sans raconter a sa place.
       *
       * LE LOGO PORTE UN `alt` QUI REPREND SON TEXTE, nom et mention : un texte
       * dans une image n'est lisible autrement que par l'oeil.
       */}
      <section className={styles.editorial}>
        <div className={styles.sceau}>
          {/*
           * L'APPARITION ET LE FLOTTEMENT SUR DEUX ÉLÉMENTS : tous deux animent
           * `transform`, et sur le même élément l'un masquait l'autre. Le
           * texte et son bouton n'apparaissent pas en fondu, ADR-045 point 5.
           */}
          <div data-apparition="">
            <div className={styles.sceauImage} data-borne="">
              <Image
                src="/habillage/logo-sceau.jpg"
                alt={`Logo ${NOM_BOUTIQUE}, une lune et un soleil dorés, mention « bijoux faits main »`}
                width={720}
                height={720}
                sizes="(min-width: 768px) 300px, 64vw"
                className={styles.logo}
              />
            </div>
          </div>
          <div className={styles.editorialTexte}>
            <p className={styles.surtitreEditorial}>L&apos;atelier</p>
            <h2 className={styles.titreEditorial}>
              Créer peu, créer avec intention.
            </h2>
            <p className={styles.texteEditorial}>
              Chaque bijou commence par une association de formes et de
              matières, travaillée à la main et produite en petite quantité.
            </p>
            <Link href="/atelier" className={styles.actionEditorial}>
              Découvrir l&apos;atelier
            </Link>
          </div>
        </div>
      </section>

      <ReactionPointeur />
    </main>
  );
}
