import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json } from "@/lib/server/crypto-utils";
import { logDocAccess, sellerForAdmin } from "@/lib/server/kyc";
import { createDocLink } from "@/lib/server/kyc-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/kyc/seller/[uid] — detalle completo de un expediente:
 * datos del vendedor, enlaces firmados a los documentos (10 min), titulaire
 * del número de pago, checklist y auditoría. CADA apertura se registra
 * (quién, cuándo, qué documentos).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  if (!user.isAdmin) return json({ error: "Accès administrateur requis." }, 403);

  const { uid } = await params;
  const sellerSnap = await adminDb().collection("sellers").doc(uid).get();
  if (!sellerSnap.exists) return json({ error: "Dossier introuvable." }, 404);
  const seller = (sellerSnap.data() || {}) as Record<string, unknown>;

  const docs = (seller.documents as Record<string, Record<string, unknown>> | undefined) || {};
  const documentLinks: Record<string, string> = {};
  for (const [kind, meta] of Object.entries(docs)) {
    if (meta?.id) documentLinks[kind] = createDocLink(String(meta.id));
  }

  await logDocAccess({
    adminUid: user.uid, adminEmail: user.email, sellerId: uid,
    resources: Object.keys(docs), action: "view_detail",
    note: "Detalle del expediente abierto (enlaces firmados generados, 10 min)."
  });

  const auditSnap = await adminDb().collection("kycAudit")
    .where("sellerId", "==", uid).orderBy("at", "desc").limit(20).get().catch(() => null);
  const audit = auditSnap ? auditSnap.docs.map((d) => {
    const a = d.data() as Record<string, unknown>;
    return {
      type: a.type, from: a.from || null, to: a.to || null, actor: a.actor,
      note: a.note || "", at: (a.at as { toDate?: () => Date })?.toDate?.()?.toISOString() || null
    };
  }) : [];

  const accessSnap = await adminDb().collection("kycAccessLog")
    .where("sellerId", "==", uid).orderBy("at", "desc").limit(10).get().catch(() => null);
  const accessLog = accessSnap ? accessSnap.docs.map((d) => {
    const a = d.data() as Record<string, unknown>;
    return {
      adminEmail: a.adminEmail, action: a.action, resources: a.resources,
      at: (a.at as { toDate?: () => Date })?.toDate?.()?.toISOString() || null
    };
  }) : [];

  return json({ seller: sellerForAdmin(seller, uid), documentLinks, audit, accessLog });
}
