import { FieldValue } from "firebase-admin/firestore";
import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json } from "@/lib/server/crypto-utils";
import { logEvent } from "@/lib/server/escrow";
import { buildReleasedMail, sendMail } from "@/lib/server/mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Acciones manuales del admin sobre el pago:
 *  - mark_paid : pendiente_pago → pagado_retenido (pago recibido, queda retenido)
 *  - release   : pago_liberable → pago_liberado (yo transferí al vendedor)
 *  - cancel    : pendiente_pago → cancelado
 */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  if (!user.isAdmin) return json({ error: "Accès administrateur requis." }, 403);

  let body: { orderId?: string; action?: string };
  try { body = await req.json() as typeof body; } catch { return json({ error: "Requête invalide." }, 400); }
  const orderId = String(body.orderId || "");
  const action = String(body.action || "");
  if (!orderId || !["mark_paid", "release", "cancel"].includes(action)) {
    return json({ error: "Action inconnue." }, 400);
  }

  try {
    const orderRef = adminDb().collection("orders").doc(orderId);
    const outcome = await adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) return { ok: false as const, code: 404, error: "Commande introuvable." };
      const order = snap.data() as Record<string, unknown>;
      const status = String(order.status);
      if (action === "mark_paid" && status === "pendiente_pago") {
        tx.update(orderRef, { status: "pagado_retenido", paidAt: FieldValue.serverTimestamp() });
        return { ok: true as const, from: status, to: "pagado_retenido", buyerEmail: String(order.buyerEmail || ""), sellerPayouts: order.sellerPayouts || [], orderId };
      }
      if (action === "release" && status === "pago_liberable") {
        tx.update(orderRef, { status: "pago_liberado", releasedAt: FieldValue.serverTimestamp() });
        return { ok: true as const, from: status, to: "pago_liberado", buyerEmail: String(order.buyerEmail || ""), sellerPayouts: order.sellerPayouts || [], orderId };
      }
      if (action === "cancel" && status === "pendiente_pago") {
        tx.update(orderRef, { status: "cancelado", cancelledAt: FieldValue.serverTimestamp() });
        return { ok: true as const, from: status, to: "cancelado", buyerEmail: String(order.buyerEmail || ""), sellerPayouts: order.sellerPayouts || [], orderId };
      }
      return { ok: false as const, code: 400, error: `Action impossible : le statut actuel est « ${status} ».` };
    });

    if (!outcome.ok) return json({ error: outcome.error }, outcome.code);

    if (action === "release") {
      for (const payout of outcome.sellerPayouts as { sellerId: string; sellerName: string; payout: number }[]) {
        const sellerDoc = await adminDb().collection("sellerApplications").doc(payout.sellerId).get().catch(() => null);
        const sellerEmail = String(sellerDoc?.get("email") || "");
        if (sellerEmail) {
          const mail = buildReleasedMail({ orderId, payout: payout.payout, isSeller: true });
          await sendMail({ to: sellerEmail, subject: mail.subject, html: mail.html, orderId, template: "payment_released" });
        }
      }
      if (outcome.buyerEmail) {
        const totalPayout = (outcome.sellerPayouts as { payout: number }[]).reduce((s, p) => s + p.payout, 0);
        const mail = buildReleasedMail({ orderId, payout: totalPayout, isSeller: false });
        await sendMail({ to: outcome.buyerEmail, subject: mail.subject, html: mail.html, orderId, template: "payment_released" });
      }
    }
    const notes: Record<string, string> = {
      mark_paid: "Pago recibido manualmente → pagado_retenido (fondo retenido).",
      release: "Admin transfirió al vendedor manualmente → pago_liberado.",
      cancel: "Pedido cancelado por admin → cancelado."
    };
    await logEvent(orderId, "admin", "payment:" + action, notes[action], user.uid);
    return json({ ok: true, status: outcome.to });
  } catch (error) {
    console.error("[admin:payment]", error);
    return json({ error: "Erreur serveur." }, 500);
  }
}
