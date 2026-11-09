import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebase-admin";
import { json, sha256Hex } from "@/lib/server/crypto-utils";
import { rateLimit } from "@/lib/server/rate-limit";
import { ADMIN_EMAIL, buildDisputeMail, sendMail } from "@/lib/server/mail";
import { logEvent, lookupToken, toDate } from "@/lib/server/escrow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * "Fue un error" / botón del e-mail de confirmación (token deshacer_confirmacion,
 * 24 h, un solo uso). El pedido pasa a en_disputa y el pago queda retenido.
 */
export async function POST(req: Request) {
  if (!rateLimit(req, "undo", 10, 10 * 60 * 1000)) {
    return json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, 429);
  }
  let body: { token?: string; doubleConfirmed?: boolean };
  try { body = await req.json() as typeof body; } catch { return json({ error: "Requête invalide." }, 400); }
  const token = String(body.token || "");
  if (!token || token.length < 20) return json({ error: "Lien d'annulation invalide." }, 400);
  if (body.doubleConfirmed !== true) {
    return json({ error: "Annulation directe refusée : passez par la page de confirmation." }, 400);
  }

  const lookup = await lookupToken(token, "deshacer_confirmacion");
  if (!lookup.ok) {
    const messages: Record<string, string> = {
      not_found: "Lien d'annulation invalide.",
      wrong_type: "Lien d'annulation invalide.",
      used: "Cette annulation a déjà été utilisée.",
      revoked: "Ce lien a été remplacé.",
      expired: "Le délai de 24 h est dépassé : contactez l'administration pour ouvrir un litige."
    };
    return json({ error: messages[lookup.error] }, 400);
  }

  try {
    const orderRef = adminDb().collection("orders").doc(lookup.orderId);
    const tokenHash = sha256Hex(token);
    const result = await adminDb().runTransaction(async (tx) => {
      const tokenSnap = await tx.get(adminDb().collection("escrowTokens").doc(tokenHash));
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) return { ok: false as const, code: 404, error: "Commande introuvable." };
      const order = orderSnap.data() as Record<string, unknown>;
      if (order.buyerId !== lookup.customerId) {
        return { ok: false as const, code: 403, error: "Ce lien ne correspond pas à ce compte." };
      }
      if (toDate(tokenSnap.get("usedAt")) || toDate(tokenSnap.get("revokedAt"))) {
        return { ok: false as const, code: 400, error: "Cette annulation a déjà été utilisée." };
      }
      const status = String(order.status);
      if (!["entregado_confirmado", "pago_liberable"].includes(status)) {
        return { ok: false as const, code: 400, error: "Cette commande ne peut plus être annulée." };
      }
      if (status === "pago_liberable" && (toDate(order.liberableAt)?.getTime() ?? 0) < Date.now() - 3600 * 1000) {
        return { ok: false as const, code: 400, error: "Le paiement est déjà en préparation : contactez l'administration." };
      }
      const disputeRef = adminDb().collection("disputes").doc(lookup.orderId + "-undo");
      tx.set(disputeRef, {
        orderId: lookup.orderId, type: "undo", openedBy: lookup.customerId,
        openedByEmail: String(order.buyerEmail || ""),
        reason: "Le client a annulé sa confirmation de réception (erreur).", photos: [],
        status: "open", openedAt: FieldValue.serverTimestamp()
      });
      tx.set(tokenSnap.ref, { usedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.update(orderRef, {
        status: "en_disputa", disputedAt: FieldValue.serverTimestamp(),
        disputeId: disputeRef.id, undoDeadlineAt: null, confirmDueAt: null
      });
      return { ok: true as const };
    });

    if (!result.ok) return json({ error: result.error }, result.code);

    const mail = buildDisputeMail({ orderId: lookup.orderId, reason: "Annulation de confirmation (erreur du client)", byAdmin: false });
    await sendMail({ to: ADMIN_EMAIL, subject: mail.subject, html: mail.html, orderId: lookup.orderId, template: "dispute_opened" });
    await logEvent(lookup.orderId, "buyer", "dispute:opened",
      "El cliente anuló su confirmación (enlace de 24 h). Pago retenido, en_disputa.", lookup.customerId);
    return json({ ok: true, orderId: lookup.orderId, status: "en_disputa" });
  } catch (error) {
    console.error("[escrow:undo]", error);
    return json({ error: "Erreur serveur. Réessayez." }, 500);
  }
}
