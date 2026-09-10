/**
 * Fournisseur reel de points de retrait, LS-115 puis LS-200.
 *
 * LE TRANSPORTEUR EST MONDIAL RELAY, LE FOURNISSEUR D'API EST SENDCLOUD, et les
 * deux ne se confondent pas : Mondial Relay redirige son offre sans contrat
 * vers Sendcloud, agregateur qui porte le contrat, ADR-035. Le dossier
 * s'appelait `mondial-relay/` jusqu'a LS-200, ce qui mentait sur l'API appelee.
 *
 * IL NE DECIDE RIEN. Il appelle, traduit, et laisse `chercherPointsRetrait`
 * degrader : le tunnel continue a vendre a domicile quand le transporteur est
 * muet, cas d'erreur du parcours 1.
 *
 * LES DEUX CLES SONT SECRETES malgre le nom de la premiere. Sendcloud les
 * combine en `publique:secrete` et encode en base64 pour une authentification
 * HTTP Basic : la cle dite publique est un IDENTIFIANT, jamais une cle
 * publiable au sens de Stripe. Aucune ne prend le prefixe `NEXT_PUBLIC_`.
 */
import {
  TransporteurIndisponibleError,
  type FournisseurPointsRetrait,
  type PointRetrait,
} from "./index";

/**
 * Domaine des points de retrait.
 *
 * DISTINCT DU RESTE DE L'API, qui vit sur `panel.sendcloud.sc`. Les deux ne
 * s'echangent pas, et pointer l'un sur l'autre rend un 404 que rien
 * n'expliquerait.
 */
const BASE_POINTS_RETRAIT = "https://servicepoints.sendcloud.sc/api/v2";

/**
 * Le seul transporteur demande.
 *
 * ADR-035 ECARTE COLISSIMO sur son cout, 10,02 EUR contre 4,10 EUR pour la
 * meme tranche de poids. Sans ce filtre, l'API rendrait des points d'un
 * transporteur que la boutique ne propose pas, et le visiteur choisirait un
 * relais ou son colis n'arriverait jamais.
 */
const TRANSPORTEUR = "mondial_relay";

/**
 * Rayon de recherche, en metres.
 *
 * CINQ KILOMETRES EN ZONE RURALE, le Bearn n'etant pas une metropole : un rayon
 * plus etroit rendrait une liste vide autour d'Artix, ce que le visiteur lirait
 * comme « aucun relais chez moi ».
 */
const RAYON_METRES = 5000;

/** Ce que Sendcloud rend, avant traduction. Forme constatee le 10 septembre 2026. */
type PointSendcloud = {
  id: number;
  name: string;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
};

export type IdentifiantsSendcloud = {
  clePublique: string;
  cleSecrete: string;
  /** Injectable pour les tests, aucun appel reseau n'y est alors emis. */
  fetch?: typeof globalThis.fetch;
};

/**
 * Une cle manquante est une panne de configuration, et elle se voit tout de
 * suite.
 *
 * ELLE LEVE A LA CONSTRUCTION ET NON A L'APPEL. Sans identifiants, l'API rendrait
 * un 401 que `chercherPointsRetrait` degraderait en silence : la boutique
 * vendrait a domicile pour toujours sans que rien ne signale la cause. Meme
 * motif que `ConfigurationEmailIncompleteError`, et meme lecon que LS-214, ou
 * un repli muet a cache six semaines d'emails jamais partis.
 */
export class ConfigurationSendcloudIncompleteError extends Error {
  constructor(manquantes: readonly string[]) {
    super(
      `Configuration Sendcloud incomplète, variables absentes : ${manquantes.join(", ")}`,
    );
    this.name = "ConfigurationSendcloudIncompleteError";
  }
}

/**
 * Construit le fournisseur a partir d'identifiants explicites.
 *
 * LES IDENTIFIANTS SONT DES PARAMETRES ET NON UNE LECTURE D'ENVIRONNEMENT, ce
 * qui rend ce module testable sans variables posees et laisse `depuisEnvironnement`
 * porter seul la dependance au processus.
 */
export function creerFournisseurSendcloud({
  clePublique,
  cleSecrete,
  fetch: fetchInjecte,
}: IdentifiantsSendcloud): FournisseurPointsRetrait {
  const manquantes = [
    ...(clePublique ? [] : ["SENDCLOUD_PUBLIC_KEY"]),
    ...(cleSecrete ? [] : ["SENDCLOUD_SECRET_KEY"]),
  ];

  if (manquantes.length > 0) {
    throw new ConfigurationSendcloudIncompleteError(manquantes);
  }

  const appeler = fetchInjecte ?? globalThis.fetch;

  /*
   * L'EN-TETE EST CALCULE UNE FOIS, et il ne sort jamais de cette portee : ni
   * message d'erreur ni journal ne le reprend, invariant 9, le depot etant
   * public.
   */
  const autorisation = `Basic ${Buffer.from(`${clePublique}:${cleSecrete}`).toString("base64")}`;

  return {
    async rechercher({ codePostal }) {
      /*
       * LE CODE POSTAL VA DANS `address`, PARAMETRE DOCUMENTE, et les cles
       * restent dans l'en-tete : une cle en parametre de requete se retrouve
       * dans les journaux de tout intermediaire.
       */
      const url = new URL(`${BASE_POINTS_RETRAIT}/service-points`);
      url.searchParams.set("country", "FR");
      url.searchParams.set("address", codePostal);
      url.searchParams.set("radius", String(RAYON_METRES));
      url.searchParams.set("carrier", TRANSPORTEUR);

      let reponse: Response;

      try {
        reponse = await appeler(url, {
          headers: { Accept: "application/json", Authorization: autorisation },
        });
      } catch {
        /*
         * LA CAUSE RESEAU EST ENVELOPPEE SANS SON MESSAGE D'ORIGINE. Un message
         * de `fetch` porte l'URL complete, et l'URL porte le code postal du
         * visiteur.
         */
        throw new TransporteurIndisponibleError("appel réseau en échec");
      }

      if (!reponse.ok) {
        /*
         * LE CODE HTTP SUFFIT AU DIAGNOSTIC, et le corps ne le rejoint pas : un
         * corps d'erreur peut reprendre les parametres envoyes.
         */
        throw new TransporteurIndisponibleError(
          `réponse ${reponse.status} du transporteur`,
        );
      }

      let corps: unknown;

      try {
        corps = await reponse.json();
      } catch {
        throw new TransporteurIndisponibleError("réponse illisible");
      }

      /*
       * UN CORPS QUI N'EST PAS UNE LISTE EST UNE PANNE, PAS UNE LISTE VIDE. Une
       * passerelle rendant une page de maintenance en 200 existe, et la traiter
       * comme « aucun point » ferait renoncer un visiteur qui a bien un relais
       * chez lui. Le contrat distingue explicitement les deux cas.
       */
      if (!Array.isArray(corps)) {
        throw new TransporteurIndisponibleError("réponse de forme inattendue");
      }

      return corps.map(traduirePoint);
    },
  };
}

/**
 * Traduit un point Sendcloud vers le type du projet.
 *
 * LE TYPE DU FOURNISSEUR NE FUIT JAMAIS, regle du README d'`integrations/` :
 * `id` est un entier chez Sendcloud et une chaine dans le projet, LS-117 le
 * figeant dans `Commande.pointRelaisAdresse`.
 */
function traduirePoint(brut: unknown): PointRetrait {
  const point = brut as PointSendcloud;

  return {
    identifiant: String(point.id),
    nom: point.name,
    ligne1: composerVoie(point.street, point.house_number),
    codePostal: point.postal_code,
    ville: point.city,
  };
}

/**
 * Compose la ligne d'adresse a partir de la voie et du numero.
 *
 * SENDCLOUD SEPARE LES DEUX CHAMPS, mesure le 10 septembre 2026 sur 1040 points
 * de six codes postaux : `street` ne porte jamais le numero, `house_number` le
 * porte seul. La composition est donc une simple concatenation.
 *
 * AUCUNE DETECTION DE DOUBLON ICI, ET C'EST DELIBERE. Une version precedente
 * cherchait le numero dans la voie avant de l'ajouter, sur une lecture fautive
 * d'un affichage de mise au point. Cette protection etait inutile ET nuisible :
 * « RUE DU 8 MAI 1945 » avec un numero « 8 » y voyait un doublon et perdait le
 * vrai numero de rue. Un cas reel sur les 1040 mesures.
 *
 * LE NUMERO VIDE EXISTE, 16 cas sur 1040, « RUE JULES VALLES » sans numero. Le
 * repli rend la voie seule plutot qu'une ligne commencant par une espace, cette
 * adresse etant FIGEE dans la commande par LS-117.
 */
function composerVoie(voie: string, numero: string): string {
  const voieNettoyee = voie.trim();
  const numeroNettoye = numero.trim();

  return numeroNettoye === ""
    ? voieNettoyee
    : `${numeroNettoye} ${voieNettoyee}`;
}

/**
 * Le fournisseur configure par l'environnement, tel que les ecrans l'utilisent.
 *
 * CONSTRUIT A L'APPEL ET NON AU CHARGEMENT DU MODULE : `next build` evalue les
 * modules en `NODE_ENV=production` sans les variables du serveur, et une levee
 * au chargement casserait la construction de l'image. Lecon de la fiche
 * « construire n'est pas servir ».
 */
export const fournisseurPointsRetrait: FournisseurPointsRetrait = {
  async rechercher(demande) {
    return creerFournisseurSendcloud({
      clePublique: process.env.SENDCLOUD_PUBLIC_KEY ?? "",
      cleSecrete: process.env.SENDCLOUD_SECRET_KEY ?? "",
    }).rechercher(demande);
  },
};
