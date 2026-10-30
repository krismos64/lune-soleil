"use client";

/**
 * Retire de l'adresse les parametres d'un retour de lien, LS-298 critere 3.
 *
 * L'accuse de verification est rendu par le serveur d'apres `?verifie=1` : sans
 * ce retrait, chaque rechargement le reaffichait, et un favori pose sur la page
 * le rejouerait des semaines plus tard. Le message reste a l'ecran jusqu'au
 * prochain rendu, l'adresse ne le porte plus.
 *
 * `history.replaceState` ET NON `router.replace` : le second relancerait un
 * rendu serveur, donc ferait disparaitre le message a l'instant ou il parait.
 * Next.js integre l'appel natif a son routeur depuis la version 14.1, sans
 * nouvelle requete.
 */
import { useEffect } from "react";

export function EffacerParametresRetour({
  parametres,
}: {
  /** Les noms a retirer, les autres parametres de l'adresse restent. */
  parametres: readonly string[];
}) {
  useEffect(() => {
    const url = new URL(window.location.href);
    const avant = url.search;

    for (const nom of parametres) {
      url.searchParams.delete(nom);
    }

    if (url.search !== avant) {
      window.history.replaceState(
        null,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
  }, [parametres]);

  return null;
}
