/**
 * Editeur de fiche produit, LS-100 et LS-87. Parcours 3.
 *
 * `exigerAdministratrice` AVANT TOUT RENDU, et chaque Server Action porte la
 * meme garde de son cote : une Server Action est invocable directement, sans
 * passer par ce rendu.
 *
 * IL N'Y A DELIBEREMENT PAS DE MIDDLEWARE : celui de Next.js s'execute sur la
 * peripherie et ne peut pas relire la session en base, il ne verrait que la
 * presence d'un cookie, ni sa validite ni le role.
 */
import type { StatutProduit } from "@/generated/prisma/enums";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import { lireProduit } from "@/services/catalogue";
import { listerSections } from "@/services/sections-produit";
import { EditeurProduit } from "./editeur-produit";
import styles from "./editeur.module.css";

export const metadata = {
  title: "Fiche produit, administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Ce que l'ecran dit de l'etat du produit, UNE ENTREE PAR VALEUR DE L'ENUM.
 *
 * POURQUOI UN OBJET INDEXE PAR `StatutProduit` ET NON UN TEXTE EN DUR. La
 * premiere version ecrivait « Brouillon : cette fiche n'est pas visible dans la
 * boutique », phrase vraie a la creation et FAUSSE des que LS-103 publiera le
 * produit. Rien n'aurait rougi : `tsc` ne voit pas un texte qui ne consomme pas
 * la valeur, et aucun test ne lit ce paragraphe.
 *
 * SOUS CETTE FORME, AJOUTER UNE VALEUR A `StatutProduit` CASSE LA COMPILATION.
 * C'est le piege connu de l'enum ajoute, deja rencontre deux fois ici sur un
 * index partiel puis sur un ternaire du JSX : le `Record` le rend visible au
 * lieu de le laisser passer.
 */
const ETAT_AFFICHE: Record<StatutProduit, string> = {
  BROUILLON:
    "Brouillon : cette fiche n'apparaît pas dans la boutique. Sa publication demande une photo et une variante.",
  ACTIF: "Publiée : cette fiche est visible dans la boutique.",
  ARCHIVE:
    "Archivée : cette fiche est retirée de la boutique. Les commandes déjà passées ne changent pas.",
};

export default async function PageEditeurProduit({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const enTetes = await headers();

  try {
    await exigerAdministratrice(enTetes);
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      redirect("/administration/connexion");
    }
    throw erreur;
  }

  const { id } = await params;
  const produit = await lireProduit(id);

  // LA LECTURE VIENT APRES LA GARDE. Lire avant renseignerait sur l'existence
  // d'un identifiant a qui n'a pas le droit d'y acceder, par la difference
  // entre une redirection et un 404.
  if (!produit) {
    notFound();
  }

  const sections = await listerSections(produit.id);

  return (
    <main className={styles.page}>
      <p className={styles.fil}>
        <a href="/administration/categories">Catalogue</a>
      </p>
      <h1 className={styles.titre}>{produit.nom}</h1>
      <p className={styles.etat}>{ETAT_AFFICHE[produit.statut]}</p>

      <EditeurProduit
        produitId={produit.id}
        nom={produit.nom}
        descriptionCourte={produit.descriptionCourte ?? ""}
        sections={sections.map((section) => ({
          id: section.id,
          titre: section.titre,
          contenu: section.contenu,
          ordre: section.ordre,
          visible: section.visible,
        }))}
      />
    </main>
  );
}
