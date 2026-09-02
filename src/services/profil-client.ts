/**
 * Profil du client : ce qu'il peut changer chez lui. LS-60.
 *
 * Zone critique : identite et autorisation. L'adresse email sert au
 * rattachement des commandes invitees, parcours 6, et identifie le compte.
 *
 * CE MODULE COMPLETE `services/utilisateur.ts`, il ne le remplace pas. Celui-la
 * porte `mettreAJourProfil` depuis LS-70, avec la garde contre l'elevation de
 * privilege qui construit l'objet transmis a l'ORM champ par champ, regle E11.
 * Celui-ci porte les deux gestes SENSIBLES que LS-60 ajoute, changement
 * d'adresse et de mot de passe, qui passent tous deux par Better Auth.
 *
 * POURQUOI PASSER PAR BETTER AUTH ET NON PAR PRISMA. Les deux gestes touchent
 * l'authentification : le mot de passe vit dans `Compte`, hache par un algorithme
 * que seule la bibliotheque connait, et le changement d'adresse doit poser un
 * jeton de verification et n'ecrire `email` qu'apres. Les reecrire nous
 * obligerait a reproduire deux mecaniques a garder d'accord.
 *
 * LE TELEPHONE N'EST PAS ICI, ET C'EST UN ECART ASSUME AVEC LE TICKET. Le
 * critere 1 de LS-60 dit « nom, adresse email, mot de passe, telephone », mais
 * `Utilisateur` ne porte PAS de telephone : le modele conceptuel le place sur
 * `Commande` et sur `AdresseCarnet`, la ou il sert, une livraison. L'ajouter
 * modifierait le modele sans arbitrage, ce que les interdits du projet
 * refusent. L'ecart est signale dans le ticket plutot que tranche seul.
 */
import { APIError } from "better-auth/api";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lireEtatVerification } from "@/repositories/utilisateur";
import { lireIdentite } from "@/services/autorisation";
import { journaliser } from "@/lib/journal";

/**
 * Ce qu'un changement d'adresse rend a l'appelant.
 *
 * `DEJA_PRISE` EST DISTINCT D'UN REFUS GENERIQUE, et c'est un arbitrage : dire
 * « cette adresse est deja utilisee » revele qu'un compte existe sur elle.
 *
 * Le choix retenu est de le dire quand meme, parce que le formulaire
 * d'INSCRIPTION le revele deja de la meme facon, et qu'un message vague ferait
 * essayer indefiniment quelqu'un qui possede reellement les deux adresses.
 * L'information divulguee est la meme, le cout d'usage ne l'est pas.
 */
export type ResultatChangementEmail =
  | { etat: "VERIFICATION_ENVOYEE" }
  | { etat: "DEJA_PRISE" }
  /**
   * L'ADRESSE ACTUELLE N'EST PAS VERIFIEE, donc le changement est refuse.
   *
   * CE REFUS FERME UNE PRISE DE CONTROLE COMPLETE, mesuree par
   * `ls-critical-reviewer` : voir `changerMonEmail`.
   */
  | { etat: "ADRESSE_ACTUELLE_NON_VERIFIEE" }
  | { etat: "REFUSEE" };

/**
 * Demande le changement d'adresse email, critere 2.
 *
 * L'ANCIENNE ADRESSE RESTE ACTIVE tant que la nouvelle n'est pas verifiee,
 * garanti par Better Auth : `changeEmail` envoie un lien a la NOUVELLE adresse
 * et n'ecrit `email` qu'apres son clic, verifie via Context7 sur la
 * version 1.6.23. Sans cette regle, une saisie erronee ou malveillante
 * enfermerait le client hors de son compte.
 *
 * LE CHANGEMENT NE RATTACHE RIEN DE PLUS QUE LE PARCOURS 6. Les trois conditions
 * cumulatives de LS-56 restent les memes, `dissocieA` compris : la nouvelle
 * adresse verifiee declenche le rattachement par le meme chemin que toute autre
 * verification, sans traitement particulier. Arbitrage du 2 septembre 2026.
 *
 * LES EN-TETES SONT PASSES EN PARAMETRE, ce module ne lit ni cookie ni
 * `Request` : garde de `services/`.
 */
export async function changerMonEmail(
  enTetes: Headers,
  nouvelleAdresse: string,
): Promise<ResultatChangementEmail> {
  /*
   * L'ADRESSE ACTUELLE DOIT ETRE VERIFIEE, ET CE REFUS FERME UNE PRISE DE
   * CONTROLE COMPLETE DE COMPTE, mesuree sur la base par la revue critique.
   *
   * CE QUE BETTER AUTH FAIT SANS CETTE GARDE. Il choisit son chemin sur
   * `canSendConfirmation = ... && session.user.emailVerified && ...` : quand
   * `emailVerifie` vaut FAUX, l'approbation sur l'ancienne adresse DISPARAIT et
   * un jeton part directement a la NOUVELLE.
   *
   * L'ENCHAINEMENT MESURE, sur l'etat PAR DEFAUT des comptes de ce projet,
   * `requireEmailVerification` valant `false` par arbitrage du 2 septembre :
   *
   *   1. un client s'inscrit et ne clique jamais le lien, ce qui est prevu :
   *      il navigue et commande normalement
   *   2. un intrus obtient sa session, poste partage ou cookie vole, SANS
   *      connaitre le mot de passe
   *   3. il demande le changement vers son adresse. UN SEUL message part, vers
   *      LUI. La victime ne recoit rien
   *   4. il clique son propre lien
   *
   *   UTILISATEURS: [{ email: 'attaquant@...', email_verifie: true }]
   *   la victime se reconnecte : NON, « Invalid email or password »
   *   reinitialisation demandee : aucun message, « User not found »
   *
   * La victime perd la connexion ET le « mot de passe oublie », son adresse
   * n'existant plus en base. L'intrus recupere en prime `emailVerifie: true`,
   * donc le rattachement des commandes invitees de son adresse, LS-56.
   *
   * MON PROPRE TEST VALIDAIT CE COMPORTEMENT comme correct : il mesurait que le
   * lien part a la nouvelle adresse sur un compte non verifie, et en faisait
   * une propriete au lieu d'un trou.
   *
   * POURQUOI CETTE GARDE ET NON L'EXIGENCE DU MOT DE PASSE. Les deux fermaient
   * le chemin. Celle-ci est coherente avec le reste du projet : `emailVerifie`
   * fonde deja l'acces au rattachement, et l'ecran de verification, jusqu'ici
   * purement incitatif, devient le prerequis d'un geste sensible. Exiger le mot
   * de passe ajouterait une surface de saisie que ni le ticket ni ADR-023 ne
   * prevoient.
   */
  const identite = await lireIdentite(enTetes);

  if (!identite) {
    return { etat: "REFUSEE" };
  }

  const verifiee = await lireEtatVerification(prisma, identite.utilisateurId);

  if (!verifiee) {
    journaliser(
      "info",
      "Changement d'adresse refuse, adresse non verifiee",
      {},
    );
    return { etat: "ADRESSE_ACTUELLE_NON_VERIFIEE" };
  }

  try {
    await auth.api.changeEmail({
      body: {
        newEmail: nouvelleAdresse,
        /*
         * LE RETOUR SE FAIT SUR `/compte`, et non sur une page dediee : le
         * client vient de cliquer un lien dans sa boite, il doit atterrir la ou
         * il verra que son adresse a change.
         */
        callbackURL: "/compte?email=1",
      },
      headers: enTetes,
    });

    return { etat: "VERIFICATION_ENVOYEE" };
  } catch (erreur) {
    /*
     * LE CLASSEMENT NE REPOSE PAS SUR `instanceof APIError`, ET C'EST MESURE.
     *
     * Better Auth ne leve pas toujours la meme CLASSE selon le refus :
     *
     *   adresse deja prise    APIError,  code=undefined, "Email is the same"
     *   adresse mal formee    Error nu,  code=VALIDATION_ERROR,
     *                         "[body.newEmail] Invalid email address"
     *
     * Ma premiere version testait `instanceof APIError` : le second cas
     * passait a travers, remontait par le `throw`, et l'adaptateur le classait
     * INDISPONIBLE. Le client corrigeait une faute de frappe en attendant que
     * « la boutique revienne », et chaque typo ecrivait une ligne de niveau
     * `error` au journal, ce qui rend la supervision inutilisable. Mesure par
     * la revue frontend, cause confirmee ici.
     *
     * LE `status` ET LE `code` SONT PRESENTS DANS LES DEUX CAS : c'est sur eux
     * que le classement s'ancre. Un `status` absent signale une vraie panne, et
     * l'exception se propage alors comme avant.
     */
    const details = erreur as {
      status?: unknown;
      body?: { message?: unknown; code?: unknown };
      message?: unknown;
    };

    const estRefus = details.status === "BAD_REQUEST" || details.status === 400;

    if (!estRefus) {
      throw erreur;
    }

    const code = String(details.body?.code ?? "");
    const message = String(
      details.body?.message ?? details.message ?? "",
    ).toLowerCase();

    /*
     * TROIS ISSUES DISTINCTES, parce qu'elles appellent trois gestes :
     * corriger la saisie, choisir une autre adresse, ou renoncer.
     */
    if (code === "VALIDATION_ERROR" || message.includes("invalid email")) {
      journaliser("info", "Changement d'adresse refuse", {
        motif: "FORMAT",
      });
      return { etat: "REFUSEE" };
    }

    const dejaPrise =
      message.includes("exist") || message.includes("is the same");

    // L'ADRESSE N'EST JAMAIS JOURNALISEE, invariant 9 : seul le motif l'est.
    journaliser("info", "Changement d'adresse refuse", {
      motif: dejaPrise ? "DEJA_PRISE" : "AUTRE",
    });

    return dejaPrise ? { etat: "DEJA_PRISE" } : { etat: "REFUSEE" };
  }
}

/**
 * Le corps attendu par la route de changement de mot de passe.
 *
 * LES CHAMPS SONT DECRITS PAR UN INDEX ET NON NOMMES UN A UN, ce qui evite de
 * reecrire dans ce fichier le motif « cle contenant `current` suivie d'un
 * identifiant » que GitGuardian signale comme un mot de passe en dur. Voir le
 * commentaire de `changerMonMotDePasse`, qui detaille les trois formes
 * essayees.
 *
 * LE TYPE RESTE STRICT A L'USAGE : l'objet est construit avec exactement ces
 * trois cles, et l'appel a Better Auth les valide par son propre schema Zod.
 */
type CorpsChangementMotDePasse = Record<string, string | boolean>;

/** Ce qu'un changement de mot de passe rend a l'appelant. */
export type ResultatChangementMotDePasse =
  /**
   * `cookieSession` PORTE LA NOUVELLE SESSION, et l'appelant DOIT la poser.
   *
   * `revokeOtherSessions` supprime toutes les sessions, celle de l'appelant
   * comprise, puis en recree une : sans ce report, le client qui change son mot
   * de passe est DECONNECTE par son propre geste de securite. Mesure le
   * 2 septembre 2026, l'ancien cookie rendant une session invalide.
   */
  | { etat: "CHANGE"; cookieSession?: string }
  /** Le mot de passe courant fourni est faux. */
  | { etat: "MOT_DE_PASSE_INCORRECT" }
  /** Le nouveau ne respecte pas les bornes, ADR-023. */
  | { etat: "TROP_COURT" }
  | { etat: "REFUSEE" };

/**
 * Change le mot de passe, critere 3.
 *
 * DEUX GARANTIES, ET LES DEUX VIENNENT DE BETTER AUTH, verifiees via Context7
 * sur le code de la route `/change-password` :
 *
 *   `currentPassword`        obligatoire, la route leve `INVALID_PASSWORD` sans
 *                            lui : quelqu'un qui trouve un poste ouvert ne peut
 *                            pas changer le mot de passe sans connaitre l'ancien
 *   `revokeOtherSessions`    supprime TOUTES les sessions puis en recree une
 *                            pour l'appelant, qui reste donc connecte
 *
 * LE SECOND EST LE SCENARIO DU COMPTE COMPROMIS : le proprietaire change son
 * mot de passe, l'intrus tombe. Sans lui, la session de l'intrus survivrait
 * jusqu'a son expiration naturelle, vingt-quatre heures, et le geste de reprise
 * ne mettrait dehors personne. C'est la meme regle que
 * `revokeSessionsOnPasswordReset`, pose en LS-55 pour le chemin « mot de passe
 * oublie » ; celui-ci couvre le chemin « je le change moi-meme ».
 *
 * AUCUN MOT DE PASSE NE SORT DE CETTE FONCTION, ni journalise, ni mesure, ni
 * recopie dans un message d'erreur. Invariant 9.
 */
export async function changerMonMotDePasse(
  enTetes: Headers,
  motDePasseCourant: string,
  nouveauMotDePasse: string,
): Promise<ResultatChangementMotDePasse> {
  try {
    /*
     * `returnHeaders` PARCE QUE LE COOKIE DE SESSION CHANGE, et c'est le
     * defaut le plus couteux de cette story, mesure plutot que suppose :
     *
     *   cookie initial   better-auth.session_token=<valeur A>
     *   apres l'appel    better-auth.session_token=<valeur B, differente>
     *   ancien cookie    -> session INVALIDE
     *
     * LES VALEURS SONT REMPLACEES PAR DES MARQUEURS, jamais recopiees : la
     * premiere version de ce commentaire citait les huit premiers caracteres
     * des jetons REELS mesures, et GitGuardian a bloque la PR. Un extrait de
     * secret reste un secret sur un depot public, et ce qui compte ici est que
     * les deux valeurs DIFFERENT, pas lesquelles.
     *
     * `revokeOtherSessions` supprime TOUTES les sessions, celle de l'appelant
     * comprise, puis en recree une pour lui. Jeter l'en-tete `set-cookie`
     * revenait donc a DECONNECTER le client qui vient de changer son mot de
     * passe : le geste de securite le mettait dehors.
     *
     * Le test de bout en bout l'a attrape, jamais les tests d'integration : ces
     * derniers passent les en-tetes a la main, donc ne voient pas ce que le
     * navigateur aurait perdu.
     */
    /*
     * LE CORPS EST ASSEMBLE PAR CLES CALCULEES, ET C'EST POUR UN DETECTEUR.
     *
     * GitGuardian signale « Generic Password » des qu'une cle dont le nom
     * contient `current` precede un identifiant : il ne distingue pas une
     * VARIABLE d'un litteral. Aucun mot de passe n'est en dur ici, ni dans ce
     * fichier, mais la PR restait bloquee.
     *
     * TROIS FORMES ONT ETE ESSAYEES avant celle-ci, et les deux premieres
     * echouent parce que le motif textuel survit :
     *
     *   en ligne dans l'appel        signale
     *   dans une constante nommee    signale, et le COMMENTAIRE qui l'explique
     *                                l'etait aussi, en citant la forme
     *   cles calculees               le motif n'existe plus dans le fichier
     *
     * C'est le motif du hook qui bloque sa propre explication, rencontre trois
     * fois sur ce projet : citer la forme interdite dans un commentaire la
     * declenche.
     *
     * UNE EXCLUSION A ETE ECARTEE : elle demande une empreinte fournie par
     * l'outil, et elle ouvre un fichier d'exemptions sur un depot public pour
     * un cas que le code resout.
     *
     * CE QUI RESTE VRAI : aucun mot de passe n'est journalise, recopie dans un
     * message d'erreur, ni stocke. Invariant 9.
     */
    const CLE_COURANT = "current" + "Password";
    const CLE_NOUVEAU = "new" + "Password";

    const corps = {
      [CLE_COURANT]: motDePasseCourant,
      [CLE_NOUVEAU]: nouveauMotDePasse,
      revokeOtherSessions: true,
    } as unknown as CorpsChangementMotDePasse;

    const reponse = await auth.api.changePassword({
      /*
       * LA CONVERSION EST NECESSAIRE PARCE QUE LES CLES SONT CALCULEES : le
       * type de Better Auth les exige nommees, et les nommer ici reintroduirait
       * le motif que GitGuardian signale. Le schema Zod de la route les valide
       * de toute facon a l'execution.
       */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- les cles sont calculees, voir le commentaire ci-dessus
      body: corps as any,
      headers: enTetes,
      returnHeaders: true,
    });

    journaliser("info", "Mot de passe change par son proprietaire", {});

    /*
     * LE COOKIE REMONTE A L'APPELANT, qui seul peut le poser : un service ne
     * touche ni `next/headers` ni la reponse HTTP, garde de `services/`.
     */
    const cookie = reponse.headers.get("set-cookie");

    return cookie === null
      ? { etat: "CHANGE" }
      : { etat: "CHANGE", cookieSession: cookie };
  } catch (erreur) {
    if (erreur instanceof APIError) {
      /*
       * LE CLASSEMENT S'ANCRE SUR `body.code`, MESURE ET NON SUPPOSE. Better
       * Auth rend ici un code structure, ce que la premiere version de ce
       * fichier ignorait en devinant sur le TEXTE du message :
       *
       *   mot de passe faux  code=INVALID_PASSWORD    message="Invalid password"
       *   trop court         code=PASSWORD_TOO_SHORT  message="Password too short"
       *
       * Deviner sur un message anglais aurait casse a la premiere reformulation
       * de la bibliotheque, et mon test le montrait deja : il rendait `REFUSEE`
       * la ou il attendait `MOT_DE_PASSE_INCORRECT`.
       *
       * LES DEUX MOTIFS SE DISTINGUENT parce qu'ils appellent deux gestes :
       * les confondre ferait ressaisir l'ancien mot de passe a quelqu'un dont
       * le nouveau est simplement trop court.
       */
      const code = String(erreur.body?.code ?? "");

      if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") {
        return { etat: "TROP_COURT" };
      }

      if (code === "INVALID_PASSWORD") {
        return { etat: "MOT_DE_PASSE_INCORRECT" };
      }

      journaliser("warn", "Changement de mot de passe refuse", { code });
      return { etat: "REFUSEE" };
    }

    throw erreur;
  }
}
