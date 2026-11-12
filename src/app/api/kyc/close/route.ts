import { FieldValue } from "firebase-admin/firestore";
import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json } from "@/lib/server/crypto-utils";
import { rateLimit } from "@/lib/server/rate-limit";
import { logKycAudit } from "@/lib/server/kyc";
import { deleteKycFile } from "@/lib/server/kyc-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * DELETE /api/kyc/close — el vendedor cierra su cuenta de vendedor:
 * borra TODOS los documentos (retención de datos) y su expediente KYC.
 * El historial de auditoría mínimo se conserva (quién/cuándo, sin documentos).
 */
export async function DELETE(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  if (!rateLimit(req, "kyc-close", 3, 60 * 60 * 1000)) {
    return json({ error: "Trop de tentatives." }, 429);
  }

  const sellerRef = adminDb().collection("sellers").doc(user.uid);
  const sellerSnap = await sellerRef.get();
  if (!sellerSnap.exists) return json({ error: "Aucun dossier vendeur." }, 404);
  const seller = (sellerSnap.data() || {}) as Record<string, unknown>;

  // Borra cada documento cifrado y sus trozos.
  const docs = (seller.documents as Record<string, Record<string, unknown>> | undefined) || {};
  for (const meta of Object.values(docs)) {
    if (meta?.id) await deleteKycFile(String(meta.id));
  }

  // Retira la insignia y oculta sus productos.
  if (seller.status === "verificado") {
    const profiles = adminDb().collection("sellerProfiles").doc(user.uid);
    await profiles.set({ verified: false, closedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => undefined);
    const products = await adminDb().collection("products").where("sellerId", "==", user.uid).limit(300).get();
    const batch = adminDb().batch();
    products.forEach((p) => batch.update(p.ref, { sellerVerified: false, active: false }));
    await batch.commit().catch(() => undefined);
  }

  await sellerRef.delete();
  await adminDb().collection("kycPhoneCodes").doc(`${user.uid}__seller_phone`).delete().catch(() => undefined);
  await adminDb().collection("kycPhoneCodes").doc(`${user.uid}__payout_phone`).delete().catch(() => undefined);

  await logKycAudit({
    sellerId: user.uid, type: "account_closed", from: String(seller.status || ""),
    to: "(supprimé)", actor: "seller", actorId: user.uid,
    note: "Dossier et documents supprimés (politique de rétention)."
  });

  return json({ ok: true });
}
