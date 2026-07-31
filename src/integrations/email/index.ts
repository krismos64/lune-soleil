/**
 * Envoi d'email transactionnel, point d'extension. LS-70.
 *
 * POURQUOI UNE INTERFACE ET PAS UN FOURNISSEUR. ADR-008 laisse le choix du
 * prestataire ouvert, et LS-70 a besoin d'envoyer trois messages : la
 * verification d'adresse a l'inscription, ADR-023, la reinitialisation de mot
 * de passe et l'alerte de connexion par mot de passe, ADR-021. Attendre
 * l'arbitrage bloquerait l'authentification ; choisir un fournisseur ici
 * elargirait le perimetre de la story a une decision qui a son propre ADR.
 *
 * Le reste du code ne connait donc que `EnvoyeurEmail`. Le jour ou ADR-008 est
 * tranche, une implementation remplace `envoyeurJournalise` et rien d'autre ne
 * bouge.
 *
 * CE QUE CE MODULE NE FAIT PAS. Il ne decide pas ce qu'un echec provoque : la
 * regle E4 pose qu'un echec d'email ne bloque jamais une commande, mais cette
 * decision appartient a `services/`. Ici l'echec est signale, pas absorbe.
 */

/** Ce que le projet sait envoyer. Un modele, pas un contenu libre. */
export type ModeleEmail =
  | "verification-adresse"
  | "reinitialisation-mot-de-passe"
  | "alerte-connexion-administration";

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
 * Implementation d'attente : journalise l'intention, n'envoie rien.
 *
 * ELLE NE LEVE PAS. Une exception ici ferait echouer l'inscription et la
 * connexion tant qu'ADR-008 n'est pas tranche, ce qui rendrait
 * l'authentification inutilisable. L'absence d'envoi reel est en revanche une
 * dette, tracee dans LS-70 et a solder par l'epic email.
 *
 * Le destinataire est journalise en clair : c'est une donnee personnelle, mais
 * le journal applicatif de developpement en contient deja par nature, et la
 * regle interdit les SECRETS, pas les adresses. En production, ce journal ne
 * doit pas subsister : l'implementation reelle le remplace.
 */
export const envoyeurJournalise: EnvoyeurEmail = {
  async envoyer(message) {
    console.info(
      `[email non envoye, ADR-008 non tranche] modele=${message.modele} destinataire=${message.destinataire}`,
    );
  },
};
