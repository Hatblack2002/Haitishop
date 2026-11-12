import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";
import { hmacHex, safeEqual } from "./kyc";

/**
 * Almacenamiento privado de documentos KYC SIN buckets públicos:
 * cada archivo se divide en trozos, se cifra con AES-256-GCM (clave del entorno)
 * y se guarda en Firestore (kycFiles/{id} + subcolección chunks). Nada es
 * público ni accesible por URL directa.
 *
 * Lectura: SOLO mediante enlaces firmados HMAC-SHA256 con caducidad (10 min)
 * que genera la API de administración y registra cada apertura.
 * Alternativa futura (si el proyecto activa facturación GCP): mismo módulo
 * apuntando a un bucket privado; la capa de enlaces no cambia.
 */

const CHUNK_PLAINTEXT = 600_000; // bytes en claro por trozo (el doc queda << 1 MB)
export const KYC_MAX_BYTES = 5 * 1024 * 1024;
export const KYC_ALLOWED_MIME = ["image/jpeg", "image/png", "application/pdf"] as const;

function fileKey(): Buffer {
  const base = process.env.ESCROW_ENC_KEY || process.env.FIREBASE_PRIVATE_KEY || "haitishop-fallback";
  return crypto.createHash("sha256").update("haitishop-kycfiles-v1:" + base, "utf8").digest();
}

function encryptChunk(plain: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", fileKey(), iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

function decryptChunk(blob: Buffer): Buffer {
  const iv = blob.subarray(0, 12), tag = blob.subarray(12, 28), data = blob.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", fileKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export type StoredFile = { id: string; mime: string; size: number; chunks: number; sha256: string };

export async function putKycFile(
  uid: string, kind: string, data: Buffer, mime: string, name = ""
): Promise<StoredFile> {
  const sha256 = crypto.createHash("sha256").update(data).digest("hex");
  const id = crypto.randomBytes(12).toString("hex");
  const chunks = Math.max(1, Math.ceil(data.length / CHUNK_PLAINTEXT));
  const batch = adminDb().batch();
  batch.set(adminDb().collection("kycFiles").doc(id), {
    uid, kind, mime, size: data.length, chunks, sha256,
    name: String(name || "").slice(0, 80),
    createdAt: FieldValue.serverTimestamp()
  });
  for (let i = 0; i < chunks; i++) {
    const piece = data.subarray(i * CHUNK_PLAINTEXT, (i + 1) * CHUNK_PLAINTEXT);
    batch.set(adminDb().collection("kycFiles").doc(id).collection("chunks").doc(String(i)), {
      data: encryptChunk(piece)
    });
  }
  await batch.commit();
  return { id, mime, size: data.length, chunks, sha256 };
}

export async function getKycFile(fileId: string): Promise<{
  buffer: Buffer; mime: string; name: string; uid: string; kind: string;
} | null> {
  const meta = await adminDb().collection("kycFiles").doc(fileId).get();
  if (!meta.exists) return null;
  const m = meta.data() as Record<string, unknown>;
  const chunksSnap = await meta.ref.collection("chunks").get();
  const parts: Buffer[] = [];
  const byIndex = new Map<number, Buffer>();
  chunksSnap.forEach((c) => {
    const raw = c.get("data") as Buffer;
    byIndex.set(Number(c.id), decryptChunk(raw));
  });
  for (let i = 0; i < Number(m.chunks || 0); i++) {
    const piece = byIndex.get(i);
    if (!piece) return null;
    parts.push(piece);
  }
  return {
    buffer: Buffer.concat(parts),
    mime: String(m.mime || "application/octet-stream"),
    name: String(m.name || "document"),
    uid: String(m.uid || ""), kind: String(m.kind || "")
  };
}

export async function deleteKycFile(fileId: string): Promise<void> {
  const ref = adminDb().collection("kycFiles").doc(fileId);
  const chunks = await ref.collection("chunks").get();
  const batch = adminDb().batch();
  chunks.forEach((c) => batch.delete(c.ref));
  batch.delete(ref);
  await batch.commit().catch(() => undefined);
}

/* ---------------------------------------------- enlaces firmados (10 min) */

export function createDocLink(fileId: string, ttlMs = 10 * 60 * 1000): string {
  const exp = Date.now() + ttlMs;
  const sig = hmacHex(`doc:${fileId}:${exp}`);
  return `/api/kyc/document/${fileId}?exp=${exp}&sig=${sig}`;
}

export function verifyDocLink(fileId: string, exp: string | null, sig: string | null): boolean {
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now() || expNum > Date.now() + 24 * 3600 * 1000) return false;
  return safeEqual(hmacHex(`doc:${fileId}:${expNum}`), String(sig || ""));
}
