import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json } from "@/lib/server/crypto-utils";
import { STATUS_LABELS_FR, applyDueTransitions, toDate } from "@/lib/server/escrow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Lista completa de pedidos para el admin, con montos por vendedor. */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  if (!user.isAdmin) return json({ error: "Accès administrateur requis." }, 403);

  const statusFilter = new URL(req.url).searchParams.get("status") || "";
  try {
    const snap = await adminDb().collection("orders").limit(200).get();
    const docs: { id: string; data: Record<string, unknown> }[] = [];
    snap.forEach((d) => docs.push({ id: d.id, data: d.data() as Record<string, unknown> }));
    docs.sort((a, b) => (toDate(b.data.createdAt)?.getTime() ?? 0) - (toDate(a.data.createdAt)?.getTime() ?? 0));

    const orders = [];
    for (const { id, data } of docs) {
      const status = await applyDueTransitions(id, data);
      if (statusFilter && status !== statusFilter) continue;
      orders.push({
        id, status, statusLabel: STATUS_LABELS_FR[status] || status,
        buyerEmail: data.buyerEmail ?? "", phone: data.phone ?? "", address: data.address ?? "",
        paymentMethod: data.paymentMethod ?? "",
        createdAt: toDate(data.createdAt)?.toISOString() ?? null,
        total: Number(data.total) || 0,
        commissionTotal: Number(data.commissionTotal) || 0,
        payoutTotal: Number(data.payoutTotal) || 0,
        sellerPayouts: data.sellerPayouts || [],
        items: data.items || [],
        codeLocked: Boolean(data.codeLocked),
        codeAttempts: Number(data.codeAttempts || 0),
        deliveredMarkedAt: toDate(data.deliveredMarkedAt)?.toISOString() ?? null,
        confirmedAt: toDate(data.confirmedAt)?.toISOString() ?? null,
        paidAt: toDate(data.paidAt)?.toISOString() ?? null,
        liberableAt: toDate(data.liberableAt)?.toISOString() ?? null,
        releasedAt: toDate(data.releasedAt)?.toISOString() ?? null,
        disputedAt: toDate(data.disputedAt)?.toISOString() ?? null
      });
    }
    return json({ orders });
  } catch (error) {
    console.error("[admin:orders]", error);
    return json({ error: "Erreur chargement des commandes." }, 500);
  }
}
