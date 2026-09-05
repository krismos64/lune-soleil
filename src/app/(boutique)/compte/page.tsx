/**
 * Espace client. LS-95 pour les droits des personnes, puis l'epic LS-36.
 *
 * CETTE PAGE EST DEVENUE LE SOMMAIRE DE L'ESPACE CLIENT, et son en-tete disait
 * l'inverse jusqu'au 3 septembre 2026 : « ce n'est pas l'espace client de l'epic
 * LS-36, qui portera l'historique des commandes, le carnet d'adresses et les
 * avis, et qui reste a faire ». C'etait vrai a l'ecriture, LS-95 livrant le
 * strict necessaire aux droits RGPD, et cela a cesse de l'etre story par story
 * sans que personne ne relise ce paragraphe.
 *
 * ELLE PORTE DESORMAIS six sections : l'etat du compte et son rappel de
 * verification, le rattachement des commandes invitees (LS-56), l'historique
 * (LS-57), le profil (LS-60), le carnet d'adresses (LS-59), les donnees
 * personnelles (LS-62) et la suppression de compte (LS-95).
 *
 * CE QU'ELLE NE PORTE TOUJOURS PAS : le suivi de livraison (LS-58) et les avis
 * (LS-61), tous deux bloques par LS-33 et le compte Mondial Relay.
 *
 * CHAQUE SECTION EST UN LIEN, jamais un ecran de plus ici : sans eux, ces pages
 * seraient inatteignables autrement qu'en saisissant l'URL, motif de C33
 * transpose cote boutique et defaut rencontre trois fois sur ce depot.
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

import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { lireEtatVerification } from "@/repositories/utilisateur";
import { exigerSession } from "@/services/autorisation";
import { consulterCommandesRattachables } from "@/services/rattachement-commandes";
import { FENETRE_REAUTHENTIFICATION_MS } from "@/services/reauthentification";

import { BlocRattachement } from "./bloc-rattachement";
import { FormulaireSuppressionCompte } from "./formulaire-suppression";
import styles from "./compte.module.css";

export const metadata = {
  title: "Mon compte",
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

export default async function PageCompte({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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

  /*
   * L'ETAT DE VERIFICATION EST RELU EN BASE, jamais tire de la session.
   * `IdentiteAppelant` ne le porte pas volontairement, voir
   * `services/autorisation.ts` : un champ d'affichage n'a pas a voisiner avec
   * ce qui fonde une autorisation.
   */
  const adresseVerifiee = await lireEtatVerification(
    prisma,
    identite.utilisateurId,
  );

  /*
   * L'ACCUSE DE RECEPTION DU LIEN DE VERIFICATION, LS-54.
   *
   * Better Auth ramene ici avec `?verifie=1` apres avoir consomme le jeton. Le
   * parametre etait POSE SANS ETRE LU dans la premiere version : qui cliquait
   * le lien depuis sa boite atterrissait sur « Mon compte » sans le moindre
   * signe que la confirmation avait abouti. Un succes muet se lit comme un
   * echec, et fait recliquer un lien desormais consomme.
   *
   * IL N'AUTORISE RIEN ET NE PROUVE RIEN : c'est `adresseVerifiee`, lu en base,
   * qui dit l'etat reel. Ce parametre ne fait qu'expliquer d'ou l'on vient, et
   * le message n'est affiche que si la base CONFIRME la verification.
   */
  const parametres = await searchParams;
  const arriveDeVerification = parametres.verifie === "1";

  /*
   * L'ACCUSE DE RECEPTION DU CHANGEMENT D'ADRESSE, LS-60.
   *
   * `changerMonEmail` ramene ici avec `?email=1` apres que le lien a ete
   * consomme. Le parametre etait POSE SANS ETRE LU, exactement comme
   * `?verifie=1` avant LS-54 : qui cliquait le lien depuis sa boite
   * atterrissait sur « Mon compte » sans le moindre signe que le changement
   * avait abouti. Un succes muet se lit comme un echec.
   *
   * IL N'AUTORISE RIEN ET NE PROUVE RIEN : l'adresse affichee vient de la
   * SESSION, et c'est elle qui dit l'etat reel.
   */
  const arriveDeChangementEmail = parametres.email === "1";

  /*
   * LES COMMANDES RATTACHABLES, LS-56, parcours 6 etape 3.
   *
   * LECTURE SEULE, aucun rattachement automatique a l'affichage d'une page. Le
   * parcours 6 pose une liste PROPOSEE puis un geste explicite : rattacher au
   * simple rendu ferait qu'un `GET` modifie des donnees, ce qu'un prechargement
   * de lien suffirait a declencher.
   *
   * LE SERVICE REND `ADRESSE_NON_VERIFIEE` PLUTOT QU'UNE LISTE VIDE quand
   * l'adresse ne l'est pas, et la distinction se voit a l'ecran : le bloc de
   * rattachement ne s'affiche pas du tout, c'est le rappel de verification
   * au-dessus qui porte le message. Afficher « aucune commande » a quelqu'un
   * qui en a laisserait croire qu'elles sont perdues.
   */
  const rattachables = await consulterCommandesRattachables(
    identite.utilisateurId,
    identite.email,
  );

  const nombreEligibles =
    rattachables.etat === "ELIGIBLES" ? rattachables.commandes.length : 0;

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      {/*
       * LE SUR-TITRE, forme du prototype, LS-180. Il n'est PAS un titre au sens
       * du document : c'est un `p` qui precede le `h1`, et le mettre en `h2`
       * ferait passer un niveau 2 AVANT le niveau 1 sur chaque ecran.
       *
       * `aria-hidden` LE RETIRE DE L'ARBRE D'ACCESSIBILITE. Lu a voix haute,
       * « ESPACE CLIENT, Mon compte » redit deux fois la meme chose : c'est un
       * repere visuel de rubrique, et le `h1` juste dessous porte deja
       * l'information.
       */}
      <p className={styles.surTitre} aria-hidden="true">
        Espace client
      </p>
      <h1 className={styles.titre}>Mon compte</h1>

      {arriveDeVerification && adresseVerifiee && (
        <p className={styles.succes} role="status">
          Votre adresse email est confirmée.
        </p>
      )}

      {arriveDeChangementEmail && (
        <p className={styles.succes} role="status">
          Votre nouvelle adresse email est confirmée. Vos prochaines connexions
          se feront avec {identite.email}.
        </p>
      )}

      <section className={styles.section} aria-labelledby="titre-informations">
        <h2 id="titre-informations">Informations du compte</h2>
        <dl className={styles.liste}>
          <div className={styles.ligne}>
            <dt>Adresse email</dt>
            <dd>{identite.email}</dd>
          </div>
        </dl>

        {/*
         * LE RAPPEL DE VERIFICATION VIT ICI, et c'est ce qui rend
         * `/compte/verification` de nouveau atteignable.
         *
         * Sans lui, cet ecran n'etait designe que par la redirection qui suit
         * l'inscription : une fois quitte, on ne pouvait plus jamais y revenir
         * sans saisir l'URL. C'est le motif de C33 transpose cote boutique, et
         * le test e2e ne le voyait pas puisqu'il y arrivait par `goto`.
         *
         * IL N'EST PAS ALARMANT. La verification ne bloque rien, arbitrage du
         * 2 septembre : le texte annonce ce qu'elle apporte, il ne reclame pas.
         */}
        {!adresseVerifiee && (
          <div className={styles.rappel}>
            <p className={styles.texte}>
              Votre adresse email n&apos;est pas encore confirmée. La confirmer
              permet de rattacher à ce compte les commandes passées sans être
              connecté.
            </p>
            <Link href="/compte/verification" className={styles.lien}>
              Confirmer mon adresse
            </Link>
          </div>
        )}
      </section>

      {/*
       * LA SECTION ENTIERE EST RENDUE PAR LE COMPOSANT, sa decision de
       * s'afficher comprise. La page lui passe le nombre, elle ne tranche pas.
       *
       * POURQUOI PAS `{nombreEligibles > 0 && ...}` ICI, qui etait la premiere
       * version et paraissait plus simple. Ce nombre est calcule au rendu
       * SERVEUR : apres un rattachement reussi, `revalidatePath` le fait
       * retomber a zero, et la condition demontait la section AU MOMENT MEME ou
       * son compte rendu devenait utile. Trois choses partaient ensemble, le
       * message de succes, le focus clavier qui retombait sur `body`, et la
       * region live retiree du DOM avant d'avoir rien annonce.
       *
       * Mesure : le test e2e voyait « element(s) not found » APRES avoir
       * resolu le noeud, signature exacte d'un demontage pendant l'assertion.
       *
       * Le composant connait, lui, la difference entre « rien a rattacher, ne
       * rien afficher » et « je viens de rattacher, montrer le resultat ».
       * Defaut trouve par la revue frontend.
       */}
      <BlocRattachement nombreEligibles={nombreEligibles} />

      {/*
       * LA DECONNEXION MANQUAIT ENTIEREMENT. `signOut` etait exporte depuis
       * LS-70 sans aucun appelant : un client sur un appareil partage n'avait
       * aucun moyen de fermer sa session, sinon supprimer son compte. C'est un
       * etat non nominal absent, pas un defaut de rendu.
       */}
      {/*
       * LES QUATRE RACCOURCIS, LS-180.
       *
       * CE BLOC REMPLACE QUATRE SECTIONS, une par ecran, que cette page portait
       * jusqu'ici : chacune avait son `h2`, son paragraphe et son lien. Elles
       * existaient pour une raison qui reste vraie, rendre les ecrans
       * atteignables sans saisir leur URL, motif de C33 transpose cote
       * boutique. LA BARRE LATERALE LES PORTE DESORMAIS, sur TOUS les ecrans et
       * plus seulement depuis celui-ci.
       *
       * ILS NE DISPARAISSENT PAS POUR AUTANT, et c'est la forme du prototype :
       * la vue d'ensemble garde des tuiles vers les rubriques. Le doublon avec
       * la barre est voulu, un raccourci au centre de l'ecran se voit mieux
       * qu'une entree de menu, en particulier au premier passage.
       *
       * LE LIBELLE DES LIENS EST INCHANGE, « Voir mes commandes », « Gérer mes
       * adresses », « Gérer mes informations », « Voir mes données » : ce sont
       * les noms accessibles sur lesquels quatre fichiers de tests de bout en
       * bout naviguent, et les changer casserait des tests qui vérifient le
       * parcours réel, pas le rendu.
       */}
      <section className={styles.section} aria-labelledby="titre-raccourcis">
        <h2 id="titre-raccourcis">Mon espace</h2>

        <ul className={styles.raccourcis}>
          <li className={styles.raccourci}>
            <Link href="/compte/commandes" className={styles.raccourciLien}>
              Voir mes commandes
            </Link>
            <p className={styles.raccourciTexte}>
              Vos commandes, leur suivi et vos factures.
            </p>
          </li>

          <li className={styles.raccourci}>
            <Link href="/compte/adresses" className={styles.raccourciLien}>
              Gérer mes adresses
            </Link>
            <p className={styles.raccourciTexte}>
              Vos adresses enregistrées pour vos prochaines commandes.
            </p>
          </li>

          <li className={styles.raccourci}>
            <Link href="/compte/profil" className={styles.raccourciLien}>
              Gérer mes informations
            </Link>
            <p className={styles.raccourciTexte}>
              Votre nom, votre adresse email ou votre mot de passe.
            </p>
          </li>

          <li className={styles.raccourci}>
            <Link href="/compte/donnees" className={styles.raccourciLien}>
              Voir mes données
            </Link>
            <p className={styles.raccourciTexte}>
              Une copie de vos données, et vos droits sur celles-ci.
            </p>
          </li>
        </ul>
      </section>

      {/*
       * LA SECTION « SESSION » A ETE RETIREE PAR LS-180, ET CE N'EST PAS UNE
       * PERTE DE FONCTION : la deconnexion vit maintenant en pied de barre
       * laterale, donc atteignable depuis TOUS les ecrans de l'espace client et
       * plus seulement depuis celui-ci, ce qui est un gain pour un appareil
       * partage.
       *
       * IL FALLAIT LA RETIRER, ET PAS SEULEMENT PAR ELEGANCE. Le bouton aurait
       * existe DEUX FOIS sur cette page, dans la barre et dans la section, et
       * `compte-authentification.spec.ts` cherche
       * `getByRole("button", { name: "Se déconnecter" })` sans ancrage : deux
       * occurrences font echouer Playwright en violation de mode strict.
       */}

      {/*
       * LA SECTION « MES DONNEES PERSONNELLES » A ETE RETIREE PAR LS-180, ET
       * C'EST LA MEME RAISON QUE LA SECTION « SESSION » CI-DESSUS : la tuile de
       * raccourci « Voir mes données » pointe vers la meme route, et la barre
       * laterale porte l'entree sur tous les ecrans.
       *
       * DEUX LIENS IDENTIQUES VERS LA MEME CIBLE SUR UN MEME ECRAN EST UN
       * DEFAUT, pas seulement une gene de test. `compte-donnees.spec.ts` l'a
       * attrape en violation de mode strict, « resolved to 2 elements », et il
       * avait raison de le faire : au clavier, la tabulation traverse deux fois
       * la meme destination, et un lecteur d'ecran annonce deux fois « Voir mes
       * données » sans que rien ne distingue les deux.
       *
       * CE QUE LE TEXTE DE CETTE SECTION DISAIT N'EST PAS PERDU : l'ecran
       * `/compte/donnees` annonce lui-meme ce que le fichier contient et ce
       * qu'il ne contient pas, et `compte-donnees.spec.ts` le verifie. Cette
       * section n'en etait qu'une porte d'entree.
       */}

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
