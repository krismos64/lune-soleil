/**
 * Consultation du fichier client par l'exploitante, LS-185.
 *
 * TRAITEMENT T11 DU REGISTRE, et il faut l'avoir lu avant de toucher a ce
 * fichier : `docs/architecture/REGISTRE-DES-TRAITEMENTS.md`. Une consultation
 * est un traitement au sens de l'article 4 point 2 du RGPD, qui cite
 * explicitement « la consultation » parmi les operations visees.
 *
 * TROIS FINALITES, DEUX BASES LEGALES, arbitrage de Christophe du 5 septembre
 * 2026. Repondre a une demande RGPD et retrouver un acheteur relevent de
 * l'execution du contrat, article 6.1.b ; suivre l'activite commerciale releve
 * de l'interet legitime, article 6.1.f. Les distinguer n'est pas un raffinement
 * de redaction : si l'interet legitime venait a etre conteste, l'ecran resterait
 * legitime en retirant les totaux.
 *
 * CE SERVICE NE FAIT QUE LIRE. Aucune ecriture, aucune suppression : la
 * suppression de compte appartient au client lui-meme, LS-95, et reste une
 * action sensible de la famille `IDENTIFIANTS` portee par l'espace client.
 *
 * ---------------------------------------------------------------------------
 * LA RECHERCHE LIBRE EST UN ECART ASSUME A ADR-027, ET CE N'EST PAS UN OUBLI.
 *
 * ADR-027 decision 3 range « consulter ou exporter en masse les donnees
 * clients » parmi les actions sensibles, qui exigent une preuve d'identite
 * recente. `.claude/familles-sans-action.txt` annonçait deux fois, avant cette
 * story, qu'une recherche par nom ou par adresse ferait basculer un ecran dans
 * cette categorie.
 *
 * Trois options ont ete presentees a Christophe : recherche avec
 * `exigerReauthentificationRecente`, recherche avec journalisation dans
 * `JournalAudit`, ou liste bornee sans recherche. Il a retenu la recherche
 * libre nue, en connaissance de l'ecart.
 *
 * NE PAS AJOUTER LA GARDE EN CROYANT REPARER UNE NEGLIGENCE. Revenir sur
 * l'arbitrage lui appartient, et cela tient en deux gestes : poser la marque de
 * famille sur `listerClientsAdministration`, et appeler
 * `exigerReauthentificationRecente` dans la page. La marche a suivre entiere est
 * dans `.claude/familles-sans-action.txt`, avec le nom exact de la famille.
 *
 * LA MARQUE N'EST PAS ECRITE ICI EN TOUTES LETTRES, ET CE N'EST PAS UNE
 * COQUETTERIE. `verifier-actions-sensibles.sh` cherche l'annotation dans `src/`
 * sans distinguer un commentaire d'une marque reelle : l'ecrire pour l'expliquer
 * la DECLENCHE, et le controle a echoue sur cette phrase meme, reclamant une
 * garde pour une action qui n'est pas marquee. Motif « le hook bloque son
 * explication », deja en fiche sur ce depot.
 * ---------------------------------------------------------------------------
 */
import { prisma } from "@/lib/prisma";
import { listerClients, type ClientEnListe } from "@/repositories/utilisateur";

export type { ClientEnListe };

/**
 * Le plafond de la liste, motif de LS-163.
 *
 * IL EST ANNONCE A L'ECRAN quand il est atteint. Le volume est NON BORNE ici,
 * a la difference du catalogue : les comptes s'accumulent sans limite, et
 * LS-183 a montre qu'un plafond ecrit par analogie sur un ensemble borne est
 * faux. Celui-la est juste.
 */
export const PLAFOND_CLIENTS = 100;

export type VueClients = {
  clients: ClientEnListe[];
  limiteAtteinte: boolean;
};

/**
 * Les clients, filtres par un terme de recherche libre.
 *
 * `terme` NE PORTE AUCUNE AUTORISATION, invariant 2 : il restreint ce que la
 * requete rend, il ne decide jamais qui a le droit de la lancer. La garde de
 * role vit dans la page, appelee avant tout rendu.
 *
 * IL N'EST PAS VALIDE PAR UN SCHEMA ZOD, et c'est deliberе. Ce n'est ni un
 * identifiant ni une valeur de domaine : c'est du texte libre dont la seule
 * propriete attendue est d'etre du texte. Prisma le passe en parametre lie,
 * jamais en concatenation, donc l'injection est fermee par la couche d'acces.
 * Le borner en longueur serait du zele sans defaut a fermer, la requete etant
 * indexee sur des colonnes courtes.
 */
export async function listerClientsAdministration(
  options: { terme?: string } = {},
  client: typeof prisma = prisma,
): Promise<VueClients> {
  return listerClients(client, {
    ...(options.terme ? { terme: options.terme } : {}),
    limite: PLAFOND_CLIENTS,
  });
}
