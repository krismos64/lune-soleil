/**
 * Accueil de l'administration, LS-70.
 *
 * Cette page ne porte pas encore de fonctionnalite : elle existe pour etre la
 * PREMIERE ROUTE PROTEGEE du projet, et pour que la protection soit ecrite et
 * testee avant que du contenu sensible n'arrive derriere.
 *
 * LE MOTIF A REPRENDRE SUR TOUTE ROUTE D'ADMINISTRATION : appeler
 * `exigerAdministratrice` AVANT de rendre quoi que ce soit. Pas de verification
 * dans un composant enfant, pas de rendu conditionnel sur un role lu cote
 * client : le composant serveur decide, ou il n'y a pas de protection.
 *
 * Deliberement PAS de middleware. Un middleware Next.js s'execute sur la
 * peripherie et ne peut pas relire la session en base : il ne verrait que la
 * presence d'un cookie, pas sa validite ni le role. Protection reelle ici.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";

export const metadata = {
  title: "Administration, Lune & Soleil",
  robots: { index: false, follow: false },
};

export default async function PageAdministration() {
  let identite;

  try {
    identite = await exigerAdministratrice(await headers());
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      // Redirection et non page d'erreur : sans session, la reponse utile est
      // le formulaire de connexion. Le refus ne dit pas si le compte existe.
      redirect("/administration/connexion");
    }
    throw erreur;
  }

  return (
    <main>
      <h1>Administration</h1>
      <p>Connexion réussie, {identite.email}.</p>
    </main>
  );
}
