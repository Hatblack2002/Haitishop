import { FieldValue } from "firebase-admin/firestore";
import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json } from "@/lib/server/crypto-utils";
import { rateLimit } from "@/lib/server/rate-limit";
import {
  TERMS_VERSION, logKycAudit, missingRequirements, sellerForOwner
} from "@/lib/server/kyc";
import { ADMIN_EMAIL, buildKycSubmittedMail, sendMail } from "@/lib/server/mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = { acceptTerms?: boolean };

/**
 * POST /api/kyc/submit — acepta términos y envía el expediente a revisión.
 * registrado/telefono_verificado → documentos_enviados → en_revision (auto).
 * Envía un e-mail al administrador con la nueva solicitud.
 */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  if (!rateLimit(req, "kyc-submit", 6, 60 * 60 * 1000)) {
    return json({ error: "Trop de tentatives. Réessayez plus tard." }, 429);
  }

  let body: Body;
  try { body = await req.json() as Body; } catch { return json({ error: "Requête invalide." }, 400); }
  if (body.acceptTerms !== true) {
    return json({ error: "Vous devez accepter les conditions et la politique de confidentialité." }, 400);
  }

  const sellerRef = adminDb().collection("sellers").doc(user.uid);
  const sellerSnap = await sellerRef.get();
  if (!sellerSnap.exists) return json({ error: "Complétez d'abord votre profil de vendeur." }, 400);
  const seller = (sellerSnap.data() || {}) as Record<string, unknown>;
  const status = String(seller.status || "");
  if (status === "suspendido") return json({ error: "Compte suspendu : contactez l'administration." }, 403);
  if (status === "verificado") return json({ error: "Votre compte est déjà vérifié." }, 400);
  if (seller.locked) return json({ error: "Compte bloqué après plusieurs refus. Contactez l'administration." }, 403);

  const missing = missingRequirements(seller);
  if (missing.length) {
    return json({ error: "Dossier incomplet : " + missing.join(" · "), missing }, 400);
  }

  const from = status || "registrado";
  await sellerRef.set({
    status: "en_revision",
    submittedAt: FieldValue.serverTimestamp(),
    termsVersion: TERMS_VERSION,
    termsAcceptedAt: FieldValue.serverTimestamp(),
    rejectionReason: null,
    infoRequest: null,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  await logKycAudit({ sellerId: user.uid, type: "status_change", from, to: "documentos_enviados", actor: "seller", actorId: user.uid, note: "Dossier complet envoyé." });
  await logKycAudit({ sellerId: user.uid, type: "status_change", from: "documentos_enviados", to: "en_revision", actor: "system", note: "File d'examen administrateur." });

  const mail = buildKycSubmittedMail({
    storeName: String(seller.storeName || ""), sellerEmail: user.email || "",
    fullName: String(seller.fullName || ""), city: String(seller.city || ""), department: String(seller.department || "")
  });
  await sendMail({ to: ADMIN_EMAIL, subject: mail.subject, html: mail.html, template: "kyc_submitted" });

  const after = await sellerRef.get();
  return json({ ok: true, seller: sellerForOwner(after.data() as Record<string, unknown>) });
}
