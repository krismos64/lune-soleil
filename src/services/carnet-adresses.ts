/**
 * Carnet d'adresses du client, parcours 8. LS-59.
 *
 * Zone critique : autorisation et donnees personnelles. Une adresse porte un
 * nom, une adresse postale et un telephone.
 *
 * TOUTE OPERATION EXIGE `utilisateurId` EN PLUS DE L'IDENTIFIANT D'ADRESSE,
 * invariant 2 et regle A1. Le parcours 8 l'ecrit sans ambiguite : « les etapes
 * 3, 4 et 5 recoivent un identifiant d'adresse et n'en tirent aucune
 * autorisation ». Le couple entre dans le `where` du repository, jamais dans
 * une comparaison faite apres coup.
 *
 * LE CARNET EST UN CONFORT, JAMAIS UN PREALABLE. Aucune etape du parcours 1
 * n'en depend : l'achat sans compte reste le mode par defaut, et ce module ne
 * doit jamais devenir une dependance du tunnel.
 *
 * IL NE TOUCHE AUCUNE COMMANDE. Modifier ou supprimer une adresse du carnet ne
 * change aucune commande passee, invariant 3 et regle A3 : la commande porte une
 * COPIE figee, jamais une reference. Aucune fonction de ce fichier n'ecrit sur
 * `Commande`, et c'est verifiable a la lecture de ses imports.
 */
import { Prisma } from "@/generated/prisma/client";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { schemaAdresseCarnet, valider } from "@/lib/validation";
import {
  creerAdresse,
  lireAdresse,
  listerAdresses,
  mettreAJourAdresse,
  poserDefautSurAdresse,
  retirerDefautDuCarnet,
  supprimerAdresse,
  type AdresseDuCarnet,
  type ChampsAdresse,
} from "@/repositories/adresse-carnet";

export type { AdresseDuCarnet };

/**
 * Ce que les ecritures du carnet rendent a l'appelant.
 *
 * `INTROUVABLE` NE DISTINGUE PAS « n'existe pas » DE « pas la votre », meme
 * motif que l'acces aux documents : distinguer les deux dirait a qui essaie un
 * identifiant au hasard qu'il a trouve une adresse existante.
 */
export type ResultatCarnet =
  | { etat: "FAIT" }
  | { etat: "INTROUVABLE" }
  | { etat: "SAISIE_INVALIDE"; champ: string };

/** Le carnet du compte, etape 1. Lecture seule. */
export async function listerMesAdresses(
  utilisateurId: string,
): Promise<AdresseDuCarnet[]> {
  return listerAdresses(prisma, utilisateurId);
}

/** Une adresse du compte, ou `null`. Sert a pre-remplir le formulaire d'edition. */
export async function lireMonAdresse(
  adresseId: string,
  utilisateurId: string,
): Promise<AdresseDuCarnet | null> {
  return lireAdresse(prisma, adresseId, utilisateurId);
}

/**
 * Traduit une saisie validee en champs de base.
 *
 * LES OPTIONNELS DEVIENNENT `null` ET NON `undefined`. La colonne est nullable,
 * et `undefined` signifierait « ne pas toucher » dans un `update` : sur une
 * modification, un `libelle` efface par le client resterait alors en base. Les
 * deux valeurs ne disent pas la meme chose et les confondre est silencieux.
 */
function versChamps(saisie: {
  libelle?: string | undefined;
  nomComplet: string;
  ligne1: string;
  ligne2?: string | undefined;
  codePostal: string;
  ville: string;
  pays: string;
  telephone?: string | undefined;
}): ChampsAdresse {
  return {
    libelle: saisie.libelle ?? null,
    nomComplet: saisie.nomComplet,
    ligne1: saisie.ligne1,
    ligne2: saisie.ligne2 ?? null,
    codePostal: saisie.codePostal,
    ville: saisie.ville,
    pays: saisie.pays,
    telephone: saisie.telephone ?? null,
  };
}

/**
 * Ajoute une adresse au carnet, etape 2.
 *
 * `utilisateurId` VIENT DE LA SESSION, jamais de la saisie : le schema
 * `z.strictObject` fait echouer bruyamment une tentative de le poser.
 */
export async function ajouterAdresse(
  utilisateurId: string,
  entree: unknown,
): Promise<ResultatCarnet> {
  const saisie = valider(schemaAdresseCarnet, entree);

  await creerAdresse(prisma, utilisateurId, versChamps(saisie));

  return { etat: "FAIT" };
}

/**
 * Modifie une adresse, etape 4.
 *
 * AUCUNE COMMANDE N'EST TOUCHEE, regle A3 et invariant 3. Le parcours 8 decrit
 * le cas jumeau : un client qui corrige une adresse pendant qu'une commande est
 * en cours voit la commande retenir ce qu'il a valide, jamais la correction.
 */
export async function modifierAdresse(
  adresseId: string,
  utilisateurId: string,
  entree: unknown,
): Promise<ResultatCarnet> {
  const saisie = valider(schemaAdresseCarnet, entree);

  const touchees = await mettreAJourAdresse(
    prisma,
    adresseId,
    utilisateurId,
    versChamps(saisie),
  );

  return touchees === 0 ? { etat: "INTROUVABLE" } : { etat: "FAIT" };
}

/**
 * Retire une adresse du carnet, etape 5.
 *
 * AUCUNE PROMOTION AUTOMATIQUE si c'etait celle par defaut, regle A7 : « un
 * carnet sans adresse par defaut est un etat legitime ». Promouvoir la suivante
 * choisirait a la place du client, sans qu'il l'ait demande.
 */
export async function retirerAdresse(
  adresseId: string,
  utilisateurId: string,
): Promise<ResultatCarnet> {
  const supprimees = await supprimerAdresse(prisma, adresseId, utilisateurId);

  return supprimees === 0 ? { etat: "INTROUVABLE" } : { etat: "FAIT" };
}

/**
 * Choisit l'adresse par defaut, etape 3. UNE TRANSACTION, ordre impose.
 *
 * POINT 9 DES TRANSACTIONS CRITIQUES DE `database.md`, et l'ordre n'est pas un
 * detail de style : **retirer le drapeau de l'ancienne AVANT de le poser sur la
 * nouvelle**.
 *
 * POURQUOI L'ORDRE INVERSE ECHOUE. `adresse_defaut_unique` est un INDEX PARTIEL,
 * pas une contrainte, donc il n'est PAS differable : PostgreSQL le verifie
 * LIGNE A LIGNE et non au `COMMIT`. Poser le nouveau drapeau alors que l'ancien
 * tient encore leve une violation d'unicite qui avorte la transaction, et le
 * client ne peut plus changer son adresse par defaut.
 *
 * REGROUPER LES DEUX EN UNE INSTRUCTION NE SAUVE PAS, et c'est le piege le plus
 * couteux. Verifie sur PostgreSQL 18.4 : un
 * `UPDATE ... SET est_par_defaut = (id = :cible)` reussit ou echoue selon
 * l'ordre PHYSIQUE de parcours des lignes. Il passe quand l'ancienne est ecrite
 * avant la nouvelle, il leve dans le cas contraire. Une instruction qui marche
 * en developpement et casse en production selon cet ordre est plus dangereuse
 * qu'une instruction qui echoue toujours.
 *
 * LE MEME PIEGE VIT SUR LES RANGS DE MEDIAS, C9, et sur les rangs de
 * categories, C24, cette derniere etant une CONTRAINTE donc differable. La
 * difference tient au fait qu'un index partiel se cree par `CREATE UNIQUE
 * INDEX` et qu'un index ne se differe pas, seule une contrainte le peut.
 *
 * LE REFUS ANNULE TOUT. Si l'adresse n'appartient pas au compte, la transaction
 * leve : sans cela, le carnet resterait sans adresse par defaut apres en avoir
 * eu une, et le client aurait perdu son reglage en tentant de voler celui d'un
 * autre.
 */
class AdresseIntrouvableError extends Error {
  constructor() {
    super("Adresse introuvable");
    this.name = "AdresseIntrouvableError";
  }
}

export async function choisirAdresseParDefaut(
  adresseId: string,
  utilisateurId: string,
): Promise<ResultatCarnet> {
  try {
    await prisma.$transaction(async (transaction) => {
      // PREMIER : le drapeau part de l'ancienne. Voir l'entete.
      await retirerDefautDuCarnet(transaction, utilisateurId);

      // SECOND : il se pose sur la nouvelle, si elle est bien a ce compte.
      const posees = await poserDefautSurAdresse(
        transaction,
        adresseId,
        utilisateurId,
      );

      if (posees === 0) {
        /*
         * UNE EXCEPTION ET NON UN `return`, regle de `database.md` :
         * `$transaction` valide des que la fonction rend une valeur. Un `return`
         * laisserait committer le retrait du drapeau, donc un carnet sans
         * adresse par defaut apres une tentative refusee.
         */
        throw new AdresseIntrouvableError();
      }
    });

    return { etat: "FAIT" };
  } catch (erreur) {
    if (erreur instanceof AdresseIntrouvableError) {
      return { etat: "INTROUVABLE" };
    }

    /*
     * `P2002` EST LA VIOLATION D'UNICITE, donc l'index partiel qui a parle. Il
     * ne devrait jamais survenir, l'ordre ci-dessus le fermant, et c'est
     * precisement pour cela qu'il est journalise plutot qu'avale : sa presence
     * signalerait que l'ordre a ete inverse par une modification future.
     */
    if (
      erreur instanceof Prisma.PrismaClientKnownRequestError &&
      erreur.code === "P2002"
    ) {
      journaliser("error", "Bascule d'adresse par defaut en violation", {
        code: erreur.code,
      });
    }

    throw erreur;
  }
}
