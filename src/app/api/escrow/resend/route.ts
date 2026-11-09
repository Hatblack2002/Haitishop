import { json } from "@/lib/server/crypto-utils";
import { rateLimit } from "@/lib/server/rate-limit";
import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { baseUrl, createEscrowToken, logEvent } from "@/lib/server/escrow";
import { buildPurchaseMail, sendMail } from "@/lib/server/mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * El cliente pide un nuevo enlace de confirmación desde su cuenta.
 * Invalida el token anterior (revokedAt) y genera uno nuevo (14 días).
 */
export async function POST(req: Request) {
  if (!rateLimit(req, "resend", 5, 10 * 60 * 1000)) {
    return json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, 429);
  }
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);

  let body: { orderId?: string };
  try { body = await req.json() as typeof body; } catch { return json({ error: "Requête invalide." }, 400); }
  const orderId = String(body.orderId || "");
  if (!orderId) return json({ error: "Commande inconnue." }, 400);

  try {
    const orderSnap = await adminDb().collection("orders").doc(orderId).get();
    if (!orderSnap.exists) return json({ error: "Commande introuvable." }, 404);
    const order = orderSnap.data() as Record<string, unknown>;
    if (order.buyerId !== user.uid) return json({ error: "Cette commande ne vous appartient pas." }, 403);
    const status = String(order.status);
    if (!["pendiente_pago", "pagado_retenido", "entregado_confirmado"].includes(status)) {
      return json({ error: "Aucun lien de confirmation n'est nécessaire pour cette commande." }, 400);
    }

    const { token, expiresAt } = await createEscrowToken(orderId, user.uid, "confirmar_entrega");
    const confirmUrl = baseUrl(req) + "/confirmation/" + token;

    if (user.email) {
      const mail = buildPurchaseMail({
        orderId, code: "", confirmUrl,
        items: ((order.items as { name: string; quantity: number; price: number }[]) || []),
        total: Number(order.total) || 0,
        paymentMethod: String(order.paymentMethod || ""),
        deliveryAddress: ""
      });
      await sendMail({ to: user.email, subject: mail.subject, html: mail.html, orderId, template: "purchase" });
    }
    await logEvent(orderId, "buyer", "token:resent",
      "Nuevo enlace de confirmación generado a petición del cliente (anterior invalidado).", user.uid);
    return json({ ok: true, confirmUrl, confirmExpiresAt: expiresAt.toISOString() });
  } catch (error) {
    console.error("[escrow:resend]", error);
    return json({ error: "Erreur serveur. Réessayez." }, 500);
  }
}
