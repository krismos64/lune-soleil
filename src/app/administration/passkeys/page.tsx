/**
 * Gestion des passkeys de l'administration, LS-175, ADR-021.
 *
 * POURQUOI CET ECRAN N'EXISTAIT PAS, ET POURQUOI C'ETAIT BLOQUANT.
 *
 * ADR-021 fait de la passkey le chemin PRINCIPAL de l'administration, et
 * LS-175 exige que l'exploitante l'enregistre « depuis son propre appareil, sur
 * le domaine de production ». Le code savait SE CONNECTER par passkey,
 * `signIn.passkey()` etant appele par l'ecran de connexion et par celui de
 * reauthentification, mais AUCUN ecran n'appelait `addPasskey` : il n'existait
 * aucun chemin pour en enregistrer une.
 *
 * La procedure d'amorcage renvoyait a `/administration` pour cette etape, une
 * page qui n'a jamais rien porte de tel. Mesure du 10 septembre 2026, sur une
 * production deja en service et une base sans aucune passkey.
 *
 * IL EXIGE LE ROLE, PAS SEULEMENT UNE SESSION. `exigerAdministratrice` et
 * jamais `lireIdentite` : c'est le defaut exact que l'ecran de
 * reauthentification a corrige en relecture, et le repeter ici laisserait un
 * client inscrit sur la boutique enregistrer une passkey sur son propre compte
 * depuis une route d'administration.
 *
 * CE QUE CET ECRAN NE FAIT PAS. Il ne cree aucun compte et ne change aucun
 * role : `role` porte `input: false`, regle E11, et la promotion passe par
 * `scripts/amorcer-production.sh`. Un ecran qui promouvrait serait exactement
 * l'invariant 2 viole.
 */
import { Suspense } from "react";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ChargementAdministration } from "@/components/chargement-administration";
import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import { listerPasskeysDuCompte } from "@/services/passkeys";

import { GestionPasskeys } from "./gestion-passkeys";
import styles from "./passkeys.module.css";

export const metadata = {
  title: "Vos passkeys",
  robots: { index: false, follow: false },
};

/**
 * Jamais de cache : la liste depend de la session courante, et un rendu partage
 * entre deux visiteurs melangerait les moyens d'acces de deux comptes.
 */
export const dynamic = "force-dynamic";

export default async function PagePasskeys() {
  let identite;
  try {
    identite = await exigerAdministratrice(await headers());
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      redirect("/administration/connexion");
    }
    throw erreur;
  }

  /*
   * C34 : LA CIBLE DU LIEN D'EVITEMENT PORTE `id="contenu"` ET
   * `tabIndex={-1}`, tous deux sur la balise principale. Mesure deux fois sur
   * ce depot : `focus()` sur un element sans `tabindex` ne prend pas, le focus
   * retombe sur `body` et la tabulation suivante repart du haut. La page
   * defile, le lien parait marcher, et il ne remplit pas son role.
   *
   * Cet ecran est rendu SOUS la barre d'administration, donc le lien existe
   * dans le layout et sa cible est obligatoire ici.
   *
   * CE COMMENTAIRE NE CITE PAS LA BALISE PRINCIPALE entre chevrons, et c'est
   * une contrainte reelle : `verifier-lien-evitement.sh` lit la balise en
   * partant de sa premiere occurrence dans le fichier jusqu'au chevron
   * fermant. Un commentaire qui l'ecrit sous sa forme litterale devient cette
   * premiere occurrence, la fenetre se referme sur le commentaire, et le
   * controle annonce l'ancre absente sur un ecran qui la porte. Mesure le
   * 10 septembre 2026, motif connu du depot : un garde-fou qui cite la forme
   * interdite se fait detecter par le controle qu'il explique.
   */
  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <h1>Vos passkeys</h1>

      <p className={styles.introduction}>
        Une passkey vous connecte par Face&nbsp;ID, Touch&nbsp;ID ou le code de
        votre appareil, sans mot de passe à retenir. Enregistrez-en une par
        appareil que vous utilisez.
      </p>

      {/*
       * LA LECTURE VIT SOUS UN `<Suspense>` INTERNE, ET L'AUTORISATION AU-DESSUS,
       * C32. Un `loading.tsx` de segment enveloppe la page entiere : le
       * streaming commencerait avant que `exigerAdministratrice` ait decide, et
       * une redirection ne pourrait plus changer une reponse deja engagee.
       *
       * LA LISTE EST LUE PAR LE SERVEUR et passee en props, jamais rechargee au
       * montage par un effet. La premiere version appelait `listUserPasskeys()`
       * dans un `useEffect`, ce qu'ESLint a refuse a raison : un `setState`
       * synchrone dans un effet declenche un rendu en cascade.
       *
       * Le rafraichissement apres un ajout passe par `router.refresh()`, qui
       * rejoue CE composant serveur : une seule source pour la donnee.
       */}
      <Suspense fallback={<ChargementPasskeys />}>
        <ListePasskeys utilisateurId={identite.utilisateurId} />
      </Suspense>
    </main>
  );
}

async function ListePasskeys({ utilisateurId }: { utilisateurId: string }) {
  const passkeys = await listerPasskeysDuCompte(utilisateurId);
  return <GestionPasskeys passkeys={passkeys} />;
}

/**
 * L'annonce se termine par un point de suspension, C35, et non par un point
 * final : une attente EN COURS se dit ainsi, le point fermant la phrase donc
 * l'action.
 */
function ChargementPasskeys() {
  return (
    <ChargementAdministration
      annonce="Chargement de vos passkeys…"
      lignes={2}
    />
  );
}
