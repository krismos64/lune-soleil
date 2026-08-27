/**
 * Envoi reel par le SMTP du domaine, ADR-008. LS-82.
 *
 * CE QUE CE MODULE REMPLACE. LS-70 a livre `envoyeurJournalise`, qui journalise
 * l'intention et n'envoie rien, faute de decision. ADR-008 ayant tranche pour le
 * SMTP OVH, cette implementation prend sa place sans qu'aucun appelant ne
 * change : `EnvoyeurEmail` reste le seul point de couplage.
 *
 * CE MODULE N'ECRIT RIEN EN BASE. La trace `JournalEmail` et l'outbox
 * appartiennent a `services/`, qui seul peut ouvrir une transaction. Ici on
 * appelle le serveur, on classe l'erreur, et on rend la main.
 *
 * IL NE DECIDE PAS NON PLUS DE LA RETENTATIVE. Il dit si une erreur est
 * REESSAYABLE, le service decide s'il reessaie et combien de fois. La
 * distinction compte : la meme erreur se traite differemment selon qu'elle
 * survient sur une confirmation de commande ou sur une reinitialisation de mot
 * de passe attendue a l'ecran.
 */
import nodemailer, { type Transporter } from "nodemailer";

import { journaliser } from "@/lib/journal";

import {
  FournisseurEmailIndisponibleError,
  type EnvoyeurEmail,
  type MessageEmail,
} from "./index";
import { rendreModele } from "./modeles";

/**
 * Configuration de connexion, lue une fois.
 *
 * AUCUNE VALEUR PAR DEFAUT SUR LES IDENTIFIANTS, et c'est deliberé. Un defaut
 * silencieux ferait demarrer l'application avec une configuration incomplete,
 * et le defaut ne se verrait qu'au premier envoi rate, c'est-a-dire sur une
 * vraie commande. Mieux vaut refuser tot et bruyamment.
 *
 * LE PORT A UN DEFAUT, LUI : 587 est la valeur de `.env.example` et celle du MX
 * Plan. Un port absent est une omission benigne, un mot de passe absent ne
 * l'est pas.
 */
type ConfigurationSmtp = {
  hote: string;
  port: number;
  utilisateur: string;
  motDePasse: string;
  expediteur: string;
};

/**
 * Erreur de configuration, distincte d'une panne du fournisseur.
 *
 * POURQUOI NE PAS REUTILISER `FournisseurEmailIndisponibleError`. Celle-ci dit
 * « reessayer plus tard a du sens ». Une variable d'environnement manquante ne
 * s'arrangera pas au deuxieme essai, et la confondre avec une panne ferait
 * retenter en boucle une configuration qui ne peut pas marcher.
 */
export class ConfigurationEmailIncompleteError extends Error {
  constructor(readonly variablesManquantes: string[]) {
    super(
      `Configuration SMTP incomplete, variables manquantes : ${variablesManquantes.join(", ")}`,
    );
    this.name = "ConfigurationEmailIncompleteError";
  }
}

/**
 * Lit la configuration, ou dit precisement ce qui manque.
 *
 * ELLE NOMME LES VARIABLES ABSENTES, JAMAIS LEUR VALEUR. Invariant 9 : le
 * depot est public et cette erreur peut remonter dans un journal. Lister les
 * noms suffit au diagnostic, c'est aussi ce que permet la regle d'acces aux
 * secrets du projet.
 */
export function lireConfigurationSmtp(
  env: NodeJS.ProcessEnv = process.env,
): ConfigurationSmtp {
  const requises = {
    SMTP_HOST: env.SMTP_HOST,
    SMTP_USER: env.SMTP_USER,
    SMTP_PASSWORD: env.SMTP_PASSWORD,
    EMAIL_FROM_ADDRESS: env.EMAIL_FROM_ADDRESS,
  };

  const manquantes = Object.entries(requises)
    .filter(([, valeur]) => !valeur)
    .map(([nom]) => nom);

  if (manquantes.length > 0) {
    throw new ConfigurationEmailIncompleteError(manquantes);
  }

  return {
    hote: requises.SMTP_HOST as string,
    port: Number(env.SMTP_PORT ?? 587),
    utilisateur: requises.SMTP_USER as string,
    motDePasse: requises.SMTP_PASSWORD as string,
    expediteur: requises.EMAIL_FROM_ADDRESS as string,
  };
}

/**
 * Codes d'erreur nodemailer qui ne se resolvent pas d'eux-memes.
 *
 * RETENTER SUR UNE ERREUR D'AUTHENTIFICATION EST LE DEFAUT QUE LE CRITERE 4 DE
 * LS-82 VISE. Un mot de passe faux le reste au deuxieme essai, et chaque
 * tentative consomme le plafond de 200 messages par heure du MX Plan : la
 * boucle de retentative epuiserait le quota et ferait tomber les envois
 * legitimes avec elle.
 *
 * Codes releves dans la documentation nodemailer, page « errors », consultee le
 * 27 aout 2026 : `EAUTH` et `ENOAUTH` couvrent l'authentification, `EENVELOPE`
 * une adresse refusee, `ECONFIG` une configuration invalide. Aucun des quatre
 * ne s'ameliore avec le temps.
 */
const CODES_DEFINITIFS = new Set(["EAUTH", "ENOAUTH", "EENVELOPE", "ECONFIG"]);

/**
 * Une erreur d'envoi merite-t-elle une nouvelle tentative ?
 *
 * PAR DEFAUT OUI, ET CE SENS EST DELIBERE. Un code inconnu est plus souvent une
 * panne passagere qu'une faute definitive, et le nombre de tentatives est de
 * toute facon borne par l'appelant. L'inverse, refuser par defaut, priverait
 * definitivement un client de sa confirmation sur un code non repertorie.
 */
export function estReessayable(erreur: unknown): boolean {
  const code = (erreur as { code?: unknown } | null)?.code;

  return typeof code === "string" ? !CODES_DEFINITIFS.has(code) : true;
}

/**
 * Message de refus sur pour une trace lue dans l'administration.
 *
 * LA REPONSE BRUTE DU SERVEUR N'EST PAS RECOPIEE. Un refus SMTP renvoie
 * frequemment l'identifiant de connexion dans son texte, parfois la commande
 * `AUTH` complete : la recopier ecrirait en base ce que l'invariant 9 interdit
 * d'ecrire dans un journal. Le code seul suffit a diagnostiquer, et il est
 * stable.
 */
export function motifSansSecret(erreur: unknown): string {
  const code = (erreur as { code?: unknown } | null)?.code;

  return typeof code === "string" ? code : "ERREUR_INCONNUE";
}

/**
 * Construit le transport. Une connexion par message, sans pool.
 *
 * PAS DE `pool: true`, ET CE N'EST PAS UN OUBLI. Le pool garde des connexions
 * ouvertes pour enchainer les envois, ce qui vaut pour un flux continu. Ici la
 * tache envoie quelques messages par cycle puis se termine : les connexions
 * resteraient ouvertes sans usage jusqu'a expiration cote serveur.
 *
 * `secure: false` SUR LE PORT 587 N'EST PAS UNE CONNEXION EN CLAIR. Nodemailer
 * passe en STARTTLS des que le serveur l'annonce, ce que fait le MX Plan.
 * `requireTLS` rend la chose explicite et refuse de continuer si la negociation
 * echoue, plutot que de retomber en clair sans le dire.
 */
export function creerTransport(config: ConfigurationSmtp): Transporter {
  return nodemailer.createTransport({
    host: config.hote,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.utilisateur, pass: config.motDePasse },
  });
}

/**
 * L'envoyeur reel, celui qui remplace `envoyeurJournalise`.
 *
 * `transport` ET `config` SONT INJECTABLES pour que les tests exercent le
 * classement des erreurs sans serveur SMTP. Sans cette entree, le critere 4 de
 * LS-82 ne serait prouvable qu'en montant un faux serveur, et un test qui a
 * besoin d'un serveur pour tourner finit par ne plus tourner.
 */
export function creerEnvoyeurSmtp(
  config: ConfigurationSmtp = lireConfigurationSmtp(),
  transport: Transporter = creerTransport(config),
): EnvoyeurEmail {
  return {
    async envoyer(message: MessageEmail): Promise<void> {
      const rendu = rendreModele(message);

      try {
        await transport.sendMail({
          from: config.expediteur,
          to: message.destinataire,
          subject: rendu.objet,
          text: rendu.texte,
        });

        // L'ADRESSE N'EST PAS JOURNALISEE, LS-73 : c'est une donnee
        // personnelle. Retrouver A QUI un message est parti releve de
        // `JournalEmail`, qui porte sa propre duree de conservation.
        journaliser("info", "email remis au serveur SMTP", {
          modele: message.modele,
        });
      } catch (erreur) {
        // LE CODE EST JOURNALISE, PAS LA REPONSE DU SERVEUR, meme motif que
        // `motifSansSecret` : un refus SMTP transporte parfois l'identifiant
        // de connexion dans son texte.
        journaliser("error", "envoi SMTP en echec", {
          modele: message.modele,
          code: motifSansSecret(erreur),
          reessayable: String(estReessayable(erreur)),
        });

        throw new FournisseurEmailIndisponibleError(message.modele, erreur);
      }
    },
  };
}
