/**
 * Page 404 publique, LS-146.
 *
 * ELLE COUVRE DEUX CAS A LA FOIS, verifie via Context7 sur la documentation de
 * Next.js : `not-found.tsx` a la RACINE de `app/` repond a la fois aux appels
 * explicites de `notFound()` dans un segment et a toute URL qui ne correspond a
 * aucune route de l'application. C'est le comportement du fichier racine depuis
 * Next.js 13.3, et il couvre les quatre appels de `notFound()` du depot.
 *
 * `global-not-found.tsx` EXISTE ET N'EST PAS RETENU. Il repond au meme besoin en
 * court-circuitant le layout racine, mais il est marque EXPERIMENTAL et demande
 * le drapeau `experimental.globalNotFound`. Une boutique qui encaisse ne pose pas
 * sa page d'erreur sur une API que la version suivante peut deplacer, et le seul
 * avantage qu'il apporterait, se passer du layout racine, n'a aucun interet ici
 * puisque ce layout ne porte que `html` et `body`.
 *
 * L'EN-TETE ET LE PIED SONT COMPOSES ICI, ET NON HERITES. Ils vivent dans le
 * layout du groupe `(boutique)`, or ce fichier est a la racine et ne traverse
 * pas ce groupe : sans ces deux lignes, la page 404 serait un texte nu sans
 * aucune navigation, ce que le critere 2 refuse. Les placer dans le layout
 * racine les ferait au contraire apparaitre sur `/administration`, que LS-122
 * ecarte explicitement.
 *
 * AUCUN `loading.tsx` NE DOIT ETRE AJOUTE SUR UNE ROUTE QUI APPELLE
 * `notFound()`. Le streaming Suspense commence avant que l'appel soit atteint,
 * et Next.js laisse alors le statut a 200 en se contentant d'un `noindex`. Le
 * SEO tranche sur ce projet : un moteur indexerait une page inexistante. Le
 * commentaire de `produit/[slug]/page.tsx` porte la mesure, 404 sans le fichier
 * et 200 avec, et le test de LS-146 verifie le CODE DE STATUT et non l'aspect de
 * la page, precisement pour que cette regression se voie.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { EnTeteBoutique } from "@/components/en-tete-boutique";
import { PiedBoutique } from "@/components/pied-boutique";

import styles from "./erreur.module.css";

/*
 * `noindex` EST DEJA POSE PAR NEXT.JS sur une reponse 404. Ce bloc ne sert donc
 * pas au referencement mais a l'onglet du navigateur et au partage : sans lui,
 * la page herite du titre de la boutique, et un lien mort partage s'annoncerait
 * comme la boutique elle-meme.
 */
export const metadata: Metadata = {
  title: "Page introuvable, Lune & Soleil",
  description: "Cette page n'existe pas ou n'existe plus.",
};

export default function PageIntrouvable() {
  return (
    <>
      <EnTeteBoutique />

      <main className={styles.page} id="contenu" tabIndex={-1}>
        {/*
         * LE CODE 404 EST ECRIT EN TOUTES LETTRES dans le surtitre plutot que
         * dans un chiffre geant decoratif : le nombre seul ne dit rien a qui ne
         * connait pas les codes HTTP, et le titre porte l'explication.
         */}
        <p className={styles.surtitre}>Erreur 404</p>

        <h1 className={styles.titre}>Cette page n&apos;existe pas</h1>

        {/*
         * LE TEXTE N'ACCUSE PERSONNE ET N'INVENTE AUCUNE CAUSE. Une piece
         * vendue est le cas le plus frequent sur cette boutique, chaque bijou
         * etant unique : le dire oriente vers le catalogue plutot que de laisser
         * croire a une panne.
         *
         * AUCUN ACCORD AU FEMININ, `frontend-design.md` : une part notable des
         * acheteurs est masculine.
         */}
        <p className={styles.texte}>
          Le lien est peut-être incomplet, ou la pièce que vous cherchiez a
          trouvé preneur. Chaque bijou étant unique, une création vendue quitte
          définitivement la boutique.
        </p>

        <div className={styles.sorties}>
          <Link href="/catalogue" className={styles.actionPrincipale}>
            Voir les créations
          </Link>
          <Link href="/" className={styles.actionSecondaire}>
            Revenir à l&apos;accueil
          </Link>
        </div>
      </main>

      <PiedBoutique />
    </>
  );
}
