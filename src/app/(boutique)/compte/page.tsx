/**
 * Espace client, droits des personnes. LS-95, RGPD articles 15 et 17.
 *
 * CE QUE CETTE PAGE EST, ET CE QU'ELLE N'EST PAS. C'est le strict necessaire
 * pour exercer les droits que le registre des traitements annonce : voir son
 * compte, demander ses donnees, supprimer son compte. **Ce n'est pas l'espace
 * client de l'epic LS-36**, qui portera l'historique des commandes, le carnet
 * d'adresses et les avis, et qui reste a faire.
 *
 * Ecrire ici davantage aurait modifie le perimetre du cahier des charges sans
 * arbitrage, ce que les interdits du projet refusent. Ce qui est livre est ce
 * que LS-95 exige, pas une avance sur LS-36.
 *
 * COMPOSANT SERVEUR, `exigerSession` appele AVANT tout rendu, motif pose par
 * LS-70. Pas de middleware : celui de Next.js s'execute sur la peripherie et ne
 * peut pas relire la session en base, il ne verrait que la presence d'un cookie.
 *
 * PAS DE ROLE EXIGE ICI, a la difference de `/administration`. Cette page sert
 * les CLIENTS, et l'administratrice est aussi titulaire d'un compte : les deux
 * populations y accedent, chacune ne voyant que ses propres donnees, puisque
 * l'identite vient de la session et jamais d'un parametre.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { exigerSession } from "@/services/autorisation";
import { FENETRE_REAUTHENTIFICATION_MS } from "@/services/reauthentification";

import { FormulaireSuppressionCompte } from "./formulaire-suppression";
import styles from "./compte.module.css";

export const metadata = {
  title: "Mon compte, Lune & Soleil",
  robots: { index: false, follow: false },
};

/**
 * La page lit la session a chaque affichage.
 *
 * Sans cela, Next.js pourrait servir un rendu mis en cache, donc l'adresse email
 * d'une personne a une autre. Meme motif que l'ecran du journal des connexions.
 */
export const dynamic = "force-dynamic";

const MINUTES_DE_FRAICHEUR = Math.round(FENETRE_REAUTHENTIFICATION_MS / 60_000);

export default async function PageCompte() {
  const identite = await exigerSession(await headers());

  if (!identite) {
    /*
     * Redirection et non page d'erreur : sans session, la reponse utile est le
     * formulaire de connexion.
     *
     * VERS LA CONNEXION CLIENT DEPUIS LS-54. Cette ligne pointait vers
     * `/administration/connexion`, observation deposee le 13 aout 2026 pendant
     * LS-81 et LS-89. Ce n'etait pas une faille, l'ecran refusant correctement
     * quiconque n'est pas administratrice depuis LS-89, mais un parcours
     * incoherent : la page annoncait un espace d'administration a quelqu'un qui
     * voulait consulter son compte. Aucune page de connexion client n'existait
     * alors, et en inventer une aurait modifie le perimetre sans arbitrage.
     *
     * LE SECOND CHEMIN EST DANS `formulaire-suppression.tsx`, corrige avec
     * celui-ci. Les reprendre separement laisserait le motif du drapeau ajoute
     * sans etre porte dans toutes les conditions d'acces, deja rencontre trois
     * fois sur ce projet.
     */
    redirect("/compte/connexion");
  }

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Mon compte</h1>

      <section className={styles.section} aria-labelledby="titre-informations">
        <h2 id="titre-informations">Informations du compte</h2>
        <dl className={styles.liste}>
          <div className={styles.ligne}>
            <dt>Adresse email</dt>
            <dd>{identite.email}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="titre-donnees">
        <h2 id="titre-donnees">Obtenir une copie de mes données</h2>
        <p className={styles.texte}>
          Vous pouvez demander une copie des données personnelles que la
          boutique détient à votre sujet, dans un format lisible et
          réutilisable. La demande se fait par email et la réponse intervient
          sous un mois au plus.
        </p>
        <p className={styles.texte}>
          Cette copie contient votre compte, vos adresses enregistrées, vos
          commandes, vos avis et l&apos;historique de vos connexions. Elle ne
          contient jamais votre mot de passe, qui n&apos;est stocké nulle part
          en clair.
        </p>
      </section>

      <section
        className={styles.sectionDanger}
        aria-labelledby="titre-suppression"
      >
        <h2 id="titre-suppression">Supprimer mon compte</h2>

        {/*
          CE QUE LA PERSONNE DOIT SAVOIR AVANT DE CLIQUER, et qui n'est pas
          evident : ses commandes ne disparaissent pas. Une facture ne se
          supprime jamais, article L123-22 du code de commerce, dix ans, et
          l'article 17 paragraphe 3 point b du RGPD ecarte l'effacement quand la
          loi impose la conservation.

          Le dire ici plutot que de laisser croire a un effacement total evite
          une reclamation fondee sur une attente que la loi ne permet pas de
          satisfaire.
        */}
        <p className={styles.texte}>
          La suppression est <strong>définitive</strong>. Elle efface vos
          adresses enregistrées, vos moyens de connexion et vos sessions
          ouvertes.
        </p>
        <p className={styles.texte}>
          Vos commandes et vos factures sont <strong>conservées</strong> et ne
          vous sont plus rattachées : la loi impose de garder les pièces
          comptables pendant dix ans. Vous ne pourrez plus les consulter depuis
          un compte.
        </p>

        <FormulaireSuppressionCompte
          minutesDeFraicheur={MINUTES_DE_FRAICHEUR}
        />
      </section>
    </main>
  );
}
