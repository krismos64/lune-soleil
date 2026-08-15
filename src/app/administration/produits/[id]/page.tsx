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
import { declinaisonsAttendues } from "@/integrations/medias/traitement";
import { lireProduit } from "@/services/catalogue";
import { listerMedias } from "@/services/media";
import { listerSections } from "@/services/sections-produit";
import { compterLignesDeCommande, listerVariantes } from "@/services/variante";
import { EditeurProduit } from "./editeur-produit";
import { MediasProduit } from "./medias-produit";
import { VariantesProduit } from "./variantes-produit";
import styles from "./editeur.module.css";

export const metadata = {
  title: "Fiche produit, administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Prefixe sous lequel les medias sont servis, ADR-007.
 *
 * IL VIENT DE LA CONFIGURATION ET NON DES DONNEES. `Media.chemin` porte un
 * chemin relatif au dossier `public/` du volume, jamais une URL : le prefixe
 * appartient a la configuration de Nginx, et le figer en base casserait au
 * premier changement de point de montage.
 *
 * EN DEVELOPPEMENT, AUCUN NGINX NE SERT CE CHEMIN. Les vignettes ne s'affichent
 * donc pas hors production, ce qui est attendu et sans consequence : la liste,
 * les statuts et l'ordre restent utilisables. Ce qui protege la vie privee est
 * le traitement, pas l'affichage.
 */
const PREFIXE_MEDIAS = process.env.MEDIA_PREFIXE_PUBLIC ?? "/medias";

/**
 * Declinaison servie a la vignette d'administration.
 *
 * 640 px ET NON 320 : l'ecran affiche la vignette sur environ 190 px CSS, soit
 * pres de 400 px physiques sur un telephone a densite double, ou la declinaison
 * 320 px paraitrait floue.
 *
 * LE JPEG ET NON L'AVIF, alors que l'AVIF pese six fois moins. Un `<img src>`
 * simple ne negocie aucun format : le navigateur prend ce qu'on lui donne, et
 * servir l'AVIF afficherait une image cassee a qui ne le supporte pas. C'est
 * l'ecran ou l'exploitante verifie ses photos, il doit s'afficher partout. Le
 * `<picture>` a trois sources appartient au catalogue public, LS-104, ou le
 * poids compte vraiment.
 *
 * LE NOM EST VERIFIE CONTRE `declinaisonsAttendues()` PLUTOT QU'ECRIT EN DUR.
 * Une premiere version portait `640.jpg` quand le traitement ecrit `640.jpeg` :
 * rien n'aurait rougi, ni `tsc` ni aucun test, et toutes les vignettes de
 * l'administration auraient ete cassees en production sans que la construction
 * le signale. Sous cette forme, renommer ou retirer une declinaison fait
 * echouer le rendu de la page immediatement.
 */
const NOM_VIGNETTE = "640.jpeg";

if (!declinaisonsAttendues().includes(NOM_VIGNETTE)) {
  throw new Error(
    `La declinaison ${NOM_VIGNETTE} n'est plus produite par le traitement.`,
  );
}

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
  const variantes = await listerVariantes(produit.id);
  const medias = await listerMedias(produit.id);

  /*
   * LE COMPTE DE COMMANDES PAR VARIANTE SERT L'AVERTISSEMENT D'ADR-029.
   *
   * Une requete par variante est acceptable ici et le restera : une fiche porte
   * une a cinq declinaisons, `frontend-design.md` dimensionnant le catalogue a
   * 10 a 40 references. Ce n'est pas le motif N+1 qu'il faudrait eviter sur une
   * liste de catalogue, et regrouper ces comptes en une seule requete ajouterait
   * un agregat pour economiser quatre lectures indexees.
   */
  const comptes = await Promise.all(
    variantes.map(async (variante) => ({
      id: variante.id,
      nombreCommandes: await compterLignesDeCommande(variante.id),
    })),
  );
  const nombreCommandesPar = new Map(
    comptes.map((compte) => [compte.id, compte.nombreCommandes]),
  );

  return (
    <main className={styles.page}>
      <p className={styles.fil}>
        <a href="/administration/categories">Catalogue</a>
      </p>
      {/*
       * L'ORDRE DES BLOCS EST DELIBERE, arbitrage du 14 aout 2026 : informations
       * generales, puis declinaisons, puis sections editoriales.
       *
       * A 320 px tout est empile, et corriger un nom ne doit demander aucun
       * defilement. C'est aussi l'ordre du parcours 3, qui cree le produit avant
       * ses variantes. Ne pas remonter les declinaisons en tete au motif
       * qu'elles portent le prix et le stock.
       */}
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
      <VariantesProduit
        produitId={produit.id}
        variantes={variantes.map((variante) => ({
          id: variante.id,
          reference: variante.reference,
          libelle: variante.libelle,
          dimensions: variante.dimensions,
          prixCentimes: variante.prixCentimes,
          quantitePhysique: variante.quantitePhysique,
          quantiteReservee: variante.quantiteReservee,
          archivee: variante.archiveeA !== null,
          nombreCommandes: nombreCommandesPar.get(variante.id) ?? 0,
        }))}
      />
      <MediasProduit
        produitId={produit.id}
        medias={medias.map((media) => ({
          id: media.id,
          chemin: media.chemin,
          texteAlternatif: media.texteAlternatif,
          ordre: media.ordre,
          statutTraitement: media.statutTraitement,
          /*
           * LE JPEG ET NON L'AVIF, alors que l'AVIF pese six fois moins.
           *
           * Un `<img src>` simple ne negocie aucun format : le navigateur prend
           * ce qu'on lui donne. Servir l'AVIF ici afficherait une image cassee
           * a qui ne le supporte pas, et cet ecran est celui ou l'exploitante
           * verifie ses photos. Le `<picture>` a trois sources appartient au
           * catalogue public, LS-104, ou le poids compte vraiment.
           *
           * LE CHEMIN N'EST CONSTRUIT QUE POUR UN MEDIA TRAITE. Un media en
           * attente ou en echec n'a aucun fichier sous `public/`, C8 : lui
           * fabriquer une URL produirait une image cassee la ou le composant
           * doit afficher un etat.
           */
          vignette:
            media.statutTraitement === "TRAITE"
              ? `${PREFIXE_MEDIAS}/${media.chemin}/${NOM_VIGNETTE}`
              : null,
        }))}
      />
    </main>
  );
}
