/**
 * Controle de sante applicatif, LS-73. Adaptateur d'entree.
 *
 * QUI L'APPELLE : le controle de sante du conteneur, LS-74, et le controle de
 * fumee apres deploiement. Jamais un navigateur de client.
 *
 * ROUTE PUBLIQUE ET NON AUTHENTIFIEE, decision assumee : un orchestrateur ne
 * porte pas de session, et exiger un jeton rendrait le controle de sante
 * inutilisable pour ce a quoi il sert. La contrepartie est stricte, et c'est
 * elle qui gouverne le corps de la reponse : ce qui est public ne dit RIEN
 * d'exploitable. Pas de version de PostgreSQL ni de Node, pas de nom d'hote,
 * pas d'URL de connexion, aucune trace d'erreur. Un attaquant qui appelle cette
 * route apprend seulement que le site fonctionne, ce que la page d'accueil lui
 * dirait aussi.
 *
 * CE QU'ELLE NE FAIT PAS : aucune regle metier, aucune requete directe. La
 * sonde appartient a `services/sante.ts`.
 */
import { engendrerCorrelationId, journaliser } from "@/lib/journal";
import { verifierSante } from "@/services/sante";

/**
 * JAMAIS DE CACHE. Un Route Handler `GET` est deja dynamique par defaut dans
 * Next.js 16, verifie via Context7 : il n'est mis en cache que sur option
 * explicite. La directive est posee quand meme parce que l'enjeu est
 * dissymetrique : une reponse mise en cache par megarde ferait repondre « en
 * bonne sante » a une application dont la base est morte, et le defaut ne se
 * verrait qu'au moment d'un incident reel. Une ligne pour fermer ce cas.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const correlation = { correlationId: engendrerCorrelationId() };
  const etat = await verifierSante(correlation);

  journaliser(
    etat.operationnel ? "debug" : "warn",
    "controle de sante",
    { operationnel: etat.operationnel, base: etat.base },
    correlation,
  );

  /**
   * 200 OU 503, ET LE CODE EST CE QUI COMPTE. Docker et les sondes
   * d'orchestrateur decident sur le code HTTP, pas sur le corps : repondre 200
   * avec `{"operationnel": false}` serait lu comme un service sain. Le corps
   * sert au diagnostic humain, le code sert a la machine.
   *
   * L'identifiant de correlation est renvoye pour rattacher une reponse
   * observee aux lignes de journal correspondantes. Il n'autorise rien,
   * invariant 2.
   */
  return Response.json(etat, {
    status: etat.operationnel ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
      "X-Correlation-Id": correlation.correlationId,
    },
  });
}
