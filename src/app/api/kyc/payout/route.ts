import { FieldValue } from "firebase-admin/firestore";
import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json, encryptCode } from "@/lib/server/crypto-utils";
import { rateLimit } from "@/lib/server/rate-limit";
import {
  isPayoutNumberTaken, logKycAudit, maskNumber, normalizePhone, payoutHash
} from "@/lib/server/kyc";
import { ADMIN_EMAIL, buildKycPayoutChangeMail, sendMail } from "@/lib/server/mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = { provider?: string; number?: string; holderName?: string };

/**
 * POST /api/kyc/payout — registra el número de pago (MonCash/NatCash).
 * El titular lo compara el admin con el documento. El número se verifica por
 * WhatsApp (purpose payout_phone) y se guarda CIFRADO + hash para unicidad.
 * Si un vendedor VERIFICADO cambia el número: vuelve a en_revision (revisión
 * manual) hasta re-verificar por WhatsApp.
 */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  if (!rateLimit(req, "kyc-payout", 10, 60 * 60 * 1000)) {
    return json({ error: "Trop de tentatives. Réessayez plus tard." }, 429);
  }

  let body: Body;
  try { body = await req.json() as Body; } catch { return json({ error: "Requête invalide." }, 400); }
  const provider = String(body.provider || "");
  const holderName = String(body.holderName || "").trim().slice(0, 80);
  if (!["moncash", "natcash"].includes(provider)) {
    return json({ error: "Choisissez MonCash ou NatCash." }, 400);
  }
  const phone = normalizePhone(String(body.number || ""));
  if (!phone) return json({ error: "Numéro de paiement invalide. Format : +509 3/4XX XXXX." }, 400);
  if (holderName.length < 3) return json({ error: "Nom du titulaire requis." }, 400);

  const sellerRef = adminDb().collection("sellers").doc(user.uid);
  const sellerSnap = await sellerRef.get();
  if (!sellerSnap.exists) return json({ error: "Complétez d'abord votre profil de vendeur." }, 400);
  const seller = (sellerSnap.data() || {}) as Record<string, unknown>;
  if (String(seller.status || "") === "suspendido") {
    return json({ error: "Compte suspendu : contactez l'administration." }, 403);
  }
  if (await isPayoutNumberTaken(phone, user.uid)) {
    await logKycAudit({ sellerId: user.uid, type: "fraud_signal", actor: "system", note: "Numéro de paiement déjà utilisé par un autre compte." });
    return json({ error: "Ce numéro de paiement est déjà associé à un autre compte vendeur." }, 409);
  }

  const previousStatus = String(seller.status || "");
  const changedWhileVerified =
    previousStatus === "verificado" && Boolean(seller.payoutVerified) &&
    String(seller.payoutNumberHash || "") !== payoutHash(phone);

  await sellerRef.set({
    payoutProvider: provider,
    payoutNumberEnc: encryptCode(phone),
    payoutNumberHash: payoutHash(phone),
    payoutMasked: maskNumber(phone),
    payoutHolderName: holderName,
    payoutVerified: false,
    ...(changedWhileVerified ? { status: "en_revision" } : {}),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  await logKycAudit({
    sellerId: user.uid, type: changedWhileVerified ? "payout_changed" : "payout_saved",
    from: previousStatus, to: changedWhileVerified ? "en_revision" : previousStatus,
    actor: "seller", actorId: user.uid,
    note: `${provider === "moncash" ? "MonCash" : "NatCash"} ${maskNumber(phone)} — titulaire : ${holderName}.`
  });

  if (changedWhileVerified) {
    const mail = buildKycPayoutChangeMail({ storeName: String(seller.storeName || ""), sellerEmail: user.email || "" });
    await sendMail({ to: ADMIN_EMAIL, subject: mail.subject, html: mail.html, template: "kyc_payout_change" });
  }

  return json({ ok: true, needsVerification: true, masked: maskNumber(phone) });
}
