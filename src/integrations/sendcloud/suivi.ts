/**
 * Lecture du statut de suivi d'un colis, LS-131. ADR-042.
 *
 * POURQUOI L'API v2 ET NON v3. Les identifiants numeriques du projet viennent
 * de `GET /api/v2/parcels/statuses`, releves le 10 septembre 2026. L'API v3 rend
 * un `parent_status` TEXTUEL : melanger les deux comparerait des libelles a des
 * identifiants, et un simple changement de formulation chez le fournisseur
 * casserait la regle qui ouvre le delai de retractation, en silence.
 *
 * IL NE DECIDE RIEN. Il lit un statut et le rend tel quel ; `statuts.ts` dit ce
 * qu'il vaut, et le service dit ce qu'il declenche. Un module qui ferait les
 * trois melangerait la forme de l'API a une regle de droit.
 *
 * DOMAINE DISTINCT DES POINTS DE RETRAIT : le suivi vit sur `panel.sendcloud.sc`
 * quand les points de retrait vivent sur `servicepoints.sendcloud.sc`.
 */
import { TransporteurIndisponibleError } from "./index";
import { estEvenementLivraison } from "./statuts";

const BASE_SUIVI = "https://panel.sendcloud.sc/api/v2";

/** Delai au-dela duquel le transporteur est tenu pour indisponible. */
const DELAI_MAXIMUM_MS = 8000;

/** Ce que le suivi rend au projet, une fois traduit. */
export type StatutSuivi = {
  /** Identifiant numerique, stable, sur lequel le code raisonne. */
  statut: number;
  /** Libelle lisible, stocke pour l'ecran d'administration. Decision 5. */
  libelle: string;
};

export interface ClientSuivi {
  /**
   * Lit le statut courant d'un colis.
   *
   * REND `null` QUAND LE TRANSPORTEUR NE CONNAIT PAS LE NUMERO, ce qui n'est
   * PAS une panne : constate sur l'API reelle, elle rend une liste vide avec un
   * statut 200. Le cas est normal au premier cycle, le transporteur pouvant
   * n'avoir pas encore enregistre le colis remis la veille.
   */
  lireStatut(numeroSuivi: string): Promise<StatutSuivi | null>;

  /**
   * Lit dans l'historique de suivi l'instant de la remise au client, LS-311.
   *
   * REND LE PREMIER EVENEMENT QUI LIVRE, jamais le dernier evenement tout court :
   * Mondial Relay ajoute un `picked-up-by-driver` parasite apres la remise, et
   * l'ordre de la liste n'est pas documente (l'exemple officiel va du plus
   * recent au plus ancien, la reponse reelle de l'inverse).
   *
   * REND `null` quand l'historique ne porte aucune remise, quand le transporteur
   * ne connait pas le numero, ou quand le colis est un retour : un colis revenu
   * a l'atelier n'a pas ete remis au client.
   */
  lireLivraison(numeroSuivi: string): Promise<Date | null>;
}

export type IdentifiantsSuivi = {
  clePublique: string;
  cleSecrete: string;
  fetch?: typeof globalThis.fetch;
  delaiMaximumMs?: number;
};

/** Ce que Sendcloud rend, avant traduction. Forme constatee le 10 septembre 2026. */
type ReponseColis = {
  parcels?: { status?: { id?: number; message?: string } }[];
};

/** L'historique de suivi, forme constatee le 4 novembre 2026 sur le colis reel. */
type ReponseHistorique = {
  is_return?: boolean;
  statuses?: { carrier_update_timestamp?: unknown; parent_status?: unknown }[];
};

/**
 * Tolerance sur un horodatage du transporteur posterieur a l'horloge du serveur.
 *
 * AU-DELA, LA DATE EST TENUE POUR FAUSSE et non pour exacte : une remise datee
 * de demain ouvrirait le delai de retractation apres le fait, et la date
 * d'experience d'un avis, D111-9, serait inventee.
 */
const AVANCE_MAXIMUM_MS = 10 * 60 * 1000;

/**
 * Lit un horodatage du transporteur, `2026-11-03 14:52:55.627604+00:00`.
 *
 * LE DECALAGE EST EXIGE, invariant 8 : un horodatage sans fuseau serait lu dans
 * celui du conteneur, et la date legale glisserait d'une ou deux heures sans
 * aucun signe. Les microsecondes sont tronquees au millieme, la precision de
 * `Timestamptz(3)`.
 */
export function lireHorodatageTransporteur(valeur: unknown): Date | null {
  if (typeof valeur !== "string") {
    return null;
  }

  const forme =
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      valeur,
    );

  if (forme === null) {
    return null;
  }

  const [, jour, heure, fraction = "", decalage] = forme;
  const millieme = fraction.padEnd(3, "0").slice(0, 3);
  const date = new Date(`${jour}T${heure}.${millieme}${decalage}`);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function creerClientSuiviSendcloud({
  clePublique,
  cleSecrete,
  fetch: fetchInjecte,
  delaiMaximumMs = DELAI_MAXIMUM_MS,
}: IdentifiantsSuivi): ClientSuivi {
  const appeler = fetchInjecte ?? globalThis.fetch;

  /*
   * L'EN-TETE NE SORT JAMAIS DE CETTE PORTEE, invariant 9 : ni message d'erreur
   * ni journal ne le reprend, le depot etant public.
   */
  const autorisation = `Basic ${Buffer.from(`${clePublique}:${cleSecrete}`).toString("base64")}`;

  return {
    async lireStatut(numeroSuivi) {
      const url = new URL(`${BASE_SUIVI}/parcels`);
      url.searchParams.set("tracking_number", numeroSuivi);

      let reponse: Response;

      try {
        reponse = await avecDelaiMaximum(
          appeler(url, {
            headers: {
              Accept: "application/json",
              Authorization: autorisation,
            },
          }),
          delaiMaximumMs,
        );
      } catch {
        /*
         * LA CAUSE RESEAU EST ENVELOPPEE SANS SON MESSAGE, qui porte l'URL
         * complete, donc le numero de suivi du client.
         */
        throw new TransporteurIndisponibleError("appel de suivi en échec");
      }

      if (!reponse.ok) {
        throw new TransporteurIndisponibleError(
          `réponse ${reponse.status} du transporteur`,
        );
      }

      let corps: ReponseColis;

      try {
        corps = (await reponse.json()) as ReponseColis;
      } catch {
        throw new TransporteurIndisponibleError("réponse de suivi illisible");
      }

      const colis = corps.parcels?.[0];

      /*
       * NUMERO INCONNU ET REPONSE DEFORMEE NE SE DISENT PAS PAREIL.
       *
       * Une liste vide est une reponse EXACTE du transporteur, « je ne connais
       * pas ce numero ». Un colis dont le statut manque signale une API en
       * derive. Les confondre ferait passer une derive pour un suivi normal, et
       * `synchroniseA` cesserait de detecter le blocage qu'il existe pour voir.
       */
      if (colis === undefined) {
        return null;
      }

      const statut = colis.status?.id;

      if (typeof statut !== "number") {
        throw new TransporteurIndisponibleError(
          "réponse de suivi sans identifiant de statut",
        );
      }

      return {
        statut,
        /*
         * LE LIBELLE PEUT MANQUER SANS QUE CE SOIT UNE PANNE : le code raisonne
         * sur l'identifiant, ce champ ne sert qu'a l'affichage. Un repli vide
         * vaut mieux qu'une exception sur une donnee decorative.
         */
        libelle: colis.status?.message ?? "",
      };
    },

    async lireLivraison(numeroSuivi) {
      /*
       * LE NUMERO VA DANS LE CHEMIN, documente sur sendcloud.dev : « The
       * tracking number that the user received ». Encode, il ne peut pas
       * changer de ressource.
       */
      const url = new URL(
        `${BASE_SUIVI}/tracking/${encodeURIComponent(numeroSuivi)}`,
      );

      let reponse: Response;

      try {
        reponse = await avecDelaiMaximum(
          appeler(url, {
            headers: {
              Accept: "application/json",
              Authorization: autorisation,
            },
          }),
          delaiMaximumMs,
        );
      } catch {
        throw new TransporteurIndisponibleError("appel d'historique en échec");
      }

      /*
       * 404, NUMERO INCONNU DE L'HISTORIQUE : rien ne livre, ce n'est pas une
       * panne. Le statut du colis garde alors son propre chemin, 11 ou 93.
       */
      if (reponse.status === 404) {
        return null;
      }

      if (!reponse.ok) {
        throw new TransporteurIndisponibleError(
          `réponse ${reponse.status} de l'historique`,
        );
      }

      let corps: ReponseHistorique;

      try {
        corps = (await reponse.json()) as ReponseHistorique;
      } catch {
        throw new TransporteurIndisponibleError("historique illisible");
      }

      if (!Array.isArray(corps.statuses)) {
        throw new TransporteurIndisponibleError("historique sans événements");
      }

      if (corps.is_return === true) {
        return null;
      }

      let premiere: Date | null = null;

      for (const evenement of corps.statuses) {
        if (
          typeof evenement.parent_status !== "string" ||
          !estEvenementLivraison(evenement.parent_status)
        ) {
          continue;
        }

        /*
         * UNE REMISE SANS DATE LISIBLE EST UNE DERIVE, pas une absence : la
         * taire laisserait le colis non livre sans aucun signe, l'echec
         * compte la rend visible.
         */
        const instant = lireHorodatageTransporteur(
          evenement.carrier_update_timestamp,
        );

        if (instant === null) {
          throw new TransporteurIndisponibleError(
            "remise sans horodatage lisible",
          );
        }

        if (instant.getTime() > Date.now() + AVANCE_MAXIMUM_MS) {
          throw new TransporteurIndisponibleError("remise datée du futur");
        }

        if (premiere === null || instant < premiere) {
          premiere = instant;
        }
      }

      return premiere;
    },
  };
}

/**
 * Borne une promesse dans le temps.
 *
 * ELLE NE PEUT PAS ANNULER L'APPEL SOUS-JACENT, une promesse ne s'interrompt
 * pas. Elle borne l'attente, ce qui suffit : une tache qui traite N expeditions
 * ne doit pas tenir son verrou sur un fournisseur muet.
 */
function avecDelaiMaximum<T>(
  promesse: Promise<T>,
  delaiMs: number,
): Promise<T> {
  return new Promise<T>((resoudre, rejeter) => {
    const minuterie = setTimeout(() => {
      rejeter(new TransporteurIndisponibleError("délai de suivi dépassé"));
    }, delaiMs);

    promesse.then(
      (valeur) => {
        clearTimeout(minuterie);
        resoudre(valeur);
      },
      (cause: unknown) => {
        clearTimeout(minuterie);
        rejeter(new TransporteurIndisponibleError(cause));
      },
    );
  });
}

/**
 * Le client configure par l'environnement.
 *
 * CONSTRUIT A L'APPEL ET NON AU CHARGEMENT DU MODULE : `next build` evalue les
 * modules en `NODE_ENV=production` sans les variables du serveur, et une levee
 * au chargement casserait la construction de l'image.
 */
export const clientSuivi: ClientSuivi = {
  async lireStatut(numeroSuivi) {
    return creerClientSuiviSendcloud({
      clePublique: process.env.SENDCLOUD_PUBLIC_KEY ?? "",
      cleSecrete: process.env.SENDCLOUD_SECRET_KEY ?? "",
    }).lireStatut(numeroSuivi);
  },
  async lireLivraison(numeroSuivi) {
    return creerClientSuiviSendcloud({
      clePublique: process.env.SENDCLOUD_PUBLIC_KEY ?? "",
      cleSecrete: process.env.SENDCLOUD_SECRET_KEY ?? "",
    }).lireLivraison(numeroSuivi);
  },
};
