import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";
import { sha256Hex } from "./crypto-utils";

/**
 * Núcleo del KYC de vendedores (verificación básica de identidad).
 *
 * Estados: registrado → telefono_verificado → documentos_enviados → en_revision → verificado
 * Alternos: rechazado (con motivo y reenvío), suspendido.
 *
 * Seguridad:
 * - Número de documento y número de pago: cifrados (AES-256-GCM) + hash SHA-256
 *   para unicidad. En pantalla solo se muestran los últimos 4 caracteres.
 * - Documentos: trozos cifrados en Firestore privado (kycFiles), accesibles solo
 *   por enlaces firmados HMAC con caducidad de 10 minutos vía API admin.
 * - Historial completo (kycAudit) y registro de aperturas de documentos (kycAccessLog).
 */

export const KYC_STATUSES = [
  "registrado", "telefono_verificado", "documentos_enviados",
  "en_revision", "verificado", "rechazado", "suspendido"
] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export const KYC_LABELS_FR: Record<string, string> = {
  registrado: "Inscription enregistrée",
  telefono_verificado: "Téléphone vérifié",
  documentos_enviados: "Documents envoyés",
  en_revision: "En cours d'examen",
  verificado: "Vendeur vérifié",
  rechazado: "Demande refusée",
  suspendido: "Compte suspendu"
};

export const TERMS_VERSION = "2026-11-v1";
export const MAX_KYC_REJECTIONS = 3;
export const CODE_TTL_MS = 10 * 60 * 1000;          // código de verificación: 10 minutos
export const MAX_CODE_ATTEMPTS = 5;                  // intentos por código
export const MAX_SENDS_PER_HOUR = 3;                 // reenvíos por hora
export const DOC_LINK_TTL_MS = 10 * 60 * 1000;       // enlace de documento: 10 minutos

export const DEPARTMENTS = [
  "Ouest", "Artibonite", "Nord", "Nord-Est", "Nord-Ouest",
  "Centre", "Sud", "Sud-Est", "Grand'Anse", "Nippes"
] as const;

export type DocumentKind = "id_front" | "id_back" | "passport_page" | "selfie";
export const DOCUMENT_KINDS: DocumentKind[] = ["id_front", "id_back", "passport_page", "selfie"];

/** Teléfono haitiano normalizado E.164 (+509 + 8 dígitos, móvil 3/4…). */
export function normalizePhone(raw: string): string | null {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("00509")) digits = digits.slice(5);
  if (digits.startsWith("509")) digits = digits.slice(3);
  if (digits.length !== 8 || !/^[34]\d{7}$/.test(digits)) return null;
  return "+509" + digits;
}

/** Normaliza un número/nombre: mayúsculas y sin espacios (para comparar). */
export function normalizeCode(value: string): string {
  return String(value || "").toUpperCase().replace(/[\s.\-]/g, "");
}

/** En pantalla solo los últimos 4 caracteres. */
export function maskNumber(value: string): string {
  const clean = normalizeCode(value);
  return "•••• " + clean.slice(-4);
}

export function maskPhone(phone: string): string {
  return phone ? "+509 •••• " + phone.slice(-4) : "";
}

/** Clave HMAC para enlaces de documentos (derivada de las claves del entorno). */
function kycHmacKey(): Buffer {
  const base = process.env.ESCROW_ENC_KEY || process.env.FIREBASE_PRIVATE_KEY || "haitishop-fallback";
  return crypto.createHash("sha256").update("haitishop-kyc-v1:" + base, "utf8").digest();
}

export function hmacHex(value: string): string {
  return crypto.createHmac("sha256", kycHmacKey()).update(value).digest("hex");
}

/** Comparación en tiempo constante. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/* --------------------------------------------------------------- auditoría */

export async function logKycAudit(entry: {
  sellerId: string; type: string; from?: string; to?: string;
  actor: "system" | "admin" | "seller"; actorId?: string; note?: string;
}): Promise<void> {
  await adminDb().collection("kycAudit").add({
    ...entry, at: FieldValue.serverTimestamp()
  }).catch(() => undefined);
}

export async function logDocAccess(entry: {
  adminUid: string; adminEmail: string; sellerId: string;
  resources: string[]; action: string; note?: string;
}): Promise<void> {
  await adminDb().collection("kycAccessLog").add({
    ...entry, at: FieldValue.serverTimestamp()
  }).catch(() => undefined);
}

/* ---------------------------------------------------- unicidad antifraude */

async function hashTaken(field: "documentNumberHash" | "payoutNumberHash" | "phone", value: string, exceptUid?: string): Promise<boolean> {
  const snap = await adminDb().collection("sellers").where(field, "==", value).limit(3).get();
  return snap.docs.some((d) => d.id !== exceptUid);
}

export function documentHash(documentNumber: string): string {
  return sha256Hex("kyc-doc:" + normalizeCode(documentNumber));
}

export function payoutHash(payoutNumber: string): string {
  const normalized = normalizePhone(payoutNumber) || "";
  return sha256Hex("kyc-payout:" + (normalized || String(payoutNumber || "").trim()));
}

export async function isDocumentNumberTaken(documentNumber: string, exceptUid?: string): Promise<boolean> {
  return hashTaken("documentNumberHash", documentHash(documentNumber), exceptUid);
}

export async function isPayoutNumberTaken(payoutNumber: string, exceptUid?: string): Promise<boolean> {
  return hashTaken("payoutNumberHash", payoutHash(payoutNumber), exceptUid);
}

export async function isPhoneTaken(phone: string, exceptUid?: string): Promise<boolean> {
  return hashTaken("phone", phone, exceptUid);
}

/* ----------------------------------------------------- vistas sanitizadas */

/** Vista para el PROPIETARIO de la cuenta: sin datos cifrados, números enmascarados. */
export function sellerForOwner(data: Record<string, unknown>): Record<string, unknown> {
  const documents: Record<string, unknown> = {};
  const docs = (data.documents as Record<string, Record<string, unknown>> | undefined) || {};
  for (const [kind, meta] of Object.entries(docs)) {
    documents[kind] = {
      mime: meta.mime, size: meta.size, uploadedAt: meta.uploadedAt || null, name: meta.name || null
    };
  }
  return {
    status: data.status || "registrado",
    statusLabel: KYC_LABELS_FR[String(data.status || "registrado")],
    fullName: data.fullName || "", storeName: data.storeName || "",
    city: data.city || "", department: data.department || "",
    phone: data.phone || null, phoneMasked: maskPhone(String(data.phone || "")),
    phoneVerified: Boolean(data.phoneVerified),
    documentType: data.documentType || null,
    documentMasked: data.documentMasked || null,
    documents,
    payout: data.payoutProvider ? {
      provider: data.payoutProvider,
      masked: data.payoutMasked || null,
      holderName: data.payoutHolderName || "",
      verified: Boolean(data.payoutVerified)
    } : null,
    rejectionReason: data.rejectionReason || null,
    infoRequest: data.infoRequest || null,
    suspendReason: data.suspendReason || null,
    locked: Boolean(data.locked),
    rejections: Number(data.rejections || 0),
    resubmissionCount: Number(data.resubmissionCount || 0),
    termsAccepted: Boolean(data.termsAcceptedAt),
    termsVersion: TERMS_VERSION,
    submittedAt: data.submittedAt || null,
    reviewedAt: data.reviewedAt || null
  };
}

/** Lista de requisitos pendientes para poder enviar a revisión. */
export function missingRequirements(data: Record<string, unknown>): string[] {
  const missing: string[] = [];
  const docs = (data.documents as Record<string, unknown> | undefined) || {};
  if (!data.fullName || !data.storeName || !data.city || !data.department) missing.push("Profil (nom, boutique, ville)");
  if (!data.phoneVerified) missing.push("Vérification du téléphone");
  if (!data.documentType || !data.documentNumberHash) missing.push("Numéro du document d'identité");
  if (data.documentType === "cni" && (!docs.id_front || !docs.id_back)) missing.push("Photos de la CNI (recto/verso)");
  if (data.documentType === "pasaporte" && !docs.passport_page) missing.push("Photo du passeport (page des données)");
  if (!docs.selfie) missing.push("Selfie avec le document");
  if (!data.payoutProvider || !data.payoutVerified) missing.push("Numéro de paiement vérifié (MonCash/NatCash)");
  if (!data.payoutHolderName) missing.push("Nom du titulaire du compte de paiement");
  return missing;
}

/** Vista para el ADMIN: números enmascarados, nunca el valor completo. */
export function sellerForAdmin(data: Record<string, unknown>, uid: string): Record<string, unknown> {
  return {
    uid,
    email: data.email || "",
    fullName: data.fullName || "",
    storeName: data.storeName || "",
    city: data.city || "", department: data.department || "",
    status: data.status || "registrado",
    statusLabel: KYC_LABELS_FR[String(data.status || "registrado")],
    phoneMasked: maskPhone(String(data.phone || "")),
    phoneVerified: Boolean(data.phoneVerified),
    documentType: data.documentType || null,
    documentMasked: data.documentMasked || null,
    documents: docsMeta(data),
    payout: data.payoutProvider ? {
      provider: data.payoutProvider, masked: data.payoutMasked || null,
      holderName: data.payoutHolderName || "", verified: Boolean(data.payoutVerified)
    } : null,
    rejectionReason: data.rejectionReason || null,
    infoRequest: data.infoRequest || null,
    locked: Boolean(data.locked), rejections: Number(data.rejections || 0),
    resubmissionCount: Number(data.resubmissionCount || 0),
    submittedAt: data.submittedAt || null, createdAt: data.createdAt || null,
    reviewedAt: data.reviewedAt || null, reviewedBy: data.reviewedBy || null,
    suspendedAt: data.suspendedAt || null, suspendReason: data.suspendReason || null
  };
}

function docsMeta(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const docs = (data.documents as Record<string, Record<string, unknown>> | undefined) || {};
  for (const [kind, meta] of Object.entries(docs)) {
    out[kind] = { fileId: meta.id, mime: meta.mime, size: meta.size, uploadedAt: meta.uploadedAt || null, name: meta.name || null };
  }
  return out;
}
