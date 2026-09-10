/**
 * Envoi d'email transactionnel, point d'extension. LS-70.
 *
 * POURQUOI UNE INTERFACE ET PAS UN FOURNISSEUR. Elle a ete ecrite en LS-70,
 * quand ADR-008 n'avait pas tranche, pour ne pas bloquer l'authentification sur
 * une decision qui avait son propre ADR.
 *
 * ELLE A GARDE SA VALEUR APRES LA DECISION. ADR-008 retient le SMTP OVH et
 * LS-82 a livre `smtp.ts`, mais le reste du code ne connait toujours que
 * `EnvoyeurEmail` : c'est ce qui rend la bascule vers un fournisseur
 * transactionnel reversible a faible cout, reserve nommee par ADR-008, et ce
 * qui permet d'eprouver la panne du fournisseur avec un double plutot qu'avec
 * un vrai serveur.
 *
 * CE QUE CE MODULE NE FAIT PAS. Il ne decide pas ce qu'un echec provoque : la
 * regle E4 pose qu'un echec d'email ne bloque jamais une commande, mais cette
 * decision appartient a `services/`. Ici l'echec est signale, pas absorbe.
 */
import { journaliser } from "@/lib/journal";

import { creerEnvoyeurSmtp, lireConfigurationSmtp } from "./smtp";

/** Ce que le projet sait envoyer. Un modele, pas un contenu libre. */
export type ModeleEmail =
  | "verification-adresse"
  | "reinitialisation-mot-de-passe"
  | "alerte-connexion-administration"
  | "message-contact-recu"
  /** LS-60, envoye a la NOUVELLE adresse pour la confirmer. */
  | "changement-adresse-verification"
  /** LS-60, envoye a l'ANCIENNE pour l'avertir et lui permettre de refuser. */
  | "changement-adresse-avertissement"
  /** LS-134, accuse de reception d'une retractation, article L221-21. */
  | "retractation-accusee"
  /** LS-172, confirmation de commande, porteuse des deux liens signes. */
  | "commande-confirmee"
  /** LS-61, invitation a deposer un avis, envoyee apres livraison constatee. */
  | "invitation-avis";

export type MessageEmail = {
  destinataire: string;
  modele: ModeleEmail;
  /** Variables du modele. Jamais de secret, invariant 9. */
  variables: Record<string, string>;
};

export interface EnvoyeurEmail {
  envoyer(message: MessageEmail): Promise<void>;
}

/**
 * Erreur d'indisponibilite du fournisseur.
 *
 * Distincte d'une erreur de programmation : elle dit « reessayer plus tard a
 * du sens », la ou une adresse malformee ne s'arrangera pas au deuxieme essai.
 * C'est ce que le service de connexion attrape pour ne pas faire echouer une
 * authentification sur une panne d'email.
 */
export class FournisseurEmailIndisponibleError extends Error {
  constructor(
    readonly modele: ModeleEmail,
    cause?: unknown,
  ) {
    super(`Fournisseur d'email indisponible, modele ${modele}`);
    this.name = "FournisseurEmailIndisponibleError";
    this.cause = cause;
  }
}

/**
 * Implementation de repli : journalise l'intention, n'envoie rien.
 *
 * ELLE N'EST PLUS LA DETTE QU'ELLE ETAIT. LS-82 a livre `creerEnvoyeurSmtp`,
 * qui est le chemin de production ; celle-ci sert desormais aux tests et aux
 * environnements sans configuration SMTP, ou construire un transport echouerait
 * a l'evaluation du module.
 *
 * ELLE NE LEVE PAS. Une exception ici ferait echouer l'inscription et la
 * connexion, ce qui rendrait l'authentification inutilisable pour une panne
 * d'email. Regle E4.
 *
 * LE DESTINATAIRE N'EST PLUS JOURNALISE EN CLAIR depuis LS-73. La version
 * initiale l'ecrivait, en jugeant qu'une adresse n'est pas un secret. LS-73 a
 * tranche l'inverse : une adresse email est une donnee personnelle, et le
 * critere 3 de la story l'exclut du journal au meme titre qu'un secret. Le
 * masquage de `lib/journal.ts` s'en charge desormais, la cle `destinataire`
 * portant `adresse` dans son nom... ce qui ne suffirait pas si elle s'appelait
 * autrement : la cle est donc nommee explicitement `adresseDestinataire`.
 *
 * CE QUI RESTE SUFFIT AU DIAGNOSTIC : savoir quel modele a ete demande et
 * qu'une adresse etait presente. Retrouver A QUI un message etait destine
 * releve de `JournalEmail`, journal metier persiste en base, qui a sa propre
 * duree de conservation.
 */
export const envoyeurJournalise: EnvoyeurEmail = {
  async envoyer(message) {
    journaliser("info", "email non envoye, envoyeur de repli en place", {
      modele: message.modele,
      adresseDestinataire: message.destinataire,
    });
  },
};

/**
 * L'envoyeur du code applicatif : le SMTP reel, ou le repli si rien n'est
 * configure.
 *
 * ---------------------------------------------------------------------------
 * LE DEFAUT QUE CETTE FONCTION FERME, mesure en production le 10 septembre
 * 2026.
 *
 * `creerAuth()` prenait `envoyeurJournalise` comme valeur PAR DEFAUT de son
 * parametre, et `src/lib/auth.ts` l'appelle sans argument. Better Auth
 * employait donc le repli EN PRODUCTION, quelle que soit la configuration
 * SMTP : aucun email de verification, de reinitialisation de mot de passe ni
 * d'alerte de connexion ne pouvait partir.
 *
 * Le defaut etait INVISIBLE parce que le repli ne leve pas, regle E4 : l'ecran
 * annonce « email envoye » et le journal ecrit « email non envoye, envoyeur de
 * repli en place » a une ligne que personne ne lisait. Il a fallu qu'une
 * personne reelle n'ait jamais recu son lien pour qu'il se voie.
 *
 * `creerEnvoyeurSmtp` existait depuis LS-82 et n'etait appele QUE par la tache
 * d'expedition de l'outbox : les emails de commande partaient, ceux de
 * l'authentification non. Deux chemins, un seul cable.
 * ---------------------------------------------------------------------------
 *
 * POURQUOI UN REPLI PLUTOT QU'UNE ERREUR. `lireConfigurationSmtp` LEVE quand
 * une variable manque, et cette fonction est appelee a l'EVALUATION du module
 * `auth.ts` : laisser l'exception remonter rendrait l'authentification entiere
 * inutilisable sur un poste sans SMTP, developpement et tests compris. C'est la
 * raison pour laquelle `envoyeurJournalise` existe, et elle reste valable.
 *
 * LE CHOIX EST JOURNALISE DANS LES DEUX SENS, et c'est le coeur de la
 * correction : un repli SILENCIEUX est ce qui a laisse le defaut vivre. La
 * ligne d'avertissement nomme les variables manquantes, jamais leurs valeurs,
 * invariant 9.
 *
 * `import` STATIQUE ET NON DYNAMIQUE : `smtp.ts` n'a aucun effet de bord a
 * l'evaluation, il n'ouvre de connexion qu'au premier envoi. L'importer ne
 * coute rien sur un poste sans configuration.
 */
export function choisirEnvoyeurEmail(
  env: NodeJS.ProcessEnv = process.env,
): EnvoyeurEmail {
  const manquantes = [
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "EMAIL_FROM_ADDRESS",
  ].filter((nom) => !env[nom]);

  if (manquantes.length > 0) {
    journaliser(
      "warn",
      "configuration SMTP incomplete, envoyeur de repli en place, AUCUN email ne partira",
      { variablesManquantes: manquantes.join(", ") },
    );
    return envoyeurJournalise;
  }

  /*
   * ---------------------------------------------------------------------------
   * L'ENVOI REEL EST REFUSE HORS PRODUCTION, LS-215.
   *
   * CE QUI L'A PRODUIT, mesure le 10 septembre 2026, quelques heures apres la
   * correction de LS-214. Le `.env` du poste de developpement portait les
   * identifiants SMTP DE LA BOUTIQUE. Tant que l'envoyeur de repli etait cable,
   * rien ne partait et le piege restait masque ; des que le SMTP a ete branche,
   * chaque execution de la suite a envoye de VRAIS emails vers les adresses de
   * test du projet.
   *
   * `client@exemple.fr`, `camille.dupont@exemple.test` et les fixtures `e2e-*`
   * designent des domaines INEXISTANTS PAR CONCEPTION : chaque message rebondit,
   * et OVH renvoie le rejet a l'expediteur. L'exploitante a recu des dizaines de
   * « Undelivered Mail Returned to Sender » dans sa boite.
   *
   * CE N'EST PAS QU'UNE GENE. Chaque execution consomme le plafond de 200
   * messages par heure du MX Plan, ADR-008 : sur une boutique ouverte, ce
   * plafond epuise ferait tomber les emails de commande legitimes avec lui.
   *
   * POURQUOI DANS LE CODE ET NON DANS `.env.example`. Vider le fichier local
   * corrige un poste, pas un clone, ni le meme poste apres une remise en place.
   * Une regle ecrite et non verifiee ne tient pas, motif connu de ce depot.
   *
   * L'AUTORISATION EST EXPLICITE ET SE POSE SCIEMMENT. Quelqu'un qui veut
   * reellement eprouver un envoi depuis son poste pose la variable ; personne ne
   * le fait par accident en clonant le depot.
   * ---------------------------------------------------------------------------
   */
  const enProduction = env.NODE_ENV === "production";
  const envoiAutorise = env.AUTORISER_ENVOI_EMAIL_HORS_PRODUCTION === "oui";

  if (!enProduction && !envoiAutorise) {
    journaliser(
      "warn",
      "envoi reel refuse hors production, envoyeur de repli en place",
      {
        nodeEnv: env.NODE_ENV ?? "(absent)",
        pourAutoriser: "poser AUTORISER_ENVOI_EMAIL_HORS_PRODUCTION=oui",
      },
    );
    return envoyeurJournalise;
  }

  journaliser("info", "envoyeur SMTP en place", {
    horsProduction: !enProduction,
  });

  /*
   * `env` EST TRANSMIS EXPLICITEMENT, jamais laisse relire `process.env`.
   *
   * `lireConfigurationSmtp` a son propre defaut sur `process.env` : sans cet
   * argument, cette fonction verifierait un environnement et en lirait un
   * AUTRE. Les deux coincident en production, ce qui rendait le defaut
   * invisible, et divergent des qu'un appelant passe son propre `env` : le
   * test a leve `ConfigurationEmailIncompleteError` sur une configuration
   * pourtant complete.
   */
  return creerEnvoyeurSmtp(lireConfigurationSmtp(env));
}
