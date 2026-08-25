/**
 * Socle de validation serveur, LS-71.
 *
 * POURQUOI CE MODULE EXISTE. L'invariant 7 est absolu, « toute entree non
 * fiable est validee cote serveur avec Zod ». Sans schemas partages, chaque
 * fonctionnalite inventerait sa facon de valider un montant, et il suffirait
 * d'une qui arrondit un decimal au lieu de le refuser pour fausser une facture.
 *
 * CE QUE CE SOCLE NE FAIT PAS, et c'est important de le tenir :
 *
 * - IL N'AUTORISE RIEN. Un identifiant conforme prouve sa FORME, jamais le
 *   droit d'y acceder, invariant 2. L'autorisation vient de la session,
 *   recoupee cote serveur par `services/autorisation.ts`.
 * - IL NE REMPLACE AUCUNE CONTRAINTE DE BASE. Les `CHECK` de PostgreSQL
 *   restent la ligne de defense qui protege l'invariant. Ce socle ameliore la
 *   QUALITE DU REFUS : refuser tot et lisiblement, au lieu de laisser remonter
 *   une erreur brute `23514` en page d'erreur serveur.
 * - IL NE CONVERTIT RIEN EN SILENCE. Aucun `z.coerce` : coercer `"19.99"`
 *   reintroduirait par la porte de service le decimal refuse par la principale.
 *
 * OU S'APPELLE LA VALIDATION. A la frontiere, dans l'adaptateur d'entree, ET au
 * point d'entree du cas d'usage. Ce n'est pas une redondance : un service reste
 * appelable depuis un autre service, chemin par lequel aucun adaptateur ne
 * passe. Le README de garde de `services/` porte deja « la validation Zod des
 * entrees non fiables ».
 *
 * Zod 4 verifie via Context7 : `z.strictObject()` remplace `.strict()` deprecie,
 * `z.int()` borne au safe integer range, `z.iso.datetime()` remplace
 * `z.string().datetime()`.
 */
import { z } from "zod";

/**
 * Entree rejetee par la validation, distincte d'une panne technique.
 *
 * ELLE NE PORTE JAMAIS LA VALEUR REFUSEE, invariant 9. Une entree invalide peut
 * etre un mot de passe colle dans le mauvais champ, un numero de carte ou un
 * jeton ; ce message finit dans un journal, une trace ou une reponse HTTP.
 * `details` nomme le CHAMP fautif et la nature du probleme, ce qui suffit a une
 * interface pour pointer la bonne case.
 *
 * Le nom reprend celui deja introduit par `services/utilisateur.ts` en LS-70,
 * qui gardera le sien tant qu'il n'aura pas de raison de bouger : deux classes
 * distinctes de meme nom seraient un piege, celle-ci est la forme partagee.
 */
export class EntreeInvalideError extends Error {
  constructor(readonly details: string) {
    super(`Entree invalide : ${details}`);
    this.name = "EntreeInvalideError";
  }
}

/**
 * Message court disant OU et QUOI, jamais AVEC QUELLE VALEUR.
 *
 * CE QUE ZOD 4 MET DANS UN PROBLEME, mesure sur ce depot et non suppose : les
 * `issues` decrivent l'attendu et le type recu, « expected string, received
 * number », et ne portent PAS la valeur refusee. Le `input` present a
 * l'execution n'est pas serialise.
 *
 * IL RESTE UN VECTEUR, et c'est celui que cette fonction doit fermer : le
 * probleme `unrecognized_keys` porte les NOMS des cles rejetees, recopies dans
 * son `message`. Un corps hostile choisit ces noms : `{ "cle_api_sk_live_x": 1 }`
 * ferait ecrire cette chaine dans un journal via le message d'erreur.
 *
 * Le message de Zod est donc REMPLACE, jamais repris, pour ce code de probleme.
 * Les autres messages sont surs et restent tels quels, ils sont plus utiles a
 * l'interface qu'un libelle generique.
 */
export function formaterProblemes(
  problemes: readonly z.core.$ZodIssue[],
): string {
  return problemes
    .map((probleme) => {
      const chemin =
        probleme.path.length > 0 ? probleme.path.join(".") : "valeur";

      if (probleme.code === "unrecognized_keys") {
        // Le NOMBRE de cles suffit a diagnostiquer, leurs noms viennent de
        // l'entree et n'ont rien a faire dans un journal.
        return `${chemin} : ${probleme.keys.length} champ(s) non reconnu(s).`;
      }

      return `${chemin} : ${probleme.message}`;
    })
    .join(", ");
}

/**
 * Valide une entree non fiable, ou leve `EntreeInvalideError`.
 *
 * `safeParse` ET NON `parse` : une `ZodError` qui traverserait telle quelle
 * porterait le message JSON complet de Zod, et surtout les noms de cles
 * rejetees par `unrecognized_keys`. La traduire ici, par `formaterProblemes`,
 * est ce qui borne ce qui sort.
 *
 * Elle donne aussi UNE SEULE classe d'erreur a capturer aux adaptateurs, la ou
 * `ZodError` les obligerait a connaitre Zod pour distinguer un refus d'entree
 * d'une panne.
 */
export function valider<T extends z.ZodType>(
  schema: T,
  entree: unknown,
): z.infer<T> {
  const resultat = schema.safeParse(entree);

  if (!resultat.success) {
    throw new EntreeInvalideError(formaterProblemes(resultat.error.issues));
  }

  return resultat.data;
}

/**
 * Montant monetaire en CENTIMES ENTIERS, invariant 1.
 *
 * `z.int()` refuse tout decimal, ainsi que `NaN` et les infinis qui sont des
 * `number` pour TypeScript et traverseraient un typage nu sans alerter.
 *
 * ZERO EST ACCEPTE, et c'est voulu : `Commande.montantTaxeCentimes` vaut zero
 * en franchise en base, article 293 B du CGI, et un avoir partiel peut solder a
 * zero. C'est la seule difference avec `schemaQuantite`.
 *
 * AUCUN ARRONDI, JAMAIS. `19.99` est refuse, pas transforme en `20` ni en
 * `1999` : deviner l'intention de l'appelant produirait une facture fausse que
 * personne ne verrait passer. Convertir des euros en centimes est le travail de
 * l'appelant, explicitement.
 */
export const schemaMontantCentimes = z
  .int("Un montant en centimes entiers est attendu.")
  .min(0, "Un montant ne peut pas etre negatif.");

/**
 * Quantite d'articles, entier STRICTEMENT positif.
 *
 * DISTINCT DE `schemaMontantCentimes` sur la borne basse, seule difference et
 * elle est metier : zero centime est un montant legitime, zero article n'est
 * pas une quantite. Fusionner les deux schemas ferait accepter une ligne de
 * panier vide.
 *
 * Remplace la garde locale de `services/reservation.ts`, dette de LS-50 : les
 * valeurs `0`, `-1` et `1.5` restent refusees avant d'atteindre PostgreSQL.
 */
export const schemaQuantite = z
  .int("Une quantite entiere est attendue.")
  .min(1, "Une quantite doit etre strictement positive.");

/**
 * Identifiant technique, UUID.
 *
 * VALIDER LA FORME N'AUTORISE RIEN, invariant 2. Ce schema empeche une chaine
 * arbitraire d'atteindre une requete, il ne dit rien du droit d'acceder a la
 * ressource designee. Tout appelant qui croirait le contraire ouvrirait un
 * acces direct par identifiant.
 *
 * `z.uuid()` et non `z.uuidv4()` : les identifiants viennent de
 * `@default(uuid())` de Prisma, et fixer la version rendrait le socle faux le
 * jour ou le schema changerait de generateur.
 */
export const schemaIdentifiant = z.uuid("Un identifiant valide est attendu.");

/**
 * Horodatage, persiste en UTC, invariant 8.
 *
 * ACCEPTE UNIQUEMENT UN INSTANT CERTAIN. `z.iso.datetime({ offset: true })`
 * exige un `Z` ou un decalage explicite, et refuse « 2026-08-07T18:30:00 » qui
 * designe deux instants distincts selon le fuseau du lecteur. L'accepter ferait
 * dependre une date de commande du fuseau du serveur, donc changer d'un
 * deploiement a l'autre.
 *
 * La conversion vers `Europe/Paris` appartient a l'AFFICHAGE et aux periodes
 * d'agregation de `STATISTIQUES.md`, jamais au stockage.
 */
export const schemaHorodatageUtc = z.iso
  .datetime({
    offset: true,
    message: "Un horodatage ISO 8601 avec fuseau explicite est attendu.",
  })
  .transform((valeur) => new Date(valeur));

/**
 * Code postal de France metropolitaine.
 *
 * L'OUTRE-MER EST EXCLU, decision de perimetre du cahier des charges et non
 * choix technique : les departements d'outre-mer commencent par 97 ou 98, et
 * les accepter promettrait une livraison que le tarif Mondial Relay retenu par
 * ADR-025 ne couvre pas. Corse comprise, `20xxx` reste metropolitaine.
 */
const schemaCodePostalMetropole = z
  .string()
  .regex(
    /^(?!97|98)\d{5}$/,
    "Un code postal de France metropolitaine est attendu.",
  );

/** Champ d'adresse non vide apres retrait des espaces de bordure. */
const champAdresse = (maximum: number) =>
  z.string().trim().min(1, "Ce champ est obligatoire.").max(maximum);

/**
 * Adresse postale, France metropolitaine.
 *
 * `z.strictObject` REFUSE LES CLES INCONNUES, et c'est la garantie et non un
 * detail de style. Un objet permissif les ignore en silence : sur une adresse
 * cela semblerait inoffensif, mais la meme habitude appliquee a un profil
 * laisserait passer `role: "ADMINISTRATRICE"` sans un bruit. Le motif vient de
 * `services/utilisateur.ts`, regle E11.
 *
 * CE SCHEMA VALIDE UNE SAISIE, il ne decrit pas l'adresse FIGEE d'une commande.
 * L'invariant 3 impose qu'une commande porte une copie figee de l'adresse au
 * moment de l'achat, jamais une reference au carnet.
 */
export const schemaAdressePostale = z.strictObject({
  ligne1: champAdresse(120),
  ligne2: champAdresse(120).optional(),
  codePostal: schemaCodePostalMetropole,
  ville: champAdresse(80),
  pays: z.literal("FR", "Seule la France metropolitaine est desservie."),
});

export type AdressePostale = z.infer<typeof schemaAdressePostale>;

/**
 * Ligne de panier : quelle variante, en quelle quantite.
 *
 * Compose les deux schemas ci-dessus plutot que de redeclarer leurs regles :
 * une borne recopiee est une borne qui divergera.
 */
export const schemaLignePanier = z.strictObject({
  varianteId: schemaIdentifiant,
  quantite: schemaQuantite,
});

/**
 * Panier soumis a reservation, au moins une ligne.
 *
 * UN PANIER VIDE EST REFUSE : reserver zero ligne rendrait un `SERVI` qui ne
 * garantit rien, et creerait une commande sans stock associe.
 */
export const schemaPanier = z
  .array(schemaLignePanier)
  .min(1, "Un panier doit porter au moins une ligne.");

/**
 * Nom du destinataire.
 *
 * OBLIGATOIRE POUR LES TROIS MODES, arbitrage du 25 aout 2026 : en Point Relais
 * c'est l'identite presentee au retrait, a domicile c'est ce qui figure sur
 * l'etiquette. Un colis sans nom n'est pas distribuable.
 */
export const schemaNomClient = champAdresse(120);

/**
 * Adresse email du client.
 *
 * `z.email()` ET NON UNE EXPRESSION REGULIERE MAISON. Ecrire soi-meme la regle
 * revient toujours a refuser une adresse valide, les formes legales etant plus
 * larges que l'intuition. La verification reelle de l'adresse appartient a
 * l'envoi, pas a la saisie.
 */
export const schemaEmailClient = z
  .email("Une adresse email valide est attendue.")
  .max(254, "Cette adresse email est trop longue.");

/**
 * Telephone francais, facultatif.
 *
 * FACULTATIF PAR DECISION DU 25 AOUT 2026, et `Commande.telephone` est nullable
 * en base, ce qui le confirme. Mondial Relay s'en sert pour la notification SMS
 * de mise a disposition : son absence degrade le service sans empecher la
 * livraison.
 *
 * LES ESPACES ET SEPARATEURS SONT TOLERES A LA SAISIE puis retires. Refuser
 * « 06 12 34 56 78 » serait refuser la facon dont un numero s'ecrit en France.
 */
export const schemaTelephone = z
  .string()
  .trim()
  .transform((valeur) => valeur.replace(/[\s.-]/g, ""))
  .refine(
    (valeur) => valeur === "" || /^(?:\+33|0)[1-9]\d{8}$/.test(valeur),
    "Un numero de telephone francais est attendu.",
  );

/**
 * Mode de livraison, les trois d'ADR-025.
 *
 * ECRIT EN DUR PLUTOT QUE DERIVE DE L'ENUM PRISMA, deliberement : ajouter une
 * valeur a l'enum ouvrirait sinon EN SILENCE la saisie a un mode dont le tarif
 * n'existe pas. Le meme piege que les index partiels, deja rencontre deux fois
 * sur ce projet.
 */
export const schemaModeLivraison = z.enum(
  ["POINT_RELAIS", "LOCKER", "DOMICILE"],
  "Un mode de livraison connu est attendu.",
);

/**
 * Point de retrait, copie complete.
 *
 * `PARCOURS.md` etape 3b impose de copier le libelle et l'adresse, pas
 * seulement l'identifiant : un point qui ferme rendrait autrement illisible une
 * commande passee.
 */
export const schemaPointRetrait = z.strictObject({
  identifiant: champAdresse(64),
  nom: champAdresse(120),
  ligne1: champAdresse(120),
  codePostal: schemaCodePostalMetropole,
  ville: champAdresse(80),
});

/**
 * Choix du mode de livraison, avec son point de retrait s'il en faut un.
 *
 * LE `superRefine` PORTE LA CONTRAINTE `chk_commande_mode_point_relais`, qui
 * est une equivalence et non une implication : un DOMICILE porteur d'un point
 * est refuse AUTANT qu'un POINT_RELAIS sans point. Ne verifier qu'un sens
 * laisserait passer la moitie des cas, et le CHECK rejetterait alors l'ecriture
 * de LS-117 avec un message que le visiteur ne comprendrait pas.
 *
 * LA VALIDATION EST LE CONTROLE PRINCIPAL, la contrainte la derniere ligne de
 * defense. C'est explicitement ce que demande LS-115.
 */
export const schemaChoixLivraison = z
  .strictObject({
    mode: schemaModeLivraison,
    pointRetrait: schemaPointRetrait.nullable(),
  })
  .superRefine((valeur, contexte) => {
    const exige = valeur.mode === "POINT_RELAIS" || valeur.mode === "LOCKER";

    if (exige && valeur.pointRetrait === null) {
      contexte.addIssue({
        code: "custom",
        path: ["pointRetrait"],
        message: "Ce mode de livraison demande de choisir un point de retrait.",
      });
    }

    if (!exige && valeur.pointRetrait !== null) {
      contexte.addIssue({
        code: "custom",
        path: ["pointRetrait"],
        message: "La livraison a domicile n'admet pas de point de retrait.",
      });
    }
  });

/** Coordonnees du client, etape 1 du tunnel. */
export const schemaCoordonnees = z.strictObject({
  nomClient: schemaNomClient,
  email: schemaEmailClient,
  telephone: schemaTelephone,
});
