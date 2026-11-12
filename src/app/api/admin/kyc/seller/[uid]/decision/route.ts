import { FieldValue } from "firebase-admin/firestore";
import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json } from "@/lib/server/crypto-utils";
import { MAX_KYC_REJECTIONS, logKycAudit, sellerForAdmin } from "@/lib/server/kyc";
import { buildKycResultMail, sendMail } from "@/lib/server/mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = { action?: string; motivo?: string; nota?: string };

/**
 * POST /api/admin/kyc/seller/[uid]/decision — acciones del admin:
 *  - approve      : en_revision → verificado (insignia + productos activos + pagos permitidos)
 *  - reject       : → rechazado con motivo OBLIGATORIO; 3 rechazos bloquean la cuenta
 *  - request_info : mantiene en_revision con una nota; el vendedor corrige y reenvía
 * En los tres casos se envía el resultado por e-mail al vendedor (francés).
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
  const action = String(body.action || "");
  const motivo = String(body.motivo || "").trim().slice(0, 500);
  const nota = String(body.nota || "").trim().slice(0, 500);
  if (!["approve", "reject", "request_info"].includes(action)) {
    return json({ error: "Action inconnue." }, 400);
  }
  if (action === "reject" && motivo.length < 5) {
    return json({ error: "Motif de refus obligatoire (5 caractères minimum)." }, 400);
  }
  if (action === "request_info" && nota.length < 5) {
    return json({ error: "Indiquez l'information demandée." }, 400);
  }

  const sellerRef = adminDb().collection("sellers").doc(uid);
  const sellerSnap = await sellerRef.get();
  if (!sellerSnap.exists) return json({ error: "Dossier introuvable." }, 404);
  const seller = (sellerSnap.data() || {}) as Record<string, unknown>;
  const from = String(seller.status || "");
  const sellerEmail = String(seller.email || "");

  if (action === "approve") {
    if (!["en_revision", "documentos_enviados", "rechazado"].includes(from)) {
      return json({ error: `Action impossible depuis l'état « ${from} ».` }, 400);
    }
    await sellerRef.set({
      status: "verificado", reviewedAt: FieldValue.serverTimestamp(),
      reviewedBy: user.email, rejectionReason: null, infoRequest: null, locked: false,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await adminDb().collection("sellerProfiles").doc(uid).set({
      uid, displayName: seller.fullName || "", storeName: seller.storeName || "",
      verified: true, approvedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    const products = await adminDb().collection("products").where("sellerId", "==", uid).limit(300).get();
    const batch = adminDb().batch();
    products.forEach((p) => batch.update(p.ref, { sellerVerified: true, active: true }));
    await batch.commit().catch(() => undefined);
    await logKycAudit({ sellerId: uid, type: "status_change", from, to: "verificado", actor: "admin", actorId: user.uid, note: "Dossier approuvé." });
    const mail = buildKycResultMail({ approved: true, storeName: String(seller.storeName || "") });
    await sendMail({ to: sellerEmail, subject: mail.subject, html: mail.html, template: "kyc_result" });
    return json({ ok: true, status: "verificado" });
  }

  if (action === "reject") {
    if (!["en_revision", "documentos_enviados", "registrado", "telefono_verificado"].includes(from)) {
      return json({ error: `Action impossible depuis l'état « ${from} ».` }, 400);
    }
    const rejections = Number(seller.rejections || 0) + 1;
    const locked = rejections >= MAX_KYC_REJECTIONS;
    await sellerRef.set({
      status: "rechazado", rejectionReason: motivo, rejections, locked,
      reviewedAt: FieldValue.serverTimestamp(), reviewedBy: user.email,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await adminDb().collection("sellerProfiles").doc(uid).set({ verified: false }, { merge: true }).catch(() => undefined);
    const products = await adminDb().collection("products").where("sellerId", "==", uid).limit(300).get();
    const batch = adminDb().batch();
    products.forEach((p) => batch.update(p.ref, { sellerVerified: false, active: false }));
    await batch.commit().catch(() => undefined);
    await logKycAudit({
      sellerId: uid, type: "status_change", from, to: "rechazado", actor: "admin", actorId: user.uid,
      note: `Motif : ${motivo}${locked ? " — COMPTE BLOQUÉ (3 refus)." : ""}`
    });
    const mail = buildKycResultMail({ approved: false, storeName: String(seller.storeName || ""), motivo });
    await sendMail({ to: sellerEmail, subject: mail.subject, html: mail.html, template: "kyc_result" });
    return json({ ok: true, status: "rechazado", locked });
  }

  // request_info
  await sellerRef.set({
    status: "en_revision",
    infoRequest: { nota, at: FieldValue.serverTimestamp(), by: user.email },
    reviewedAt: FieldValue.serverTimestamp(), reviewedBy: user.email,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await logKycAudit({ sellerId: uid, type: "info_requested", from, to: "en_revision", actor: "admin", actorId: user.uid, note: nota });
  const mail = buildKycResultMail({ approved: false, storeName: String(seller.storeName || ""), info: nota });
  await sendMail({ to: sellerEmail, subject: mail.subject, html: mail.html, template: "kyc_result" });
  const after = await sellerRef.get();
  return json({ ok: true, status: "en_revision", seller: sellerForAdmin(after.data() as Record<string, unknown>, uid) });
}
