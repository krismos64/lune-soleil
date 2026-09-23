"use client";

/**
 * Rend le focus au contenu apres un changement de page du catalogue, LS-241.
 *
 * LE DEFAUT QU'IL FERME, releve par `ls-frontend-revue`. Au clavier, activer
 * « Page suivante » sur l'avant-derniere page mene a la derniere, ou ce lien
 * n'existe plus : l'element qui portait le focus quitte le DOM, et le focus
 * retombe sur `body`. La tabulation suivante repart alors du haut du document.
 * Motif « focus sur un element detache », deja en fiche sur ce depot.
 *
 * IL N'AGIT QUE SI LE FOCUS EST PERDU : un visiteur qui a deja tabule ailleurs
 * ne doit pas etre deplace.
 */
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

export function FocusPagination() {
  const page = useSearchParams().get("page");
  const premierRendu = useRef(true);

  useEffect(() => {
    if (premierRendu.current) {
      premierRendu.current = false;
      return;
    }

    if (document.activeElement === document.body) {
      document.getElementById("contenu")?.focus();
    }
  }, [page]);

  return null;
}
