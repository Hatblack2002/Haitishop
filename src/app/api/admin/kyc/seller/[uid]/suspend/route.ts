import { FieldValue } from "firebase-admin/firestore";
import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json } from "@/lib/server/crypto-utils";
import { logKycAudit } from "@/lib/server/kyc";
import { buildKycSuspendedMail, sendMail } from "@/lib/server/mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = { action?: string; motivo?: string };

/**
 * POST /api/admin/kyc/seller/[uid]/suspend — suspende (o reactiva) un vendedor.
 * Suspendido: productos ocultos, insignia retirada y pagos pendientes retenidos
 * hasta revisión del administrador (el escrow no libera a vendedores no verificados).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  if (!user.isAdmin) return json({ error: "Accès administrateur requis." }, 403);

  const { uid } = await params;
  let body: Body;
  try { body = await req.json() as Body; } catch { return json({ error: "Requête invalide." }, 400); }
  const action = String(body.action || "suspend");
  const motivo = String(body.motivo || "").trim().slice(0, 500);

  const sellerRef = adminDb().collection("sellers").doc(uid);
  const sellerSnap = await sellerRef.get();
  if (!sellerSnap.exists) return json({ error: "Dossier introuvable." }, 404);
  const seller = (sellerSnap.data() || {}) as Record<string, unknown>;
  const from = String(seller.status || "");

  const products = await adminDb().collection("products").where("sellerId", "==", uid).limit(300).get();

  if (action === "suspend") {
    if (motivo.length < 5) return json({ error: "Motif de suspension obligatoire." }, 400);
    await sellerRef.set({
      status: "suspendido", previousStatus: from,
      suspendedAt: FieldValue.serverTimestamp(), suspendReason: motivo,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await adminDb().collection("sellerProfiles").doc(uid).set({ verified: false }, { merge: true }).catch(() => undefined);
    const batch = adminDb().batch();
    products.forEach((p) => batch.update(p.ref, { sellerVerified: false, active: false }));
    await batch.commit().catch(() => undefined);
    await logKycAudit({ sellerId: uid, type: "status_change", from, to: "suspendido", actor: "admin", actorId: user.uid, note: `Motif : ${motivo}` });
    const mail = buildKycSuspendedMail({ storeName: String(seller.storeName || ""), motivo });
    await sendMail({ to: String(seller.email || ""), subject: mail.subject, html: mail.html, template: "kyc_suspended" });
    return json({ ok: true, status: "suspendido" });
  }

  if (action === "unsuspend") {
    const restored = from === "suspendido" ? String(seller.previousStatus || "verificado") : from;
    const verified = restored === "verificado";
    await sellerRef.set({
      status: restored, suspendedAt: null, suspendReason: null,
      reviewedBy: user.email, updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await adminDb().collection("sellerProfiles").doc(uid).set({ verified }, { merge: true }).catch(() => undefined);
    const batch = adminDb().batch();
    products.forEach((p) => batch.update(p.ref, { sellerVerified: verified, active: verified ? true : p.get("active") }));
    await batch.commit().catch(() => undefined);
    await logKycAudit({ sellerId: uid, type: "status_change", from, to: restored, actor: "admin", actorId: user.uid, note: "Compte réactivé après révision." });
    return json({ ok: true, status: restored });
  }

  return json({ error: "Action inconnue." }, 400);
}
