/**
 * Page « Notre univers », LS-123 : histoire de la marque, matieres et entretien.
 *
 * TROIS LIENS Y MENAIENT ET RENDAIENT 404, verifie en production le 20 septembre
 * 2026 : deux depuis l'accueil, `page.tsx` lignes 94 et 261, et « Notre
 * histoire » au pied de page. Le critere 1 de LS-123 exige qu'aucun lien du pied
 * ne soit mort.
 *
 * ELLE ARRIVE APRES `/aide`, ET CE N'ETAIT PAS UN CHOIX D'ORDRE. Le commentaire
 * de la page soeur le disait : « l'ecrire reviendrait a inventer ». Ce qu'elle
 * porte n'existait dans aucun document, seule l'exploitante le detenait. LS-25
 * a recolte ces textes aupres d'elle le 20 septembre 2026.
 *
 * UNE PAGE A ANCRES ET NON TROIS PAGES, arbitrage de Christophe du 20 septembre
 * 2026. LS-25 annonce trois pages, le prototype les reunit sous `/notre-univers`
 * avec `#matieres` et `#entretien` : l'ecart etait trace depuis le 19 aout et
 * n'avait jamais ete arbitre.
 *
 * ---------------------------------------------------------------------------
 * CE QUE CE TEXTE N'AFFIRME PAS, ET POURQUOI CHAQUE OMISSION EST DELIBEREE.
 *
 * AUCUN PRENOM, AUCUNE SECONDE PERSONNE. L'exploitante exerce seule et demande
 * que son prenom reste hors du site. Le recit est donc a la premiere personne du
 * singulier. Toute reecriture au « nous », ou nommant une seconde creatrice,
 * decrirait une entreprise qui n'existe pas.
 *
 * « HYPOALLERGENIQUE » EST ECARTE. L'acier inoxydable libere tres peu de nickel,
 * ce qui n'est pas l'absence d'allergie : une etude relevee le 20 septembre 2026
 * mesure encore environ 2 % de reactions sur l'acier 316L. Promettre l'absence
 * d'allergie a qui reagirait quand meme serait une allegation trompeuse. La
 * formulation retenue dit le fait, « libere tres peu de nickel », et sa portee,
 * « bien tolere par la plupart des peaux sensibles ».
 *
 * LA NUANCE D'ACIER N'EST PAS CITEE. L'exploitante ne la connait pas, et 316L
 * n'est donc pas ecrit : une specification technique inventee se retournerait
 * contre elle. Si elle l'obtient de son fournisseur, elle pourra l'ajouter.
 *
 * « MODELE » EST EMPLOYE, ET IL NE L'ETAIT PAS. `frontend-design.md` l'interdit
 * depuis le 3 septembre 2026, le verbe ayant ete invente par un generateur et
 * jamais confirme. L'exploitante l'a confirme le 20 septembre 2026 : elle modele
 * la pate elle-meme. L'interdit tombe sur cette confirmation, et la regle est
 * mise a jour dans le meme commit.
 *
 * AUCUN DELAI, AUCUN PRIX, AUCUNE PROVENANCE DE MATIERE. Rien de tout cela n'a
 * ete confirme. La liste des matieres dit de quoi sont faits les bijoux, jamais
 * d'ou viennent les composants.
 * ---------------------------------------------------------------------------
 * LES CINQ PHOTOGRAPHIES MONTRENT LE TRAVAIL, JAMAIS UNE OFFRE, arbitrage de
 * Christophe du 20 septembre 2026.
 *
 * Elles portent des pieces qui ne sont PAS au catalogue, un serpent jaune et des
 * creoles corail notamment. Ce sont des creations reelles de l'exploitante,
 * confirme le meme jour, vendues sur les marches ou deja parties.
 *
 * LA DISTINCTION EST CELLE QUI SEPARE CETTE PAGE D'UNE PAGE DE VENTE : aucun
 * prix, aucun bouton panier, aucune reference. Le visiteur y voit un atelier au
 * travail, pas un catalogue. Une photographie de PRODUIT presentant une piece
 * inexistante serait une allegation trompeuse, LS-22, et c'est pour ce motif que
 * `accueil-hero.jpg` doit etre remplace avant l'ouverture.
 *
 * ELLES NE PASSENT PAS PAR LA CHAINE DE TRAITEMENT DES MEDIAS, ADR-007 : c'est
 * de l'habillage versionne, et le retrait des metadonnees n'y est donc PAS
 * automatique. Les cinq ont ete nettoyees a la conversion, `sharp` sans
 * `keepExif()`, puis verifiees octet par octet le 20 septembre 2026 : aucun
 * segment EXIF, GPS, XMP ni ICC, aucun APP residuel. Toute image ajoutee ici
 * repasse par cette verification, `public/habillage/README.md` la porte.
 * ---------------------------------------------------------------------------
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { NOM_BOUTIQUE, openGraphDePage } from "@/lib/seo";
import styles from "./notre-univers.module.css";

export const metadata: Metadata = {
  title: "Notre univers",
  description: `L'histoire de ${NOM_BOUTIQUE}, les matières des bijoux et les conseils pour en prendre soin. Bijoux faits main en Béarn, chaque pièce est unique.`,
  // LS-137, page publique indexable : canonical explicite.
  alternates: { canonical: "/notre-univers" },
  openGraph: openGraphDePage({
    titre: "Notre univers",
    description:
      "L'histoire de la marque, les matières des bijoux et les conseils pour en prendre soin.",
    chemin: "/notre-univers",
  }),
};

export default function PageNotreUnivers() {
  return (
    /* `id="contenu"` : cible du lien d'evitement, voir la page soeur. */
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Notre univers</h1>

      <nav className={styles.sommaire} aria-label="Sections de cette page">
        <ul className={styles.listeSommaire}>
          <li>
            <a href="#histoire">Mon histoire</a>
          </li>
          <li>
            <a href="#matieres">Les matières</a>
          </li>
          <li>
            <a href="#entretien">L&apos;entretien</a>
          </li>
        </ul>
      </nav>

      <section
        id="histoire"
        tabIndex={-1}
        className={styles.section}
        aria-labelledby="titre-histoire"
      >
        <h2 id="titre-histoire" className={styles.titreSection}>
          Mon histoire
        </h2>

        {/*
         * `priority` SUR CETTE SEULE IMAGE : elle est la plus haute de la page
         * et entre dans le plus grand rendu de contenu. Le poser sur les cinq
         * ferait concourir les telechargements et retarderait celle-ci.
         */}
        <Image
          src="/habillage/univers-modelage.jpg"
          alt="Deux mains façonnent une fleur en pâte polymère violette sur un plan de travail en bois, entourées de feuilles d'or, de paillettes bleues et d'un outil à bille"
          className={styles.illustration}
          width={1586}
          height={992}
          priority
          sizes="(min-width: 48rem) 48rem, 100vw"
        />

        <p className={styles.texte}>
          J&apos;ai toujours créé des bijoux. D&apos;abord pour moi, simplement
          parce que j&apos;aimais porter des pièces qui n&apos;existaient nulle
          part ailleurs.
        </p>

        <p className={styles.texte}>Puis les compliments sont venus.</p>

        <p className={styles.citation}>
          Elles viennent d&apos;où, ces boucles d&apos;oreilles ?
        </p>

        <p className={styles.texte}>
          Quand je répondais que je les avais faites moi-même, la question
          suivante était toujours la même : est-ce que je pouvais en faire pour
          elles.
        </p>

        <p className={styles.texte}>
          Ça a duré des années. L&apos;idée d&apos;en faire une activité me
          trottait dans la tête sans que je saute le pas. En 2026, je me suis
          lancée.
        </p>

        {/*
         * L'ORIGINE DU NOM, choisie par l'exploitante le 20 septembre 2026.
         *
         * UNE PHRASE ET NON UN PARAGRAPHE : c'est un detail qui attache, pas un
         * chapitre. Un encadre dedié en ferait une legende de marque, registre
         * que le reste de la page evite.
         *
         * ELLE N'AFFIRME RIEN D'INVERIFIABLE, et c'est ce qui l'a fait retenir
         * parmi dix propositions : elle dit un gout, jamais une origine
         * geographique ni une anecdote fondatrice qu'il faudrait pouvoir
         * prouver.
         */}
        <p className={styles.texte}>
          Un bijou pour les jours calmes, un autre pour ceux qui brillent. Je
          n&apos;ai jamais su choisir.
        </p>

        <p className={styles.texte}>
          Aujourd&apos;hui je fais tout : je modèle, je photographie, je réponds
          aux messages, je prépare les colis, je tiens le stand sur les marchés.
          Mon atelier est à Artix, dans les Pyrénées-Atlantiques. C&apos;est une
          petite pièce qui m&apos;est réservée, et c&apos;est là que chaque pièce
          naît, du premier geste à l&apos;emballage.
        </p>

        <Image
          src="/habillage/univers-atelier.jpg"
          alt="Un plan de travail près d'une fenêtre : pains de pâte polymère colorés, bijoux en cours de séchage, casier de crochets et de fermoirs, rouleau et scalpel"
          className={styles.illustration}
          width={1586}
          height={992}
          sizes="(min-width: 48rem) 48rem, 100vw"
        />
        <p className={styles.legende}>
          Mon plan de travail, un jour de modelage.
        </p>

        <h3 className={styles.titreSection}>Des pièces uniques</h3>

        <p className={styles.texte}>
          Mes idées viennent souvent d&apos;une tenue. Une couleur que je vois,
          une matière, et l&apos;envie d&apos;un bijou qui irait avec.
        </p>

        <p className={styles.texte}>
          <strong>Chaque pièce est unique.</strong> Certaines se ressemblent,
          mais aucune n&apos;est identique : le modelage à la main crée toujours
          de petites différences, et je les assume.
        </p>

        <p className={styles.texte}>
          C&apos;est un choix, pas une limite. Ça veut dire que{" "}
          <strong>
            la photo que vous voyez est celle du bijou que vous recevrez
          </strong>
          . Pas un modèle approchant, pas une illustration : votre bijou.
        </p>

        {/*
         * LA PHOTO PORTEE DONNE L'ECHELLE, ce qu'une prise a plat ne fait
         * jamais : la taille reelle d'une boucle est la question qui revient le
         * plus souvent avant un achat.
         */}
        <Image
          src="/habillage/univers-porte.jpg"
          alt="Une boucle d'oreille en forme de fleur violette pailletée portée à l'oreille, vue de profil"
          className={styles.illustrationCarree}
          width={1000}
          height={1000}
          sizes="(min-width: 48rem) 24rem, 100vw"
        />

        <h3 className={styles.titreSection}>Ce à quoi je tiens</h3>

        <p className={styles.texte}>
          Une question sur une taille, une couleur, un délai ? Écrivez-moi, je
          réponds moi-même.
        </p>

        <p className={styles.texte}>
          Je soigne aussi les colis. Recevoir un bijou doit être un moment
          agréable, pas juste l&apos;ouverture d&apos;un carton.
        </p>

        <Image
          src="/habillage/univers-emballage.jpg"
          alt="Une paire de boucles d'oreilles en forme de serpent jaune pailleté, présentée sur une carte de papier écru dans une pochette transparente"
          className={styles.illustrationCarree}
          width={1000}
          height={1000}
          sizes="(min-width: 48rem) 24rem, 100vw"
        />
      </section>

      <section
        id="matieres"
        tabIndex={-1}
        className={styles.section}
        aria-labelledby="titre-matieres"
      >
        <h2 id="titre-matieres" className={styles.titreSection}>
          Les matières
        </h2>

        <Image
          src="/habillage/univers-matieres.jpg"
          alt="Vue de dessus des matières : pains de pâte polymère violets, beiges et bleus, crochets et dormeuses en acier, flacon de vernis, paillettes bleues et feuilles d'or"
          className={styles.illustration}
          width={1586}
          height={992}
          sizes="(min-width: 48rem) 48rem, 100vw"
        />

        <p className={styles.texte}>
          Tous mes bijoux partent des mêmes matières. Ce qui change d&apos;une
          pièce à l&apos;autre, ce sont les couleurs et les formes.
        </p>

        <ul className={styles.liste}>
          <li>
            <strong>La pâte polymère</strong> donne le corps du bijou. Je la
            modèle à la main, puis elle durcit à la cuisson. C&apos;est une
            matière légère, ce qui compte pour des boucles d&apos;oreilles
            portées toute la journée.
          </li>
          <li>
            <strong>L&apos;acier inoxydable</strong> pour tout ce qui touche la
            peau : crochets, fermoirs, attaches, et les contours des bagues.
            C&apos;est un choix délibéré. L&apos;acier inoxydable libère très peu
            de nickel, ce qui le rend bien toléré par la plupart des peaux
            sensibles.
          </li>
          <li>
            <strong>Le vernis brillant</strong> protège la surface et donne sa
            profondeur à la couleur.
          </li>
          <li>
            <strong>Les paillettes</strong>, et{" "}
            <strong>les feuilles d&apos;or</strong> sur certaines pièces, pour
            les reflets.
          </li>
        </ul>
      </section>

      <section
        id="entretien"
        tabIndex={-1}
        className={styles.section}
        aria-labelledby="titre-entretien"
      >
        <h2 id="titre-entretien" className={styles.titreSection}>
          L&apos;entretien
        </h2>

        <p className={styles.texte}>
          Un bijou en pâte polymère dure des années si on prend deux ou trois
          précautions.
        </p>

        <h3 className={styles.titreSection}>À éviter</h3>

        <p className={styles.precaution}>
          Le parfum, la laque, la crème et les produits ménagers : ils
          ternissent les couleurs et attaquent le vernis. Mettez vos bijoux en
          dernier, après la coiffure et le parfum. Retirez-les avant la douche,
          la piscine et le coucher.
        </p>

        <h3 className={styles.titreSection}>Pour nettoyer</h3>

        <p className={styles.texte}>
          Un chiffon doux, à peine humide. Si besoin, une goutte de liquide
          vaisselle dans de l&apos;eau tiède, puis séchez aussitôt.
        </p>

        <p className={styles.precaution}>
          Jamais d&apos;alcool, d&apos;acétone ni de nettoyant pour bijoux : ces
          produits dissolvent le vernis.
        </p>

        <h3 className={styles.titreSection}>Pour ranger</h3>

        <p className={styles.texte}>
          Dans leur pochette ou une boîte, à l&apos;abri du soleil direct. Rangés
          à part les uns des autres, ils ne se rayent pas.
        </p>
      </section>

      {/*
       * LA SORTIE VERS LE CATALOGUE, relevee le 20 septembre 2026 en comparant
       * cette page a celle d'un concurrent du meme bassin.
       *
       * ELLE MANQUAIT : la page se terminait sur le rangement, et qui la lisait
       * jusqu'au bout n'avait nulle part ou aller. Une page editoriale sans
       * sortie renvoie son lecteur au bouton precedent de son navigateur.
       *
       * LE LIBELLE EST CELUI DE L'ACCUEIL, « Decouvrir les creations », a
       * dessein : deux formulations differentes pour la meme destination font
       * hesiter, et l'accueil est la page ou il a ete eprouve.
       *
       * AUCUNE PROMESSE AJOUTEE ICI. La phrase reprend ce que la page a deja
       * etabli, l'unicite et le fait main, sans annoncer un delai, un prix ni
       * une disponibilite que le catalogue seul connait.
       */}
      <section className={styles.sortie} aria-labelledby="titre-sortie">
        <h2 id="titre-sortie" className={styles.titreSortie}>
          Chaque pièce n&apos;existe qu&apos;une fois
        </h2>

        <p className={styles.texte}>
          Vous savez maintenant comment elles naissent. Les créations du moment
          sont dans la boutique, et chacune est la seule de son espèce.
        </p>

        <Link href="/catalogue" className={styles.actionCatalogue}>
          Découvrir les créations
        </Link>
      </section>
    </main>
  );
}
