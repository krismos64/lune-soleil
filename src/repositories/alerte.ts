/**
 * Lecture et acquittement des alertes critiques, LS-98.
 *
 * ------------------------------------------------------------------
 * CE FICHIER EXISTE PARCE QUE PERSONNE NE LISAIT CES ALERTES.
 *
 * SEPT services en LEVENT, `confirmation.ts`, `document-comptable.ts`,
 * `webhook-paiement.ts`, `traitement-retractation.ts`, `avoir.ts`,
 * `envoi-email.ts` et `suivi-livraison.ts`. AUCUN code ne les lisait avant le
 * 11 septembre 2026 : `DOUBLE_ENCAISSEMENT` et `MONTANT_DIVERGENT` se
 * signalaient dans une table que rien ne consultait.
 *
 * UNE ALERTE QUE PERSONNE NE VOIT EST UN INCIDENT NON TRAITE, et le mecanisme
 * complet existait, enum de gravite et index d'unicite compris.
 * ------------------------------------------------------------------
 *
 * AUCUNE DECISION METIER ICI, README du dossier : ce fichier sait lire et
 * acquitter, il ne dit pas ce qu'une alerte ouverte signifie.
 *
 * LA LEVEE VIT DANS `confirmation.ts` ET NON ICI, et ce n'est pas un oubli :
 * elle participe a la transaction de confirmation de paiement, et la deplacer
 * casserait cette atomicite pour un gain de rangement.
 */
import { Prisma } from "@/generated/prisma/client";
import type { GraviteAlerte } from "@/generated/prisma/enums";

/** Client utilisable : le client principal ou celui d'une transaction. */
export type ClientBase = Prisma.TransactionClient;

/** Une alerte telle que l'ecran la presente. */
export type AlerteLue = {
  id: string;
  type: string;
  message: string;
  gravite: GraviteAlerte;
  typeCible: string | null;
  idCible: string | null;
  creeA: Date;
  acquitteeA: Date | null;
  /** Le nom de qui a acquitte, `null` si l'alerte est ouverte. */
  acquitteePar: string | null;
};

/** Projection commune aux deux listes. */
const SELECTION = {
  id: true,
  type: true,
  message: true,
  gravite: true,
  typeCible: true,
  idCible: true,
  creeA: true,
  acquitteeA: true,
  acquitteePar: { select: { nom: true } },
} as const;

function projeter(ligne: {
  id: string;
  type: string;
  message: string;
  gravite: GraviteAlerte;
  typeCible: string | null;
  idCible: string | null;
  creeA: Date;
  acquitteeA: Date | null;
  acquitteePar: { nom: string | null } | null;
}): AlerteLue {
  return {
    id: ligne.id,
    type: ligne.type,
    message: ligne.message,
    gravite: ligne.gravite,
    typeCible: ligne.typeCible,
    idCible: ligne.idCible,
    creeA: ligne.creeA,
    acquitteeA: ligne.acquitteeA,
    acquitteePar: ligne.acquitteePar?.nom ?? null,
  };
}

/**
 * Les alertes OUVERTES, les critiques d'abord puis les plus recentes.
 *
 * L'ORDRE PORTE UNE DECISION D'USAGE : une `CRITIQUE` de la semaine derniere
 * passe avant un `AVERTISSEMENT` d'il y a une heure. Trier par date seule
 * enterrerait un double encaissement sous des avertissements de livraison.
 *
 * `gravite` SE TRIE EN DESCENDANT parce que l'enum liste `AVERTISSEMENT` avant
 * `CRITIQUE` : PostgreSQL ordonne un enum par sa DECLARATION, et un tri
 * ascendant mettrait donc les avertissements en tete.
 */
export async function listerAlertesOuvertes(
  client: ClientBase,
): Promise<AlerteLue[]> {
  const lignes = await client.alerteCritique.findMany({
    where: { acquitteeA: null },
    select: SELECTION,
    orderBy: [{ gravite: "desc" }, { creeA: "desc" }],
  });

  return lignes.map(projeter);
}

/**
 * Les alertes ACQUITTEES, les plus recemment traitees d'abord.
 *
 * ELLES SONT BORNEES, contrairement aux ouvertes : une alerte ouverte doit
 * TOUTES s'afficher, en rater une serait manquer un incident, alors que
 * l'historique n'est consulte que pour se souvenir. Sans borne, l'ecran
 * grossirait sans fin.
 */
export async function listerAlertesAcquittees(
  client: ClientBase,
  limite: number,
): Promise<AlerteLue[]> {
  const lignes = await client.alerteCritique.findMany({
    where: { acquitteeA: { not: null } },
    select: SELECTION,
    orderBy: { acquitteeA: "desc" },
    take: limite,
  });

  return lignes.map(projeter);
}

/** Combien d'alertes attendent un geste, pour la pastille de la barre. */
export async function compterAlertesOuvertes(
  client: ClientBase,
): Promise<number> {
  return client.alerteCritique.count({ where: { acquitteeA: null } });
}

/**
 * Acquitte une alerte, si elle est encore ouverte.
 *
 * ------------------------------------------------------------------
 * LA CONDITION `acquitteeA: null` EST DANS LE `WHERE`, ET C'EST LE POINT.
 *
 * Sans elle, un second acquittement ECRASERAIT la date et le nom du premier :
 * l'historique dirait que la derniere personne a traite l'incident, alors
 * qu'elle n'a fait que recliquer. Regle E7, une alerte s'acquitte, elle ne se
 * supprime jamais.
 *
 * `updateMany` ET NON `update` : celui-ci leve `P2025` quand rien ne
 * correspond, ce qui ferait d'un double clic une page d'erreur. Le compte rendu
 * dit combien de lignes ont bouge, et zero est une reponse legitime.
 * ------------------------------------------------------------------
 */
export async function acquitterAlerte(
  client: ClientBase,
  parametres: { alerteId: string; acquitteeParId: string },
): Promise<{ acquittee: boolean }> {
  const { count } = await client.alerteCritique.updateMany({
    where: { id: parametres.alerteId, acquitteeA: null },
    data: {
      acquitteeA: new Date(),
      acquitteeParId: parametres.acquitteeParId,
    },
  });

  return { acquittee: count === 1 };
}
