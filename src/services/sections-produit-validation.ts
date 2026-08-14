/**
 * Validation des entrees des sections de fiche produit, LS-100. Invariant 7.
 *
 * FICHIER SEPARE DU SERVICE, meme motif qu'en LS-99 : ces schemas sont importes
 * par les Server Actions et par des tests unitaires qui tournent sans base.
 * Les loger dans le service forcerait tout test de validation a charger Prisma.
 *
 * CE QUE CES SCHEMAS NE FONT PAS. Ils ne verifient aucune existence et
 * n'autorisent rien, invariant 2 : un identifiant bien forme ne prouve ni que
 * la section existe, ni qu'elle appartient au produit designe, ni que
 * l'appelant a le droit d'y toucher. L'appartenance vient du service, le droit
 * vient de la session.
 */
import { z } from "zod";

import { schemaIdentifiant } from "@/lib/validation";
import { engendrerSlug } from "@/services/catalogue-validation";

/**
 * Longueur maximale d'un titre de section.
 *
 * Aucune contrainte de longueur n'existe en base, la colonne etant en `TEXT`.
 * C'est une regle d'interface : un titre s'affiche sur la fiche publique, a
 * partir de 320 px, ou un texte de cette longueur tient deja sur trois lignes.
 */
const LONGUEUR_MAX_TITRE = 80;

/**
 * Longueur maximale du contenu d'une section.
 *
 * Genereuse a dessein : une description de bijou, une notice d'entretien ou un
 * guide des tailles tiennent tres largement dedans. La borne existe pour qu'un
 * collage accidentel de plusieurs pages soit refuse par un message clair plutot
 * que d'entrer en base et de rendre la fiche illisible.
 */
const LONGUEUR_MAX_CONTENU = 5000;

/**
 * Titre non vide une fois les espaces de bordure coupes.
 *
 * L'ORDRE `trim` PUIS `min(1)` EST LE POINT, comme pour les noms de categorie :
 * valider avant de couper laisserait passer trois espaces, qui atteindraient
 * `chk_section_titre_non_vide` et rendraient une erreur PostgreSQL brute a
 * l'administratrice.
 */
const schemaTitre = z
  .string("Un titre est attendu.")
  .trim()
  .min(1, "Le titre ne peut pas etre vide.")
  .max(
    LONGUEUR_MAX_TITRE,
    `Le titre depasse ${LONGUEUR_MAX_TITRE} caracteres.`,
  );

/**
 * Contenu de section, TEXTE SIMPLE, C23.
 *
 * `.trim()` N'EST PAS APPLIQUE ICI, contrairement au titre. Le contenu porte des
 * sauts de ligne signifiants, que le rendu transforme en paragraphes : couper
 * les bordures est sans risque, mais normaliser plus loin le serait, et la
 * separation des deux traitements se perd vite en relecture. Seules les
 * bordures sont retirees.
 *
 * LA CHAINE VIDE EST VALIDE, et c'est voulu : c'est l'etat d'une section
 * proposee mais pas encore redigee, et le seul moyen d'effacer un texte. La
 * regle d'affichage veut qu'une section sans contenu ne s'affiche pas du tout,
 * titre compris.
 *
 * AUCUN ASSAINISSEMENT HTML N'EST FAIT ICI, et ce n'est pas un oubli. Le risque
 * naitrait du RENDU, jamais du stockage : React echappe le texte par defaut, et
 * `dangerouslySetInnerHTML` est interdit sur ce chemin. Nettoyer a l'entree
 * donnerait l'illusion que le stockage protege, et masquerait le jour ou un
 * rendu HTML serait introduit ailleurs.
 */
const schemaContenu = z
  .string("Un contenu textuel est attendu.")
  .trim()
  .max(
    LONGUEUR_MAX_CONTENU,
    `Le contenu depasse ${LONGUEUR_MAX_CONTENU} caracteres.`,
  );

/**
 * Ajout d'une section. LA CLE EST DERIVEE DU TITRE, jamais fournie.
 *
 * Laisser l'appelant choisir sa cle ouvrirait la porte a une collision avec une
 * cle par defaut, `matieres` par exemple, dont l'unicite refuserait l'ecriture
 * avec un message que rien ne relie au formulaire.
 *
 * `strictObject` refuse les cles inconnues : un champ `ordre` glisse dans le
 * formulaire laisserait l'appelant choisir son rang, que le service calcule.
 */
export const schemaAjoutSection = z.strictObject({
  produitId: schemaIdentifiant,
  titre: schemaTitre,
});

/**
 * Modification du titre et du contenu d'une section.
 *
 * AUCUN CHAMP `cle`, volontairement, et `strictObject` fait de son envoi une
 * erreur plutot qu'un champ ignore en silence. C20 : la cle est stable, seul le
 * titre est modifiable. Aucun champ `ordre` non plus, le reordonnancement etant
 * une operation distincte qui reecrit tous les rangs a la fois.
 */
export const schemaModificationSection = z.strictObject({
  id: schemaIdentifiant,
  titre: schemaTitre,
  contenu: schemaContenu,
});

/** Masquage ou reaffichage. Le contenu n'est pas touche, C22. */
export const schemaVisibiliteSection = z.strictObject({
  id: schemaIdentifiant,
  visible: z.boolean("Un etat de visibilite est attendu."),
});

/** Suppression d'une section. La ligne part, contenu compris, ADR-026. */
export const schemaSuppressionSection = z.strictObject({
  id: schemaIdentifiant,
});

/**
 * Ordre complet des sections d'un produit, du premier rang au dernier.
 *
 * LA LISTE EST EXHAUSTIVE ET NON UN DEPLACEMENT UNITAIRE, meme raison qu'en
 * LS-99 : le service en tire les rangs 1..n, ce qui rend impossible un etat
 * intermediaire ou deux sections partagent un rang.
 *
 * LE REFUS DES DOUBLONS EST LE CONTROLE QUI COMPTE. Deux fois le meme
 * identifiant ferait ecrire deux rangs sur une section et en laisserait une
 * autre a son rang d'origine : la contrainte differable leverait au COMMIT,
 * avec un message que personne ne relierait au formulaire.
 *
 * `produitId` EST DANS L'ENTREE et n'est pas deduit des sections citees. C'est
 * lui qui dit quel ensemble doit etre couvert : sans lui, une liste de sections
 * d'un autre produit serait exhaustive de son propre point de vue.
 */
export const schemaReordonnancementSections = z.strictObject({
  produitId: schemaIdentifiant,
  ids: z
    .array(schemaIdentifiant)
    .min(1, "Au moins une section est attendue.")
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Une section apparait deux fois dans l'ordre demande.",
    ),
});

/**
 * Engendre la cle technique d'une section a partir de son titre. C20.
 *
 * REND `section` QUAND LE TITRE NE DONNE RIEN d'exploitable, un titre en
 * caracteres non latins par exemple. Contrairement au slug d'une categorie, qui
 * apparait dans une URL publique et doit donc etre refuse plutot qu'invente,
 * la cle n'est JAMAIS affichee : un repli neutre est ici sans consequence
 * visible, et le suffixe d'unicite ci-dessous ecarte la collision.
 */
export function engendrerCleSection(titre: string): string {
  return engendrerSlug(titre) || "section";
}
