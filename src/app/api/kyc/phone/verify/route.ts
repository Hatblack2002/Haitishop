import { FieldValue } from "firebase-admin/firestore";
import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json, sha256Hex } from "@/lib/server/crypto-utils";
import { rateLimit } from "@/lib/server/rate-limit";
import { MAX_CODE_ATTEMPTS, logKycAudit, safeEqual } from "@/lib/server/kyc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = { purpose?: string; code?: string };

/**
 * POST /api/kyc/phone/verify — verifica el código de 6 dígitos.
 * Máximo 5 intentos por código; caducado a los 10 minutos; un solo uso.
 */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  if (!rateLimit(req, "kyc-verify", 20, 60 * 60 * 1000)) {
    return json({ error: "Trop de tentatives. Réessayez plus tard." }, 429);
  }

  let body: Body;
  try { body = await req.json() as Body; } catch { return json({ error: "Requête invalide." }, 400); }
  const purpose = String(body.purpose || "");
  const code = String(body.code || "").replace(/\D/g, "");
  if (!["seller_phone", "payout_phone"].includes(purpose) || code.length !== 6) {
    return json({ error: "Code à 6 chiffres requis." }, 400);
  }

  const codeRef = adminDb().collection("kycPhoneCodes").doc(`${user.uid}__${purpose}`);
  const verdict = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(codeRef);
    if (!snap.exists) return { error: "Aucun code actif. Demandez un nouveau code.", status: 400 };
    const data = snap.data() as Record<string, unknown>;
    if (data.uid !== user.uid) return { error: "Code invalide.", status: 403 };
    const attempts = Number(data.attempts || 0);
    if (data.usedAt) return { error: "Ce code a déjà été utilisé. Demandez un nouveau code.", status: 400 };
    if (attempts >= MAX_CODE_ATTEMPTS) {
      return { error: "Trop de tentatives. Demandez un nouveau code.", status: 429, locked: true };
    }
    const expiresAt = (data.expiresAt as { toDate?: () => Date })?.toDate?.() as Date | undefined;
    if (!expiresAt || expiresAt.getTime() < Date.now()) {
      return { error: "Code expiré. Demandez un nouveau code.", status: 400 };
    }
    if (!safeEqual(String(data.codeHash || ""), sha256Hex(code + ":" + user.uid))) {
      tx.update(codeRef, { attempts: attempts + 1 });
      const left = MAX_CODE_ATTEMPTS - attempts - 1;
      return { error: `Code incorrect. Essais restants : ${Math.max(left, 0)}.`, status: 400, wrong: true, attempts: attempts + 1 };
    }
    tx.update(codeRef, { usedAt: FieldValue.serverTimestamp(), attempts: attempts + 1 });
    return { ok: true as const, phone: String(data.phone || "") };
  });

  if (!verdict.ok) {
    if (verdict.locked || (verdict.wrong && Number(verdict.attempts) >= MAX_CODE_ATTEMPTS)) {
      await logKycAudit({ sellerId: user.uid, type: "code_locked", actor: "system", note: `Purpose ${purpose} : ${MAX_CODE_ATTEMPTS} tentatives.` });
      await adminDb().collection("kycAudit").add({
        sellerId: user.uid, type: "admin_alert", actor: "system",
        note: `Code de vérification bloqué (${purpose}) après ${MAX_CODE_ATTEMPTS} tentatives.`,
        at: FieldValue.serverTimestamp()
      }).catch(() => undefined);
    }
    return json({ error: verdict.error }, verdict.status);
  }

  // Éxito: marca la verificación según el propósito.
  const sellerRef = adminDb().collection("sellers").doc(user.uid);
  if (purpose === "seller_phone") {
    const before = await sellerRef.get();
    const prevStatus = String((before.data() || {}).status || "");
    const nextStatus = prevStatus === "registrado" ? "telefono_verificado" : prevStatus;
    await sellerRef.set({
      phoneVerified: true, phoneVerifiedAt: FieldValue.serverTimestamp(),
      status: nextStatus, updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await logKycAudit({ sellerId: user.uid, type: "phone_verified", from: prevStatus, to: nextStatus, actor: "seller", actorId: user.uid });
  } else {
    const before = await sellerRef.get();
    const prevStatus = String((before.data() || {}).status || "");
    await sellerRef.set({
      payoutVerified: true, payoutVerifiedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await logKycAudit({ sellerId: user.uid, type: "payout_verified", from: prevStatus, to: prevStatus, actor: "seller", actorId: user.uid });
  }

  return json({ ok: true });
}
