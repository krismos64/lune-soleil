/**
 * Ecran de connexion de l'administration, LS-70.
 *
 * Composant SERVEUR : il ne fait que decider quoi rendre. Le formulaire est un
 * composant client separe, la negociation WebAuthn exigeant le navigateur.
 *
 * La redirection d'une session deja ouverte se fait ici, avant tout rendu :
 * afficher un formulaire de connexion a qui est deja connecte n'a pas de sens,
 * et la verification vient de la session, jamais d'un parametre.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import styles from "./connexion.module.css";
import { FormulaireConnexion } from "./formulaire-connexion";
import { lireIdentite } from "@/services/autorisation";

export const metadata = {
  title: "Connexion, administration",
  // L'administration ne s'indexe pas. La consigne ne protege rien par
  // elle-meme, la protection est la verification de session : elle evite
  // seulement que la page remonte dans un moteur de recherche.
  robots: { index: false, follow: false },
};

export default async function PageConnexionAdministration() {
  const identite = await lireIdentite(await headers());

  if (identite?.role === "ADMINISTRATRICE") {
    redirect("/administration");
  }

  return (
    <main className={styles.page}>
      <h1>Administration</h1>
      <p className={styles.introduction}>
        Connexion réservée à l&apos;exploitante de la boutique.
      </p>
      <FormulaireConnexion />
    </main>
  );
}
