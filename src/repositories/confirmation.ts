/**
 * Ecritures de la confirmation de paiement, LS-119, etape 7 du parcours 1.
 *
 * Ce fichier porte les instructions dont la correction depend du SQL exact,
 * comme l'autorise explicitement le garde de `repositories/`. Il n'ouvre aucune
 * transaction et ne decide rien : le service appelant lui passe le client
 * transactionnel, et c'est lui qui juge si un effet doit avoir lieu.
 */
import type { OrigineEcriture } from "@/generated/prisma/enums";
import type { ClientBase } from "@/repositories/stock";

/**
 * Consomme les reservations d'une commande et sort le stock physique, en UNE
 * instruction par variante.
 *
 * LES DEUX QUANTITES BOUGENT ENSEMBLE, ET C'EST LE COEUR DU CALCUL. Une
 * reservation active a deja incremente `quantite_reservee` : la vente doit donc
 * decrementer `quantite_physique` (la piece part) ET `quantite_reservee` (la
 * reservation se consomme). Ne decrementer que le physique laisserait la piece
 * reservee pour toujours, invisible a la vente sans jamais expirer.
 *
 * LE PLANCHER A ZERO N'EST PAS UNE PRUDENCE, c'est `chk_variante_physique_positif`
 * et `chk_variante_reservee_positif`, contraintes C5 en base. Le cas ou il joue :
 * la tache de liberation a deja rendu la reservation et la piece a ete revendue
 * ailleurs, donc le stock est a zero quand le paiement arrive. Descendre sous
 * zero ferait LEVER la transaction, donc perdre l'evenement et le faire rejouer
 * indefiniment sur un etat qui ne se resoudra jamais seul. Le service alerte
 * plutot, arbitrage du 27 aout 2026.
 *
 * `GREATEST` PORTE LE PLANCHER PLUTOT QU'UN `WHERE` : une condition qui refuse
 * la ligne ne dirait pas au service COMBIEN manque, alors que le compte rendu
 * ici permet de nommer l'ecart dans l'alerte.
 */
export async function consommerReservationEtSortirStock(
  client: ClientBase,
  parametres: { commandeId: string; varianteId: string; quantite: number },
): Promise<{ sortiePhysique: number; restantPhysique: number }> {
  /*
   * LE RESTANT EST RENDU EN PLUS DE LA SORTIE, LS-219, et les deux ne se
   * deduisent pas l'un de l'autre : la sortie dit combien de pieces sont
   * parties, le restant combien il en reste. C'est le second qui declenche
   * l'alerte de stock faible, la variante venant de tomber a zero.
   *
   * IL EST LU DANS LA MEME INSTRUCTION, jamais par une seconde requete : le
   * verrou `FOR UPDATE` est deja pris ici, et relire apres coup donnerait une
   * valeur qu'une autre vente a pu changer entre-temps.
   */
  const lignes = await client.$queryRaw<{ sortie: number; restant: number }[]>`
    WITH avant AS (
      SELECT quantite_physique, quantite_reservee
      FROM variante
      WHERE id = ${parametres.varianteId}
      FOR UPDATE
    ),
    reservee AS (
      SELECT COALESCE(SUM(quantite), 0)::int AS quantite
      FROM reservation
      WHERE commande_id = ${parametres.commandeId}
        AND variante_id = ${parametres.varianteId}
    ),
    maj AS (
      UPDATE variante
      SET
        quantite_physique = GREATEST(
          0,
          quantite_physique - ${parametres.quantite}::int
        ),
        -- SEULE LA RESERVATION DE CETTE COMMANDE SE CONSOMME, jamais la
        -- quantite vendue : si la tache de liberation est deja passee, il n'y a
        -- rien a rendre ici, et decrementer quand meme volerait la reservation
        -- d'une AUTRE commande en cours sur la meme variante.
        quantite_reservee = GREATEST(
          0,
          quantite_reservee - (SELECT quantite FROM reservee)
        )
      WHERE id = ${parametres.varianteId}
      RETURNING quantite_physique
    )
    SELECT
      (
        (SELECT quantite_physique FROM avant) - (SELECT quantite_physique FROM maj)
      )::int AS sortie,
      (SELECT quantite_physique FROM maj)::int AS restant
  `;

  /*
   * LE REPLI DU RESTANT EST `-1` ET NON ZERO, ce qui parait contre-intuitif.
   * Zero signifierait « la variante est en rupture » et ferait partir une
   * alerte sur une requete qui n'a rien rendu, c'est-a-dire sur une variante
   * introuvable. Une valeur negative ne franchit aucun seuil et reste
   * silencieuse, ce qui est le bon defaut pour une mesure absente.
   */
  return {
    sortiePhysique: lignes[0]?.sortie ?? 0,
    restantPhysique: lignes[0]?.restant ?? -1,
  };
}

/**
 * Supprime les reservations d'une commande, une fois consommees.
 *
 * ELLES NE DOIVENT PLUS POUVOIR ETRE LIBEREES par la tache de LS-120 : la
 * liberation rendrait `quantite_reservee` une seconde fois, et la piece
 * repartirait au catalogue alors qu'elle est vendue et payee.
 */
export async function supprimerReservations(
  client: ClientBase,
  commandeId: string,
): Promise<void> {
  await client.reservation.deleteMany({ where: { commandeId } });
}

/**
 * Ecrit le mouvement de vente web, effet dont l'unicite est contrainte.
 *
 * LA QUANTITE EST NEGATIVE : le stock SORT, regle S9, le signe depend du type.
 * Un mouvement positif ferait remonter le stock dans toute somme du journal, et
 * les statistiques de LS-64 compteraient une entree la ou une piece est partie.
 *
 * C'EST L'ECRITURE QUE `mouvement_vente_web_unique` REFUSE au second passage,
 * et ce refus est la garantie de la story : le webhook et la reconciliation
 * convergent vers le meme rejet en base, quel que soit celui qui arrive en
 * second. Le service traduit la violation en « rien a faire », jamais en erreur.
 *
 * `acteurId` RESTE NUL, S9 : un webhook n'est pas une personne. L'origine
 * distingue le chemin, `SYSTEME` pour le webhook, `RECONCILIATION` pour la
 * tache, et c'est cette distinction que la cle d'unicite de l'email exploite.
 */
export async function ecrireMouvementVenteWeb(
  client: ClientBase,
  parametres: {
    commandeId: string;
    varianteId: string;
    quantite: number;
    origine: OrigineEcriture;
  },
): Promise<void> {
  await client.mouvementStock.create({
    data: {
      varianteId: parametres.varianteId,
      commandeId: parametres.commandeId,
      type: "VENTE_WEB",
      quantite: -parametres.quantite,
      origine: parametres.origine,
    },
  });
}

/**
 * Historise une transition de statut de commande, critere 8.
 *
 * LES DEUX STATUTS SONT ECRITS, l'ancien et le nouveau : « passee a CONFIRMEE »
 * sans dire d'ou ne permet pas de reconstituer un parcours, et une transition
 * illegitime devient indetectable apres coup.
 *
 * `acteurId` EST NUL PAR DEFAUT, ET C'EST LE CAS DES CHEMINS AUTOMATIQUES,
 * regle S9 : un webhook n'est pas une personne, et lui attribuer l'identifiant
 * de l'exploitante ferait porter a une administratrice une transition qu'elle
 * n'a pas decidee. Seule une transition DECIDEE par une personne le renseigne,
 * LS-121, et l'identite vient alors de la session, jamais d'un parametre
 * d'interface, invariant 2.
 */
export async function historiserTransition(
  client: ClientBase,
  parametres: {
    commandeId: string;
    statutPrecedent: string;
    statutNouveau: string;
    origine: OrigineEcriture;
    acteurId?: string | null;
  },
): Promise<void> {
  await client.historiqueStatut.create({
    data: {
      commandeId: parametres.commandeId,
      statutPrecedent: parametres.statutPrecedent,
      statutNouveau: parametres.statutNouveau,
      acteurId: parametres.acteurId ?? null,
      origine: parametres.origine,
    },
  });
}

/**
 * Leve une alerte critique acquittable, E7.
 *
 * ELLE N'EST JAMAIS SUPPRIMEE, seulement acquittee : une alerte effacee est une
 * incoherence dont plus rien ne porte la trace.
 *
 * ELLE EST L'UNIQUE VOIE D'ECRITURE d'une alerte, LS-131. Un `create` direct
 * contournerait la lecture de `alerte_ouverte_unique` : l'index leverait bien,
 * mais l'appelant remonterait une exception au lieu de l'ignorer, et un cycle
 * de tache s'arreterait sur un doublon qui n'est pas un incident.
 *
 * LA DEDUPLICATION EST PORTEE PAR LA BASE ET NON PAR CE CODE, question 5 des
 * quinze : une lecture prealable laisserait une fenetre entre le `SELECT` et le
 * `INSERT`, la ou l'index tranche. Elle n'existait PAS avant LS-131, alors
 * qu'un commentaire d'`envoi-email.ts` affirmait le contraire et qu'un
 * `try/catch` en avait la forme : la tache d'envoi tournant chaque minute, un
 * envoi bloque produisait 1440 alertes par jour.
 */
export async function leverAlerteCritique(
  client: ClientBase,
  parametres: {
    type: string;
    message: string;
    typeCible: string;
    idCible: string;
    /**
     * Defaut `CRITIQUE`, valeur des appelants d'avant LS-131.
     *
     * TOUTE ALERTE N'EST PAS CRITIQUE : une livraison en echec demande un
     * arbitrage commercial, pas une intervention immediate. Les confondre
     * userait l'attention que les vraies urgences exigent.
     */
    gravite?: "AVERTISSEMENT" | "CRITIQUE";
  },
): Promise<void> {
  await client.alerteCritique.create({
    data: {
      type: parametres.type,
      message: parametres.message,
      gravite: parametres.gravite ?? "CRITIQUE",
      typeCible: parametres.typeCible,
      idCible: parametres.idCible,
    },
  });
}
