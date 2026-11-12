/**
 * Núcleo del escrow manual de HaïtiShop.
 *
 * Estados: pendiente_pago → pagado_retenido → entregado_confirmado → pago_liberable → pago_liberado
 * Estados paralelos: en_disputa, cancelado (y "awaiting_confirmation" = pedidos del flujo antiguo).
 *
 * Tokens: doc id = SHA-256(token) → un solo get, jamás el token en claro en la BD.
 * Todas las transiciones sensibles van en transacciones de Firestore.
 */

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";
import { randomToken, sha256Hex } from "./crypto-utils";
import {
  ADMIN_EMAIL, buildLiberableMail, sendMail
} from "./mail";

export const ORDER_STATUSES = [
  "pendiente_pago", "pagado_retenido", "entregado_confirmado",
  "pago_liberable", "pago_liberado", "en_disputa", "cancelado"
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number] | "awaiting_confirmation";

export const STATUS_LABELS_FR: Record<string, string> = {
  pendiente_pago: "En attente de paiement",
  pagado_retenido: "Paiement sécurisé (retenue)",
  entregado_confirmado: "Livraison confirmée",
  pago_liberable: "Paiement libérable",
  pago_liberado: "Paiement versé au vendeur",
  en_disputa: "En litige",
  cancelado: "Annulée",
  awaiting_confirmation: "Ancienne commande (flux WhatsApp)"
};

export const CONFIRM_TOKEN_TTL_MS = 14 * 24 * 3600 * 1000;   // 14 días
export const UNDO_TOKEN_TTL_MS = 24 * 3600 * 1000;           // 24 horas
export const UNDO_WINDOW_MS = 24 * 3600 * 1000;              // ventana de anulación
export const AUTO_CONFIRM_DELAY_MS = 72 * 3600 * 1000;       // 72 h tras marca de entrega
export const MAX_CODE_ATTEMPTS = 5;

export function commissionPercent(): number {
  const raw = Number(process.env.ESCROW_COMMISSION_PERCENT);
  return Number.isFinite(raw) && raw > 0 && raw <= 50 ? raw : 5;
}

export type SellerPayout = { sellerId: string; sellerName: string; gross: number; commission: number; payout: number };

/** Reparte el total por vendedor y calcula comisión + monto a transferir. */
export function computeSellerPayouts(items: { sellerId: string; sellerName?: string; price: number; quantity: number }[]): SellerPayout[] {
  const pct = commissionPercent();
  const map = new Map<string, SellerPayout>();
  for (const item of items) {
    const gross = Math.round(item.price * item.quantity);
    const id = item.sellerId || "unknown";
    const entry = map.get(id) || { sellerId: id, sellerName: item.sellerName || "Vendeur HaïtiShop", gross: 0, commission: 0, payout: 0 };
    entry.gross += gross;
    map.set(id, entry);
  }
  for (const entry of map.values()) {
    entry.commission = Math.round((entry.gross * pct) / 100);
    entry.payout = entry.gross - entry.commission;
  }
  return [...map.values()];
}

export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") { const d = new Date(value); return isNaN(d.getTime()) ? null : d; }
  if (typeof value === "number") return new Date(value);
  const ts = value as Timestamp;
  if (typeof ts?.toMillis === "function") return ts.toDate();
  return null;
}

export async function logEvent(orderId: string, actor: "system" | "admin" | "buyer" | "seller", action: string, note = "", actorId = ""): Promise<void> {
  await adminDb().collection("orderEvents").add({
    orderId, actor, actorId, action, note,
    at: FieldValue.serverTimestamp()
  }).catch(() => undefined);
}

export function baseUrl(req: Request): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "haitishop.vercel.app";
  const proto = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return proto + "://" + host;
}

/* ------------------------------------------------------------------ tokens */

export type TokenType = "confirmar_entrega" | "deshacer_confirmacion";

export type TokenRecord = {
  orderId: string; customerId: string; tipo: TokenType;
  expiresAt: Date; usedAt: Date | null; revokedAt: Date | null; createdAt: Date;
};

export async function createEscrowToken(orderId: string, customerId: string, tipo: TokenType): Promise<{ token: string; expiresAt: Date }> {
  // Invalida el token anterior del mismo tipo (revocado).
  const orderRef = adminDb().collection("orders").doc(orderId);
  const orderSnap = await orderRef.get();
  const previousHash = tipo === "confirmar_entrega" ? orderSnap.get("activeConfirmTokenHash") : orderSnap.get("activeUndoTokenHash");
  if (previousHash) {
    await adminDb().collection("escrowTokens").doc(previousHash)
      .set({ revokedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => undefined);
  }
  const token = randomToken();
  const ttl = tipo === "confirmar_entrega" ? CONFIRM_TOKEN_TTL_MS : UNDO_TOKEN_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);
  const hash = sha256Hex(token);
  await adminDb().collection("escrowTokens").doc(hash).set({
    order_id: orderId, customer_id: customerId, token_hash: hash, tipo,
    expiresAt, usedAt: null, revokedAt: null, createdAt: FieldValue.serverTimestamp()
  });
  await orderRef.set(
    tipo === "confirmar_entrega"
      ? { activeConfirmTokenHash: hash, activeConfirmExpiresAt: expiresAt }
      : { activeUndoTokenHash: hash, activeUndoExpiresAt: expiresAt },
    { merge: true }
  );
  return { token, expiresAt };
}

export type TokenLookup =
  | { ok: true; orderId: string; customerId: string }
  | { ok: false; error: "not_found" | "used" | "revoked" | "expired" | "wrong_type" };

export async function lookupToken(token: string, tipo: TokenType): Promise<TokenLookup> {
  const hash = sha256Hex(token);
  const snap = await adminDb().collection("escrowTokens").doc(hash).get();
  if (!snap.exists) return { ok: false, error: "not_found" };
  const data = snap.data() as Record<string, unknown>;
  if (data.tipo !== tipo) return { ok: false, error: "wrong_type" };
  if (toDate(data.usedAt)) return { ok: false, error: "used" };
  if (toDate(data.revokedAt)) return { ok: false, error: "revoked" };
  const expiresAt = toDate(data.expiresAt);
  if (!expiresAt || expiresAt.getTime() < Date.now()) return { ok: false, error: "expired" };
  return { ok: true, orderId: String(data.order_id), customerId: String(data.customer_id) };
}

/* ------------------------------------------------------- transiciones auto */

/** Pasa a pago_liberable un pedido vencido (transacción) y avisa a admin + vendedor. */
export async function transitionToLiberable(orderId: string, reason: "undo_window" | "auto_72h"): Promise<boolean> {
  const orderRef = adminDb().collection("orders").doc(orderId);
  const released = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return false;
    const order = snap.data() as Record<string, unknown>;
    if (order.status !== "entregado_confirmado") return false;
    const now = Date.now();
    const undoDeadline = toDate(order.undoDeadlineAt)?.getTime();
    const confirmDue = toDate(order.confirmDueAt)?.getTime();
    const due = reason === "undo_window" ? undoDeadline : (undoDeadline ?? confirmDue);
    if (!due || due > now) return false;
    tx.update(orderRef, {
      status: "pago_liberable",
      liberableAt: FieldValue.serverTimestamp(),
      liberableReason: reason
    });
    return true;
  });
  if (!released) return false;

  const snap = await adminDb().collection("orders").doc(orderId).get();
  const order = snap.data() as Record<string, unknown> | undefined;
  if (!order) return true;
  const payouts = (order.sellerPayouts as SellerPayout[] | undefined) || [];
  const totalPayout = payouts.reduce((sum, p) => sum + p.payout, 0);
  const sellerNames = payouts.map((p) => p.sellerName).join(", ") || "Vendeur HaïtiShop";
  await logEvent(orderId, "system", "status:pago_liberable",
    reason === "undo_window" ? "Ventana de anulación (24 h) vencida sin litigo." : "72 h sin respuesta del cliente tras entrega.");
  const mail = buildLiberableMail({ orderId, sellerNames, sellerPayout: totalPayout });
  await sendMail({ to: ADMIN_EMAIL, subject: mail.subject, html: mail.html, orderId, template: "payment_liberable" });
  for (const payout of payouts) {
    let sellerEmail = "";
    const kycDoc = await adminDb().collection("sellers").doc(payout.sellerId).get().catch(() => null);
    if (kycDoc && kycDoc.exists) sellerEmail = String(kycDoc.get("email") || "");
    if (!sellerEmail) {
      const legacyDoc = await adminDb().collection("sellerApplications").doc(payout.sellerId).get().catch(() => null);
      sellerEmail = String(legacyDoc?.get("email") || "");
    }
    if (sellerEmail) await sendMail({ to: sellerEmail, subject: mail.subject, html: mail.html, orderId, template: "payment_liberable" });
  }
  return true;
}

/**
 * Aplica las transiciones vencidas de un pedido (se llama en cada lectura
 * server-side). Devuelve el estado efectivo actual.
 */
export async function applyDueTransitions(orderId: string, order: Record<string, unknown>): Promise<string> {
  if (order.status !== "entregado_confirmado") return String(order.status);
  const undoDeadline = toDate(order.undoDeadlineAt)?.getTime();
  const confirmDue = toDate(order.confirmDueAt)?.getTime();
  const now = Date.now();
  if ((undoDeadline && undoDeadline <= now) || (!undoDeadline && confirmDue && confirmDue <= now)) {
    const done = await transitionToLiberable(orderId, undoDeadline && undoDeadline <= now ? "undo_window" : "auto_72h");
    return done ? "pago_liberable" : String(order.status);
  }
  return String(order.status);
}

/** Tick global (cron / botón admin): procesa todos los pedidos vencidos. */
export async function escrowTick(): Promise<{ processed: number; released: string[] }> {
  const now = Date.now();
  const snap = await adminDb().collection("orders")
    .where("status", "==", "entregado_confirmado").limit(200).get();
  const ids: string[] = [];
  snap.forEach((d) => {
    const data = d.data();
    const undoDeadline = toDate(data.undoDeadlineAt)?.getTime();
    const confirmDue = toDate(data.confirmDueAt)?.getTime();
    if ((undoDeadline && undoDeadline <= now) || (!undoDeadline && confirmDue && confirmDue <= now)) ids.push(d.id);
  });
  const released: string[] = [];
  for (const id of ids) {
    if (await transitionToLiberable(id, "undo_window")) released.push(id);
    else if (await transitionToLiberable(id, "auto_72h")) released.push(id);
  }
  return { processed: ids.length, released };
}
