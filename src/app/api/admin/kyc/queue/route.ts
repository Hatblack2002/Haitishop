import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json } from "@/lib/server/crypto-utils";
import { KYC_LABELS_FR, sellerForAdmin } from "@/lib/server/kyc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/kyc/queue?status=en_revision — cola de expedientes por estado,
 * los más antiguos primero, con antigüedad en días. Solo administradores.
 * Sin orderBy compuesto (no depende de índices de Firestore): se filtra por
 * igualdad y se ordena en memoria.
 */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  if (!user.isAdmin) return json({ error: "Accès administrateur requis." }, 403);

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "en_revision";
  const base = adminDb().collection("sellers");
  const q = status === "all" ? base.limit(200) : base.where("status", "==", status).limit(200);

  const snap = await q.get();
  const ts = (data: Record<string, unknown>): number => {
    const d = (data.submittedAt as { toDate?: () => Date } | undefined)?.toDate?.();
    return d ? d.getTime() : Number.MAX_SAFE_INTEGER; // sin dossier al final
  };
  const now = Date.now();
  const sellers = snap.docs
    .map((d) => ({ d, data: d.data() as Record<string, unknown> }))
    .sort((a, b) => ts(a.data) - ts(b.data))
    .slice(0, 100)
    .map(({ d, data }) => {
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
