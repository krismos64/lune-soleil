/**
 * Journalisation technique structuree, LS-73.
 *
 * POURQUOI CE MODULE EXISTE. Une boutique qui perd une commande doit laisser
 * une trace exploitable. Un `console.log` disperse ne l'est pas : il ne dit ni
 * quand, ni a quelle requete il se rattache, et deux appels concurrents
 * s'entrelacent sans qu'on puisse les demeler.
 *
 * CE QU'IL N'EST PAS, et la confusion couterait cher :
 *
 * - CE N'EST PAS UN JOURNAL METIER. `JournalAudit`, `JournalEmail` et le
 *   journal de connexions d'ADR-027 sont persistes en base, conserves six mois
 *   et opposables. Celui-ci vit en sortie standard, se perd au redemarrage du
 *   conteneur, et n'a aucune valeur probante. Ecrire une trace metier ici la
 *   ferait disparaitre.
 * - CE N'EST PAS DE LA MESURE D'AUDIENCE. Umami repond a « combien de
 *   visiteurs », ce module a « pourquoi cette commande a echoue ».
 * - CE N'EST PAS UN SERVICE DE SUPERVISION. Aucun envoi vers un tiers, arbitrage
 *   de Christophe du 10 aout 2026 : les traces d'exception portent des donnees
 *   personnelles, les transmettre a un sous-traitant hors UE demanderait un ADR
 *   et une declaration au registre. La decision se rouvrira en phase 6 si le
 *   besoin apparait, elle ne tient pas au cout.
 *
 * AUCUNE DEPENDANCE EXTERNE, meme arbitrage. Le besoin tient en un formateur
 * JSON ; une bibliotheque ajouterait une surface a `npm audit`, qui porte deja
 * sept overrides dont deux poses dans les trois derniers jours.
 */

/**
 * Niveaux, du plus grave au plus bavard. L'ordre du tableau EST la hierarchie.
 */
const NIVEAUX = ["error", "warn", "info", "debug"] as const;

export type NiveauJournal = (typeof NIVEAUX)[number];

const NIVEAU_PAR_DEFAUT: NiveauJournal = "info";

/**
 * Valeurs qu'un contexte de journal accepte. Volontairement etroit.
 *
 * PAS DE `unknown`, PAS D'OBJET IMBRIQUE. Accepter une forme libre laisserait
 * passer `{ client: utilisateur }` d'un geste, et l'objet entier finirait
 * serialise avec son adresse et son email. Le type force l'appelant a extraire
 * champ par champ ce qu'il veut tracer, donc a regarder ce qu'il ecrit.
 */
export type ValeurContexte = string | number | boolean | null;

export type ContexteJournal = Record<string, ValeurContexte>;

/**
 * Cles interdites en contexte, comparees en minuscules et sans separateur.
 *
 * POURQUOI UNE LISTE DE NOMS ET NON UNE DETECTION DE VALEURS. Reconnaitre un
 * secret a sa forme est perdu d'avance : un mot de passe ressemble a n'importe
 * quelle chaine. Le nom du champ, lui, est choisi par le developpeur au moment
 * ou il ecrit la ligne, c'est la qu'on peut l'arreter.
 *
 * CE QUE CHAQUE ENTREE PROTEGE :
 *
 * - `motdepasse`, `secret`, `jeton`, `token`, `cle`, `key`, `signature`,
 *   `authorization`, `cookie` : invariant 9, le depot est public
 * - `email`, `adresse`, `telephone`, `nom`, `prenom` : donnees personnelles,
 *   exigence explicite de LS-73
 * - `carte`, `iban`, `cvv` : moyens de paiement, qui ne transitent de toute
 *   facon jamais par ce projet, Stripe Checkout les gardant chez lui. La ligne
 *   existe pour que ca reste vrai le jour ou quelqu'un croira bien faire
 *
 * `pointRelaisId` et `codePostal` ne sont PAS interdits : un identifiant de
 * point relais et un code postal ne designent personne a eux seuls, et ils sont
 * indispensables pour diagnostiquer un probleme de livraison.
 */
const CLES_INTERDITES = [
  "motdepasse",
  "password",
  "secret",
  "jeton",
  "token",
  "cle",
  "key",
  "signature",
  "authorization",
  "cookie",
  "email",
  "courriel",
  "adresse",
  "telephone",
  "nom",
  "prenom",
  "carte",
  "iban",
  "cvv",
] as const;

/** Ce qui remplace une valeur retenue. Volontairement non ambigu a la lecture. */
export const VALEUR_MASQUEE = "[masque]";

/**
 * Normalise une cle pour la comparaison : minuscules, sans separateur.
 *
 * `motDePasse`, `mot_de_passe`, `MOT-DE-PASSE` et `motdepasse` designent la
 * meme chose. Comparer les chaines brutes n'en attraperait qu'une seule, et le
 * filtre donnerait une fausse assurance : il aurait l'air de proteger tout en
 * laissant passer trois ecritures sur quatre.
 */
function normaliserCle(cle: string): string {
  return cle.toLowerCase().replaceAll(/[-_\s]/g, "");
}

/**
 * Une cle porte-t-elle une donnee a masquer ?
 *
 * COMPARAISON PAR INCLUSION et non par egalite. Les noms reels sont composes :
 * `emailClient`, `adresseLivraison`, `stripeWebhookSecret`. Exiger l'egalite
 * exacte ne masquerait que le cas ou le champ s'appelle exactement `email`,
 * qui est le plus rare dans du vrai code.
 */
function cleSensible(cle: string): boolean {
  const normalisee = normaliserCle(cle);
  return CLES_INTERDITES.some((interdite) => normalisee.includes(interdite));
}

/**
 * Remplace la valeur des cles sensibles, conserve les autres.
 *
 * LA CLE RESTE VISIBLE, seule sa valeur part. C'est la regle de diagnostic du
 * projet, « lister les noms de variables sans leur contenu » : savoir QUE la
 * requete portait un email aide a comprendre le chemin parcouru, connaitre
 * l'adresse n'apporte rien de plus au diagnostic.
 */
function masquerContexte(contexte: ContexteJournal): ContexteJournal {
  const resultat: ContexteJournal = {};

  for (const [cle, valeur] of Object.entries(contexte)) {
    resultat[cle] = cleSensible(cle) ? VALEUR_MASQUEE : valeur;
  }

  return resultat;
}

/**
 * Niveau actif, lu dans l'environnement. Critere 4 de LS-73, « reglable sans
 * modification de code ».
 *
 * LU A CHAQUE APPEL ET NON MIS EN CACHE. Un cache au chargement du module
 * figerait le niveau pour toute la duree du processus, ce qui empeche de le
 * changer sur un conteneur en cours d'incident, precisement le moment ou on en
 * a besoin. Le cout est une lecture de `process.env` par ligne journalisee,
 * negligeable devant l'ecriture elle-meme.
 *
 * UNE VALEUR INCONNUE RETOMBE SUR `info` SANS LEVER. Une faute de frappe dans
 * une variable d'environnement ne doit pas empecher l'application de demarrer :
 * un site muet vaut mieux qu'un site mort, et l'erreur se voit au premier
 * journal manquant.
 */
function niveauActif(): NiveauJournal {
  const brut = process.env.LOG_LEVEL?.toLowerCase();

  return NIVEAUX.find((niveau) => niveau === brut) ?? NIVEAU_PAR_DEFAUT;
}

/** Un niveau doit-il etre ecrit, compte tenu du niveau actif ? */
function niveauAutorise(niveau: NiveauJournal): boolean {
  return NIVEAUX.indexOf(niveau) <= NIVEAUX.indexOf(niveauActif());
}

/**
 * Ce qu'on extrait d'une erreur avant de l'ecrire.
 *
 * NI `message`, NI `stack`, NI `cause`, et c'est LE point de la story. Le
 * critere 3 le dit : « c'est sur le chemin d'erreur que la fuite se produit ».
 * Les trois vecteurs mesures sur ce depot :
 *
 * - PostgreSQL met la valeur en conflit dans le message d'une violation
 *   d'unicite, « Key (email)=(personne@exemple.fr) already exists »
 * - une trace d'appel porte les arguments sur certains moteurs
 * - `cause` chaine des erreurs de pilote qui portent l'URL de connexion, mot de
 *   passe compris
 *
 * Ce qui reste, le NOM de la classe, suffit a savoir quoi chercher :
 * `PrismaClientKnownRequestError` et `EntreeInvalideError` ne renvoient pas au
 * meme diagnostic. Le detail complet reste visible en developpement, ou
 * `journaliserErreur` ecrit l'objet natif sur le flux d'erreur.
 */
function nommerErreur(erreur: unknown): string {
  if (erreur instanceof Error) {
    return erreur.name;
  }

  // Une valeur levee qui n'est pas une `Error`, `throw "..."` par exemple. Son
  // TYPE est tout ce qu'on peut en dire sans risquer d'ecrire son contenu.
  return typeof erreur;
}

/**
 * Identifiant de correlation de la requete en cours.
 *
 * POURQUOI IL EST PASSE EXPLICITEMENT et non stocke dans un contexte implicite.
 * `AsyncLocalStorage` le rendrait invisible dans les signatures, au prix d'une
 * dependance au contexte d'execution que les tests devraient simuler. Le passer
 * en parametre rend la chaine lisible et le test trivial. Si le cout d'ecriture
 * devient reel quand les services se multiplieront, la question se reposera.
 */
export type Correlation = { readonly correlationId: string };

/**
 * Engendre un identifiant de correlation.
 *
 * `crypto.randomUUID()` est natif a Node depuis la 19, aucune dependance. Il
 * n'a AUCUNE valeur de securite ici : il correle des lignes de journal, il
 * n'autorise rien et ne se substitue a aucun jeton signe, invariant 2.
 */
export function engendrerCorrelationId(): string {
  return crypto.randomUUID();
}

type LigneJournal = {
  horodatage: string;
  niveau: NiveauJournal;
  message: string;
  correlationId?: string;
} & ContexteJournal;

/**
 * Ecrit une ligne. Point de sortie unique du module.
 *
 * JSON SUR UNE LIGNE, format attendu par les collecteurs et lisible par `jq`.
 *
 * HORODATAGE EN UTC, invariant 8. `toISOString()` produit toujours un `Z`
 * final ; la conversion vers Europe/Paris appartient a l'affichage. Deux
 * conteneurs sur des fuseaux differents produisent ainsi des journaux
 * comparables.
 *
 * IL NE LEVE JAMAIS. Un echec d'ecriture de journal ne doit pas faire echouer
 * une commande deja payee, meme principe que la regle E4 pour l'email. Une
 * sortie standard fermee ou saturee est un cas reel en conteneur.
 */
function ecrire(ligne: LigneJournal): void {
  try {
    const flux = ligne.niveau === "error" ? process.stderr : process.stdout;
    flux.write(`${JSON.stringify(ligne)}\n`);
  } catch {
    // Volontairement vide. Journaliser l'echec de journalisation appellerait le
    // meme code et pourrait boucler.
  }
}

/**
 * Journalise un evenement technique.
 *
 * LE MESSAGE EST UNE CONSTANTE DE CODE, jamais une valeur d'entree. Interpoler
 * une donnee dedans, `journaliser("info", \`commande de ${email}\`)`, contourne
 * entierement le masquage : le filtre travaille sur les cles du contexte, pas
 * sur le texte libre. Tout ce qui varie va dans `contexte`.
 */
export function journaliser(
  niveau: NiveauJournal,
  message: string,
  contexte: ContexteJournal = {},
  correlation?: Correlation,
): void {
  if (!niveauAutorise(niveau)) {
    return;
  }

  ecrire({
    horodatage: new Date().toISOString(),
    niveau,
    message,
    ...(correlation ? { correlationId: correlation.correlationId } : {}),
    ...masquerContexte(contexte),
  });
}

/**
 * Journalise une erreur en ne gardant que le nom de sa classe.
 *
 * EN DEVELOPPEMENT SEULEMENT, l'objet natif est ecrit ensuite sur le flux
 * d'erreur, pile d'appel comprise. Sans cela, deboguer reviendrait a chercher a
 * l'aveugle un `TypeError` sans savoir quelle ligne l'a leve.
 *
 * LA CONDITION EST FERMEE PAR DEFAUT : elle exige `NODE_ENV === "development"`
 * plutot que d'exclure `"production"`. Un environnement inattendu, une variable
 * absente ou un `next build` qui evalue en production, retombe donc du cote
 * silencieux. La formulation inverse ferait fuiter des la premiere valeur non
 * prevue, defaut deja rencontre sur ce depot.
 */
export function journaliserErreur(
  message: string,
  erreur: unknown,
  contexte: ContexteJournal = {},
  correlation?: Correlation,
): void {
  journaliser(
    "error",
    message,
    { ...contexte, erreur: nommerErreur(erreur) },
    correlation,
  );

  if (process.env.NODE_ENV === "development") {
    console.error(erreur);
  }
}
