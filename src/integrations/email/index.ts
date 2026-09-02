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

/** Ce que le projet sait envoyer. Un modele, pas un contenu libre. */
export type ModeleEmail =
  | "verification-adresse"
  | "reinitialisation-mot-de-passe"
  | "alerte-connexion-administration"
  | "message-contact-recu";

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
