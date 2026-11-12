import { FieldValue } from "firebase-admin/firestore";
import { adminDb, requireUser } from "@/lib/server/firebase-admin";
import { json, encryptCode } from "@/lib/server/crypto-utils";
import { rateLimit } from "@/lib/server/rate-limit";
import {
  DOCUMENT_KINDS, DocumentKind, isDocumentNumberTaken, documentHash,
  logKycAudit, maskNumber, normalizeCode
} from "@/lib/server/kyc";
import { KYC_ALLOWED_MIME, KYC_MAX_BYTES, putKycFile, deleteKycFile } from "@/lib/server/kyc-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/kyc/documents — subida segura de documentos (multipart).
 * Campos: kind (id_front | id_back | passport_page | selfie), documentType
 * (cni | pasaporte), documentNumber (obligatorio en la primera foto del
 * documento) y file (JPG/PNG/PDF, 5 MB máx).
 *
 * El archivo se cifra y se guarda en trozos privados; el número de documento
 * se guarda cifrado + hash para unicidad; en pantalla solo últimos 4.
 */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Connectez-vous." }, 401);
  if (!rateLimit(req, "kyc-docs", 20, 60 * 60 * 1000)) {
    return json({ error: "Trop d'envois. Réessayez dans une heure." }, 429);
  }

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "Requête invalide." }, 400); }

  const kind = String(form.get("kind") || "") as DocumentKind;
  if (!DOCUMENT_KINDS.includes(kind)) return json({ error: "Type de document inconnu." }, 400);

  const sellerRef = adminDb().collection("sellers").doc(user.uid);
  const sellerSnap = await sellerRef.get();
  if (!sellerSnap.exists) return json({ error: "Complétez d'abord votre profil de vendeur." }, 400);
  const seller = (sellerSnap.data() || {}) as Record<string, unknown>;
  if (["suspendido"].includes(String(seller.status || ""))) {
    return json({ error: "Compte suspendu : contactez l'administration." }, 403);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "Fichier manquant." }, 400);
  const mime = file.type || "";
  if (!(KYC_ALLOWED_MIME as readonly string[]).includes(mime)) {
    return json({ error: "Format non accepté : utilisez JPG, PNG ou PDF." }, 400);
  }
  if (file.size > KYC_MAX_BYTES) return json({ error: "Fichier trop lourd : 5 Mo maximum." }, 400);
  const buffer = Buffer.from(await file.arrayBuffer());

  // Tipo de documento y número (obligatorio en la primera foto del documento).
  let documentType = String(seller.documentType || "");
  const requestedType = String(form.get("documentType") || "");
  if (["cni", "pasaporte"].includes(requestedType)) documentType = requestedType;
  if (kind === "passport_page" && documentType !== "pasaporte") documentType = "pasaporte";
  if ((kind === "id_front" || kind === "id_back") && documentType !== "cni") documentType = "cni";

  let documentNumber = "";
  if (kind === "id_front" || kind === "passport_page" || form.get("documentNumber")) {
    documentNumber = normalizeCode(String(form.get("documentNumber") || ""));
    if (documentNumber.length < 6 || documentNumber.length > 20 || !/^[A-Z0-9]+$/.test(documentNumber)) {
      return json({ error: "Numéro de document invalide (6 à 20 caractères, lettres et chiffres)." }, 400);
    }
    if (await isDocumentNumberTaken(documentNumber, user.uid)) {
      await logKycAudit({
        sellerId: user.uid, type: "fraud_signal", actor: "system",
        note: "Numéro de document déjà associé à un autre compte vendeur."
      });
      return json({ error: "Ce numéro de document est déjà associé à un autre compte vendeur." }, 409);
    }
  }

  const stored = await putKycFile(user.uid, kind, buffer, mime, file.name);

  const update: Record<string, unknown> = {
    documentType,
    documents: { ...((seller.documents as Record<string, unknown>) || {}), [kind]: {
      id: stored.id, mime: stored.mime, size: stored.size, sha256: stored.sha256,
      name: String(file.name || "").slice(0, 80), uploadedAt: FieldValue.serverTimestamp()
    }},
    updatedAt: FieldValue.serverTimestamp()
  };
  if (documentNumber) {
    update.documentNumberEnc = encryptCode(documentNumber);
    update.documentNumberHash = documentHash(documentNumber);
    update.documentMasked = maskNumber(documentNumber);
  }
  const docs = (seller.documents as Record<string, Record<string, unknown>> | undefined) || {};
  const previous = docs[kind];
  if (previous && previous.id && previous.id !== stored.id) {
    await deleteKycFile(String(previous.id)); // sustitución: borra el anterior
  }
  await sellerRef.set(update, { merge: true });

  await logKycAudit({
    sellerId: user.uid, type: "document_uploaded", actor: "seller", actorId: user.uid,
    note: `${kind} (${stored.mime}, ${stored.size} octets)${documentNumber ? " · numéro enregistré" : ""}.`
  });

  return json({ ok: true, kind, documentMasked: update.documentMasked || seller.documentMasked || null });
}
