import { json } from "@/lib/server/crypto-utils";
import { escrowTick } from "@/lib/server/escrow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Tick programado (Vercel Cron): aplica las transiciones vencidas
 * (24 h de anulación / 72 h de respuesta) aunque nadie cargue la página.
 * Protegido por CRON_SECRET (header Authorization: Bearer <secreto>).
 */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (secret && provided === secret) {
    const result = await escrowTick();
    return json({ ok: true, ...result });
  }
  if (!secret) {
    return json({ error: "CRON_SECRET no está configurado." }, 503);
  }
  return json({ error: "No autorizado." }, 401);
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
