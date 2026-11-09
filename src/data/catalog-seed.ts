/**
 * Catálogo inicial de la demo HaïtiShop.
 *
 * Los datos viven en catalog-seed.json (mismo fichero que lee
 * scripts/seed-firestore.mjs para publicarlos en Firestore).
 *
 * Las imágenes ya están alojadas en Cloudinary (cloud dcclzhsim,
 * carpeta haitishop-demo/products) con entrega optimizada f_auto,q_auto.
 */
import seedJson from "./catalog-seed.json";

export interface SeedProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  stock: number;
  location: string;
  sellerId: string;
  sellerName: string;
  brand?: string;
  imageUrl: string;
  imagePublicId: string;
  imageProvider: string;
  active: boolean;
  createdAt?: { seconds?: number };
}

export const SEED_PRODUCTS = seedJson as SeedProduct[];
