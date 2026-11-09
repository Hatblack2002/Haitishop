/**
 * Rate limiting en memoria (ventana deslizante) por IP + ruta.
 * Suficiente para frenar abuso básico en serverless; los intentos del código
 * de entrega tienen además su propio límite persistente (5 por pedido).
 */

const buckets = new Map<string, number[]>();

export function rateLimit(req: Request, route: string, max: number, windowMs: number): boolean {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const key = route + ":" + ip;
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) { buckets.set(key, hits); return false; }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}
