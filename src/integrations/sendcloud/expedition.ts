/**
 * Creation d'un colis et de son etiquette chez Sendcloud, LS-218.
 *
 * CE MODULE DEPENSE DE L'ARGENT REEL, et c'est ce qui le distingue de tous les
 * autres appels du projet. Sendcloud n'a PAS de mode test : chaque appel abouti
 * cree un envoi FACTURE, 4,10 € en point relais et 7,49 € au domicile, ADR-035.
 * Une annulation ne rembourse pas.
 *
 * TROIS CONSEQUENCES SUR SA FORME :
 *
 *   - le client est INJECTABLE, comme `ClientSuivi` de LS-131, et aucun test du
 *     depot n'appelle l'implementation reelle. Le chemin nominal n'est donc
 *     couvert par aucun test automatique, ce qui est assume : le couvrir
 *     couterait une etiquette par execution de la CI
 *   - la creation part d'un GESTE de l'exploitante, jamais d'un evenement.
 *     Aucun webhook, aucune tache planifiee n'appelle ce module
 *   - l'idempotence est ancree sur l'effet, invariant 5, et elle vit en BASE :
 *     `Expedition.commande_id` est unique, donc deux appels concurrents ne
 *     peuvent pas produire deux lignes. La garde applicative seule laisserait
 *     une fenetre pendant l'appel reseau, qui dure des secondes
 *
 * IL NE DECIDE RIEN D'AUTRE : `methodes.ts` dit quelle methode correspond au
 * mode, le service dit quand creer et quoi en faire. Un module qui ferait les
 * trois melangerait la forme de l'API a une regle metier.
 *
 * DOMAINE : `panel.sendcloud.sc`, comme le suivi, et NON
 * `servicepoints.sendcloud.sc` qui porte les points de retrait. Se tromper
 * d'hote rend un 404 qu'on lit a tort comme une cle invalide, mesure le
 * 10 septembre 2026.
 */
import type { ModeLivraison } from "@/generated/prisma/enums";

import { TransporteurIndisponibleError } from "./index";
import { methodePour } from "./methodes";

const BASE_EXPEDITION = "https://panel.sendcloud.sc/api/v2";

/**
 * Delai au-dela duquel le transporteur est tenu pour indisponible.
 *
 * PLUS LONG QUE LE SUIVI, quinze secondes contre huit. Une creation ecrit chez
 * le fournisseur la ou une lecture ne fait que lire : abandonner trop tot
 * laisserait un colis cree chez Sendcloud que le projet croit absent, donc une
 * etiquette payee et perdue. Mieux vaut attendre que douter.
 */
const DELAI_MAXIMUM_MS = 15000;

/** L'adresse du destinataire, telle que la commande la porte figee. */
export type AdresseExpedition = {
  nom: string;
  ligne1: string;
  ligne2?: string | null;
  codePostal: string;
  ville: string;
  pays: string;
  email: string;
  telephone?: string | null;
};

/** Ce que le projet demande, sans rien connaitre de la forme de l'API. */
export type DemandeExpedition = {
  /** Le numero de commande, porte comme reference lisible chez le fournisseur. */
  reference: string;
  /** Le mode que le client a choisi et paye, jamais deduit d'autre chose. */
  mode: ModeLivraison;
  adresse: AdresseExpedition;
  /** L'identifiant du point de retrait choisi, exige par les deux modes de retrait. */
  pointRetraitId?: string | null;
  /**
   * Le poids du colis, en GRAMMES entiers, LS-218 critere 11.
   *
   * IL ARRIVE PAR LA DEMANDE ET N'EST PAS LU ICI, et c'est la frontiere de ce
   * module : un fournisseur qui irait chercher un reglage en base melangerait
   * l'acces aux donnees a la forme d'une API tierce. Le service le lit sur
   * `ParametreBoutique` et le remet, comme il remet deja le mode.
   *
   * SA BORNE HAUTE VIT EN AMONT, dans `schemaPoidsColis` et dans
   * `chk_parametre_poids_colis_borne` : la revalider ici donnerait un troisieme
   * endroit ou la meme regle se dit, donc un troisieme a corriger le jour ou la
   * tranche change.
   */
  poidsGrammes: number;
};

/** Ce que la creation rend au projet, une fois traduite. */
export type ExpeditionCreee = {
  /** L'identifiant du colis chez Sendcloud, pour retrouver son etiquette. */
  identifiantColis: number;
  /** Le numero de suivi, qui alimente `Expedition.numeroSuivi`. */
  numeroSuivi: string;
};

export interface ClientExpedition {
  /**
   * Cree le colis et demande son etiquette.
   *
   * ELLE LEVE `TransporteurIndisponibleError` SUR TOUTE PANNE, jamais une
   * erreur brute : le service la traduit en refus metier lisible, et la saisie
   * manuelle reste possible, meme regle de degradation qu'ADR-025.
   */
  creer(demande: DemandeExpedition): Promise<ExpeditionCreee>;

  /**
   * Rend l'etiquette d'un colis deja cree, au format PDF.
   *
   * SEPAREE DE LA CREATION, ET C'EST DELIBERE. Une etiquette se reimprime :
   * papier bourre, imprimante eteinte, colis prepare le lendemain. Fusionner
   * les deux obligerait a recreer un colis pour ravoir son etiquette, donc a
   * payer deux fois.
   */
  lireEtiquette(identifiantColis: number): Promise<ArrayBuffer>;
}

export type IdentifiantsExpedition = {
  clePublique: string;
  cleSecrete: string;
  fetch?: typeof globalThis.fetch;
  delaiMaximumMs?: number;
};

/**
 * Ce que Sendcloud rend a la creation, avant traduction.
 *
 * FORME MINIMALE ET NON EXHAUSTIVE : le projet ne lit que ce dont il a besoin.
 * Decrire toute la reponse ferait dependre le `type-check` de champs que le
 * fournisseur peut ajouter ou retirer sans prevenir.
 */
type ReponseCreation = {
  parcel?: {
    id?: number;
    tracking_number?: string;
    label?: { label_printer?: string; normal_printer?: string[] };
  };
};

/** Enveloppe une promesse d'un delai maximum, sans laisser l'appel courir. */
async function avecDelaiMaximum<T>(
  promesse: Promise<T>,
  delaiMs: number,
): Promise<T> {
  let minuterie: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promesse,
      new Promise<never>((_, rejeter) => {
        minuterie = setTimeout(
          () => rejeter(new Error("délai dépassé")),
          delaiMs,
        );
      }),
    ]);
  } finally {
    if (minuterie !== undefined) {
      clearTimeout(minuterie);
    }
  }
}

export function creerClientExpeditionSendcloud({
  clePublique,
  cleSecrete,
  fetch: fetchInjecte,
  delaiMaximumMs = DELAI_MAXIMUM_MS,
}: IdentifiantsExpedition): ClientExpedition {
  const appeler = fetchInjecte ?? globalThis.fetch;

  /*
   * L'EN-TETE NE SORT JAMAIS DE CETTE PORTEE, invariant 9 : ni message d'erreur
   * ni journal ne le reprend, le depot etant public.
   */
  const autorisation = `Basic ${Buffer.from(`${clePublique}:${cleSecrete}`).toString("base64")}`;

  return {
    async creer(demande) {
      /*
       * LE CORPS SUIT LA FORME DE L'API v2, relevee le 10 septembre 2026. Les
       * noms de champs ne sont PAS supposes : `request_label` a `true` demande
       * l'etiquette dans le meme appel, ce qui evite un second aller-retour
       * pendant lequel le colis existerait sans etiquette.
       *
       * `weight` EST EN KILOGRAMMES ET EN CHAINE, forme attendue par Sendcloud.
       * Le projet raisonne en grammes entiers, invariant 1 dans l'esprit : la
       * conversion vit ICI, au bord, et nulle part ailleurs.
       */
      const corps = {
        parcel: {
          name: demande.adresse.nom,
          address: demande.adresse.ligne1,
          address_2: demande.adresse.ligne2 ?? "",
          city: demande.adresse.ville,
          postal_code: demande.adresse.codePostal,
          country: demande.adresse.pays,
          email: demande.adresse.email,
          telephone: demande.adresse.telephone ?? "",
          order_number: demande.reference,
          weight: (demande.poidsGrammes / 1000).toFixed(3),
          request_label: true,
          shipment: { id: methodePour(demande.mode) },
          /*
           * LE POINT DE RETRAIT N'EST POSE QUE S'IL EXISTE. Envoyer
           * `to_service_point: null` au domicile fait echouer la creation chez
           * certains transporteurs, et le champ absent est la forme sure.
           */
          ...(demande.pointRetraitId
            ? { to_service_point: Number(demande.pointRetraitId) }
            : {}),
        },
      };

      let reponse: Response;

      try {
        reponse = await avecDelaiMaximum(
          appeler(`${BASE_EXPEDITION}/parcels`, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: autorisation,
            },
            body: JSON.stringify(corps),
          }),
          delaiMaximumMs,
        );
      } catch {
        /*
         * LA CAUSE RESEAU EST ENVELOPPEE SANS SON MESSAGE, qui porte l'URL et
         * peut porter le corps, donc l'adresse du client.
         *
         * ATTENTION, CE CAS EST AMBIGU : le colis a PEUT-ETRE ete cree chez
         * Sendcloud avant que la reponse se perde. Le service doit donc traiter
         * cette erreur comme « etat inconnu » et non comme « rien ne s'est
         * passe », et l'exploitante verifie sur Sendcloud avant de reessayer.
         */
        throw new TransporteurIndisponibleError(
          "création d'expédition en échec",
        );
      }

      if (!reponse.ok) {
        /*
         * LE CORPS D'ERREUR N'EST PAS REPRIS, invariant 9 : Sendcloud y renvoie
         * les champs refuses, donc l'adresse. Seul le code sort.
         */
        throw new TransporteurIndisponibleError(
          `réponse ${reponse.status} du transporteur`,
        );
      }

      let contenu: ReponseCreation;

      try {
        contenu = (await reponse.json()) as ReponseCreation;
      } catch {
        throw new TransporteurIndisponibleError(
          "réponse de création illisible",
        );
      }

      const identifiantColis = contenu.parcel?.id;
      const numeroSuivi = contenu.parcel?.tracking_number;

      /*
       * LES DEUX CHAMPS SONT EXIGES, ET UNE ABSENCE EST UNE PANNE. Un colis
       * cree sans numero de suivi est payé mais introuvable : la tache horaire
       * ne pourra jamais le lire, donc `livreA` restera nul et le delai de
       * retractation ne demarrera pas. Mieux vaut lever et faire verifier
       * l'exploitante que d'enregistrer une expedition muette.
       */
      if (typeof identifiantColis !== "number") {
        throw new TransporteurIndisponibleError(
          "réponse de création sans identifiant de colis",
        );
      }

      if (typeof numeroSuivi !== "string" || numeroSuivi === "") {
        throw new TransporteurIndisponibleError(
          "réponse de création sans numéro de suivi",
        );
      }

      return { identifiantColis, numeroSuivi };
    },

    async lireEtiquette(identifiantColis) {
      let reponse: Response;

      try {
        reponse = await avecDelaiMaximum(
          appeler(
            `${BASE_EXPEDITION}/labels/normal_printer/${identifiantColis}`,
            {
              headers: {
                Accept: "application/pdf",
                Authorization: autorisation,
              },
            },
          ),
          delaiMaximumMs,
        );
      } catch {
        throw new TransporteurIndisponibleError("lecture d'étiquette en échec");
      }

      if (!reponse.ok) {
        throw new TransporteurIndisponibleError(
          `réponse ${reponse.status} du transporteur`,
        );
      }

      return reponse.arrayBuffer();
    },
  };
}
