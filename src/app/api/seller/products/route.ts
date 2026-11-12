import { FieldValue } from "firebase-admin/firestore";
import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json } from "@/lib/server/crypto-utils";
import { rateLimit } from "@/lib/server/rate-limit";
import { logKycAudit } from "@/lib/server/kyc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CATEGORIES = ["Électronique", "Mode", "Maison", "Beauté", "Alimentation", "Construction"];
const CONDITIONS = ["Neuf", "Comme neuf", "Occasion"];

/**
 * POST /api/seller/products — publicación de productos SOLO para vendedores
 * verificados (KYC). Todo server-side: precios/stock validados aquí, foto
 * subida a Cloudinary (carpeta pública de productos) y el documento se crea
 * con sellerVerified: true.
 */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  if (!rateLimit(req, "seller-publish", 20, 60 * 60 * 1000)) {
    return json({ error: "Trop de publications. Réessayez plus tard." }, 429);
  }

  const sellerSnap = await adminDb().collection("sellers").doc(user.uid).get();
  const seller = (sellerSnap.data() || {}) as Record<string, unknown>;
  if (!sellerSnap.exists || String(seller.status || "") !== "verificado") {
    return json({ error: "Votre compte vendeur doit être vérifié (KYC) avant de publier des produits." }, 403);
  }

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "Requête invalide." }, 400); }

  const name = String(form.get("name") || "").trim().slice(0, 100);
  const description = String(form.get("description") || "").trim().slice(0, 1500);
  const category = String(form.get("category") || "");
  const condition = String(form.get("condition") || "");
  const location = String(form.get("location") || "").trim().slice(0, 60);
  const brand = String(form.get("brand") || "").trim().slice(0, 60);
  const variants = String(form.get("variants") || "").trim().slice(0, 200);
  const price = Math.round(Number(form.get("price")));
  const stock = Math.floor(Number(form.get("stock")));

  if (name.length < 3) return json({ error: "Nom du produit requis." }, 400);
  if (description.length < 10) return json({ error: "Description trop courte." }, 400);
  if (!CATEGORIES.includes(category)) return json({ error: "Catégorie invalide." }, 400);
  if (!CONDITIONS.includes(condition)) return json({ error: "État invalide." }, 400);
  if (!location) return json({ error: "Ville / localisation requise." }, 400);
  if (!Number.isFinite(price) || price < 1 || price > 10_000_000) return json({ error: "Prix invalide." }, 400);
  if (!Number.isFinite(stock) || stock < 0 || stock > 10_000) return json({ error: "Stock invalide." }, 400);

  const file = form.get("photo");
  if (!(file instanceof File)) return json({ error: "Ajoutez une photo du produit." }, 400);
  if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
    return json({ error: "Image invalide : formats image, 8 Mo maximum." }, 400);
  }

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "dcclzhsim";
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "haitishop_demo_unsigned";
  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", preset);
  body.append("folder", "haitishop-demo/products");
  const up = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body });
  if (!up.ok) return json({ error: "Cloudinary a refusé l'image. Vérifiez le preset unsigned." }, 502);
  const upData = await up.json() as { secure_url?: string };
  if (!upData.secure_url) return json({ error: "Cloudinary n'a pas retourné d'URL." }, 502);

  const storeName = String(seller.storeName || "") || String(seller.fullName || "") || user.email || "Vendeur HaïtiShop";
  const ref = adminDb().collection("products").doc();
  await ref.set({
    name, description, price, stock, category, condition, location,
    brand, variants, sellerId: user.uid, sellerName: storeName,
    imageUrl: upData.secure_url, active: true, sellerVerified: true,
    createdAt: FieldValue.serverTimestamp()
  });

  await logKycAudit({
    sellerId: user.uid, type: "product_published", actor: "seller", actorId: user.uid,
    note: `« ${name} » à ${price} HTG (stock ${stock}).`
  });

  return json({ ok: true, productId: ref.id });
}
