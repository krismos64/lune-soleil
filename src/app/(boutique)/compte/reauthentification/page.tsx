/**
 * Ecran de reauthentification CLIENT, LS-164, ADR-023 et ADR-027 decision 3.
 *
 * POURQUOI IL EXISTE. `formulaire-suppression.tsx` affichait « confirmez votre
 * identite avant de supprimer votre compte » sans qu'aucun ecran ne le permette :
 * le seul existant, `/administration/reauthentification`, exige le role
 * `ADMINISTRATRICE` et renvoie un client vers la connexion de l'administration.
 * Le message demandait donc une action impossible, sur une impasse, et cela
 * privait le client d'un droit que le RGPD article 17 lui garantit.
 *
 * PAR MOT DE PASSE ET NON PAR PASSKEY, ADR-023 : l'authentification client se
 * fait par email et mot de passe seuls. La passkey est le chemin de
 * l'administration, ADR-021, et l'ouvrir ici serait un second chemin, plus
 * faible, vers la meme preuve : `prouverIdentiteParPasskey` accorde la preuve
 * sur le seul constat qu'une session est NEUVE, ce qu'une reconnexion ordinaire
 * par mot de passe produit deja sur un compte sans passkey.
 *
 * UN ECRAN GENERIQUE ET NON UN CHAMP DANS CHAQUE FORMULAIRE, decision de
 * conception de cette story. Trois actions sensibles existent deja cote client,
 * suppression du compte et les deux gestes de LS-60, et LS-62 en ajoutera
 * l'export : recopier la mecanique quatre fois multiplierait les endroits ou
 * une garde peut manquer. La preuve dure quinze minutes et vaut pour toutes.
 *
 * IL N'ACCORDE RIEN PAR LUI-MEME. Etablir une preuve note un horodatage sur la
 * session ; c'est l'action sensible qui, ensuite, verifiera sa fraicheur cote
 * serveur. Invariant 2.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { exigerSession } from "@/services/autorisation";
import { FENETRE_REAUTHENTIFICATION_MS } from "@/services/preuve-identite";

import { FormulaireReauthentificationClient } from "./formulaire-reauthentification-client";
import styles from "../authentification.module.css";

export const metadata = {
  title: "Confirmer votre identité, Lune & Soleil",
  robots: { index: false, follow: false },
};

/**
 * Jamais de cache : la page depend de la session courante, et un rendu partage
 * entre deux visiteurs serait une confusion d'identite.
 */
export const dynamic = "force-dynamic";

const FENETRE_MINUTES = Math.round(FENETRE_REAUTHENTIFICATION_MS / 60_000);

/**
 * Ou la confirmation ramene, par cle et JAMAIS par chemin fourni.
 *
 * CE QUE CETTE INDIRECTION FERME. Accepter `?retour=<url>` ferait de cet ecran
 * une redirection ouverte : un lien vers
 * `/compte/reauthentification?retour=https://exemple-malveillant.fr` partirait
 * de notre domaine, donc avec sa confiance, et ramenerait ailleurs apres une
 * saisie de mot de passe. Le filtrer par « commence par / » ne suffit pas,
 * `//exemple.fr` etant une URL absolue de schema relatif que le navigateur suit
 * vers l'exterieur.
 *
 * Une CLE ne peut designer qu'une destination de cette table. Une valeur
 * inconnue, absente ou multiple retombe sur l'espace client, defaut ferme.
 *
 * C'EST LA MEME DOCTRINE QUE `RETOUR_APRES_VERIFICATION` dans
 * `verification/bouton-renvoi.tsx` : le chemin de retour est ecrit dans le code,
 * jamais choisi par l'appelant.
 */
const DESTINATIONS = {
  compte: "/compte",
  profil: "/compte/profil",
  donnees: "/compte/donnees",
} as const;

type CleDestination = keyof typeof DESTINATIONS;

const DESTINATION_PAR_DEFAUT: CleDestination = "compte";

/**
 * Ce que chaque destination annonce, pour que l'ecran dise POURQUOI il demande.
 *
 * « Confirmez votre identite » sans motif se lit comme une panne ou un piege.
 * Nommer le geste qui attend derriere rend la demande comprehensible, et c'est
 * ce qui evite qu'une personne abandonne son droit a l'effacement en chemin.
 */
const MOTIFS: Record<CleDestination, string> = {
  compte: "avant de supprimer votre compte",
  profil: "avant de modifier vos informations",
  donnees: "avant de télécharger vos données",
};

function lireDestination(brut: string | string[] | undefined): CleDestination {
  // UN PARAMETRE REPETE ARRIVE EN TABLEAU, `?retour=a&retour=b`. Le premier
  // element est retenu plutot que de laisser un tableau tomber dans le `in`,
  // ou il serait faux sans que le defaut se voie.
  const valeur = Array.isArray(brut) ? brut[0] : brut;

  if (typeof valeur === "string" && valeur in DESTINATIONS) {
    return valeur as CleDestination;
  }

  return DESTINATION_PAR_DEFAUT;
}

export default async function PageReauthentificationClient({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const identite = await exigerSession(await headers());

  if (!identite) {
    /*
     * Redirection et non page d'erreur : sans session, la reponse utile est le
     * formulaire de connexion CLIENT. Pointer vers l'administration
     * reconduirait le defaut meme que cette story corrige.
     */
    redirect("/compte/connexion");
  }

  const parametres = await searchParams;
  const destination = lireDestination(parametres.retour);

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1 className={styles.titre}>Confirmer votre identité</h1>
      <p className={styles.introduction}>
        Saisissez votre mot de passe {MOTIFS[destination]}. Votre confirmation
        reste valable {FENETRE_MINUTES} minutes.
      </p>

      <FormulaireReauthentificationClient
        email={identite.email}
        destination={DESTINATIONS[destination]}
      />
    </main>
  );
}
