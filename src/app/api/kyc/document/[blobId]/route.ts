import { json } from "@/lib/server/crypto-utils";
import { verifyDocLink, getKycFile } from "@/lib/server/kyc-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/kyc/document/[blobId]?exp=…&sig=… — sirve un documento KYC solo con
 * un enlace firmado HMAC válido y NO caducado (10 minutos, lo genera la API
 * admin y cada generación queda registrada). Sin firma válida: 403 genérico
 * sin información. Sin caché.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ blobId: string }> }
) {
  const { blobId } = await params;
  const url = new URL(req.url);
  const exp = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");

  if (!verifyDocLink(blobId, exp, sig)) {
    return json({ error: "Lien invalide ou expiré." }, 403);
  }

  const file = await getKycFile(blobId);
  if (!file) return json({ error: "Lien invalide ou expiré." }, 403);

  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_") || "document";
  return new Response(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      "content-type": file.mime,
      "content-disposition": `inline; filename="${safeName}"`,
      "cache-control": "private, no-store"
    }
  });
}
