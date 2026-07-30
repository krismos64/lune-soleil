import type { Metadata } from "next";
import "@/styles/tokens.css";
import "./globals.css";

/*
 * Aucune police n'est choisie ici. La typographie de la boutique appartient à la
 * phase 2, avec l'identité visuelle. Le rendu se fait d'ici là sur la pile
 * système, ce qui évite de figer un choix par défaut du générateur.
 */

export const metadata: Metadata = {
  title: "Lune & Soleil, bijoux artisanaux faits main",
  description:
    "Bijoux artisanaux faits main, créés à l'unité. Boutique en cours de construction.",
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
