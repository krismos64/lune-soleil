/**
 * Vue d'ensemble des pieces comptables emises, LS-184.
 *
 * CE SERVICE NE FAIT QUE LIRE, ET C'EST UNE PROPRIETE A TENIR. L'invariant 4
 * est absolu : une facture n'est jamais modifiee ni supprimee, une correction
 * produit un avoir. Aucune fonction d'ecriture n'entre ici, et l'ecran qui
 * l'appelle ne porte aucune Server Action.
 *
 * LE DEFAUT QU'IL FERME. Les factures sont emises depuis LS-126, numerotees par
 * ADR-031, rendues en PDF par LS-129 et servies au client par LS-57 et LS-132.
 * L'exploitante, elle, n'avait AUCUNE vue d'ensemble : le seul chemin passait
 * par le detail d'une commande, ce qui suppose de connaitre la commande.
 * Retrouver une facture depuis son numero etait impossible.
 *
 * POURQUOI C'EST PLUS QU'UN CONFORT. L'entreprise est en franchise en base de
 * TVA, article 293 B du CGI, ce qui allege les obligations declaratives sans
 * supprimer l'obligation de conservation et de presentation des pieces. Ce
 * service ne DECIDE d'aucune obligation juridique, il rend consultable ce que
 * le code emet deja.
 */
import { prisma } from "@/lib/prisma";
import { schemaIdentifiant, valider } from "@/lib/validation";
import {
  listerPiecesComptables,
  type PieceComptable,
} from "@/repositories/facture";

export type { PieceComptable };

/**
 * Le plafond de la liste, motif de LS-163.
 *
 * IL EST ANNONCE A L'ECRAN quand il est atteint, jamais silencieux : une liste
 * qui s'arrete sans le dire fait croire que la periode ne contient rien de plus,
 * et sur des pieces comptables cette croyance est couteuse.
 *
 * LE VOLUME EST NON BORNE ICI, a la difference du catalogue. LS-183 avait ecrit
 * un critere de plafond par analogie et il etait FAUX, `frontend-design.md`
 * interdisant d'introduire un plafond que le schema ne porte pas sur un
 * ensemble borne par le metier a quarante references. Les factures, elles,
 * s'accumulent sans limite : une par commande payee, pour toujours.
 */
export const PLAFOND_PIECES = 100;

export type PeriodeComptable = {
  depuis?: Date;
  jusqua?: Date;
};

export type VueComptable = {
  pieces: PieceComptable[];
  limiteAtteinte: boolean;
  /** Nombre de factures dans le lot rendu, jamais dans la base entiere. */
  nombreFactures: number;
  /** Nombre d'avoirs dans le lot rendu. */
  nombreAvoirs: number;
  /**
   * Somme signee des pieces du lot, en centimes entiers.
   *
   * LES AVOIRS SONT DEJA NEGATIFS a la lecture, donc une addition simple donne
   * l'encaisse nette. Invariant 1 : aucun flottant n'entre dans ce calcul, et
   * il se fait COTE SERVEUR, jamais dans le navigateur.
   */
  totalCentimes: number;
};

/**
 * Les pieces emises sur une periode, la plus recente d'abord.
 *
 * LE TOTAL EST CALCULE SUR LE LOT RENDU, ET L'ECRAN DOIT LE DIRE quand le
 * plafond est atteint. Sommer la base entiere pendant qu'on affiche cent lignes
 * donnerait deux chiffres qui ne se repondent pas : le total ne correspondrait a
 * aucune liste visible, et personne ne pourrait le verifier a la main. Motif
 * « numerateur et denominateur apparies ».
 */
export async function lireVueComptable(
  periode: PeriodeComptable = {},
  client: typeof prisma = prisma,
): Promise<VueComptable> {
  /*
   * LES BORNES SONT ETALEES PAR SPREAD CONDITIONNEL, jamais passees a
   * `undefined`. `exactOptionalPropertyTypes` est actif dans ce dépôt :
   * `{ depuis: undefined }` n'y est PAS la même chose qu'une clé absente, et le
   * compilateur refuse la première forme. C'est le même motif que le `where`
   * conditionnel de `listerCommandes`, et il a une vertu au-delà du type : une
   * clé absente ne peut pas atteindre la requête par inadvertance.
   */
  const { pieces, limiteAtteinte } = await listerPiecesComptables(client, {
    ...(periode.depuis ? { depuis: periode.depuis } : {}),
    ...(periode.jusqua ? { jusqua: periode.jusqua } : {}),
    limite: PLAFOND_PIECES,
  });

  return {
    pieces,
    limiteAtteinte,
    nombreFactures: pieces.filter((piece) => piece.type === "FACTURE").length,
    nombreAvoirs: pieces.filter((piece) => piece.type === "AVOIR").length,
    totalCentimes: pieces.reduce(
      (somme, piece) => somme + piece.montantCentimes,
      0,
    ),
  };
}

/**
 * Ce qu'il faut pour servir une piece a l'exploitante.
 *
 * `numero` SERT A NOMMER LE FICHIER TELECHARGE, et il vient du serveur : le
 * navigateur ne choisit jamais le nom d'un document comptable.
 */
export type PieceAServir = {
  numero: string;
  cheminPdf: string;
};

/**
 * Retrouve le PDF d'une piece, facture ou avoir, pour l'administration.
 *
 * L'AUTORISATION N'EST PAS ICI, ET C'EST DELIBERE : elle est portee par
 * l'appelant, qui exige le role AVANT d'appeler cette fonction. Ce service ne
 * sait pas qui demande, il ne fait que resoudre un identifiant en chemin.
 *
 * ELLE NE DISTINGUE PAS « PIECE INEXISTANTE » DE « PDF EN ECHEC », et rend
 * `null` dans les deux cas. La nuance existe pourtant et compte a l'ECRAN, ou
 * la liste affiche « PDF indisponible » sur une piece dont `cheminPdf` est nul,
 * LS-129 : c'est la liste qui porte cet etat, pas le telechargement. Une route
 * qui distinguerait les deux refus n'apprendrait rien d'utile a l'exploitante
 * et ferait deux chemins de sortie la ou un seul suffit.
 *
 * LES DEUX TABLES SONT INTERROGEES, la facture d'abord. Les numeros ne se
 * confondent pas, `F-2026-0001` contre `A-2026-0001`, mais l'identifiant est un
 * UUID qui ne dit pas sa table : chercher dans les deux est le seul moyen de
 * servir un avoir sans demander a l'appelant de connaitre la nature de la piece
 * qu'il a affichee.
 */
export async function lirePieceAServir(
  pieceId: string,
  client: typeof prisma = prisma,
): Promise<PieceAServir | null> {
  const identifiant = valider(schemaIdentifiant, pieceId);

  const facture = await client.facture.findUnique({
    where: { id: identifiant },
    select: { numero: true, cheminPdf: true },
  });

  if (facture?.cheminPdf) {
    return { numero: facture.numero, cheminPdf: facture.cheminPdf };
  }

  const avoir = await client.avoir.findUnique({
    where: { id: identifiant },
    select: { numero: true, cheminPdf: true },
  });

  if (avoir?.cheminPdf) {
    return { numero: avoir.numero, cheminPdf: avoir.cheminPdf };
  }

  return null;
}
