/**
 * Declenchement des taches planifiees. LS-72. Adaptateur d'entree.
 *
 * QUI L'APPELLE : le conteneur `cron` de la topologie cible, jamais un
 * navigateur. Le chemin est sous `/api/interne/` pour que cela se lise, mais
 * **le prefixe ne protege rien** : ce qui protege est le secret partage,
 * verifie cote serveur, invariant 2. Un appel qui se presente comme le cron
 * n'est pas le cron.
 *
 * UNE SEULE ROUTE PARAMETREE plutot que deux fichiers jumeaux. Les deux taches
 * partagent exactement la meme mecanique, seul le nom du verrou change :
 * dupliquer le fichier dupliquerait aussi la verification du secret, et un
 * durcissement futur risquerait de n'etre applique qu'a l'un des deux. Le nom
 * arrive par l'URL, donc **non fiable**, et n'est accepte que s'il figure dans
 * la table `TACHES`.
 *
 * CE QU'ELLE NE DECIDE PAS : aucune logique metier n'est ecrite ici, chaque
 * tache delegue a son service. LES QUATRE TACHES SONT DESORMAIS REMPLIES,
 * les deux dernieres par LS-120.
 */
import { engendrerCorrelationId, journaliser } from "@/lib/journal";
import { secretCronValide } from "@/lib/secret-cron";
import { fournisseurStripe } from "@/integrations/stripe";
import { libererReservationsExpirees } from "@/services/liberation-reservations";
import { purgerQuarantaine } from "@/services/media";
import { reconcilierPaiements } from "@/services/reconciliation-paiements";
import { purgerJournaux } from "@/services/purge-journaux";
import {
  executerSousVerrou,
  NOMS_TACHES,
  type NomTache,
} from "@/services/tache-planifiee";

/**
 * JAMAIS DE CACHE. Une reponse mise en cache ferait croire la tache executee
 * sans qu'aucun verrou n'ait ete pris, et le defaut ne se verrait qu'au moment
 * ou la tache compte vraiment. Meme motif que la route de sante.
 */
export const dynamic = "force-dynamic";

/**
 * `POST` ET NON `GET`, et ce n'est pas une preference de style. Une tache
 * planifiee n'est pas une lecture : elle modifiera le stock des la phase 3. Un
 * `GET` serait rejouable par un prefetch de navigateur ou un crawler, et
 * certains intermediaires le mettent en cache. Le verrou protegerait du
 * dommage, mais autant ne pas construire le chemin.
 */
export async function POST(
  requete: Request,
  contexte: { params: Promise<{ nom: string }> },
): Promise<Response> {
  const correlation = { correlationId: engendrerCorrelationId() };

  /**
   * LE SECRET SE VERIFIE AVANT TOUT LE RESTE, y compris avant de regarder si
   * le nom de tache existe. Verifier le nom d'abord distinguerait, pour un
   * appelant non authentifie, une tache connue d'une tache inconnue par le
   * code de reponse : cela publierait la liste des taches internes.
   */
  if (!secretCronValide(requete.headers)) {
    // 404 ET NON 401 : une route interne ne confirme pas son existence a qui
    // ne prouve rien. Un 401 dirait « cette route existe et attend un secret ».
    // Aucun en-tete `WWW-Authenticate` pour la meme raison.
    journaliser(
      "warn",
      "Appel de tache refuse, secret invalide",
      {},
      correlation,
    );
    return new Response(null, { status: 404 });
  }

  const { nom } = await contexte.params;

  /**
   * LE NOM VIENT DE L'URL, DONC IL N'AUTORISE RIEN et ne sert qu'apres
   * validation contre la liste connue. Sans ce filtre, un appelant muni du
   * secret creerait un verrou portant le nom de son choix, remplissant la
   * table de lignes qu'aucune tache ne relacherait.
   */
  if (!NOMS_TACHES.includes(nom as NomTache)) {
    journaliser("warn", "Tache inconnue demandee", { tache: nom }, correlation);
    return new Response(null, { status: 404 });
  }

  const tache = nom as NomTache;

  const resultat = await executerSousVerrou(tache, async () => {
    /**
     * LES QUATRE TACHES PORTENT UN TRAVAIL depuis LS-120, `purge-journaux` en
     * LS-94, `purge-quarantaine-medias` en LS-102, et les deux du paiement.
     *
     * `purge-journaux` applique les durees de conservation annoncees au
     * registre des traitements, regle E14. Elle est branchee ici plutot que
     * dans un fichier de route distinct pour la meme raison qui a fait choisir
     * une route parametree : la verification du secret et la prise de verrou
     * sont communes, et les dupliquer ferait qu'un durcissement futur ne
     * s'appliquerait qu'a l'un des deux fichiers.
     *
     * `liberation-reservations` et `reconciliation-paiements` sont remplies
     * depuis LS-120, plus bas dans cette fonction.
     *
     * Le contrat que toutes ces taches respectent est le meme : elles LEVENT en
     * cas d'echec, et `executerSousVerrou` se charge du journal et du
     * relachement.
     */
    if (tache === "purge-journaux") {
      /**
       * `purgerJournaux` NE LEVE PAS, a la difference du contrat des deux
       * autres taches, et cet ecart est le critere 4 de LS-94.
       *
       * Une purge qui leve ferait sortir la boucle et laisserait les tables
       * suivantes intactes : un incident sur `JournalConnexion` empecherait
       * la purge de `RateLimit`, qui grossirait alors indefiniment. L'echec
       * est donc porte table par table dans le resultat, et journalise a
       * l'interieur du service.
       *
       * LA TACHE EST DECLAREE EN ECHEC SI UNE SEULE PURGE A ECHOUE, en levant
       * ici apres coup : les autres tables ont ete traitees, mais
       * l'exploitation doit voir un echec plutot qu'un 200 rassurant. Sans
       * cela, une purge cassee depuis des mois rendrait la meme reponse
       * qu'une purge sans travail.
       */
      const resultats = await purgerJournaux();
      const echouees = resultats.filter((r) => r.echec).map((r) => r.table);

      journaliser(
        "info",
        "Purge des journaux terminee",
        {
          tache,
          supprimees: resultats.reduce((somme, r) => somme + r.supprimees, 0),
          tablesEnEchec: echouees.length,
        },
        correlation,
      );

      if (echouees.length > 0) {
        throw new Error(
          `Purge en echec sur ${echouees.length} table(s) : ${echouees.join(", ")}`,
        );
      }

      return;
    }

    /**
     * `purge-quarantaine-medias` ramasse les originaux dont le televersement a
     * ete interrompu, LS-102, premier cas d'erreur du parcours 3.
     *
     * ELLE LEVE EN CAS D'ECHEC, contrat commun a toutes les taches SAUF
     * `purge-journaux` : il n'y a ici qu'un seul dossier a parcourir, donc
     * aucune raison de porter l'echec element par element. `executerSousVerrou`
     * se charge du journal et du relachement.
     *
     * L'AGE MINIMAL EST CELUI DU SERVICE, une heure, et il ne se reduit pas
     * sans y penser : un fichier depose il y a deux minutes peut etre en cours
     * de traitement, et le supprimer ferait echouer un televersement en cours.
     * La marge est de trois ordres de grandeur sur les 1,9 s mesurees a
     * ADR-007 pour la photographie la plus lourde eprouvee.
     */
    if (tache === "purge-quarantaine-medias") {
      const supprimes = await purgerQuarantaine();

      journaliser(
        "info",
        "Purge de la quarantaine des medias terminee",
        { tache, supprimes },
        correlation,
      );

      return;
    }

    /*
     * `liberation-reservations`, LS-120 : elle rend au catalogue les
     * reservations echues. Sans elle, `quantiteReservee` ne redescendait
     * JAMAIS et une piece abandonnee au paiement restait invendable pour
     * toujours, ce que LS-106 avait mesure sans pouvoir le lever.
     *
     * ELLE LEVE EN CAS D'ECHEC, contrat commun a toutes les taches sauf
     * `purge-journaux` : il n'y a ici qu'une seule instruction, donc aucune
     * raison de porter l'echec element par element.
     */
    if (tache === "liberation-reservations") {
      const liberees = await libererReservationsExpirees();

      journaliser(
        "info",
        "Liberation des reservations expirees terminee",
        { tache, liberees },
        correlation,
      );

      return;
    }

    /*
     * `reconciliation-paiements`, LS-120 : elle rattrape les evenements jamais
     * recus. C'est le SECOND CHEMIN vers les effets de confirmation, decision D,
     * et l'idempotence par effet de LS-119 est ce qui empeche les deux chemins
     * de produire des doublons.
     *
     * LE PRESTATAIRE REEL EST INJECTE ICI, et c'est le seul endroit du chemin de
     * production qui le nomme : le service ne connait que le contrat, ce qui
     * permet d'eprouver la panne avec un double. Sans compte Stripe, LS-18, la
     * lecture d'etat leve en indisponibilite et chaque commande est sautee,
     * jamais annulee a l'aveugle.
     */
    if (tache === "reconciliation-paiements") {
      const bilan = await reconcilierPaiements({
        fournisseur: fournisseurStripe,
      });

      journaliser(
        "info",
        "Reconciliation des paiements terminee",
        { tache, ...bilan },
        correlation,
      );

      return;
    }

    journaliser(
      "debug",
      "Tache declenchee, aucun travail a executer",
      {
        tache,
      },
      correlation,
    );
  });

  /**
   * 200 DANS LES TROIS CAS SAUF ECHEC REEL, et le cas `IGNOREE` est le point.
   *
   * Une instance qui n'obtient pas le verrou a fait exactement ce qu'on attend
   * d'elle. Repondre 409 ferait echouer un appel sur deux en production a deux
   * instances : le cron journaliserait une erreur toutes les cinq minutes, et
   * l'exploitante apprendrait a ignorer ces alertes, ce qui noierait la seule
   * qui compte le jour ou la tache echoue vraiment.
   */
  journaliser(
    resultat.etat === "ECHOUEE" ? "error" : "info",
    "Tache planifiee terminee",
    { tache, etat: resultat.etat },
    correlation,
  );

  return Response.json(
    { tache, etat: resultat.etat },
    { status: resultat.etat === "ECHOUEE" ? 500 : 200 },
  );
}
