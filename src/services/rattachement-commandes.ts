/**
 * Rattachement des commandes passees sans compte, parcours 6. LS-56.
 *
 * Zone critique : ce module decide qui accede a l'historique et aux factures
 * d'une commande. Une condition mal posee ici ouvre les donnees d'un tiers.
 *
 * CE QUE LE RATTACHEMENT EST. Un client commande sans compte, `utilisateurId`
 * restant nul, puis cree un compte plus tard avec la meme adresse. Ce module
 * relie les deux, ce qui lui donne acces a son historique et a ses factures.
 *
 * LES TROIS CONDITIONS SONT CUMULATIVES, aucune n'est facultative :
 *
 *   1. l'adresse du compte est VERIFIEE
 *   2. la commande n'a PAS de proprietaire, `utilisateurId` nul
 *   3. la commande n'est PAS dissociee, `dissocieA` nul
 *
 * LA PREMIERE VIT ICI, les deux autres dans le `where` du repository. Cette
 * repartition suit la garde des couches : le repository execute, il ne juge
 * pas. Ce qui compte est qu'aucun chemin n'atteigne l'ecriture sans les trois.
 *
 * POURQUOI LA VERIFICATION D'ADRESSE EST NON NEGOCIABLE ALORS QU'ELLE NE BLOQUE
 * PAS LA CONNEXION. L'arbitrage du 2 septembre 2026 pose
 * `requireEmailVerification` a `false` : un compte non verifie se connecte et
 * commande. Il ne rattache rien pour autant, et les deux regles ne se
 * contredisent pas. S'inscrire ne prouve pas qu'on possede la boite ; cliquer
 * le lien recu le prouve. Sans cette condition, quiconque saisit l'adresse d'un
 * tiers a l'inscription recupererait ses commandes, ses adresses figees et ses
 * factures. C'est le seul endroit du projet ou `emailVerifie` FONDE une
 * decision d'acces.
 *
 * DEUX DECLENCHEURS, ET LE SECOND N'EST PAS UN DOUBLON. Le rattachement se
 * rejoue a chaque ouverture de session, en plus du clic sur le lien de
 * verification :
 *
 *   a la verification   effet immediat, le client voit ses commandes en
 *                       revenant de sa boite
 *   a la connexion      rattrape les commandes passees APRES la verification,
 *                       qu'un declenchement unique laisserait orphelines pour
 *                       toujours
 *
 * Le second cas est reel : rien n'oblige un client verifie a etre connecte au
 * moment ou il commande. Le rejeu est sans risque, les trois conditions etant
 * revaluees a chaque fois, et sans cout mesurable, la requete portant sur un
 * index de `email_normalise` et ne rendant aucune ligne le reste du temps.
 *
 * IDEMPOTENT PAR CONSTRUCTION. Une seconde execution ne trouve plus aucune
 * commande, `utilisateurId` n'etant plus nul, et rend zero. Aucune garde
 * supplementaire n'est necessaire, et surtout aucun drapeau « deja rattache »
 * sur le compte : un tel drapeau fermerait justement le rattrapage ci-dessus.
 */
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import {
  listerCommandesRattachables,
  rattacherCommandes,
  type CommandeRattachable,
} from "@/repositories/commande";
import { ecrireAudit } from "@/repositories/mouvement-stock";
import { lireEtatVerification } from "@/repositories/utilisateur";

export type { CommandeRattachable };

/**
 * Normalise une adresse email pour la comparaison.
 *
 * ELLE DOIT RENDRE EXACTEMENT CE QUE `services/commande.ts` ECRIT dans
 * `Commande.emailNormalise`, a savoir `trim().toLowerCase()`. Les deux formes
 * se comparent par egalite stricte en SQL : la moindre divergence, un accent
 * retire ou un point supprime chez Gmail, ne produirait AUCUNE erreur. Le
 * rattachement rendrait simplement zero commande, en silence, et le client
 * conclurait que ses commandes ont disparu.
 *
 * C'est le motif de la chaine construite a l'execution, deja rencontre sur ce
 * projet : deux moities justes separement, une jonction fausse. Un test
 * unitaire ancre les deux formes l'une a l'autre.
 *
 * AUCUNE NORMALISATION PLUS AMBITIEUSE, et c'est un choix. Traiter les points
 * de Gmail ou les sous-adresses en `+` ferait correspondre des adresses que le
 * client a saisies differemment, donc rattacherait sur une egalite que la
 * personne n'a jamais etablie. Le doute profite ici a la non-divulgation.
 */
export function normaliserEmailPourRattachement(brut: string): string {
  return brut.trim().toLowerCase();
}

/**
 * Ce que la consultation rend a l'interface.
 *
 * `ADRESSE_NON_VERIFIEE` EST DISTINCT D'UNE LISTE VIDE, et la nuance porte
 * toute l'information de l'ecran : le premier dit « confirmez votre adresse »,
 * le second « il n'y a rien a rattacher ». Les confondre laisserait un client
 * devant une liste vide sans savoir qu'un clic la remplirait.
 */
export type ResultatConsultation =
  | { etat: "ADRESSE_NON_VERIFIEE" }
  | { etat: "ELIGIBLES"; commandes: CommandeRattachable[] };

/**
 * Les commandes qu'un compte peut revendiquer, sans rien ecrire.
 *
 * `utilisateurId` ET `email` VIENNENT DE LA SESSION, jamais d'un formulaire ni
 * d'une URL, invariant 2. Cette signature n'accepte aucun identifiant de
 * commande : l'appelant ne choisit pas ce qu'il rattache, le serveur le calcule.
 */
export async function consulterCommandesRattachables(
  utilisateurId: string,
  email: string,
): Promise<ResultatConsultation> {
  const verifiee = await lireEtatVerification(prisma, utilisateurId);

  if (!verifiee) {
    // DEFAUT FERME, et la lecture ne se fait meme pas : une liste calculee puis
    // jetee finirait par etre affichee « pour information » par une future
    // modification de l'ecran.
    return { etat: "ADRESSE_NON_VERIFIEE" };
  }

  const commandes = await listerCommandesRattachables(
    prisma,
    normaliserEmailPourRattachement(email),
  );

  return { etat: "ELIGIBLES", commandes };
}

/** Ce que le rattachement rend a l'appelant. Jamais une exception sur un refus. */
export type ResultatRattachement =
  { etat: "RATTACHEES"; nombre: number } | { etat: "ADRESSE_NON_VERIFIEE" };

/**
 * Rattache au compte toutes ses commandes eligibles.
 *
 * UNE TRANSACTION, point 6 des transactions critiques de `database.md`.
 * L'ecriture des commandes et l'entree au journal d'audit sont indissociables :
 * un rattachement sans trace laisserait un acces a des donnees personnelles
 * sans qu'aucune trace ne dise quand ni pour qui il a ete ouvert, et le
 * parcours 6 impose cette entree a son etape 4.
 *
 * L'AUDIT N'EST ECRIT QUE SI QUELQUE CHOSE L'A ETE. Une entree « zero commande
 * rattachee » a chaque connexion noierait les entrees reelles sous le bruit,
 * le rejeu ayant lieu a chaque ouverture de session. Ce que le journal doit
 * porter est l'evenement, pas la tentative.
 *
 * LE DETAIL NE PORTE AUCUNE DONNEE PERSONNELLE, seulement un nombre et le
 * declencheur : ce journal est lisible par l'exploitante, et l'adresse email y
 * serait une donnee recopiee sans necessite.
 */
export async function rattacherMesCommandes(
  utilisateurId: string,
  email: string,
  declencheur: "VERIFICATION" | "CONNEXION" | "DEMANDE",
): Promise<ResultatRattachement> {
  const verifiee = await lireEtatVerification(prisma, utilisateurId);

  if (!verifiee) {
    return { etat: "ADRESSE_NON_VERIFIEE" };
  }

  const emailNormalise = normaliserEmailPourRattachement(email);

  const nombre = await prisma.$transaction(async (transaction) => {
    const rattachees = await rattacherCommandes(
      transaction,
      emailNormalise,
      utilisateurId,
    );

    if (rattachees > 0) {
      await ecrireAudit(transaction, {
        acteurId: utilisateurId,
        action: "RATTACHEMENT_COMMANDES",
        typeCible: "Utilisateur",
        idCible: utilisateurId,
        detail: { nombre: rattachees, declencheur },
      });
    }

    return rattachees;
  });

  if (nombre > 0) {
    /*
     * LES CLES SONT `total` ET `origine`, ET CE N'EST PAS UN CAPRICE DE STYLE.
     * `masquerContexte` de `lib/journal.ts` compare PAR INCLUSION : `nombre`
     * contient « nom », `declencheur` contient « cle », et les deux valeurs
     * sortaient donc en `[masque]`. La ligne existait sans rien apprendre.
     *
     * Le filtre a raison de comparer ainsi, c'est ce qui lui fait attraper
     * `emailClient` et `adresseLivraison`. Le contourner en l'affaiblissant
     * couterait cette protection pour deux entiers ; le renommage ne coute
     * rien. Aucune de ces deux valeurs n'est une donnee personnelle.
     */
    journaliser("info", "Commandes rattachees a un compte", {
      total: nombre,
      origine: declencheur,
    });
  }

  return { etat: "RATTACHEES", nombre };
}
