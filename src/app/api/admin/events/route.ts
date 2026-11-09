import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json } from "@/lib/server/crypto-utils";
import { toDate } from "@/lib/server/escrow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Historial global: quién hizo qué y cuándo. */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  if (!user.isAdmin) return json({ error: "Accès administrateur requis." }, 403);
  try {
    const snap = await adminDb().collection("orderEvents").limit(150).get();
    const events: Record<string, unknown>[] = [];
    snap.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      events.push({
        id: d.id, orderId: data.orderId, actor: data.actor, actorId: data.actorId,
        action: data.action, note: data.note, at: toDate(data.at)?.toISOString() ?? null
      });
    });
    events.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
    return json({ events: events.slice(0, 100) });
  } catch (error) {
    console.error("[admin:events]", error);
    return json({ error: "Erreur chargement de l'historique." }, 500);
  }
}
