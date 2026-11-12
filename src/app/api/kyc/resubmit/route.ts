import { FieldValue } from "firebase-admin/firestore";
import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json } from "@/lib/server/crypto-utils";
import { rateLimit } from "@/lib/server/rate-limit";
import { logKycAudit, missingRequirements, sellerForOwner } from "@/lib/server/kyc";
import { ADMIN_EMAIL, buildKycSubmittedMail, sendMail } from "@/lib/server/mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/kyc/resubmit — reenvía el expediente tras un rechazo (o tras una
 * solicitud de información). Si la cuenta está bloqueada (3 rechazos), solo el
 * administrador puede desbloquearla.
 */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  if (!rateLimit(req, "kyc-resubmit", 6, 60 * 60 * 1000)) {
    return json({ error: "Trop de tentatives. Réessayez plus tard." }, 429);
  }

  const sellerRef = adminDb().collection("sellers").doc(user.uid);
  const sellerSnap = await sellerRef.get();
  if (!sellerSnap.exists) return json({ error: "Aucun dossier vendeur." }, 404);
  const seller = (sellerSnap.data() || {}) as Record<string, unknown>;
  const status = String(seller.status || "");

  if (seller.locked) {
    return json({ error: "Compte bloqué après plusieurs refus. Contactez l'administration." }, 403);
  }
  if (!["rechazado", "en_revision"].includes(status)) {
    return json({ error: "Votre dossier n'est pas dans un état qui permet le renvoi." }, 400);
  }

  const missing = missingRequirements(seller);
  if (missing.length) {
    return json({ error: "Dossier incomplet : " + missing.join(" · "), missing }, 400);
  }

  await sellerRef.set({
    status: "en_revision",
    resubmissionCount: Number(seller.resubmissionCount || 0) + 1,
    rejectionReason: null,
    infoRequest: null,
    submittedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  await logKycAudit({
    sellerId: user.uid, type: "status_change", from: status, to: "en_revision",
    actor: "seller", actorId: user.uid, note: "Dossier renvoyé après correction."
  });

  const mail = buildKycSubmittedMail({
    storeName: String(seller.storeName || ""), sellerEmail: user.email || "",
    fullName: String(seller.fullName || ""), city: String(seller.city || ""), department: String(seller.department || "")
  });
  await sendMail({ to: ADMIN_EMAIL, subject: mail.subject, html: mail.html, template: "kyc_submitted" });

  const after = await sellerRef.get();
  return json({ ok: true, seller: sellerForOwner(after.data() as Record<string, unknown>) });
}
