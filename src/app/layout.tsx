import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HaïtiShop — Le marché haïtien en ligne",
  description: "Découvrez les produits des vendeurs locaux partout en Haïti."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
