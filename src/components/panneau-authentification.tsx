import Image from "next/image";

import styles from "./panneau-authentification.module.css";

/*
 * GABARIT A DEUX PANNEAUX DES ECRANS D'AUTHENTIFICATION, LS-229.
 *
 * Il habille la connexion et l'inscription, des deux espaces, et RIEN D'AUTRE.
 * La reauthentification, la verification d'email et le mot de passe oublie
 * partagent pourtant le meme module CSS `authentification.module.css` : ce sont
 * des etapes au milieu d'un parcours, pas des portes d'entree, et les parer
 * d'un grand visuel ferait ressembler une confirmation d'identite a une page
 * d'accueil.
 *
 * LS-268 : CE QUI SUIT VAUT POUR LE DECOR PAR DEFAUT, CELUI DE
 * L'ADMINISTRATION. Les decors `nuit` et `aube` de la boutique restent visibles
 * en bandeau sous 768 px, voir plus bas.
 *
 * LE PANNEAU EST RETIRE DU FLUX SOUS 768 px PAR `display: none`, ET L'IMAGE
 * RESTE DANS LE BALISAGE. Le composant etant rendu sur le serveur, il ne connait
 * pas la largeur du client : il n'existe aucun moyen de ne pas emettre le noeud
 * sans basculer en composant client et mesurer la fenetre, ce qui coute plus
 * cher que le gain.
 *
 * `sizes` RESTE A `50vw`, ET LE COUT SUR TELEPHONE EST ASSUME, PAS IGNORE.
 *
 * Mesure le 14 septembre 2026 : a 320 px en DPR 2, le navigateur telecharge
 * 9,7 ko, source 384w, pour un panneau que le CSS masque. A 1280 px il prend
 * 41,9 ko en 640w, qui eux servent.
 *
 * DEUX ESSAIS ONT VOULU SUPPRIMER CES 9,7 ko ET ONT CASSE LE RENDU :
 * `(min-width: 768px) 50vw, 0px`, puis `, 1px`. Tous deux demandaient la source
 * la plus PETITE du jeu, que le navigateur gardait ensuite sur grand ecran, ou
 * le panneau rendait alors un aplat delave.
 *
 * Aucune valeur intermediaire ne fait mieux : a 320 px, `50vw` vaut deja 160 px
 * CSS, soit 320 px en DPR 2, et le navigateur retient donc deja la plus petite
 * source utile du jeu. Descendre plus bas ne gagne rien sans rouvrir le
 * delavage. Supprimer vraiment ce cout demanderait de ne pas rendre le noeud,
 * donc un composant client qui mesure la fenetre : plus cher que 9,7 ko.
 *
 * `100vw` SERAIT FAUX ICI, a la difference du hero de l'accueil qui le declare :
 * cette image y est VISIBLE en pleine largeur sur telephone, la sienne non.
 *
 * `priority` ET NON LE CHARGEMENT DIFFERE PAR DEFAUT. Le panneau occupe la
 * moitie de l'ecran des l'ouverture : `loading="lazy"`, que `next/image` pose
 * sinon, le faisait arriver apres coup et laissait un aplat sable visible le
 * temps du chargement. C'est ce que fait deja le hero de l'accueil, pour la
 * meme raison.
 *
 * L'IMAGE EST DECORATIVE. `alt` vide et `aria-hidden` : elle n'apporte aucune
 * information que le formulaire ne porte pas, et l'annoncer retarderait l'acces
 * au premier champ.
 *
 * LA PHOTOGRAPHIE DE L'ATELIER, et non plus `accueil-hero.jpg`, depuis le
 * 23 septembre 2026. L'accueil porte desormais une banniere a texte incruste,
 * 2,63:1, qu'une colonne etroite recadrerait en coupant ce texte. L'atelier est
 * une photographie reelle de `/atelier`, sans texte, et ses pieces sont
 * au centre : le recadrage `cover` n'y perd rien d'essentiel.
 */
/**
 * LES DÉCORS ANIMÉS DES PORTES D'ENTRÉE DE LA BOUTIQUE, LS-268.
 *
 * Arbitrage de Christophe du 4 octobre 2026, amendement d'ADR-045 : la
 * connexion ouvre sur un ciel de nuit, l'inscription sur une aube. Le décor
 * s'anime, LE FORMULAIRE JAMAIS : rien ne bouge pendant une saisie.
 *
 * SOUS 768 px LE DÉCOR DEVIENT UN BANDEAU au-dessus du formulaire, et non plus
 * un panneau masqué, arbitrage du même jour : l'image de nuit y est
 * téléchargée, environ 100 ko, en connaissance de cause.
 *
 * L'ADMINISTRATION GARDE LA PHOTOGRAPHIE DE L'ATELIER, immobile : ADR-045 n'y
 * anime rien. C'est le décor par défaut, pour qu'un écran ajouté n'hérite pas
 * d'une animation par oubli.
 *
 * `data-borne` : `AnimationsBornees`, monté par le layout de la boutique, arrête
 * tout mouvement au plus tard cinq secondes après l'entrée dans l'écran.
 * L'IMAGE DE NUIT EST UN DÉCOR GÉNÉRÉ, ciel aquarelle sans aucun bijou, sans
 * texte ni métadonnée, `public/habillage/README.md`.
 */
type Decor = "atelier" | "nuit" | "aube";

const TEXTES: Record<
  Exclude<Decor, "atelier">,
  { phrase: string; sous: string }
> = {
  nuit: {
    phrase: "Bon retour à l'atelier",
    sous: "Vos commandes, vos factures et vos adresses vous attendent.",
  },
  aube: {
    phrase: "Un compte, et tout se retrouve",
    sous: "Suivre une commande, retrouver une facture, laisser un avis sur une pièce reçue.",
  },
};

export function PanneauAuthentification({
  children,
  decor = "atelier",
}: {
  children: React.ReactNode;
  decor?: Decor;
}) {
  if (decor === "atelier") {
    return (
      <div className={styles.gabarit}>
        <div className={styles.panneau} aria-hidden="true">
          <Image
            src="/habillage/univers-atelier.jpg"
            alt=""
            className={styles.image}
            width={1586}
            height={992}
            sizes="50vw"
            priority
          />
        </div>
        <div className={styles.colonneFormulaire}>
          <div className={styles.contenu}>{children}</div>
        </div>
      </div>
    );
  }

  const textes = TEXTES[decor];

  return (
    <div className={`${styles.gabarit} ${styles.gabaritDecor}`}>
      {/*
       * DÉCORATIF ET DÉCLARÉ COMME TEL : la phrase redit ce que le titre du
       * formulaire annonce. `aria-hidden` porte sur tout le décor, en
       * permanence, et non sur une fenêtre d'animation, ADR-045.
       */}
      <div
        className={`${styles.panneau} ${styles.decor} ${styles[decor]}`}
        aria-hidden="true"
        data-borne=""
      >
        {decor === "nuit" ? (
          <Image
            src="/habillage/porte-ciel-nuit.jpg"
            alt=""
            className={styles.ciel}
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            priority
          />
        ) : null}
        <div className={styles.poussiere}>
          {Array.from({ length: 8 }, (_, rang) => (
            <i key={rang} />
          ))}
        </div>
        <div className={styles.decorContenu}>
          {decor === "nuit" ? <AstreNuit /> : <AstreAube />}
          <p className={styles.phrase}>{textes.phrase}</p>
          <p className={styles.sous}>{textes.sous}</p>
        </div>
      </div>
      <div className={styles.colonneFormulaire}>
        <div className={styles.contenu}>{children}</div>
      </div>
    </div>
  );
}

/** Lune dans son anneau, tracée puis posée. `pathLength` normalise le tracé. */
function AstreNuit() {
  return (
    <svg className={styles.astre} viewBox="0 0 200 200">
      <defs>
        <linearGradient id="porte-or-nuit" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--ls-or-clair)" />
          <stop offset="0.6" stopColor="var(--ls-or-pale)" />
          <stop offset="1" stopColor="var(--ls-or-moyen)" />
        </linearGradient>
      </defs>
      <circle
        className={styles.trait}
        pathLength={1}
        cx="100"
        cy="100"
        r="92"
        stroke="url(#porte-or-nuit)"
        strokeWidth="1.5"
      />
      <path
        className={styles.lune}
        d="M112 36 C68 30 40 66 46 104 C52 140 88 160 120 144 C86 146 66 122 67 96 C68 68 86 46 112 36Z"
        fill="url(#porte-or-nuit)"
      />
      <path
        className={styles.etoile}
        style={{ "--rang": 0 } as React.CSSProperties}
        d="M140 62 l3 10 10 3-10 3-3 10-3-10-10-3 10-3z"
      />
      <path
        className={styles.etoile}
        style={{ "--rang": 1 } as React.CSSProperties}
        d="M150 120 l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"
      />
      <circle
        className={styles.etoile}
        style={{ "--rang": 2 } as React.CSSProperties}
        cx="124"
        cy="98"
        r="2.5"
      />
    </svg>
  );
}

/** Soleil qui se lève sur l'horizon, rayons et orbite tracés. */
function AstreAube() {
  const rayons = [
    "M100 58 v-20",
    "M128 66 l12-15",
    "M146 88 l18-8",
    "M72 66 l-12-15",
    "M54 88 l-18-8",
  ];
  return (
    <svg className={styles.astre} viewBox="0 0 200 200">
      <defs>
        <radialGradient id="porte-or-aube" cx="40%" cy="35%" r="70%">
          <stop stopColor="var(--ls-ciel-jour-haut)" />
          <stop offset="0.45" stopColor="var(--ls-or-clair)" />
          <stop offset="1" stopColor="var(--ls-or-sombre)" />
        </radialGradient>
      </defs>
      <path
        className={styles.trait}
        pathLength={1}
        d="M10 150 H190"
        stroke="var(--ls-or-moyen)"
        strokeWidth="1.5"
      />
      <path
        className={`${styles.trait} ${styles.orbite}`}
        pathLength={1}
        d="M22 150 A78 78 0 0 1 178 150"
        stroke="var(--ls-accent-gold)"
        strokeWidth="1"
      />
      {rayons.map((trace, rang) => (
        <path
          key={trace}
          className={styles.rayon}
          style={{ "--rang": rang } as React.CSSProperties}
          d={trace}
        />
      ))}
      <path
        className={styles.soleil}
        d="M50 150 A50 50 0 0 1 150 150 Z"
        fill="url(#porte-or-aube)"
      />
    </svg>
  );
}
