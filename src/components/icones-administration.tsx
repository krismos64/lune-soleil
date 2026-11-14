/**
 * Les icônes de l'administration, LS-325. Dessinées au trait, dans une boîte
 * de 24 par 24, à la couleur du texte qui les porte.
 *
 * TOUJOURS DÉCORATIVES, `aria-hidden` : le libellé à côté nomme la rubrique
 * ou l'action, une icône seule ne nomme jamais rien ici. Un bouton sans
 * libellé visible porte son nom par `aria-label`, pas par son icône.
 *
 * SANS DÉPENDANCE NI ÉTAT : ce fichier se rend côté serveur comme côté
 * client, la barre latérale et la palette étant des composants client.
 */
import type { ReactNode } from "react";

const TRACES = {
  bord: (
    <>
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
    </>
  ),
  alertes: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  statistiques: (
    <>
      <path d="M4 20h16" />
      <path d="M7 20v-6M12 20V6M17 20v-9" />
    </>
  ),
  commandes: (
    <>
      <path d="M6 8h12l-1 12H7L6 8Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </>
  ),
  expeditions: (
    <>
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" />
      <path d="M3 7.5 12 12l9-4.5M12 12v9" />
    </>
  ),
  retractations: (
    <>
      <path d="M8 5 4 9l4 4" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-4" />
    </>
  ),
  factures: (
    <>
      <path d="M6 3h9l4 4v14H6V3Z" />
      <path d="M15 3v4h4M9 12h7M9 16h7" />
    </>
  ),
  messages: (
    <>
      <path d="M3 6h18v12H3V6Z" />
      <path d="m3 7 9 6.5L21 7" />
    </>
  ),
  avis: (
    <path d="m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3 1.2-6.2L3 9.5l6.3-.8L12 3Z" />
  ),
  clients: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 20c.5-3.6 2.8-5.5 6-5.5s5.5 1.9 6 5.5" />
      <path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.9c2 .7 3.2 2.4 3.5 5.1" />
    </>
  ),
  produits: (
    <>
      <path d="M7 4h10l4 5-9 11L3 9l4-5Z" />
      <path d="M3 9h18M9.5 9 12 20l2.5-11M7 4l2.5 5M17 4l-2.5 5" />
    </>
  ),
  categories: (
    <>
      <path d="M3 12.5V4.5C3 3.7 3.7 3 4.5 3h8l8.5 8.5-9.5 9.5L3 12.5Z" />
      <circle cx="7.6" cy="7.6" r="1.4" />
    </>
  ),
  stocks: (
    <>
      <path d="M3 10h8v10H3V10ZM13 10h8v10h-8V10ZM8 3h8v7H8V3Z" />
    </>
  ),
  parametres: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  passkeys: (
    <>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9M17 12v3.5M20.5 12v2.5" />
    </>
  ),
  connexions: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  recherche: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  marche: (
    <>
      <path d="M4 9.5 5.5 4h13L20 9.5" />
      <path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" />
      <path d="M5.5 12v8h13v-8" />
    </>
  ),
  theme: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.8 0-1.2-1-1.6-1-2.7 0-1 .8-1.7 1.9-1.7H17a4 4 0 0 0 4-4c0-4.4-4-7.8-9-7.8Z" />
      <circle cx="7.7" cy="12" r="1" />
      <circle cx="10" cy="7.8" r="1" />
      <circle cx="15" cy="7.8" r="1" />
    </>
  ),
  promotion: (
    <>
      <path d="m6 18 12-12" />
      <circle cx="7.5" cy="7.5" r="2.5" />
      <circle cx="16.5" cy="16.5" r="2.5" />
    </>
  ),
  boutique: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v6H4V6h6" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  fermer: <path d="m6 6 12 12M18 6 6 18" />,
  fleche: <path d="m9 6 6 6-6 6" />,
} as const satisfies Record<string, ReactNode>;

export type NomIcone = keyof typeof TRACES;

export function IconeAdministration({
  nom,
  className,
}: {
  nom: NomIcone;
  className?: string | undefined;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {TRACES[nom]}
    </svg>
  );
}
