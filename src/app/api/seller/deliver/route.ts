import { FieldValue } from "firebase-admin/firestore";
import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json, sha256Hex } from "@/lib/server/crypto-utils";
import { rateLimit } from "@/lib/server/rate-limit";
import {
  AUTO_CONFIRM_DELAY_MS, baseUrl, createEscrowToken, logEvent
} from "@/lib/server/escrow";
import { ADMIN_EMAIL, buildDeliveryMarkedMail, sendMail } from "@/lib/server/mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * El vendedor/repartidor ingresa el código de 6 dígitos al entregar.
 * Máximo 5 intentos fallidos → bloqueo + aviso al admin.
 * La verificación usa el hash SHA-256 (código + id de pedido como sal).
 */
export async function POST(req: Request) {
  if (!rateLimit(req, "deliver", 20, 10 * 60 * 1000)) {
    return json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, 429);
  }
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);

  let body: { orderId?: string; code?: string };
  try { body = await req.json() as typeof body; } catch { return json({ error: "Requête invalide." }, 400); }
  const orderId = String(body.orderId || "");
  const code = String(body.code || "").replace(/\D/g, "");
  if (!orderId || code.length !== 6) return json({ error: "Entrez le code à 6 chiffres fourni par le client." }, 400);

  try {
    const appSnap = await adminDb().collection("sellerApplications").doc(user.uid).get();
    const approved = appSnap.exists && appSnap.get("status") === "approved";
    if (!approved && !user.isAdmin) return json({ error: "Votre compte vendeur doit être approuvé." }, 403);

    const orderRef = adminDb().collection("orders").doc(orderId);
    const outcome = await adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) return { kind: "not_found" as const };
      const order = snap.data() as Record<string, unknown>;
      const sellerIds = (order.sellerIds as string[]) || [];
      if (!sellerIds.includes(user.uid) && !user.isAdmin) return { kind: "forbidden" as const };
      const status = String(order.status);
      if (!["pendiente_pago", "pagado_retenido", "entregado_confirmado"].includes(status)) {
        return { kind: "bad_status" as const, status };
      }
      if (order.codeLocked) return { kind: "locked" as const };
      if (order.deliveredMarkedAt) return { kind: "already" as const };
      const expected = String(order.deliveryCodeHash || "");
      const buyerEmail = String(order.buyerEmail || "");
      if (sha256Hex(code + orderId) === expected) {
        tx.update(orderRef, {
          deliveredMarkedAt: FieldValue.serverTimestamp(),
          codeAttempts: 0,
          ...(status === "entregado_confirmado"
            ? {}
            : { status: "entregado_confirmado", confirmDueAt: new Date(Date.now() + AUTO_CONFIRM_DELAY_MS) })
        });
        return { kind: "ok" as const, buyerEmail, buyerId: String(order.buyerId || ""), alreadyConfirmed: status === "entregado_confirmado" };
      }
      const attempts = Number(order.codeAttempts || 0) + 1;
      const locked = attempts >= 5;
      tx.update(orderRef, { codeAttempts: attempts, codeLocked: locked });
      return { kind: locked ? ("locked_now" as const) : ("wrong" as const), attempts };
    });

    if (outcome.kind === "not_found") return json({ error: "Commande introuvable." }, 404);
    if (outcome.kind === "forbidden") return json({ error: "Cette commande ne contient pas vos produits." }, 403);
    if (outcome.kind === "bad_status") {
      return json({ error: "Livraison impossible : statut actuel « " + outcome.status + " »." }, 400);
    }
    if (outcome.kind === "locked") {
      return json({ error: "Trop d'essais : code bloqué. Contactez l'administration HaïtiShop." }, 403);
    }
    if (outcome.kind === "already") {
      return json({ error: "La livraison de cette commande est déjà marquée." }, 400);
    }
    if (outcome.kind === "wrong") {
      return json({ error: `Code incorrect. Tentative ${outcome.attempts} sur 5.` }, 400);
    }
    if (outcome.kind === "locked_now") {
      const mail = buildDisputeAdminNotice(orderId, outcome.attempts);
      await sendMail({ to: ADMIN_EMAIL, subject: mail.subject, html: mail.html, orderId, template: "admin_notice" });
      await logEvent(orderId, "seller", "code:locked",
        `Código de entrega bloqueado tras ${outcome.attempts} intentos fallidos (vendedor ${user.uid}).`, user.uid);
      return json({ error: "Code incorrect 5 fois : ce code est maintenant bloqué. L'administration a été avertie." }, 403);
    }

    // Éxito: entrega marcada.
    await logEvent(orderId, "seller", "delivery:marked",
      outcome.alreadyConfirmed
        ? "El vendedor marcó la entrega (cliente ya había confirmado)."
        : "El vendedor marcó la entrega con el código. Respuesta del cliente esperada 72 h.", user.uid);
    if (!outcome.alreadyConfirmed && outcome.buyerEmail) {
      const { token } = await createEscrowToken(orderId, outcome.buyerId, "confirmar_entrega");
      const confirmUrl = baseUrl(req) + "/confirmation/" + token;
      const mail = buildDeliveryMarkedMail({ orderId, confirmUrl });
      await sendMail({ to: outcome.buyerEmail, subject: mail.subject, html: mail.html, orderId, template: "delivery_marked" });
    }
    return json({ ok: true, orderId });
  } catch (error) {
    console.error("[seller:deliver]", error);
    return json({ error: "Erreur serveur. Réessayez." }, 500);
  }
}

function buildDisputeAdminNotice(orderId: string, attempts: number) {
  return {
    subject: "Code de livraison bloqué — commande " + orderId,
    html: `<div style="font-family:Arial,sans-serif;"><h2>Alerte sécurité</h2><p>Le code de livraison de la commande <b>${orderId}</b> a été bloqué après <b>${attempts} tentatives</b> incorrectes.</p><p>Vérifiez auprès du client et du vendeur, puis débloquez la commande depuis la base si nécessaire.</p></div>`
  };
}
