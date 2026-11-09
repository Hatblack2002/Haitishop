import crypto from "crypto";

/**
 * Utilidades criptográficas del escrow.
 * - Tokens de 256 bits aleatorios (nunca IDs predecibles).
 * - En la base de datos SOLO se guarda el hash SHA-256 del token.
 * - Código de entrega de 6 dígitos: se verifica contra su hash; la copia
 *   legible por el cliente se guarda cifrada (AES-256-GCM) para poder
 *   mostrársela de nuevo en su cuenta sin exponerla al vendedor ni a leaks.
 */

export function randomToken(): string {
  return crypto.randomBytes(32).toString("base64url"); // 43 caracteres URL-safe
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

/** Código de entrega: 6 dígitos aleatorios criptográficos (000000-999999). */
export function randomDeliveryCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function encryptionKey(): Buffer {
  const explicit = process.env.ESCROW_ENC_KEY;
  const base = explicit || (process.env.FIREBASE_PRIVATE_KEY || "haitishop-fallback");
  return crypto.createHash("sha256").update("haitishop-escrow-v1:" + base, "utf8").digest();
}

export function encryptCode(code: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return iv.toString("base64") + "." + cipher.getAuthTag().toString("base64") + "." + enc.toString("base64");
}

export function decryptCode(payload: string | undefined | null): string | null {
  if (!payload) return null;
  try {
    const [ivB64, tagB64, dataB64] = payload.split(".");
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
