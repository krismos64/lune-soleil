/**
 * Obtenir une copie de ses donnees personnelles. LS-62, criteres 1 et 2.
 * RGPD articles 15 et 20.
 *
 * CE QUE CET ECRAN CHANGE. Jusqu'ici `/compte` annonçait « la demande se fait
 * par email et la reponse intervient sous un mois au plus », ce que le critere 1
 * refuse : « le client obtient ses donnees depuis l'espace client, SANS demarche
 * par email ». Le service existait deja, LS-95, il lui manquait un ecran.
 *
 * LE TELECHARGEMENT PASSE PAR UNE ROUTE, `export/route.ts`, et non par une
 * Server Action : le navigateur doit enregistrer un fichier, ce qu'une reponse
 * HTTP avec `content-disposition` fait nativement et sans JavaScript.
 *
 * COMPOSANT SERVEUR, `exigerSession` appele AVANT tout rendu, motif pose par
 * LS-70. Pas de middleware : celui de Next.js s'execute sur la peripherie et ne
 * peut pas relire la session en base, il ne verrait que la presence d'un cookie.
 *
 * CETTE PAGE N'EXIGE PAS LA PREUVE D'IDENTITE, la route si. Poser la garde ici
 * ferait tomber sur un refus AVANT d'avoir explique de quoi il s'agit, et le
 * lien de confirmation vit precisement sur cet ecran. La protection porte sur
 * l'effet, la lecture des donnees, pas sur la lecture de son mode d'emploi.
 */
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { exigerSession } from "@/services/autorisation";
import { FENETRE_REAUTHENTIFICATION_MS } from "@/services/preuve-identite";

import styles from "../compte.module.css";

export const metadata = {
  title: "Mes données personnelles, Lune & Soleil",
  robots: { index: false, follow: false },
};

/**
 * La page lit la session a chaque affichage. Sans cela, Next.js pourrait servir
 * un rendu mis en cache, donc l'adresse d'une personne a une autre.
 */
export const dynamic = "force-dynamic";

const FENETRE_MINUTES = Math.round(FENETRE_REAUTHENTIFICATION_MS / 60_000);

export default async function PageMesDonnees() {
  const identite = await exigerSession(await headers());

  if (!identite) {
    redirect("/compte/connexion");
  }

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Mes données personnelles</h1>

      <p className={styles.texte}>
        <Link href="/compte" className={styles.lien}>
          Retour à mon compte
        </Link>
      </p>

      <section className={styles.section} aria-labelledby="titre-copie">
        <h2 id="titre-copie">Obtenir une copie</h2>

        <p className={styles.texte}>
          Vous pouvez télécharger l&apos;ensemble des données que la boutique
          détient à votre sujet, dans un format lisible et réutilisable.
        </p>

        {/*
         * CE QUE LE FICHIER CONTIENT, ANNONCE AVANT LE CLIC. Une personne qui
         * exerce son droit d'acces doit pouvoir verifier que la reponse est
         * complete : sans cette liste, elle n'a aucun moyen de savoir si un
         * volet manque. C'est aussi ce qui rend l'article 15 verifiable.
         */}
        <ul className={styles.contenuExport}>
          <li>votre compte : adresse email, nom, date de création</li>
          <li>vos adresses enregistrées</li>
          <li>vos commandes, avec leur détail et leurs adresses</li>
          <li>vos avis publiés</li>
          <li>l&apos;historique de vos connexions</li>
        </ul>

        {/*
         * CE QUE LE FICHIER NE CONTIENT PAS, ET POURQUOI. Un mot de passe absent
         * d'un export peut se lire comme un oubli : le dire evite la reclamation
         * et explique la mesure de securite plutot que de la subir.
         */}
        <p className={styles.texte}>
          Il ne contient jamais votre mot de passe ni vos moyens de connexion,
          qui ne sont stockés nulle part en clair. Seule leur existence est
          indiquée.
        </p>

        {/*
         * UN LIEN ET NON UN BOUTON : c'est une navigation vers une ressource, et
         * le navigateur l'enregistre. `download` propose le nom de fichier, que
         * la route confirme par son en-tete `content-disposition`.
         *
         * PAS DE `target="_blank"` : le telechargement n'ouvre aucune page, un
         * onglet vide s'ouvrirait puis se fermerait, ce qui deroute.
         */}
        <p className={styles.texte}>
          <a
            href="/compte/donnees/export"
            download
            className={styles.actionSecondaire}
          >
            Télécharger mes données
          </a>
        </p>

        {/*
         * LA CONDITION EST DITE AVANT LE CLIC, et non decouverte par un refus.
         * L'export est une action sensible, `DONNEES_CLIENTS` d'ADR-027 : il
         * livre en un fichier tout le dossier de la personne, ce qu'un
         * ordinateur laisse ouvert suffirait sinon a emporter.
         */}
        <div className={styles.rappel}>
          <p className={styles.texte}>
            Pour votre sécurité, le téléchargement demande de confirmer votre
            identité. La confirmation reste valable {FENETRE_MINUTES} minutes.
          </p>
          <Link
            href="/compte/reauthentification?retour=donnees"
            className={styles.lien}
          >
            Confirmer mon identité
          </Link>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="titre-autres-droits">
        <h2 id="titre-autres-droits">Vos autres droits</h2>

        {/*
         * LA RECTIFICATION SE FAIT AILLEURS, ET LE DIRE EVITE UNE DEMANDE PAR
         * EMAIL. `docs/PROCEDURE-DROITS-DES-PERSONNES.md` prevoit deja de
         * repondre a une demande de rectification « en indiquant le chemin » :
         * autant le donner ici.
         */}
        <p className={styles.texte}>
          Pour corriger votre nom ou votre adresse email,{" "}
          <Link href="/compte/profil" className={styles.lien}>
            modifiez vos informations
          </Link>
          . Vos adresses de livraison se gèrent dans{" "}
          <Link href="/compte/adresses" className={styles.lien}>
            votre carnet d&apos;adresses
          </Link>
          .
        </p>

        {/*
         * CE QUE LA SUPPRESSION FAIT VRAIMENT, dit ici comme sur `/compte`.
         * Laisser croire a un effacement total produirait une reclamation
         * fondee sur une attente que la loi ne permet pas de satisfaire :
         * article 17 paragraphe 3 point b, et L123-22 du code de commerce.
         */}
        <p className={styles.texte}>
          Pour supprimer votre compte,{" "}
          <Link href="/compte" className={styles.lien}>
            rendez-vous en bas de votre compte
          </Link>
          . Vos commandes et vos factures sont conservées dix ans, comme la loi
          l&apos;impose, mais ne vous sont plus rattachées.
        </p>

        {/*
         * UNE COMMANDE NE SE RECTIFIE PAS, et c'est contre-intuitif : la
         * personne peut croire a un refus arbitraire. L'instantane est fige,
         * invariants 3 et 4, parce qu'une commande passee est un FAIT et non une
         * donnee a jour.
         */}
        <p className={styles.texte}>
          Les informations d&apos;une commande déjà passée ne peuvent pas être
          modifiées : elles sont figées au moment de l&apos;achat, comme la
          facture qui en découle. Pour une erreur sur une commande en cours,{" "}
          <Link href="/contact" className={styles.lien}>
            écrivez à la boutique
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
