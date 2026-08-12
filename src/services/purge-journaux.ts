/**
 * Purge des journaux techniques. LS-94, regle E14, ADR-027 decision 2.
 *
 * CE QUE CE MODULE FERME. Le registre des traitements annonce une duree de
 * conservation pour chaque table portant une donnee personnelle. Jusqu'a cette
 * story, TROIS de ces durees n'etaient appliquees par personne :
 * `JournalConnexion` avait sa fonction de purge depuis LS-80 sans que rien ne
 * l'appelle, `JournalAudit` et `RateLimit` n'en avaient aucune. ADR-027
 * decision 2, consequence 2 le dit deja : « une duree ecrite dans un document
 * et appliquee par personne est fictive ». Depuis LS-90 cette duree est
 * annoncee a l'autorite de controle, ce qui rend l'ecart opposable.
 *
 * POURQUOI UN MODULE SEPARE ET NON UNE PURGE PAR SERVICE. La regle qui compte
 * ici est transverse : « aucune table ne conserve au-dela de sa duree
 * annoncee ». Repartie dans trois modules, elle n'est verifiable nulle part et
 * l'oubli d'une table ne produit aucun symptome, la table grossit simplement
 * en silence. Rassemblee, la liste se lit d'un coup d'oeil et un controle
 * automatique peut la confronter au registre.
 *
 * `JournalEmail` N'EST PAS PURGE ICI, et ce n'est pas un oubli. Sa duree suit
 * la commande qu'il sert, traitement T2 du registre, donc dix ans au titre de
 * l'article L123-22 du code de commerce quand la commande a produit une
 * facture. Le purger a six mois supprimerait la trace d'envoi d'une facture
 * encore opposable.
 */
import { journaliser, journaliserErreur } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import {
  limiteDeConservation,
  purgerJournalConnexion,
} from "@/services/journal-connexion";

/**
 * Duree de conservation d'une ligne de `RateLimit`, EN HEURES et non en mois.
 *
 * L'ARBITRAGE QUE CETTE STORY DEVAIT RENDRE, LS-94. Le registre annonçait six
 * mois « par alignement » sur la deliberation CNIL n 2021-122, alignement qui
 * ne tient pas a l'examen.
 *
 * Cette deliberation vise la JOURNALISATION, c'est-a-dire une trace conservee
 * pour etre relue apres un incident. `RateLimit` n'est pas une trace : c'est un
 * COMPTEUR DE TRAVAIL, dont Better Auth se sert pour decider d'accepter ou de
 * refuser la requete suivante. Les fenetres configurees par ADR-027 valent
 * SOIXANTE SECONDES : passe la fenetre, la ligne n'a plus aucune utilite
 * fonctionnelle, Better Auth la reinitialise de lui-meme a la tentative
 * suivante.
 *
 * OR SA CLE ENCODE UNE ADRESSE IP, donc une donnee personnelle, ADR-027
 * decision 1 relevant deja que le mecanisme integre compte par IP et non par
 * compte. Conserver six mois une donnee dont l'usage dure une minute contredit
 * la minimisation, article 5.1.c du RGPD : la duree doit etre proportionnee a
 * la finalite, et la finalite est ici epuisee en une minute.
 *
 * VINGT-QUATRE HEURES ET NON UNE HEURE, pourtant plus proche de l'usage. La
 * marge sert a l'exploitation : constater le lendemain matin qu'une adresse a
 * ete plafonnee pendant la nuit a une valeur de diagnostic, et le journal des
 * connexions qui porte cette information, lui, est conserve six mois. Vingt-
 * quatre heures laissent trois ordres de grandeur au-dessus de la fenetre la
 * plus longue, tout en divisant par cent quatre-vingts la duree pendant
 * laquelle une adresse IP reste attachee a cette table.
 *
 * REPERCUTE AU REGISTRE, traitement T9, critere 5 de LS-94.
 */
export const CONSERVATION_RATE_LIMIT_HEURES = 24;

/**
 * Ce qu'une purge rend, par table.
 *
 * `echec` EST UN ETAT NORMAL DE CE TYPE, et c'est le point de la story. Le
 * critere 4 exige qu'une purge en echec ne fasse pas echouer les autres :
 * modeliser l'echec plutot que de le laisser remonter en exception est ce qui
 * rend cette garantie tenable, et surtout observable.
 */
export type ResultatPurge = {
  table: string;
  supprimees: number;
  echec: boolean;
};

/**
 * Supprime les lignes de `JournalAudit` au-dela de la duree de conservation.
 *
 * SIX MOIS, PAR ALIGNEMENT ASSUME sur la deliberation CNIL n 2021-122, a la
 * difference de `RateLimit` ci-dessus. L'alignement tient ici parce que
 * `JournalAudit` EST un journal au sens de la recommandation : une trace des
 * actions d'administration, conservee pour etre relue apres coup. C'est la
 * meme nature que `JournalConnexion`, et la meme duree.
 *
 * `limiteDeConservation` EST REUTILISEE plutot que recalculee, avec son
 * traitement du quantieme : `setUTCMonth` seul deborde, le 31 aout moins six
 * mois donnant le 3 mars, defaut deja trouve en relecture de LS-80. Recopier ce
 * calcul ici aurait recopie le defaut ou, pire, l'aurait corrige d'un seul
 * cote.
 *
 * COMPARAISON STRICTE `lt`, comme la purge de LS-80 : a la frontiere, garder
 * une ligne de trop vaut mieux qu'en supprimer une qui pouvait servir.
 */
export async function purgerJournalAudit(
  maintenant: Date = new Date(),
): Promise<number> {
  const { count } = await prisma.journalAudit.deleteMany({
    where: { creeA: { lt: limiteDeConservation(maintenant) } },
  });

  return count;
}

/**
 * Supprime les lignes de `RateLimit` au-dela de vingt-quatre heures.
 *
 * ELLE NE COMPARE PAS UNE DATE, et c'est la difference qui se rate. La table
 * `RateLimit` appartient a Better Auth : elle N'A AUCUNE COLONNE DE DATE, mais
 * un `lastRequest` en `BigInt` portant des MILLISECONDES depuis l'epoch,
 * `Date.now()` verifie dans le code de la bibliotheque installee
 * (`api/rate-limiter/index.mjs`, `const now = Date.now()`).
 *
 * Ecrire `{ lastRequest: { lt: unEDate } }` ne compilerait pas, et convertir la
 * date en secondes plutot qu'en millisecondes supprimerait tout ou rien selon
 * le sens de l'erreur, sans qu'aucun parcours nominal ne le montre : la table
 * se viderait entierement ou ne se viderait jamais, deux etats egalement
 * silencieux.
 *
 * `BigInt` ET NON `Number` : la colonne est un `BigInt` cote Prisma, et
 * comparer un `Number` a un `BigInt` leve en JavaScript plutot que de convertir.
 */
export async function purgerRateLimit(
  maintenant: Date = new Date(),
): Promise<number> {
  const limiteMillisecondes = BigInt(
    maintenant.getTime() - CONSERVATION_RATE_LIMIT_HEURES * 60 * 60 * 1000,
  );

  const { count } = await prisma.rateLimit.deleteMany({
    where: { lastRequest: { lt: limiteMillisecondes } },
  });

  return count;
}

/**
 * Les purges a executer, et la table que chacune vide.
 *
 * UNE TABLE ET NON UNE SUITE D'APPELS, meme motif que `TACHES` et que
 * `CHEMINS_SURVEILLES` : ajouter une purge est une ligne, la liste se lit d'un
 * coup d'oeil pour verifier qu'aucune table a duree annoncee ne manque, et un
 * controle textuel peut la confronter au registre des traitements.
 *
 * LE NOM DE TABLE EST CELUI DU MODELE PRISMA, qui est aussi celui qu'emploie le
 * registre. Deux orthographes rendraient la confrontation impossible.
 */
const PURGES: ReadonlyArray<{
  table: string;
  executer: (maintenant: Date) => Promise<number>;
}> = [
  { table: "JournalConnexion", executer: purgerJournalConnexion },
  { table: "JournalAudit", executer: purgerJournalAudit },
  { table: "RateLimit", executer: purgerRateLimit },
];

/**
 * Execute toutes les purges, sans qu'un echec n'empeche les suivantes.
 *
 * LE POINT DE CETTE FONCTION, critere 4. Une purge qui leve ferait sortir la
 * boucle et laisserait les tables suivantes intactes : un incident sur
 * `JournalConnexion` arreterait la purge de `RateLimit`, qui grossirait alors
 * indefiniment sans que rien ne le dise. Chaque purge est donc isolee dans son
 * propre `try`, et son echec est journalise puis porte dans le resultat.
 *
 * ELLE NE LEVE PAS, MAIS ELLE NE MENT PAS NON PLUS. Le drapeau `echec` distingue
 * « zero ligne a supprimer », qui est le cas nominal d'une base recente, de
 * « la suppression a echoue », qui rend lui aussi zero. Sans ce drapeau, une
 * purge cassee depuis des mois serait indiscernable d'une purge sans travail :
 * c'est exactement le mode de defaillance silencieuse que le critere 4 vise.
 *
 * ELLE N'EST PAS APPELEE DIRECTEMENT PAR LA ROUTE : `executerSousVerrou` la
 * porte, ce qui garantit qu'une seule instance purge a la fois, critere 3.
 */
export async function purgerJournaux(
  maintenant: Date = new Date(),
): Promise<ResultatPurge[]> {
  const resultats: ResultatPurge[] = [];

  for (const { table, executer } of PURGES) {
    try {
      const supprimees = await executer(maintenant);

      journaliser("info", "Purge de journal executee", {
        table,
        supprimees,
      });

      resultats.push({ table, supprimees, echec: false });
    } catch (erreur) {
      // JOURNALISE PUIS POURSUIT, jamais relance. Voir l'entete : une table
      // qui grossit indefiniment est un incident silencieux, et l'arret de la
      // boucle transformerait un incident sur une table en incident sur trois.
      journaliserErreur("Purge de journal en echec", erreur, { table });

      resultats.push({ table, supprimees: 0, echec: true });
    }
  }

  return resultats;
}
