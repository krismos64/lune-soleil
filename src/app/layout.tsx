import type { Metadata } from "next";
import "@/styles/tokens.css";
import { NOM_BOUTIQUE, urlDuSite } from "@/lib/seo";
import "./globals.css";

/*
 * Aucune police n'est choisie ici. La typographie de la boutique appartient à la
 * phase 2, avec l'identité visuelle. Le rendu se fait d'ici là sur la pile
 * système, ce qui évite de figer un choix par défaut du générateur.
 */

/**
 * LS-137. `metadataBase` EST POSÉE ICI ET NULLE PART AILLEURS.
 *
 * Elle est ce qui permet aux pages d'écrire un canonical RELATIF, `/catalogue`,
 * que Next.js résout ensuite en absolu. Sans elle, un canonical relatif est
 * émis tel quel : les moteurs le résolvent alors contre l'hôte de la requête,
 * donc juste par accident tant qu'aucun autre nom de domaine ne sert le site.
 *
 * SANS ELLE AUSSI, Next.js avertit au build sur toute image Open Graph relative
 * et retombe sur `localhost`. Vérifié via Context7 sur la documentation Next.js.
 *
 * ELLE EST LUE À CHAQUE RENDU, jamais figée au chargement du module :
 * `urlDuSite()` lève si la variable manque, ce qui doit se produire au démarrage
 * du serveur et non au moment où le bundle est construit.
 */
export const metadata: Metadata = {
  metadataBase: new URL(urlDuSite()),
  title: {
    default: "Lune & Soleil, bijoux artisanaux faits main",
    /*
     * LE GABARIT ÉVITE DE RÉPÉTER LE NOM DE LA BOUTIQUE dans chaque page.
     * Les titres des pages qui le portaient déjà ont été raccourcis en
     * conséquence : « Le catalogue, Lune & Soleil » redoublait la marque.
     */
    template: `%s, ${NOM_BOUTIQUE}`,
  },
  description:
    "Bijoux artisanaux faits main, créés à l'unité. Boutique en cours de construction.",
  openGraph: {
    siteName: NOM_BOUTIQUE,
    locale: "fr_FR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
