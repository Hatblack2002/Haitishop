import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebase-admin";
import { json, sha256Hex } from "@/lib/server/crypto-utils";
import { rateLimit } from "@/lib/server/rate-limit";
import {
  UNDO_WINDOW_MS, baseUrl, createEscrowToken, logEvent, lookupToken, toDate
} from "@/lib/server/escrow";
import { buildConfirmedMail, sendMail } from "@/lib/server/mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Confirmación de entrega. POST obligatorio (nunca GET) — el enlace del e-mail
 * solo abre la página intermedia; la confirmación llega aquí con el botón
 * pulsado dos veces por el cliente y se revalida todo en el servidor.
 */
export async function POST(req: Request) {
  if (!rateLimit(req, "confirm", 10, 10 * 60 * 1000)) {
    return json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, 429);
  }
  let body: { token?: string; doubleConfirmed?: boolean };
  try { body = await req.json() as typeof body; } catch { return json({ error: "Requête invalide." }, 400); }
  const token = String(body.token || "");
  if (!token || token.length < 20) return json({ error: "Lien de confirmation invalide." }, 400);
  if (body.doubleConfirmed !== true) {
    return json({ error: "Confirmation directe refusée : passez par la page de confirmation." }, 400);
  }

  const lookup = await lookupToken(token, "confirmar_entrega");
  if (!lookup.ok) {
    const messages: Record<string, string> = {
      not_found: "Lien de confirmation invalide.",
      wrong_type: "Lien de confirmation invalide.",
      used: "Ce paiement a déjà été confirmé.",
      revoked: "Ce lien a été remplacé. Demandez un nouveau lien depuis votre compte.",
      expired: "Ce lien a expiré. Demandez un nouveau lien depuis votre compte."
    };
    return json({ error: messages[lookup.error] }, 400);
  }

  try {
    const orderRef = adminDb().collection("orders").doc(lookup.orderId);
    const tokenHash = sha256Hex(token);
    const result = await adminDb().runTransaction(async (tx) => {
      const tokenSnap = await tx.get(adminDb().collection("escrowTokens").doc(tokenHash));
      const orderSnap = await tx.get(orderRef);
      if (!tokenSnap.exists || !orderSnap.exists) return { ok: false as const, code: 404, error: "Commande introuvable." };
      const tokenData = tokenSnap.data() as Record<string, unknown>;
      const order = orderSnap.data() as Record<string, unknown>;
      if (toDate(tokenData.usedAt) || toDate(tokenData.revokedAt) || (toDate(tokenData.expiresAt)?.getTime() ?? 0) < Date.now()) {
        return { ok: false as const, code: 400, error: "Ce lien n'est plus utilisable." };
      }
      if (tokenData.customer_id !== order.buyerId) {
        return { ok: false as const, code: 403, error: "Ce lien ne correspond pas à ce compte." };
      }
      const status = String(order.status);
      if (["pago_liberable", "pago_liberado", "cancelado"].includes(status) || toDate(order.confirmedAt)) {
        return { ok: false as const, code: 400, error: "Ce paiement a déjà été confirmé." };
      }
      if (status === "en_disputa") {
        return { ok: false as const, code: 400, error: "Cette commande est en litige : contactez l'administration." };
      }
      if (!["pagado_retenido", "entregado_confirmado", "pendiente_pago"].includes(status)) {
        return { ok: false as const, code: 400, error: "Cette commande ne peut pas être confirmée pour le moment." };
      }
      tx.set(tokenSnap.ref, { usedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.update(orderRef, {
        status: "entregado_confirmado",
        confirmedAt: FieldValue.serverTimestamp(),
        undoDeadlineAt: new Date(Date.now() + UNDO_WINDOW_MS),
        confirmDueAt: null
      });
      return {
        ok: true as const,
        buyerEmail: String(order.buyerEmail || ""),
        total: Number(order.total) || 0,
        items: (order.items as { name: string; quantity: number; price: number }[]) || []
      };
    });

    if (!result.ok) return json({ error: result.error }, result.code);

    // Enlace de anulación (24 h) para el e-mail "Tu as confirmé la réception".
    const undo = await createEscrowToken(lookup.orderId, lookup.customerId, "deshacer_confirmacion");
    const undoUrl = baseUrl(req) + "/confirmation/" + undo.token;
    if (result.buyerEmail) {
      const mail = buildConfirmedMail({
        orderId: lookup.orderId, undoUrl,
        items: result.items.map(({ name, quantity, price }) => ({ name, quantity, price })),
        total: result.total
      });
      await sendMail({ to: result.buyerEmail, subject: mail.subject, html: mail.html, orderId: lookup.orderId, template: "confirmed_with_undo" });
    }
    await logEvent(lookup.orderId, "buyer", "delivery:confirmed",
      "Cliente confirmó la entrega (doble confirmación). Ventana de anulación: 24 h.", lookup.customerId);
    return json({ ok: true, orderId: lookup.orderId, undoDeadlineHours: 24 });
  } catch (error) {
    console.error("[escrow:confirm]", error);
    return json({ error: "Erreur serveur. Réessayez." }, 500);
  }
}
