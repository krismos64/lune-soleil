"use client";

/**
 * Pose le focus sur le titre a l'arrivee sur la page, LS-117.
 *
 * POURQUOI IL EXISTE. On arrive ici par `router.push`, une navigation CLIENT :
 * le bouton « Commander avec obligation de paiement » qui portait le focus est
 * retire du DOM, et le focus retombe sur `body` sans qu'aucune erreur ne soit
 * levee. Au lecteur d'ecran, la commande a l'air de n'avoir rien produit.
 *
 * Le tunnel traite deja ce cas a chaque changement d'etape, mais son mecanisme
 * vit dans le composant client des formulaires : cette page est un composant
 * serveur et n'en herite pas. Releve par `ls-frontend-revue` le 25 aout 2026,
 * fiche « focus sur un element detache ».
 *
 * COMPOSANT SANS RENDU, et c'est deliberate : il n'ajoute aucun element au
 * document, il agit sur celui que la page serveur a deja rendu. La cible porte
 * `tabIndex={-1}`, sans quoi `focus()` ne ferait rien du tout.
 */
import { useEffect } from "react";

export function FocusTitre({ cible }: { cible: string }) {
  useEffect(() => {
    const element = document.getElementById(cible);

    element?.focus();
  }, [cible]);

  return null;
}
