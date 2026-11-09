import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json } from "@/lib/server/crypto-utils";
import { applyDueTransitions, toDate } from "@/lib/server/escrow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Ventas del vendedor: pedidos que contienen sus productos (sin datos del cliente). */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);

  try {
    const appSnap = await adminDb().collection("sellerApplications").doc(user.uid).get();
    const approved = appSnap.exists && appSnap.get("status") === "approved";
    if (!approved && !user.isAdmin) return json({ error: "Votre compte vendeur doit être approuvé." }, 403);

    const snap = await adminDb().collection("orders")
      .where("sellerIds", "array-contains", user.uid).limit(50).get();
    const docs: { id: string; data: Record<string, unknown> }[] = [];
    snap.forEach((d) => docs.push({ id: d.id, data: d.data() as Record<string, unknown> }));
    docs.sort((a, b) => (toDate(b.data.createdAt)?.getTime() ?? 0) - (toDate(a.data.createdAt)?.getTime() ?? 0));

    const orders = [];
    for (const { id, data } of docs.slice(0, 25)) {
      const status = await applyDueTransitions(id, data);
      const payout = ((data.sellerPayouts as { sellerId: string; sellerName: string; gross: number; commission: number; payout: number }[]) || [])
        .find((p) => p.sellerId === user.uid);
      orders.push({
        id, status,
        createdAt: toDate(data.createdAt)?.toISOString() ?? null,
        myItems: ((data.items as { name: string; quantity: number; price: number; sellerId: string }[]) || [])
          .filter((i) => i.sellerId === user.uid),
        myGross: payout?.gross ?? 0,
        myCommission: payout?.commission ?? 0,
        myPayout: payout?.payout ?? 0,
        codeLocked: Boolean(data.codeLocked),
        deliveredMarkedAt: toDate(data.deliveredMarkedAt)?.toISOString() ?? null,
        canDeliver: ["pendiente_pago", "pagado_retenido", "entregado_confirmado"].includes(status) &&
          !data.deliveredMarkedAt && !data.codeLocked
      });
    }
    return json({ orders });
  } catch (error) {
    console.error("[seller:orders]", error);
    return json({ error: "Impossible de charger vos ventes." }, 500);
  }
}
