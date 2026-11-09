import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://haitishop.vercel.app"),
  title: "HaïtiShop — Le marché haïtien en ligne",
  description: "Découvrez et achetez les produits des vendeurs locaux partout en Haïti. Prix en gourdes (HTG), commande simple et confirmation par WhatsApp.",
  keywords: ["HaïtiShop", "marketplace Haïti", "commerce local Haïti", "acheter en Haïti", "vendeurs haïtiens", "HTG"],
  openGraph: {
    title: "HaïtiShop — Le marché haïtien en ligne",
    description: "Des produits proposés par des commerçants en Haïti. Prix en gourdes (HTG), commande simple.",
    url: "https://haitishop.vercel.app",
    siteName: "HaïtiShop",
    locale: "fr_HT",
    type: "website",
    images: [{ url: "https://res.cloudinary.com/dcclzhsim/image/upload/q_auto:best/copy_of_file_000000004b4481f5856e94a87bad615e_awp5pa.png", width: 512, height: 512, alt: "HaïtiShop" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "HaïtiShop — Le marché haïtien en ligne",
    description: "Le commerce local, partout en Haïti."
  }
};

export const viewport: Viewport = { themeColor: "#12305c" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
