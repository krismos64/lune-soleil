/**
 * Les actions directes de l'administration, LS-325 : ce que l'exploitante
 * vient faire le plus souvent, atteignable sans passer par une liste. La
 * palette « Aller à… » et le tableau de bord lisent la même table, pour
 * qu'une action porte le même nom partout.
 *
 * CHAQUE ACTION MÈNE À UN ÉCRAN QUI EXISTE, gardé par son propre contrôle de
 * rôle : cette table ne donne aucun droit, elle raccourcit un chemin.
 */
import type { NomIcone } from "./icones-administration";

export type ActionRapide = {
  libelle: string;
  /** Ce que l'action permet, dit en une ligne sous son nom. */
  precision: string;
  chemin: string;
  icone: NomIcone;
};

export const ACTIONS_RAPIDES: readonly ActionRapide[] = [
  {
    libelle: "Créer un produit",
    precision: "Nom, photos, prix et stock",
    chemin: "/administration/produits/nouveau",
    icone: "plus",
  },
  {
    libelle: "Enregistrer une vente de marché",
    precision: "Une pièce vendue hors du site",
    chemin: "/administration/stocks",
    icone: "marche",
  },
  {
    libelle: "Changer le thème de la boutique",
    precision: "Saisons, fêtes et opérations",
    chemin: "/administration/parametres#theme-saisonnier",
    icone: "theme",
  },
  {
    libelle: "Régler une promotion",
    precision: "Taux, articles et période",
    chemin: "/administration/parametres#promotion",
    icone: "promotion",
  },
] as const;
