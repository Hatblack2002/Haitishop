import { FieldValue } from "firebase-admin/firestore";
import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { encryptCode, json, randomDeliveryCode, sha256Hex } from "@/lib/server/crypto-utils";
import { rateLimit } from "@/lib/server/rate-limit";
import { baseUrl, commissionPercent, computeSellerPayouts, createEscrowToken, logEvent } from "@/lib/server/escrow";
import { ADMIN_EMAIL, buildPurchaseMail, sendMail } from "@/lib/server/mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = { items?: { productId?: string; quantity?: number }[]; phone?: string; address?: string; paymentMethod?: string };

export async function POST(req: Request) {
  if (!rateLimit(req, "checkout", 6, 10 * 60 * 1000)) {
    return json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, 429);
  }
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous pour finaliser votre commande." }, 401);

  let body: Body;
  try { body = await req.json() as Body; } catch { return json({ error: "Requête invalide." }, 400); }

  const items = (body.items || []).slice(0, 20);
  const phone = String(body.phone || "").trim().slice(0, 40);
  const address = String(body.address || "").trim().slice(0, 300);
  const paymentMethod = String(body.paymentMethod || "").trim().slice(0, 60) || "MonCash (simulation)";
  if (!items.length) return json({ error: "Votre panier est vide." }, 400);
  if (!phone || !address) return json({ error: "Téléphone et adresse de livraison sont requis." }, 400);

  try {
    // Precio y stock SIEMPRE desde el servidor (el cliente no dicta montos).
    const lines: { productId: string; name: string; price: number; quantity: number; sellerId: string; sellerName: string }[] = [];
    for (const item of items) {
      const productId = String(item.productId || "");
      const quantity = Math.floor(Number(item.quantity));
      if (!productId || !Number.isFinite(quantity) || quantity < 1 || quantity > 10) {
        return json({ error: "Quantité invalide." }, 400);
      }
      const snap = await adminDb().collection("products").doc(productId).get();
      if (!snap.exists) return json({ error: "Un produit de votre panier n'existe plus." }, 400);
      const p = snap.data() as Record<string, unknown>;
      if (p.active === false) return json({ error: "Un produit n'est plus disponible : " + String(p.name || "") }, 400);
      if (Number(p.stock) < quantity) {
        return json({ error: "Stock insuffisant pour : " + String(p.name || "produit") }, 400);
      }
      lines.push({
        productId, name: String(p.name || "Produit"), price: Number(p.price) || 0,
        quantity, sellerId: String(p.sellerId || ""), sellerName: String(p.sellerName || "Vendeur HaïtiShop")
      });
    }
    // KYC: solo se compra a vendedores verificados (el catálogo de la casa salta el control).
    const uniqueSellerIds = [...new Set(lines.map((l) => l.sellerId).filter((id) => id && id !== "haitishop-selection"))];
    for (const sellerId of uniqueSellerIds) {
      const sellerSnap = await adminDb().collection("sellers").doc(sellerId).get().catch(() => null);
      if (sellerSnap && sellerSnap.exists && String(sellerSnap.get("status") || "") !== "verificado") {
        return json({ error: "Un produit de votre panier appartient à un vendeur en cours de vérification. Réessayez plus tard." }, 400);
      }
    }
    const total = lines.reduce((sum, l) => sum + Math.round(l.price * l.quantity), 0);
    const sellerPayouts = computeSellerPayouts(lines);
    const commissionTotal = sellerPayouts.reduce((s, p) => s + p.commission, 0);

    const orderRef = adminDb().collection("orders").doc();
    const deliveryCode = randomDeliveryCode();

    await orderRef.set({
      buyerId: user.uid, buyerEmail: user.email, phone, address, paymentMethod,
      status: "pendiente_pago", total, commissionPercent: commissionPercent(),
      commissionTotal, payoutTotal: total - commissionTotal, sellerPayouts,
      sellerIds: [...new Set(lines.map((l) => l.sellerId).filter(Boolean))],
      items: lines,
      deliveryCodeHash: sha256Hex(deliveryCode + orderRef.id),
      deliveryCodeEnc: encryptCode(deliveryCode),
      codeAttempts: 0, codeLocked: false,
      deliveredMarkedAt: null, confirmedAt: null, undoDeadlineAt: null, confirmDueAt: null,
      paidAt: null, liberableAt: null, releasedAt: null, disputedAt: null,
      activeConfirmTokenHash: null, activeUndoTokenHash: null,
      createdAt: FieldValue.serverTimestamp()
    });

    // Token de confirmación de entrega (14 días), guardado SOLO como hash SHA-256.
    const { token, expiresAt } = await createEscrowToken(orderRef.id, user.uid, "confirmar_entrega");

    const confirmUrl = baseUrl(req) + "/confirmation/" + token;
    const mail = buildPurchaseMail({
      orderId: orderRef.id, code: deliveryCode, confirmUrl,
      items: lines.map(({ name, quantity, price }) => ({ name, quantity, price })),
      total, paymentMethod, deliveryAddress: address
    });
    const mailResult = await sendMail({ to: user.email || ADMIN_EMAIL, subject: mail.subject, html: mail.html, orderId: orderRef.id, template: "purchase" });

    await logEvent(orderRef.id, "buyer", "order:created",
      `Commande créée (${paymentMethod}). Code de livraison généré. E-mail : ${mailResult.sent ? "envoyé" : "non configuré"}.`, user.uid);

    return json({
      orderId: orderRef.id, code: deliveryCode, confirmUrl, total,
      commissionTotal, payoutTotal: total - commissionTotal,
      confirmExpiresAt: expiresAt.toISOString(),
      emailSent: mailResult.sent
    });
  } catch (error) {
    console.error("[checkout]", error);
    return json({ error: "Impossible d'enregistrer la commande. Vérifiez la configuration serveur (variables FIREBASE_*)." }, 500);
  }
}
