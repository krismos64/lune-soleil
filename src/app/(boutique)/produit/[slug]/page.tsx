/**
 * Fiche produit publique, LS-105. Onze blocs dans l'ordre impose.
 *
 * COMPOSANT SERVEUR qui assemble ; deux enfants seulement sont clients, la
 * galerie et le bloc d'achat, parce que changer de photo ou de declinaison ne
 * doit pas recharger la page. Tout le reste est rendu au serveur.
 *
 * L'ORDRE DES BLOCS EST IMPOSE PAR `frontend-design.md`, pas suggere. Il est
 * concu pour un ecran de 320 px ou tout est empile : ce qui decide de l'achat
 * au-dessus, ce qui rassure et detaille ensuite. Ne pas le reorganiser, meme
 * si le rendu a 1280 px semblerait s'en accommoder.
 *
 * DEUX BLOCS SONT POSES SANS ETRE IMPLEMENTES, et c'est deliberé :
 *   - le bloc 6, ajout au panier, appartient a la phase 3, epic LS-4
 *   - le bloc 11, avis verifies, appartient a LS-61, epic LS-36
 * Leur emplacement est reserve maintenant pour ne pas reorganiser la page plus
 * tard.
 *
 * `params` EST UNE PROMESSE en Next.js 16, comme `searchParams` : elle
 * s'attend, elle ne se lit pas directement.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { lireFichePublique } from "@/services/catalogue";
import styles from "./fiche.module.css";
import { Galerie } from "./galerie";
import { SelecteurVariante } from "./selecteur-variante";

/**
 * La page lit la base a chaque affichage.
 *
 * UNE FICHE MISE EN CACHE MONTRERAIT UNE PIECE DEJA VENDUE. La disponibilite
 * change a chaque reservation, et c'est la donnee la plus volatile de l'ecran :
 * c'est aussi celle sur laquelle un client decide d'acheter.
 */
export const dynamic = "force-dynamic";

/*
 * AUCUN `loading.tsx` SUR CETTE ROUTE, ET C'EST UN ARBITRAGE, PAS UN OUBLI.
 *
 * `frontend-design.md` exige un etat de chargement, et LS-104 en a pose un sur
 * le catalogue. Ici il est INCOMPATIBLE avec le 404 : `loading.tsx` enveloppe
 * la page entiere dans une frontiere Suspense, le streaming de la reponse
 * commence donc AVANT que `notFound()` soit atteint, et Next.js laisse alors le
 * statut a 200 en se contentant d'ajouter un `noindex`. Verifie par Context7 sur
 * la documentation de Next.js 16, et mesure : 404 sans le fichier, 200 avec.
 *
 * LE SEO TRANCHE. Un brouillon et un slug inconnu doivent rendre un VRAI 404 :
 * repondre 200 les rendrait indexables, et le `noindex` ne protege que des
 * moteurs qui le respectent. Le SEO est prioritaire sur ce projet, et un statut
 * faux est un defaut de correction quand l'ecran fige n'est qu'un defaut de
 * confort.
 *
 * CE QUI LE RETABLIRAIT SANS LE CONFLIT : deplacer le contenu lourd sous un
 * `<Suspense>` DANS cette page, en gardant le controle d'existence au-dessus.
 * La lecture etant aujourd'hui unique et rapide, l'ajouter compliquerait la
 * page pour un gain nul. A reconsiderer si la fiche gagne des donnees lentes,
 * les avis de LS-61 par exemple.
 */

/**
 * Metadonnees construites depuis la fiche, SEO etant prioritaire sur ce projet.
 *
 * UN PRODUIT NON SERVI NE PORTE AUCUN TITRE DE PRODUIT. Rendre « Bague fine »
 * en titre d'une page 404 divulguerait l'existence d'un brouillon, ce que la
 * garde du service refuse par ailleurs : les deux doivent dire la meme chose.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const fiche = await lireFichePublique(slug);

  if (fiche === null) {
    return { title: "Pièce introuvable, Lune & Soleil" };
  }

  return {
    title: `${fiche.nom}, Lune & Soleil`,
    description:
      fiche.descriptionCourte ??
      `${fiche.nom}, bijou artisanal fait main, créé à l'unité.`,
  };
}

export default async function PageFicheProduit({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const fiche = await lireFichePublique(slug);

  /*
   * `notFound()` SUR UN BROUILLON COMME SUR UN SLUG INCONNU. Le service rend
   * `null` dans les deux cas, sans les distinguer : repondre differemment
   * dirait au visiteur quels slugs existent en preparation.
   */
  if (fiche === null) {
    notFound();
  }

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      {/*
       * FIL D'ARIANE, retour vers la categorie. Il n'est pas dans la table des
       * onze blocs, qui commence au nom du bijou : il precede donc le bloc 1
       * sans s'y inserer, et donne le chemin de retour au catalogue filtre.
       */}
      <nav className={styles.filAriane} aria-label="Fil d'Ariane">
        <ol className={styles.filArianeListe}>
          <li>
            <Link href="/catalogue" className={styles.filArianeLien}>
              Le catalogue
            </Link>
          </li>
          <li>
            <Link
              href={`/catalogue?categorie=${fiche.categorieSlug}`}
              className={styles.filArianeLien}
            >
              {fiche.categorieNom}
            </Link>
          </li>
        </ol>
      </nav>

      <div className={styles.corps}>
        {/*
         * LA GALERIE EST PREMIERE DANS LE DOM, et c'est ce qui permet a la mise
         * en page de deux colonnes de la placer a gauche sans aucun `order` :
         * l'ordre de lecture au clavier reste celui qu'on voit.
         *
         * SANS PHOTOGRAPHIE, PAS DE GALERIE DU TOUT. La fiche reste servie,
         * comme la carte sans photo du catalogue reste affichable.
         */}
        {fiche.photos.length > 0 && (
          <Galerie photos={fiche.photos} nomProduit={fiche.nom} />
        )}

        <div className={styles.achat}>
          {/* Bloc 1, nom du bijou. */}
          <h1 className={styles.titre}>{fiche.nom}</h1>

          {/* Bloc 2, presentation courte. Absente, le paragraphe disparait. */}
          {fiche.descriptionCourte !== null &&
            fiche.descriptionCourte.trim() !== "" && (
              <p className={styles.presentation}>{fiche.descriptionCourte}</p>
            )}

          {/* Blocs 3 a 8 : ils dependent tous de la declinaison choisie. */}
          <SelecteurVariante variantes={fiche.variantes} />
        </div>

        <div className={styles.editorial}>
          {/*
           * Bloc 9, sections editoriales, pilotees par l'administratrice,
           * ADR-026.
           *
           * LE FILTRE EST DEJA FAIT PAR LE SERVICE, C22 et C23 : ce qui arrive
           * ici est visible et non vide. Ne pas refiltrer ici, ce qui
           * dupliquerait une regle metier dans un composant.
           *
           * LE CONTENU EST DU TEXTE, RENDU COMME TEL. React l'echappe par
           * defaut, et `white-space: pre-line` rend les sauts de ligne :
           * `dangerouslySetInnerHTML` est interdit sur ce champ, C23, et un
           * controle du depot le verifie sur tout `src/`.
           */}
          {fiche.sections.map((section) => (
            <section key={section.id} className={styles.section}>
              <h2 className={styles.titreSection}>{section.titre}</h2>
              <p className={styles.texteSection}>{section.contenu}</p>
            </section>
          ))}

          {/*
           * Bloc 10, retours et retractation.
           *
           * LES TEXTES LEGAUX SONT RENVOYES, JAMAIS RECOPIES, critere de la
           * story. Un delai ou une condition duplique ici se perimerait en
           * silence le jour ou la page legale change, et une information
           * precontractuelle fausse se sanctionne au-dela de l'ecart annonce.
           *
           * LES FRAIS DE RETOUR SONT MENTIONNES AVEC LA RETRACTATION, et jamais
           * separement : `frontend-design.md` et `legal.md` l'imposent, faute de
           * quoi le delai de retractation passe a douze mois, article L221-20.
           */}
          {/*
           * LE LIEN EST POSE DEPUIS LE 3 SEPTEMBRE 2026, LS-28 : la page
           * `/informations-legales` existe, et son ancre `#retractation` porte
           * le detail. Il etait deliberement absent jusque-la, un lien vers une
           * 404 sur la page ou le client decide d'acheter etant pire que son
           * absence.
           *
           * LE TEXTE COURT RESTE, il ne se remplace pas par le lien : le delai
           * et la charge des frais de retour doivent se lire SUR la fiche,
           * `legal.md` et l'article L221-23. Renvoyer sans les afficher exposerait
           * au delai de douze mois de l'article L221-20.
           */}
          <section className={styles.legal}>
            <h2 className={styles.titreSection}>Retours et rétractation</h2>
            <p className={styles.texteSection}>
              14 jours pour changer d&apos;avis à compter de la réception, frais
              de retour à la charge du client.{" "}
              <Link
                href="/informations-legales#retractation"
                className={styles.lienLegal}
              >
                Détail du droit de rétractation
              </Link>
            </p>
          </section>

          {/*
           * Bloc 11, avis verifies. EMPLACEMENT RESERVE, non implemente : les
           * avis appartiennent a LS-61, epic LS-36. La place est prise
           * maintenant pour ne pas reorganiser la page ensuite, et rien ne
           * s'affiche tant qu'aucun avis n'existe.
           */}
        </div>
      </div>
    </main>
  );
}
