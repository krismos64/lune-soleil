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
  };
}

/**
 * Borne une promesse dans le temps.
 *
 * ELLE NE PEUT PAS ANNULER L'APPEL SOUS-JACENT, une promesse ne s'interrompt
 * pas. Elle borne l'attente, ce qui suffit : une tache qui traite N expeditions
 * ne doit pas tenir son verrou sur un fournisseur muet.
 */
function avecDelaiMaximum<T>(promesse: Promise<T>, delaiMs: number): Promise<T> {
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
};
