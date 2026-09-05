/**
 * Etat de chargement des ecrans d'administration, LS-188.
 *
 * POURQUOI UN COMPOSANT PARTAGE ET NON ONZE FICHIERS. Chaque ecran a son propre
 * module CSS, et onze squelettes ecrits separement divergeraient : le douzieme
 * ecran copierait celui qu'il a sous la main plutot que la forme voulue. Ici la
 * forme vit a un seul endroit, et chaque `loading.tsx` ne fournit que ce qui
 * change, son titre et le nombre de lignes attendues.
 *
 * UNE ARMATURE ET NON UN TOURNIQUET, critere 3. Les barres occupent la place que
 * le contenu prendra, ce qui evite le saut de mise en page a l'arrivee des
 * donnees. Le motif vient de `(boutique)/catalogue/loading.tsx`, LS-104, seul
 * etat de chargement du depot avant cette story.
 *
 * L'EN-TETE EST RENDU POUR DE VRAI, jamais en ardoise. Le sur-titre et le titre
 * sont connus avant la requete, ils ne dependent d'aucune donnee : les remplacer
 * par des barres grises ferait clignoter un texte que rien n'obligeait a
 * disparaitre, et priverait l'exploitante du seul repere qui lui dit QUEL ecran
 * se charge.
 *
 * IL NE PORTE AUCUN STYLE D'ECRAN. Les classes viennent du module de l'ecran
 * appelant, passees en proprietes : un composant partage qui importerait
 * `clients.module.css` imposerait la mise en page des clients aux dix autres.
 *
 * ------------------------------------------------------------------
 * DEUX POSITIONS D'APPEL, ET C'EST `titre` QUI LES DISTINGUE.
 *
 * EN `loading.tsx` DE SEGMENT, dix ecrans : le composant remplace la page
 * entiere, donc il rend son propre `<main>` et son propre `<h1>`. `titre` et
 * `classePage` sont alors fournis.
 *
 * EN REPLI D'UN `<Suspense>` INTERNE, trois ecrans de liste : le `<main>` et le
 * `<h1>` de la page sont DEJA rendus au-dessus de la frontiere, et le repli ne
 * remplace que le contenu suspendu. `titre` est omis, le composant rend alors un
 * fragment sans en-tete. Le redonner produirait un second `<main>` imbrique et
 * un second `<h1>`, deux defauts d'accessibilite.
 * ------------------------------------------------------------------
 */
import type { CSSProperties } from "react";

import styles from "./chargement-administration.module.css";

/**
 * Combien de barres l'armature montre.
 *
 * CE N'EST PAS UN REGLAGE COSMETIQUE : le nombre doit approcher ce que l'ecran
 * affiche d'habitude. Trop peu, la page grandit d'un coup a l'arrivee des
 * donnees ; trop, elle retrecit. Les listes d'administration plafonnent a 100
 * lignes mais en montrent une poignee sur une boutique qui demarre.
 */
const LIGNES_PAR_DEFAUT = 4;

export function ChargementAdministration({
  titre,
  surtitre,
  tete,
  annonce,
  lignes = LIGNES_PAR_DEFAUT,
  classePage,
  classeTitre,
  classeSurtitre,
}: {
  /**
   * Le titre de l'ecran, identique a celui que la page rendra.
   *
   * OMIS EN REPLI DE `<Suspense>` INTERNE, ou la page a deja rendu son `<main>`
   * et son `<h1>` au-dessus de la frontiere.
   */
  titre?: string | undefined;
  /** Le sur-titre, quand l'ecran en porte un. */
  surtitre?: string | undefined;
  /**
   * Ce que la page rend AVANT son sur-titre, un lien de retour le plus souvent.
   *
   * IL FAIT PARTIE DE LA MESURE DE PLACE, ce n'est pas un ornement. Le lien de
   * retour des ecrans Expeditions et Messages occupe 44 px de cible tactile plus
   * 12 px de marge : l'omettre remonte le titre et tout ce qui suit de 56 px,
   * puis les redescend a l'arrivee des donnees. Exactement le saut que
   * l'armature existe pour eviter.
   *
   * IL EST RENDU A L'IDENTIQUE, lien compris et donc cliquable : pendant le
   * chargement, repartir en arriere est justement ce qu'on peut vouloir faire.
   */
  tete?: React.ReactNode;
  /**
   * Ce qu'un lecteur d'ecran entend.
   *
   * IL EST EXPLICITE ET NON DERIVE DU TITRE. « Chargement des commandes » se lit
   * mieux que « Chargement de Commandes », et le francais ne permet pas de
   * fabriquer la seconde forme depuis la premiere sans se tromper de genre ou
   * d'article. Le laisser au point d'appel est plus court que la regle qui
   * l'engendrerait.
   */
  annonce: string;
  /** Nombre de barres de l'armature. */
  lignes?: number | undefined;
  /**
   * Classes du module CSS de l'ecran appelant.
   *
   * `| undefined` SUR LES TROIS, Y COMPRIS SUR `classePage` QUI EST REQUISE.
   * `noUncheckedIndexedAccess` est actif : une cle de module CSS se lit en
   * `string | undefined`, meme quand la classe existe bel et bien dans le
   * fichier. Exiger `string` obligerait chaque appelant a ecrire `?? ""`, huit
   * fois, sans rien verifier de plus. La difference entre les trois reste
   * portee par le point d'interrogation : `classePage` doit etre PASSEE, les
   * deux autres peuvent etre omises, et l'ecran du journal des connexions omet
   * bien `classeTitre` parce que son `h1` n'a pas de classe.
   */
  classePage?: string | undefined;
  classeTitre?: string | undefined;
  classeSurtitre?: string | undefined;
}) {
  /*
   * `exactOptionalPropertyTypes` EST ACTIF, d'ou les `| undefined` explicites
   * ci-dessus : le point d'interrogation seul autorise l'absence de la
   * propriete, pas sa presence a `undefined`, et un appelant qui calcule son
   * sur-titre par une ternaire passe bien `undefined`.
   */
  const rangs = Array.from({ length: Math.max(1, lignes) }, (_, rang) => rang);

  const corps = (
    <>
      {/*
       * `role="status"` ET NON UN SIMPLE PARAGRAPHE. Un lecteur d'ecran doit
       * apprendre que la page travaille, sans quoi l'exploitante ne sait pas si
       * son geste a ete pris. Meme choix qu'en LS-185 sur l'ecran Clients.
       *
       * `aria-live` N'EST PAS AJOUTE, `role="status"` le portant implicitement
       * en `polite` : le doubler ne change rien et brouille la lecture.
       */}
      <p className={styles.annonce} role="status">
        {annonce}
      </p>

      {/*
       * `aria-hidden` SUR L'ARMATURE. Annoncer quatre barres vides n'apprend
       * rien a qui ecoute, la phrase ci-dessus le fait mieux. C'est ce qui rend
       * ces barres purement decoratives, et donc dispensees de nom accessible.
       */}
      <ul className={styles.armature} aria-hidden="true">
        {rangs.map((rang) => (
          <li key={rang} className={styles.ligne}>
            {/*
             * LES DEUX BARRES ONT DES LARGEURS DIFFERENTES, et la seconde varie
             * legerement d'une ligne a l'autre. Des barres toutes identiques se
             * lisent comme un tableau vide plutot que comme une attente.
             *
             * LA VARIATION EST DETERMINISTE, calculee sur le rang et non tiree
             * au hasard : `Math.random()` au rendu donnerait un serveur et un
             * client differents, donc une erreur d'hydratation.
             */}
            <span className={styles.barreLongue} />
            <span
              className={styles.barreCourte}
              style={
                { "--ls-largeur-barre": largeurCourte(rang) } as CSSProperties
              }
            />
          </li>
        ))}
      </ul>
    </>
  );

  /*
   * SANS `titre`, LE COMPOSANT NE REND QUE SON CORPS. Il sert alors de repli a
   * une frontiere INTERNE, sous un `<main>` et un `<h1>` que la page a deja
   * rendus : ajouter les siens produirait un `<main>` imbrique et un second
   * `<h1>`, que `axe-core` signalerait a juste titre.
   */
  if (titre === undefined) {
    return corps;
  }

  return (
    <main className={classePage}>
      {tete}
      {surtitre ? <p className={classeSurtitre}>{surtitre}</p> : null}
      <h1 className={classeTitre}>{titre}</h1>
      {corps}
    </main>
  );
}

/**
 * Largeur de la barre courte, en pourcentage, variant avec le rang.
 *
 * TROIS VALEURS QUI SE REPETENT, ni aleatoire ni monotone. Le motif se voit a
 * peine, ce qui est le but : il suffit que les lignes ne soient pas un peigne
 * regulier.
 */
function largeurCourte(rang: number): string {
  const largeurs = ["52%", "38%", "45%"];
  return largeurs[rang % largeurs.length] ?? "45%";
}
