import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json } from "@/lib/server/crypto-utils";
import { KYC_LABELS_FR, sellerForAdmin } from "@/lib/server/kyc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/kyc/queue?status=en_revision — cola de expedientes por estado,
 * los más antiguos primero, con antigüedad en días. Solo administradores.
 */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  if (!user.isAdmin) return json({ error: "Accès administrateur requis." }, 403);

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "en_revision";
  const base = adminDb().collection("sellers");
  const q = status === "all"
    ? base.orderBy("submittedAt", "asc").limit(100)
    : base.where("status", "==", status).orderBy("submittedAt", "asc").limit(100);

  const snap = await q.get();
  const now = Date.now();
  const sellers = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const submitted = (data.submittedAt as { toDate?: () => Date })?.toDate?.();
    const days = submitted ? Math.floor((now - submitted.getTime()) / 86_400_000) : null;
    return { ...sellerForAdmin(data, d.id), daysWaiting: days };
  });

  return json({
    sellers,
    statusLabel: KYC_LABELS_FR[status] || status,
    count: sellers.length
  });
}
