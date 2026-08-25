/**
 * Fournisseur reel de points de retrait, LS-115.
 *
 * IL N'APPELLE RIEN, ET C'EST DELIBERE. Le compte Mondial Relay n'existe pas :
 * il attend l'ouverture du compte bancaire professionnel, LS-27 et LS-18. LS-27
 * interdit explicitement « aucun identifiant fictif, aucune reponse d'API
 * inventee », et fabriquer une liste de commerces plausibles serait exactement
 * cela : des adresses reelles de tiers affichees comme des points partenaires.
 *
 * IL LEVE DONC `TransporteurIndisponibleError`, ce qui place le tunnel dans le
 * cas de panne du parcours 1 : la liste ne s'affiche pas, le domicile reste
 * propose, le message est explicite. Le comportement est celui d'un service
 * momentanement indisponible, ce qui est la verite : ce service n'est pas
 * encore raccorde.
 *
 * CE QUI RESTE A FAIRE quand le compte existera : implementer `rechercher` par
 * un appel HTTP a l'API Mondial Relay, avec les identifiants lus dans
 * l'environnement. Rien d'autre ne bouge, le contrat et sa degradation etant
 * deja testes.
 */
import {
  TransporteurIndisponibleError,
  type FournisseurPointsRetrait,
} from "./index";

export const fournisseurPointsRetrait: FournisseurPointsRetrait = {
  async rechercher() {
    throw new TransporteurIndisponibleError(
      "compte Mondial Relay non ouvert, LS-27",
    );
  },
};
