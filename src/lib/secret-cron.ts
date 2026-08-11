/**
 * Verification du secret partage des routes internes. LS-72, invariant 2.
 *
 * CE QUE CE MODULE PROTEGE. Les routes de taches planifiees ne sont derriere
 * aucune session : le conteneur cron n'a pas de compte. Le seul chose qui
 * distingue un appel legitime d'un appel arbitraire est ce secret. **Un appel
 * qui se presente comme le cron n'est pas le cron**, l'invariant 2 s'applique
 * mot pour mot.
 *
 * CE MODULE N'IMPORTE RIEN DU PROJET, et ne doit jamais le faire. Meme motif
 * que `mot-de-passe.ts` et `issue-connexion.ts` : il reste testable sans base
 * de donnees, et la suite unitaire doit tourner sans Docker.
 */
import { timingSafeEqual } from "node:crypto";

/** En-tete portant le secret. Choisi explicite plutot que `Authorization`. */
export const ENTETE_SECRET_CRON = "x-cron-secret";

/**
 * Compare deux chaines en temps constant.
 *
 * POURQUOI PAS `===`, qui serait plus simple et parfaitement lisible.
 * L'egalite de chaines de JavaScript s'arrete au premier caractere different :
 * le temps de reponse depend donc du nombre de caracteres corrects en tete.
 * Un attaquant qui mesure ce temps reconstitue le secret caractere par
 * caractere, sans jamais avoir a le deviner en entier.
 *
 * `timingSafeEqual` EXIGE DES TAMPONS DE MEME LONGUEUR et leve sinon. La
 * longueur est donc comparee d'abord, ce qui fuit la longueur du secret, fuite
 * sans valeur pratique : elle ne reduit pas l'espace de recherche d'un secret
 * engendre par `openssl rand`.
 *
 * L'ENCODAGE EST EXPLICITE en `utf8`. Sans lui, deux chaines identiques mais
 * encodees differemment compareraient faux, et le refus serait incomprehensible.
 */
function egaliteConstante(attendu: string, fourni: string): boolean {
  const tamponAttendu = Buffer.from(attendu, "utf8");
  const tamponFourni = Buffer.from(fourni, "utf8");

  if (tamponAttendu.length !== tamponFourni.length) {
    return false;
  }

  return timingSafeEqual(tamponAttendu, tamponFourni);
}

/**
 * Le secret attendu, ou `null` s'il n'est pas configure.
 *
 * LU A CHAQUE APPEL ET NON MIS EN CACHE au chargement du module, meme motif que
 * `LOG_LEVEL` dans `journal.ts` : un cache figerait la valeur pour toute la
 * duree du processus, ce qui empeche de la changer sans redemarrer.
 *
 * LA VALEUR N'EST JAMAIS JOURNALISEE ni comparee a autre chose qu'au vide,
 * invariant 9. Seule son absence est constatee.
 */
function secretAttendu(): string | null {
  const brut = process.env.CRON_SHARED_SECRET;

  return brut && brut.length > 0 ? brut : null;
}

/**
 * L'appel porte-t-il le secret partage ?
 *
 * DEFAUT FERME, ET C'EST LE POINT QUI SE RATE. Quand la variable n'est pas
 * configuree, cette fonction rend `false` : les routes internes sont alors
 * inaccessibles a tous, y compris au cron. Une tache qui ne tourne pas se
 * remarque ; une route ouverte a tous ne se remarque pas.
 *
 * La formulation inverse, « pas de secret configure donc on laisse passer »,
 * est celle qui rend l'ouverture invisible : elle marche parfaitement en
 * developpement, ou personne ne configure rien, et publie deux routes internes
 * le jour du deploiement. Le projet a deja rencontre ce motif trois fois, voir
 * ADR-027 et la regle de securite.
 *
 * Le secret ABSENT DE LA REQUETE et le secret FAUX rendent la meme reponse,
 * meme principe que `AutorisationRefuseeError` : distinguer les deux
 * renseignerait sur l'existence du mecanisme.
 */
export function secretCronValide(enTetes: Headers): boolean {
  const attendu = secretAttendu();

  if (attendu === null) {
    return false;
  }

  const fourni = enTetes.get(ENTETE_SECRET_CRON);

  if (fourni === null) {
    return false;
  }

  return egaliteConstante(attendu, fourni);
}
