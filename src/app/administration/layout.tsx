/**
 * Layout de l'administration, LS-162.
 *
 * IL EXISTE POUR PORTER LA BARRE DE NAVIGATION, arbitrage de Christophe du
 * 2 septembre 2026 : barre permanente plutot qu'index sur l'accueil. Sept URL a
 * connaitre par coeur ne se reglent pas en imposant un retour a l'accueil entre
 * chaque ecran.
 *
 * IL N'AUTORISE RIEN, ET C'EST DELIBERE. Chaque page appelle deja
 * `exigerAdministratrice` avant de rendre quoi que ce soit, et c'est LA
 * protection : un layout ne doit surtout pas devenir le seul endroit ou elle
 * vit. Deux raisons, et la seconde est la vraie.
 *
 * D'abord, un layout ne se re-rend pas a chaque navigation : y placer une garde
 * la ferait s'executer moins souvent que les pages qu'elle pretend proteger.
 *
 * Ensuite et surtout, une Server Action n'est PAS rendue par un layout. Une
 * garde qui vivrait ici laisserait toutes les actions ouvertes a un appel HTTP
 * direct, alors que l'ecran paraitrait protege. C'est exactement le motif que
 * `verifier-gardes-administration.sh` verifie fonction par fonction.
 *
 * CE QU'IL FAIT DE LA SESSION, il ne s'en sert QUE POUR AFFICHER. `lireIdentite`
 * ne leve pas et rend `null` sans session : la barre disparait alors, ce qui
 * evite de proposer sept liens vers des ecrans protetes a qui n'est pas
 * connecte, sur la page de connexion en particulier. Cacher la barre n'est pas
 * une protection et n'en tient pas lieu : les pages restent gardees.
 */
import { headers } from "next/headers";

import { NavigationAdministration } from "@/components/navigation-administration";
import { lireIdentite } from "@/services/autorisation";

export default async function LayoutAdministration({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const identite = await lireIdentite(await headers());

  /*
   * LE ROLE EST VERIFIE, PAS SEULEMENT LA PRESENCE D'UNE SESSION. Un client
   * inscrit sur la boutique porte une session valide avec le role `CLIENT` :
   * sans ce test, la barre de l'administration s'afficherait pour lui s'il
   * ouvrait une de ces URL, en annoncant sept ecrans auxquels il n'a pas acces.
   * Les pages le refuseraient bien, mais l'affichage aurait deja divulgue la
   * structure de l'administration. Motif « fabriquer la preuve sans le role ».
   */
  const estAdministratrice = identite?.role === "ADMINISTRATRICE";

  return (
    <>
      {estAdministratrice ? <NavigationAdministration /> : null}
      {children}
    </>
  );
}
