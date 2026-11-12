import { FieldValue } from "firebase-admin/firestore";
import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json } from "@/lib/server/crypto-utils";
import { rateLimit } from "@/lib/server/rate-limit";
import { DEPARTMENTS, logKycAudit, sellerForOwner } from "@/lib/server/kyc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = { fullName?: string; storeName?: string; city?: string; department?: string };

/** POST /api/kyc/profile — paso 1: datos básicos de la tienda. */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  if (!rateLimit(req, "kyc-profile", 10, 60 * 60 * 1000)) {
    return json({ error: "Trop de tentatives. Réessayez plus tard." }, 429);
  }

  let body: Body;
  try { body = await req.json() as Body; } catch { return json({ error: "Requête invalide." }, 400); }

  const fullName = String(body.fullName || "").trim().slice(0, 80);
  const storeName = String(body.storeName || "").trim().slice(0, 80);
  const city = String(body.city || "").trim().slice(0, 60);
  const department = String(body.department || "").trim();
  if (fullName.length < 3 || storeName.length < 2 || city.length < 2) {
    return json({ error: "Nom complet, boutique et ville sont requis." }, 400);
  }
  if (!(DEPARTMENTS as readonly string[]).includes(department)) {
    return json({ error: "Département invalide." }, 400);
  }

  const ref = adminDb().collection("sellers").doc(user.uid);
  const before = await ref.get();
  const prev = (before.data() || {}) as Record<string, unknown>;
  const prevStatus = String(prev.status || "");
  if (["verificado", "suspendido"].includes(prevStatus)) {
    return json({ error: "Votre profil ne peut plus être modifié ici. Contactez l'administration." }, 403);
  }

  const status = before.exists ? prevStatus || "registrado" : "registrado";
  await ref.set({
    uid: user.uid, email: user.email || "", fullName, storeName, city, department,
    status, createdAt: before.exists ? (prev.createdAt || FieldValue.serverTimestamp()) : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  await logKycAudit({
    sellerId: user.uid, type: "profile_saved",
    from: before.exists ? prevStatus : "(nouveau)", to: status,
    actor: "seller", actorId: user.uid,
    note: `Boutique « ${storeName} », ${city} (${department}).`
  });

  const after = await ref.get();
  return json({ ok: true, seller: sellerForOwner(after.data() as Record<string, unknown>) });
}
