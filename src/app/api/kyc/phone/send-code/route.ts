import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json, sha256Hex, decryptCode } from "@/lib/server/crypto-utils";
import { rateLimit } from "@/lib/server/rate-limit";
import {
  CODE_TTL_MS, MAX_SENDS_PER_HOUR, isPhoneTaken, isPayoutNumberTaken,
  logKycAudit, maskPhone, normalizePhone
} from "@/lib/server/kyc";
import { sendVerificationCode } from "@/lib/server/sms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = { purpose?: string; phone?: string };

/**
 * POST /api/kyc/phone/send-code — envía un código de 6 dígitos por WhatsApp
 * (plantilla Authentication de la WhatsApp Business Cloud API de Meta).
 * - Caduca en 10 minutos, máx 5 intentos de verificación, máx 3 envíos por hora.
 * - seller_phone : verifica el teléfono del vendedor (se guarda en su perfil).
 * - payout_phone : verifica el número de pago MonCash/NatCash guardado.
 * - Si la entrega falla, se reembolsa el envío consumido y al usuario solo se
 *   le informa con un mensaje genérico (sin detalles del proveedor).
 */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  if (!rateLimit(req, "kyc-send-code", 12, 60 * 60 * 1000)) {
    return json({ error: "Trop de tentatives. Réessayez plus tard." }, 429);
  }

  let body: Body;
  try { body = await req.json() as Body; } catch { return json({ error: "Requête invalide." }, 400); }
  const purpose = String(body.purpose || "");
  if (!["seller_phone", "payout_phone"].includes(purpose)) {
    return json({ error: "Objet de vérification inconnu." }, 400);
  }

  const sellerRef = adminDb().collection("sellers").doc(user.uid);
  const sellerSnap = await sellerRef.get();
  if (!sellerSnap.exists) return json({ error: "Complétez d'abord votre profil de vendeur." }, 400);

  let phone: string | null = null;
  if (purpose === "seller_phone") {
    const raw = String(body.phone || "").trim();
    if (raw) {
      phone = normalizePhone(raw);
      if (!phone) return json({ error: "Numéro haïtien invalide. Format : +509 3/4XX XXXX." }, 400);
      if (await isPhoneTaken(phone, user.uid)) {
        await logKycAudit({ sellerId: user.uid, type: "fraud_signal", actor: "system", note: "Téléphone déjà utilisé par un autre compte." });
        return json({ error: "Ce téléphone est déjà associé à un autre compte vendeur." }, 409);
      }
      await sellerRef.set({ phone, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else {
      phone = String((sellerSnap.data() || {}).phone || "") || null;
      if (!phone) return json({ error: "Indiquez votre numéro de téléphone." }, 400);
    }
  } else {
    // El número de pago se descifra SOLO en memoria para enviar el código por WhatsApp
    // (nunca se guarda en claro en la base de datos).
    const enc = String((sellerSnap.data() || {}).payoutNumberEnc || "");
    const payoutPhone = enc ? decryptCode(enc) : null;
    if (!payoutPhone) return json({ error: "Enregistrez d'abord votre numéro de paiement." }, 400);
    phone = payoutPhone;
    if (await isPayoutNumberTaken(phone, user.uid)) {
      await logKycAudit({ sellerId: user.uid, type: "fraud_signal", actor: "system", note: "Numéro de paiement déjà utilisé par un autre compte." });
      return json({ error: "Ce numéro de paiement est déjà associé à un autre compte vendeur." }, 409);
    }
  }

  // Máximo 3 envíos por hora por usuario y propósito (persistente, serverless-safe).
  const limitRef = adminDb().collection("kycRateLimits").doc(`${user.uid}_${purpose}_send`);
  const allowed = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(limitRef);
    const now = Date.now();
    const data = snap.exists ? snap.data() as Record<string, unknown> : {};
    const windowStart = Number(data.windowStart || 0);
    const count = Number(data.count || 0);
    if (!windowStart || now - windowStart > 3600 * 1000) {
      tx.set(limitRef, { windowStart: now, count: 1 });
      return true;
    }
    if (count >= MAX_SENDS_PER_HOUR) return false;
    tx.set(limitRef, { windowStart, count: count + 1 });
    return true;
  });
  if (!allowed) {
    return json({ error: "Maximum 3 envois par heure. Réessayez plus tard." }, 429);
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  const codeDoc = adminDb().collection("kycPhoneCodes").doc(`${user.uid}__${purpose}`);
  await codeDoc.set({
    uid: user.uid, purpose, phone, phoneMasked: maskPhone(phone),
    codeHash: sha256Hex(code + ":" + user.uid),
    expiresAt, attempts: 0, usedAt: null,
    createdAt: FieldValue.serverTimestamp()
  });

  const result = await sendVerificationCode(phone, code);
  await logKycAudit({
    sellerId: user.uid, type: "code_sent", actor: "system",
    note: `Purpose ${purpose} → ${maskPhone(phone)}. ${result.devMode ? "MODE DÉVELOPPEMENT (WhatsApp non configuré)." : result.sent ? "Message WhatsApp envoyé." : "Échec d'envoi WhatsApp."}`
  });

  if (!result.sent && !result.devMode) {
    // Entrega fallida: se reembolsa uno de los 3 envíos de la hora para no
    // penalizar al vendedor por un fallo del proveedor.
    await adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(limitRef);
      if (!snap.exists) return;
      const count = Number((snap.data() || {}).count || 0);
      tx.set(limitRef, { windowStart: Number((snap.data() || {}).windowStart || Date.now()), count: Math.max(count - 1, 0) });
    }).catch(() => undefined);
    // Mensaje genérico: sin detalles del proveedor ni del destinatario.
    return json({ error: "Le code n'a pas pu être envoyé pour le moment. Réessayez dans quelques minutes." }, 503);
  }

  return json({
    ok: true, sent: result.sent, devMode: result.devMode,
    devCode: result.devMode ? code : undefined,   // SOLO desarrollo local
    expiresAt: expiresAt.toISOString(), phoneMasked: maskPhone(phone)
  });
}
