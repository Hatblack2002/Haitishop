import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { decryptCode, json } from "@/lib/server/crypto-utils";
import { applyDueTransitions, toDate } from "@/lib/server/escrow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Pedidos del cliente con transiciones vencidas aplicadas y código descifrado. */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);

  try {
    const snap = await adminDb().collection("orders")
      .where("buyerId", "==", user.uid).limit(50).get();
    const now = Date.now();
    const orders: Record<string, unknown>[] = [];
    const docs: { id: string; data: Record<string, unknown> }[] = [];
    snap.forEach((d) => docs.push({ id: d.id, data: d.data() as Record<string, unknown> }));
    docs.sort((a, b) => (toDate(b.data.createdAt)?.getTime() ?? 0) - (toDate(a.data.createdAt)?.getTime() ?? 0));

    for (const { id, data } of docs.slice(0, 30)) {
      const status = await applyDueTransitions(id, data);
      const confirmExpires = toDate(data.activeConfirmExpiresAt);
      const disputeSnap = data.disputeId
        ? await adminDb().collection("disputes").doc(String(data.disputeId)).get().catch(() => null)
        : null;
      orders.push({
        id,
        status,
        createdAt: toDate(data.createdAt)?.toISOString() ?? null,
        total: data.total ?? 0,
        paymentMethod: data.paymentMethod ?? "",
        items: (data.items as { name: string; quantity: number; price: number }[]) || [],
        deliveryCode: decryptCode(String(data.deliveryCodeEnc || "")),
        codeLocked: Boolean(data.codeLocked),
        deliveredMarkedAt: toDate(data.deliveredMarkedAt)?.toISOString() ?? null,
        confirmedAt: toDate(data.confirmedAt)?.toISOString() ?? null,
        dispute: disputeSnap && disputeSnap.exists
          ? { status: disputeSnap.get("status"), type: disputeSnap.get("type") }
          : null,
        confirmLink: {
          active: Boolean(confirmExpires && confirmExpires.getTime() > now &&
            !toDate(data.confirmedAt) && !["pago_liberable", "pago_liberado", "cancelado", "en_disputa"].includes(status)),
          expiresAt: confirmExpires?.toISOString() ?? null
        },
        canResend: ["pendiente_pago", "pagado_retenido", "entregado_confirmado"].includes(status)
      });
    }
    return json({ orders });
  } catch (error) {
    console.error("[orders:mine]", error);
    return json({ error: "Impossible de charger vos commandes (variables FIREBASE_* du serveur ?)." }, 500);
  }
}
