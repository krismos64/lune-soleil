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
 * IL NE DECIDE RIEN D'AUTRE : `methodes.ts` dit quelle option correspond au
 * mode, le service dit quand creer et quoi en faire. Un module qui ferait les
 * trois melangerait la forme de l'API a une regle metier.
 *
 * DOMAINE : `panel.sendcloud.sc`, comme le suivi, et NON
 * `servicepoints.sendcloud.sc` qui porte les points de retrait. Se tromper
 * d'hote rend un 404 qu'on lit a tort comme une cle invalide, mesure le
 * 10 septembre 2026.
 *
 * API v3 DEPUIS LS-296, le 29 octobre 2026. La v2 rendait 403 a la creation sur
 * ce compte, « Creating parcels via API v2 is not available for this account.
 * Please use API v3. » : la premiere commande reelle n'a pas pu partir. Le
 * suivi, `suivi.ts`, lit encore la v2, qui repond en lecture.
 */
import type { ModeLivraison } from "@/generated/prisma/enums";

import { TransporteurIndisponibleError } from "./index";
import {
  ADRESSE_EXPEDITEUR_ID,
  CONTRAT_MONDIAL_RELAY,
  optionPour,
} from "./methodes";

const BASE_EXPEDITION = "https://panel.sendcloud.sc/api/v3";

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
 *
 * LA v3 ENVELOPPE DANS `data` et rend un TABLEAU de colis, un envoi pouvant en
 * porter quinze. Le projet n'en cree qu'un, et en lit donc le premier.
 */
type ColisRendu = {
  id?: number;
  tracking_number?: string | null;
  status?: { code?: string };
};

type EnvoiRendu = {
  parcels?: ColisRendu[];
  errors?: { code?: unknown }[];
};

/**
 * LE 201 PORTE `data`, LE 409 PEUT RENDRE L'ENVOI A LA RACINE, la specification
 * decrivant le second sans l'enveloppe. Les deux formes sont lues.
 */
type ReponseCreation = EnvoiRendu & { data?: EnvoiRendu };

/**
 * Le seul statut d'un colis annonce et expediable.
 *
 * LISTE BLANCHE ET NON LISTE NOIRE, LS-296, revue critique : une annonce que
 * Mondial Relay refuse revient en 201 AVEC un numero de suivi, statut
 * `ANNOUNCEMENT_FAILED`, exemple de la specification v3. Ne lire que l'identifiant
 * et le numero l'aurait enregistree comme expediee, email au client compris,
 * pour un colis que le transporteur ne connait pas. Tout autre statut leve.
 */
const STATUT_COLIS_EXPEDIABLE = "READY_TO_SEND";

/**
 * Le resume d'un refus, sans aucune valeur venue de la demande.
 *
 * LE CODE HTTP, LES CODES D'ERREUR ET LES CHEMINS DE CHAMP SEULEMENT, invariant
 * 9 et minimisation : le `detail` et le `message` de Sendcloud reprennent
 * parfois la valeur refusee, donc l'adresse du client. Un chemin comme
 * `/to_address/postal_code` dit quel champ corriger sans dire ce qu'il valait.
 *
 * IL EXISTE PARCE QU'UN 403 EXPLICITE A COUTE TROIS HEURES, LS-296 : la cause
 * se reduisait a « réponse 403 », et le journal n'en gardait que le nom de
 * classe. Les deux formes d'erreur de Sendcloud sont lues, `errors[]` de la v3
 * et `error.code` de la v2.
 */
export async function resumerRefus(reponse: Response): Promise<string> {
  let corps: unknown;

  try {
    corps = await reponse.json();
  } catch {
    return `réponse ${reponse.status} du transporteur`;
  }

  const codes: string[] = [];
  const champs: string[] = [];
  const objet = (corps ?? {}) as {
    errors?: { code?: unknown; source?: { pointer?: unknown } }[];
    error?: { code?: unknown };
  };

  for (const erreur of Array.isArray(objet.errors) ? objet.errors : []) {
    if (typeof erreur?.code === "string" || typeof erreur?.code === "number") {
      codes.push(String(erreur.code));
    }
    if (typeof erreur?.source?.pointer === "string") {
      champs.push(erreur.source.pointer);
    }
  }
  if (
    typeof objet.error?.code === "string" ||
    typeof objet.error?.code === "number"
  ) {
    codes.push(String(objet.error.code));
  }

  return [
    `réponse ${reponse.status} du transporteur`,
    codes.length > 0 ? `codes ${codes.join(", ")}` : null,
    champs.length > 0 ? `champs ${champs.join(", ")}` : null,
  ]
    .filter((partie): partie is string => partie !== null)
    .join(", ");
}

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
       * LE CORPS SUIT LA FORME DE L'API v3, `POST /shipments/announce`, relevee
       * le 29 octobre 2026. L'annonce SYNCHRONE cree le colis ET son etiquette
       * dans le meme appel, ce qui evite un second aller-retour pendant lequel
       * le colis existerait sans etiquette.
       *
       * LE POIDS PART EN KILOGRAMMES ET EN CHAINE, `{ value, unit }`. Le projet
       * raisonne en grammes entiers, invariant 1 dans l'esprit : la conversion
       * vit ICI, au bord, et nulle part ailleurs.
       *
       * `order_number` PORTE LE NUMERO DE COMMANDE, lisible dans le panneau
       * Sendcloud : c'est par lui que l'exploitante retrouve un colis.
       */
      const corps = {
        from_address: { sender_address_id: ADRESSE_EXPEDITEUR_ID },
        to_address: {
          name: demande.adresse.nom,
          address_line_1: demande.adresse.ligne1,
          ...(demande.adresse.ligne2
            ? { address_line_2: demande.adresse.ligne2 }
            : {}),
          postal_code: demande.adresse.codePostal,
          city: demande.adresse.ville,
          country_code: demande.adresse.pays,
          email: demande.adresse.email,
          ...(demande.adresse.telephone
            ? { phone_number: demande.adresse.telephone }
            : {}),
        },
        ship_with: {
          type: "shipping_option_code",
          properties: {
            shipping_option_code: optionPour(demande.mode),
            contract_id: CONTRAT_MONDIAL_RELAY,
          },
        },
        order_number: demande.reference,
        /*
         * LA REFERENCE EXTERNE FERME LE DOUBLE ACHAT CHEZ LE FOURNISSEUR, LS-296.
         * Sendcloud la veut unique par compte, et une seconde annonce sous la
         * meme reference rend 409 avec l'envoi EXISTANT, sans rien creer ni
         * facturer. Un double clic, deux onglets ou une reponse perdue suivie
         * d'un nouvel essai retombent donc sur la premiere etiquette.
         *
         * LE NUMERO DE COMMANDE ET NON SON IDENTIFIANT : unique lui aussi, et
         * lisible dans le panneau Sendcloud a cote d'`order_number`.
         *
         * CONSEQUENCE ASSUMEE : un envoi reste en echec d'annonce bloque la
         * reference, le 409 le rend et le controle de statut ci-dessous le
         * refuse. Il faut l'annuler sur Sendcloud avant de reessayer, ce qui
         * est le sens sur.
         */
        external_reference_id: demande.reference,
        parcels: [
          {
            weight: {
              value: (demande.poidsGrammes / 1000).toFixed(3),
              unit: "kg",
            },
          },
        ],
        /*
         * LE POINT DE RETRAIT N'EST POSE QUE S'IL EXISTE. Au domicile, le champ
         * absent est la forme sure. `id` est l'identifiant SENDCLOUD du point,
         * celui que le tunnel recoit de l'API des points de retrait, et non
         * celui du transporteur.
         */
        ...(demande.pointRetraitId
          ? { to_service_point: { id: Number(demande.pointRetraitId) } }
          : {}),
      };

      let reponse: Response;

      try {
        reponse = await avecDelaiMaximum(
          appeler(`${BASE_EXPEDITION}/shipments/announce`, {
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

      /*
       * LE 409 N'EST PAS UNE PANNE : c'est l'envoi deja annonce sous cette
       * reference, rendu sans rien creer. Il passe par les memes controles
       * qu'une creation, statut compris.
       */
      if (!reponse.ok && reponse.status !== 409) {
        /*
         * LE CORPS D'ERREUR N'EST PAS REPRIS TEL QUEL, invariant 9 : Sendcloud y
         * renvoie les champs refuses, donc l'adresse. `resumerRefus` n'en garde
         * que les codes et les chemins de champ.
         */
        throw new TransporteurIndisponibleError(await resumerRefus(reponse));
      }

      let contenu: ReponseCreation;

      try {
        contenu = (await reponse.json()) as ReponseCreation;
      } catch {
        throw new TransporteurIndisponibleError(
          "réponse de création illisible",
        );
      }

      const envoi = contenu.data ?? contenu;
      const colis = envoi.parcels?.[0];
      const identifiantColis = colis?.id;
      const numeroSuivi = colis?.tracking_number;

      /*
       * UNE ANNONCE ECHOUEE EST UNE PANNE, MEME EN 201, voir
       * `STATUT_COLIS_EXPEDIABLE`. Les codes d'erreur de l'envoi appartiennent a
       * une liste fermee de la specification et ne portent aucune valeur : ils
       * vont dans la cause, comme ceux de `resumerRefus`.
       */
      const codesErreur = (Array.isArray(envoi.errors) ? envoi.errors : [])
        .map((erreur) => erreur?.code)
        .filter(
          (code): code is string | number =>
            typeof code === "string" || typeof code === "number",
        )
        .map(String);
      const statut = colis?.status?.code;

      if (codesErreur.length > 0 || statut !== STATUT_COLIS_EXPEDIABLE) {
        throw new TransporteurIndisponibleError(
          [
            `réponse ${reponse.status} du transporteur`,
            `statut ${typeof statut === "string" ? statut : "absent"}`,
            codesErreur.length > 0 ? `codes ${codesErreur.join(", ")}` : null,
          ]
            .filter((partie): partie is string => partie !== null)
            .join(", "),
        );
      }

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
          /*
           * A4 ET NON A6, le format par defaut d'une etiquette en v3 : la v2
           * servait `normal_printer`, une feuille A4, et l'atelier imprime sur
           * une imprimante de bureau. Le PDF n'existe qu'a 72 dpi.
           */
          appeler(
            `${BASE_EXPEDITION}/parcels/${identifiantColis}/documents/label?paper_size=A4`,
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
        throw new TransporteurIndisponibleError(await resumerRefus(reponse));
      }

      return reponse.arrayBuffer();
    },
  };
}
