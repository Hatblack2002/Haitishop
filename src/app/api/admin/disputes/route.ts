import { FieldValue } from "firebase-admin/firestore";
import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json } from "@/lib/server/crypto-utils";
import { logEvent } from "@/lib/server/escrow";
import { buildDisputeResolvedMail, sendMail } from "@/lib/server/mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Cola de disputas (GET) y resolución (POST: a favor del vendedor o del cliente). */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  if (!user.isAdmin) return json({ error: "Accès administrateur requis." }, 403);
  try {
    const snap = await adminDb().collection("disputes").limit(100).get();
    const docs: Record<string, unknown>[] = [];
    snap.forEach((d) => docs.push({ id: d.id, ...d.data() }));
    docs.sort((a, b) => String(b.openedAt || "").localeCompare(String(a.openedAt || "")));
    return json({ disputes: docs });
  } catch (error) {
    console.error("[admin:disputes:GET]", error);
    return json({ error: "Erreur chargement des litiges." }, 500);
  }
}

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  if (!user.isAdmin) return json({ error: "Accès administrateur requis." }, 403);

  let body: { disputeId?: string; resolution?: string; note?: string };
  try { body = await req.json() as typeof body; } catch { return json({ error: "Requête invalide." }, 400); }
  const disputeId = String(body.disputeId || "");
  const resolution = String(body.resolution || "");
  const note = String(body.note || "").trim().slice(0, 500);
  if (!disputeId || !["seller", "customer"].includes(resolution)) {
    return json({ error: "Résolution inconnue." }, 400);
  }

  try {
    const disputeRef = adminDb().collection("disputes").doc(disputeId);
    const outcome = await adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(disputeRef);
      if (!snap.exists) return { ok: false as const, code: 404, error: "Litige introuvable." };
      const dispute = snap.data() as Record<string, unknown>;
      if (dispute.status !== "open") return { ok: false as const, code: 400, error: "Ce litige est déjà résolu." };
      const orderRef = adminDb().collection("orders").doc(String(dispute.orderId));
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) return { ok: false as const, code: 404, error: "Commande introuvable." };
      const order = orderSnap.data() as Record<string, unknown>;
      if (String(order.status) !== "en_disputa") {
        return { ok: false as const, code: 400, error: "La commande n'est plus en litige." };
      }
      const forSeller = resolution === "seller";
      tx.update(disputeRef, {
        status: forSeller ? "resolved_seller" : "resolved_customer",
        resolutionNote: note, resolvedBy: user.uid, resolvedAt: FieldValue.serverTimestamp()
      });
      tx.update(orderRef, forSeller
        ? { status: "pago_liberable", liberableAt: FieldValue.serverTimestamp(), liberableReason: "dispute_resolved_seller" }
        : { status: "cancelado", cancelledAt: FieldValue.serverTimestamp(), cancelReason: "dispute_resolved_customer" }
      );
      return {
        ok: true as const, orderId: String(dispute.orderId), forSeller,
        buyerEmail: String(order.buyerEmail || ""), sellerIds: (order.sellerIds as string[]) || []
      };
    });

    if (!outcome.ok) return json({ error: outcome.error }, outcome.code);

    const mail = buildDisputeResolvedMail({ orderId: outcome.orderId, forSeller: outcome.forSeller, note });
    if (outcome.buyerEmail) await sendMail({ to: outcome.buyerEmail, subject: mail.subject, html: mail.html, orderId: outcome.orderId, template: "dispute_resolved" });
    for (const sellerId of outcome.sellerIds) {
      const sellerDoc = await adminDb().collection("sellerApplications").doc(sellerId).get().catch(() => null);
      const sellerEmail = String(sellerDoc?.get("email") || "");
      if (sellerEmail) await sendMail({ to: sellerEmail, subject: mail.subject, html: mail.html, orderId: outcome.orderId, template: "dispute_resolved" });
    }
    await logEvent(outcome.orderId, "admin", "dispute:resolved",
      (outcome.forSeller ? "Resuelto a favor del vendedor → pago_liberable." : "Resuelto a favor del cliente → cancelado (reembolso manual).") + (note ? " Nota: " + note : ""), user.uid);
    return json({ ok: true });
  } catch (error) {
    console.error("[admin:disputes:POST]", error);
    return json({ error: "Erreur serveur." }, 500);
  }
}
