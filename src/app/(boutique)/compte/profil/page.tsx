/**
 * Profil du client. LS-60.
 *
 * COMPOSANT SERVEUR, `exigerSession` appele AVANT tout rendu. Pas de
 * middleware : celui de Next.js s'execute sur la peripherie et ne peut pas
 * relire la session en base, il ne verrait que la presence d'un cookie.
 *
 * LE PROFIL ET L'HISTORIQUE SONT DEUX SURFACES INDEPENDANTES, invariant 3 :
 * modifier son nom ne change pas le `nomClient` des commandes passees, et
 * changer d'adresse ne touche pas leur `emailNormalise`. Un test le verifie.
 */
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LONGUEUR_MINIMALE_MOT_DE_PASSE } from "@/lib/mot-de-passe";
import { prisma } from "@/lib/prisma";
import { exigerSession } from "@/services/autorisation";

import { changerEmailAction, changerNomAction } from "./actions";
import {
  FormulaireEmail,
  FormulaireMotDePasse,
  FormulaireNom,
} from "./formulaires";
import styles from "./profil.module.css";
import stylesCompte from "../compte.module.css";

export const metadata = {
  title: "Mon profil, Lune & Soleil",
  robots: { index: false, follow: false },
};

/**
 * La page lit la session a chaque affichage. Sans cela, Next.js pourrait servir
 * un rendu mis en cache, donc le profil d'une personne a une autre.
 */
export const dynamic = "force-dynamic";

export default async function PageProfil() {
  const identite = await exigerSession(await headers());

  if (!identite) {
    redirect("/compte/connexion");
  }

  /*
   * LE NOM EST RELU EN BASE, `IdentiteAppelant` ne le portant pas
   * volontairement : ce type est reduit a ce dont une decision d'AUTORISATION a
   * besoin, et un champ d'affichage n'a pas a y voisiner.
   */
  const compte = await prisma.utilisateur.findUnique({
    where: { id: identite.utilisateurId },
    select: { nom: true },
  });

  return (
    <main id="contenu" tabIndex={-1} className={stylesCompte.page}>
      <h1 className={stylesCompte.titre}>Mon profil</h1>

      <p className={stylesCompte.texte}>
        <Link href="/compte" className={stylesCompte.lien}>
          Retour à mon compte
        </Link>
      </p>

      {/*
       * CE QUE LE PROFIL NE CHANGE PAS, dit avant les formulaires : une
       * personne qui corrige une faute dans son nom doit savoir que sa facture
       * de juin garde l'ancien. C'est une consequence de l'invariant 3, et la
       * taire ferait attendre une correction qui n'aura pas lieu.
       */}
      <p className={stylesCompte.texte}>
        Ces informations concernent votre compte. Vos commandes et vos factures
        conservent les informations que vous aviez saisies au moment de
        l&apos;achat.
      </p>

      <div className={styles.sections}>
        <FormulaireNom
          nomActuel={compte?.nom ?? ""}
          action={changerNomAction}
        />

        <FormulaireEmail
          emailActuel={identite.email}
          action={changerEmailAction}
        />

        <FormulaireMotDePasse
          longueurMinimale={LONGUEUR_MINIMALE_MOT_DE_PASSE}
        />
      </div>
    </main>
  );
}
