import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json } from "@/lib/server/crypto-utils";
import { logDocAccess, logKycAudit } from "@/lib/server/kyc";
import { getKycFile } from "@/lib/server/kyc-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type GatewayResponse = { choices?: { message?: { content?: string } }[] };

/**
 * POST /api/admin/kyc/seller/[uid]/analyze — pre-chequeo IA (sugerencia NO
 * vinculante) de los documentos con el Vercel AI Gateway. El admin decide
 * siempre. Los NÚMEROS de documento nunca se envían al modelo: solo las
 * imágenes, el tipo de documento y el nombre del titular declarado.
 * Cada análisis queda registrado en el historial de accesos.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  if (!user.isAdmin) return json({ error: "Accès administrateur requis." }, 403);

  const key = process.env.AI_GATEWAY_API_KEY || "";
  if (!key) return json({ error: "Analyse IA non configurée (AI_GATEWAY_API_KEY absente)." }, 501);

  const { uid } = await params;
  const sellerSnap = await adminDb().collection("sellers").doc(uid).get();
  if (!sellerSnap.exists) return json({ error: "Dossier introuvable." }, 404);
  const seller = (sellerSnap.data() || {}) as Record<string, unknown>;
  const docs = (seller.documents as Record<string, Record<string, unknown>> | undefined) || {};

  const kindsOrder = seller.documentType === "pasaporte"
    ? ["passport_page", "selfie"] : ["id_front", "id_back", "selfie"];
  const content: Record<string, unknown>[] = [];

  const holderName = String(seller.payoutHolderName || "(non renseigné)");
  content.push({
    type: "text",
    text:
      "Tu es l'assistant de vérification KYC de HaïtiShop (marché haïtien). " +
      "Analyse les documents fournis (CNI haïtienne recto/verso ou page du passeport) et le selfie avec le document. " +
      `Nom du titulaire du compte de paiement déclaré par le vendeur : « ${holderName} ».\n` +
      "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :\n" +
      '{"legible": boolean, "typeDetecte": "CNI|passeport|autre", "nomVisible": string, ' +
      '"coincideSelfie": true|false|null, "nomCoincideTitulaire": true|false|null, ' +
      '"problemes": [string], "notes": string}\n' +
      "coincideSelfie = le selfie semble montrer la même personne que la photo du document. " +
      "nomVisible = nom/prénom lus sur le document. nomCoincideTitulaire = le nom lu correspond au titulaire déclaré. " +
      "problemes = défauts (flou, coupé, expiré, retouches suspectes…). Sois prudent : null si tu ne peux pas juger."
  });

  let attached = 0;
  for (const kind of kindsOrder) {
    const meta = docs[kind];
    if (!meta?.id) continue;
    const file = await getKycFile(String(meta.id)).catch(() => null);
    if (!file) continue;
    content.push({ type: "text", text: `Document : ${kind}` });
    content.push({ type: "image_url", image_url: { url: `data:${file.mime};base64,${file.buffer.toString("base64")}` } });
    attached++;
  }
  if (!attached) return json({ error: "Aucun document à analyser." }, 400);

  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer " + key, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.AI_GATEWAY_VISION_MODEL || "google/gemini-2.5-flash",
        messages: [{ role: "user", content }],
        max_tokens: 600
      }),
      signal: AbortSignal.timeout(55_000)
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      return json({ error: "Le service d'analyse IA a refusé la requête (" + res.status + "): " + detail }, 502);
    }
    const data = await res.json() as GatewayResponse;
    const raw = String(data.choices?.[0]?.message?.content || "");
    const match = raw.match(/\{[\s\S]*\}/);
    let analysis: unknown = null;
    try { analysis = JSON.parse(match ? match[0] : raw); } catch { analysis = { notes: raw.slice(0, 600) }; }

    await logDocAccess({
      adminUid: user.uid, adminEmail: user.email, sellerId: uid,
      resources: Object.keys(docs), action: "ai_analysis",
      note: "Documents envoyés au modèle d'analyse (suggestion non contraignante)."
    });
    await logKycAudit({
      sellerId: uid, type: "ai_analysis", actor: "admin", actorId: user.uid,
      note: "Pré-vérification IA effectuée (suggestion, l'admin décide)."
    });
    return json({ ok: true, analysis });
  } catch (error) {
    console.error("[kyc:analyze]", error);
    return json({ error: "Analyse IA indisponible pour le moment." }, 502);
  }
}
