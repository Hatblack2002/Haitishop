import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebase-admin";
import { json } from "@/lib/server/crypto-utils";
import { rateLimit } from "@/lib/server/rate-limit";
import { ADMIN_EMAIL, buildDisputeMail, sendMail } from "@/lib/server/mail";
import { logEvent, lookupToken, toDate } from "@/lib/server/escrow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** "J'ai un problème" desde la página de confirmación → en_disputa + formulario. */
export async function POST(req: Request) {
  if (!rateLimit(req, "dispute", 10, 10 * 60 * 1000)) {
    return json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, 429);
  }
  let body: { token?: string; reason?: string; photos?: string[] };
  try { body = await req.json() as typeof body; } catch { return json({ error: "Requête invalide." }, 400); }
  const token = String(body.token || "");
  const reason = String(body.reason || "").trim().slice(0, 1000);
  if (!token || token.length < 20) return json({ error: "Lien invalide." }, 400);
  if (reason.length < 10) return json({ error: "Décrivez le problème (10 caractères minimum)." }, 400);
  const photos = (Array.isArray(body.photos) ? body.photos : [])
    .filter((u) => /^https:\/\/res\.cloudinary\.com\//.test(String(u))).slice(0, 3);

  const lookup = await lookupToken(token, "confirmar_entrega");
  if (!lookup.ok) {
    const messages: Record<string, string> = {
      not_found: "Lien invalide.", wrong_type: "Lien invalide.",
      used: "Ce paiement a déjà été confirmé : ouvrez un litige depuis votre compte ou contactez l'administration.",
      revoked: "Ce lien a été remplacé. Demandez un nouveau lien depuis votre compte.",
      expired: "Ce lien a expiré. Demandez un nouveau lien depuis votre compte."
    };
    return json({ error: messages[lookup.error] }, 400);
  }

  try {
    const orderRef = adminDb().collection("orders").doc(lookup.orderId);
    const result = await adminDb().runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) return { ok: false as const, code: 404, error: "Commande introuvable." };
      const order = orderSnap.data() as Record<string, unknown>;
      if (order.buyerId !== lookup.customerId) {
        return { ok: false as const, code: 403, error: "Ce lien ne correspond pas à ce compte." };
      }
      const status = String(order.status);
      if (["pago_liberado", "cancelado"].includes(status)) {
        return { ok: false as const, code: 400, error: "Cette commande est déjà finalisée : contactez l'administration." };
      }
      if (status === "en_disputa") return { ok: true as const, already: true, sellerIds: (order.sellerIds as string[]) || [] };
      if (!["pendiente_pago", "pagado_retenido", "entregado_confirmado", "pago_liberable"].includes(status)) {
        return { ok: false as const, code: 400, error: "Litige impossible pour cette commande." };
      }
      const disputeRef = adminDb().collection("disputes").doc(lookup.orderId + "-problem");
      tx.set(disputeRef, {
        orderId: lookup.orderId, type: "problem", openedBy: lookup.customerId,
        openedByEmail: String(order.buyerEmail || ""), reason, photos,
        status: "open", openedAt: FieldValue.serverTimestamp()
      }, { merge: false });
      tx.update(orderRef, {
        status: "en_disputa", disputedAt: FieldValue.serverTimestamp(),
        disputeId: disputeRef.id, undoDeadlineAt: null, confirmDueAt: null
      });
      return { ok: true as const, already: false, sellerIds: (order.sellerIds as string[]) || [] };
    });

    if (!result.ok) return json({ error: result.error }, result.code);

    const mail = buildDisputeMail({ orderId: lookup.orderId, reason, byAdmin: false });
    await sendMail({ to: ADMIN_EMAIL, subject: mail.subject, html: mail.html, orderId: lookup.orderId, template: "dispute_opened" });
    for (const sellerId of result.sellerIds) {
      const sellerDoc = await adminDb().collection("sellerApplications").doc(sellerId).get().catch(() => null);
      const sellerEmail = String(sellerDoc?.get("email") || "");
      if (sellerEmail) await sendMail({ to: sellerEmail, subject: mail.subject, html: mail.html, orderId: lookup.orderId, template: "dispute_opened" });
    }
    if (!result.already) {
      await logEvent(lookup.orderId, "buyer", "dispute:opened",
        "Cliente abrió un litigio: " + reason.slice(0, 120) + (photos.length ? ` (${photos.length} foto(s))` : ""), lookup.customerId);
    }
    return json({ ok: true, orderId: lookup.orderId, status: "en_disputa", already: result.already });
  } catch (error) {
    console.error("[escrow:dispute]", error);
    return json({ error: "Erreur serveur. Réessayez." }, 500);
  }
}

export async function GET() {
  return json({ error: "Méthode non autorisée." }, 405);
}
