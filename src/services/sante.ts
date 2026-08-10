/**
 * Controle de sante applicatif, LS-73.
 *
 * POURQUOI UN SERVICE ET NON DU CODE DANS LA ROUTE. La route est un adaptateur
 * d'entree, elle traduit un resultat en reponse HTTP et rien d'autre. Placer la
 * sonde ici la rend testable sans serveur, et reutilisable par le script de
 * fumee comme par le controle de sante du conteneur, critere 5.
 *
 * CE QUE CE MODULE DECIDE, et c'est le critere 2 : une base injoignable rend le
 * service INDISPONIBLE. Repondre « en bonne sante » parce que le processus Node
 * repond, alors qu'aucune commande ne peut etre enregistree, ferait passer un
 * incident total pour un fonctionnement normal. Un orchestrateur ne redemarrerait
 * jamais le conteneur.
 */
import { prisma } from "@/lib/prisma";
import { journaliserErreur, type Correlation } from "@/lib/journal";

/**
 * Delai maximal accorde a la sonde, en millisecondes.
 *
 * POURQUOI UN DELAI DE GARDE EST INDISPENSABLE. Le cas qui fait mal n'est pas
 * la base qui refuse la connexion, celle-la echoue vite. C'est la base qui
 * accepte la connexion TCP et ne repond plus : saturation du pool, table
 * verrouillee, disque plein. Sans delai, `$queryRaw` attend indefiniment, le
 * controle de sante du conteneur expire de son cote, et le diagnostic est un
 * silence au lieu d'un etat.
 *
 * DEUX SECONDES parce que la sonde doit rester tres inferieure a l'intervalle
 * du controle Docker : un depassement doit produire un echec franc avant que le
 * controle suivant ne se declenche, sinon les sondes s'empilent.
 */
const DELAI_SONDE_MS = 2_000;

export type EtatSante = {
  /** Vrai seulement si TOUTES les dependances vitales repondent. */
  operationnel: boolean;
  /** Etat de la base, seule dependance vitale a ce stade du projet. */
  base: "disponible" | "indisponible";
};

/** Erreur interne signalant le depassement du delai de garde. */
class DelaiSondeDepasseError extends Error {
  constructor() {
    super(`Sonde de base non aboutie en ${DELAI_SONDE_MS} ms`);
    this.name = "DelaiSondeDepasseError";
  }
}

/**
 * Interroge la base avec un delai de garde.
 *
 * `SELECT 1` ET NON UN COMPTAGE SUR UNE TABLE METIER. La sonde doit mesurer la
 * disponibilite de la base, pas l'etat du catalogue : un `count` sur `Produit`
 * ferait echouer le controle de sante pendant une migration qui verrouille la
 * table, alors que le service est parfaitement capable de servir. Elle ne lit
 * aucune donnee personnelle, ce qui la rend sans risque au regard du critere 3.
 *
 * LE MINUTEUR EST TOUJOURS ANNULE, y compris quand la requete gagne la course.
 * Un `setTimeout` non annule maintient l'evenement actif et retarde l'arret
 * propre du processus, ce qui se manifeste en conteneur par un arret lent puis
 * un `SIGKILL`.
 */
async function sonderBase(): Promise<void> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;

  const garde = new Promise<never>((_, rejeter) => {
    minuteur = setTimeout(
      () => rejeter(new DelaiSondeDepasseError()),
      DELAI_SONDE_MS,
    );
  });

  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, garde]);
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * Etat de sante de l'application.
 *
 * ELLE NE LEVE JAMAIS. Un controle de sante qui leve produit une reponse 500
 * dont le corps, en production, est une page d'erreur : l'orchestrateur y lit
 * un echec, ce qui est correct, mais l'exploitant perd la distinction entre
 * « la base est morte » et « le controle de sante est casse ». Un etat explicite
 * est toujours plus exploitable qu'une exception.
 *
 * L'ECHEC EST JOURNALISE, sans quoi une indisponibilite intermittente ne
 * laisserait aucune trace : le controle suivant repasserait au vert et personne
 * ne saurait qu'il y a eu une coupure. `journaliserErreur` ne garde que le nom
 * de la classe, l'URL de connexion portee par la cause ne sort pas.
 */
export async function verifierSante(
  correlation?: Correlation,
): Promise<EtatSante> {
  try {
    await sonderBase();
    return { operationnel: true, base: "disponible" };
  } catch (erreur) {
    journaliserErreur("controle de sante en echec", erreur, {}, correlation);
    return { operationnel: false, base: "indisponible" };
  }
}
