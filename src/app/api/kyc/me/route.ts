import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json } from "@/lib/server/crypto-utils";
import { sellerForOwner, missingRequirements } from "@/lib/server/kyc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/kyc/me — estado de mi verificación (sin datos sensibles). */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  const snap = await adminDb().collection("sellers").doc(user.uid).get();
  if (!snap.exists) return json({ status: "none", termsVersion: "2026-11-v1" });
  const view = sellerForOwner(snap.data() as Record<string, unknown>);
  return json({ ...view, missing: missingRequirements(snap.data() as Record<string, unknown>) });
}
