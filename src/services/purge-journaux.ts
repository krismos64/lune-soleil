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
 * Duree de conservation d'une ligne d'outbox TERMINEE, en jours.
 *
 * L'ARBITRAGE QUE LS-154 DEVAIT RENDRE, et il n'est pas de meme nature que celui
 * de `RateLimit` ci-dessus : la question n'est pas seulement « combien de
 * temps », mais « quelles lignes ».
 *
 * TRENTE JOURS, ET LE RAISONNEMENT TIENT EN DEUX TEMPS.
 *
 * L'information de fond ne vit PAS ici. Une ligne `ENVOYE` ou `ECHOUE` a deja
 * produit sa trace dans `JournalEmail`, qui est le document opposable et suit
 * la commande qu'il sert, jusqu'a dix ans au titre de l'article L123-22 du code
 * de commerce. La ligne d'outbox n'est plus qu'un doublon de travail, et le
 * registre le dit : « une file de travail, pas une trace ».
 *
 * MAIS ELLE PORTE L'ADRESSE DU DESTINATAIRE ET LES VARIABLES DU MESSAGE, donc
 * des donnees personnelles. Conserver sans limite ce qui n'a plus d'usage
 * contredit la minimisation, article 5.1.c, exactement le raisonnement qui a
 * ramene `RateLimit` de six mois a vingt-quatre heures.
 *
 * POURQUOI PAS VINGT-QUATRE HEURES, ALORS. Parce que l'usage ne s'arrete pas a
 * l'envoi : une reclamation « je n'ai jamais recu ma confirmation » arrive
 * quelques jours plus tard, et la ligne d'outbox porte alors les VARIABLES du
 * message, que `JournalEmail` ne conserve pas. Trente jours couvrent le delai
 * ou une telle reclamation se produit, sans garder une adresse un an.
 *
 * POURQUOI PAS SIX MOIS. Aucun texte ne l'impose ici : la deliberation CNIL
 * n 2021-122 vise la journalisation de securite, et cette table n'en est pas
 * une. S'aligner dessus serait le meme faux alignement que LS-94 a corrige.
 */
export const CONSERVATION_ENVOI_TERMINE_JOURS = 30;

/**
 * Duree de conservation d'un message de contact, en annees.
 *
 * TROIS ANS, referentiel CNIL n 2021-131, meme ancrage que le traitement T2
 * pour les donnees de prospect : « trois ans a compter du dernier contact
 * emanant du prospect ». Un message de contact EST ce dernier contact.
 *
 * LA VALEUR EST VERIFIEE A LA SOURCE et non deduite : LS-97 avait d'abord
 * retenu douze mois sans qu'aucun texte ne l'appuie.
 */
export const CONSERVATION_MESSAGE_ANNEES = 3;

/**
 * Supprime les lignes d'outbox TERMINEES au-dela de leur duree.
 *
 * LE FILTRE SUR LE STATUT EST LE COEUR DE CETTE FONCTION, et c'est pourquoi la
 * purge n'a pas ete ecrite dans LS-82 : un `deleteMany` par age seul aurait
 * suffi a la faire passer, et il aurait ete FAUX.
 *
 * LES QUATRE STATUTS N'ONT PAS LA MEME VALEUR :
 *
 * - `ENVOYE` et `ECHOUE` sont TERMINEES. L'information de fond survit dans
 *   `JournalEmail` : elles peuvent partir
 * - `ENVOI_EN_COURS` est BLOQUEE ET AMBIGUE. Personne ne sait si le message est
 *   parti, ADR-033 refuse de trancher automatiquement, et une alerte appelle
 *   l'exploitante a decider. La purger effacerait precisement ce qu'il faut
 *   traiter, et le ferait EN SILENCE
 * - `EN_ATTENTE` n'est pas encore partie : la purger priverait un client de sa
 *   confirmation
 *
 * AUCUNE CONTRAINTE DE BASE NE PEUT EXPRIMER CELA, la regle portant sur un
 * `WHERE` et non sur une ligne. C'est donc une propriete du CODE, prouvee par
 * les quatre tests d'etat et par la mutation qui retire le filtre.
 *
 * `in` PLUTOT QU'UNE NEGATION, et ce choix compte. `not: { in: [...] }` aurait
 * le meme effet aujourd'hui, et le perdrait au premier statut AJOUTE a l'enum :
 * un `ARCHIVE` inconnu serait purge par defaut. La liste positive garde le
 * defaut FERME, meme motif que le predicat d'index partiel de `paiement`.
 */
export async function purgerEnvoisTermines(
  maintenant: Date = new Date(),
): Promise<number> {
  const { count } = await prisma.envoiEnAttente.deleteMany({
    where: {
      statut: { in: ["ENVOYE", "ECHOUE"] },
      /*
       * COMPARAISON STRICTE `lt`, comme les trois autres purges de ce fichier.
       * « A la frontiere, garder une ligne de trop vaut mieux qu'en supprimer
       * une qui pouvait servir », position posee par LS-80 et rappelee en tete
       * de `purgerJournalAudit`.
       *
       * UNE PREMIERE VERSION PORTAIT `lte`, seul ecart du projet, et AUCUN TEST
       * ne le voyait : la mutation `lte` vers `lt` laissait les quinze tests
       * verts. Releve par `ls-critical-reviewer` le 2 septembre 2026. Le test de
       * frontiere qui accompagne cette ligne ferme desormais les deux sens.
       */
      creeA: { lt: limiteEnvoiTermine(maintenant) },
    },
  });

  return count;
}

/**
 * L'instant a partir duquel une ligne d'outbox terminee est purgeable.
 *
 * EXPORTEE POUR QUE LE TEST DE FRONTIERE S'Y ANCRE plutot que de recopier le
 * calcul. La leçon vient du test de `journal_audit` : une premiere version y
 * recopiait un `setUTCMonth` qui paraissait equivalent et ne l'etait pas, la
 * ligne se trouvait trois jours apres la limite, et la mutation restait verte.
 *
 * Un test qui recalcule la frontiere ne teste pas la frontiere du code.
 */
export function limiteEnvoiTermine(maintenant: Date): Date {
  return new Date(
    maintenant.getTime() -
      CONSERVATION_ENVOI_TERMINE_JOURS * 24 * 60 * 60 * 1000,
  );
}

/**
 * Supprime les messages de contact au-dela de trois ans.
 *
 * ELLE NE REGARDE PAS LE STATUT, contrairement a la purge d'outbox ci-dessus, et
 * l'asymetrie se justifie plutot qu'elle ne s'oublie.
 *
 * Une ligne d'outbox bloquee est un INCIDENT a traiter : la purger effacerait le
 * travail. Un message non lu de trois ans n'est pas un incident, c'est une
 * demande a laquelle plus personne ne repondra : le garder au-dela de la duree
 * annoncee contredirait la minimisation sans rendre service.
 *
 * LA DATE DE REFERENCE EST `creeA` ET NON `luA`. Le referentiel CNIL compte « a
 * compter du dernier contact emanant du prospect », donc de l'envoi du message,
 * jamais du moment ou l'exploitante l'a ouvert : ancrer sur la lecture ferait
 * dependre une duree legale d'un geste interne, et un message jamais lu ne
 * serait alors JAMAIS purge.
 */
export async function purgerMessages(
  maintenant: Date = new Date(),
): Promise<number> {
  const { count } = await prisma.message.deleteMany({
    where: { creeA: { lt: limiteMessage(maintenant) } },
  });

  return count;
}

/**
 * L'instant a partir duquel un message est purgeable.
 *
 * `setUTCFullYear` SEUL DEBORDE SUR UNE ANNEE BISSEXTILE, mesure plutot que
 * suppose : le 29 fevrier 2024 moins trois ans donne le 1er MARS 2021, et non
 * le 28 fevrier. La limite part alors VERS L'AVANT, donc la purge supprime un
 * message qui n'a pas encore trois ans.
 *
 * LE SENS DE L'ERREUR EST LE MAUVAIS, et c'est ce qui la rend grave : elle
 * detruit une donnee personnelle AVANT le terme annonce au registre, ce qu'aucun
 * rejeu ne rattrape. Une limite trop conservatrice garderait une ligne de trop,
 * ce que la comparaison stricte assume deja.
 *
 * C'EST LE JUMEAU EXACT DU DEFAUT DE `setUTCMonth` corrige en relecture de
 * LS-80, ou le 31 aout moins six mois donnait le 3 mars. Le quantieme y bornait
 * le debordement ; ici c'est le 29 fevrier qui n'existe pas dans l'annee cible.
 *
 * LE CALCUL PASSE PAR LES MOIS, donc par `limiteDeConservation` dont le
 * mecanisme est deja eprouve : se placer au 1er avant de reculer, puis borner le
 * quantieme au dernier jour du mois atteint. Un `3 * 365 * 86400 * 1000`
 * deriverait au fil des annees bissextiles.
 */
function limiteMessage(maintenant: Date): Date {
  const limite = new Date(maintenant);
  const quantieme = limite.getUTCDate();

  limite.setUTCDate(1);
  limite.setUTCMonth(limite.getUTCMonth() - CONSERVATION_MESSAGE_ANNEES * 12);

  const dernierJourDuMois = new Date(
    Date.UTC(limite.getUTCFullYear(), limite.getUTCMonth() + 1, 0),
  ).getUTCDate();

  limite.setUTCDate(Math.min(quantieme, dernierJourDuMois));

  return limite;
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
  { table: "EnvoiEnAttente", executer: purgerEnvoisTermines },
  { table: "Message", executer: purgerMessages },
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
