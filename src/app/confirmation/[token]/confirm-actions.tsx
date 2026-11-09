"use client";

import { useState } from "react";

const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "dcclzhsim";
const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "haitishop_demo_unsigned";

type Props = {
  token: string;
  tipo: "confirm" | "undo";
  orderId: string;
  status: string;
  deliveredMarkedAt: string | null;
};

export function ConfirmActions({ token, tipo, orderId, status, deliveredMarkedAt }: Props) {
  const [step, setStep] = useState<"idle" | "sure" | "dispute" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [doneTitle, setDoneTitle] = useState("");
  const [reason, setReason] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  async function post(url: string, body: Record<string, unknown>) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({ error: "Réponse illisible." }));
    if (!res.ok) throw new Error(data.error || "Erreur serveur.");
    return data;
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true); setMessage("");
    try {
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, 3)) {
        if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
          throw new Error("Photos : images uniquement, 8 Mo maximum.");
        }
        const body = new FormData();
        body.append("file", file);
        body.append("upload_preset", uploadPreset);
        body.append("folder", "haitishop-demo/disputes");
        const res = await fetch("https://api.cloudinary.com/v1_1/" + cloudName + "/image/upload", { method: "POST", body });
        if (!res.ok) throw new Error("Envoi de la photo impossible.");
        const data = await res.json() as { secure_url?: string };
        if (data.secure_url) urls.push(data.secure_url);
      }
      setPhotos((old) => [...old, ...urls].slice(0, 3));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur photo.");
    } finally { setUploading(false); }
  }

  async function confirmReceipt() {
    setStep("busy"); setMessage("");
    try {
      await post("/api/escrow/confirm", { token, doubleConfirmed: true });
      setDoneTitle("Merci, confirmation enregistrée ✅");
      setMessage("Le paiement va être préparé pour le vendeur. Vous avez 24 h pour annuler en cas d'erreur (lien dans votre e-mail).");
      setStep("done");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur serveur.");
      setStep("error");
    }
  }

  async function undoConfirmation() {
    setStep("busy"); setMessage("");
    try {
      await post("/api/escrow/undo", { token, doubleConfirmed: true });
      setDoneTitle("Confirmation annulée 🛡️");
      setMessage("La commande est passée en litige : le paiement reste bloqué et l'administration HaïtiShop va examiner le dossier.");
      setStep("done");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur serveur.");
      setStep("error");
    }
  }

  async function openDispute() {
    if (reason.trim().length < 10) {
      setMessage("Décrivez le problème (10 caractères minimum).");
      return;
    }
    setStep("busy"); setMessage("");
    try {
      await post("/api/escrow/dispute", { token, reason: reason.trim(), photos });
      setDoneTitle("Litige ouvert 🛡️");
      setMessage("Le paiement reste bloqué. L'administration HaïtiShop a été notifiée et va examiner votre dossier.");
      setStep("done");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur serveur.");
      setStep("error");
    }
  }

  if (step === "done") {
    return (
      <div className="confirm-done">
        <h2>{doneTitle}</h2>
        <p>{message}</p>
        <p className="confirm-ref">Référence : <b>{orderId}</b></p>
      </div>
    );
  }

  if (tipo === "undo") {
    return (
      <div className="confirm-actions">
        {status !== "entregado_confirmado" && status !== "pago_liberable" && (
          <p className="confirm-note">Cette commande n’est plus dans un état annulable. Contactez l’administration HaïtiShop.</p>
        )}
        {status === "pago_liberable" && (
          <p className="confirm-note warn">Le paiement est déjà en préparation. L’annulation reste possible quelques instants seulement.</p>
        )}
        {(status === "entregado_confirmado" || status === "pago_liberable") && (
          step === "sure" ? (
            <div className="confirm-sure">
              <p><b>Êtes-vous sûr ?</b> La commande passera en litige et le paiement restera bloqué le temps de la vérification.</p>
              <div className="confirm-btns">
                <button className="confirm-btn secondary" onClick={() => setStep("idle")}>Retour</button>
                <button className="confirm-btn danger" onClick={undoConfirmation}>Oui, ouvrir un litige</button>
              </div>
            </div>
          ) : (
            <button className="confirm-btn danger" onClick={() => setStep("sure")}>Ce n’était pas voulu — annuler la confirmation</button>
          )
        )}
        {message && <p className="confirm-message" role="status">{message}</p>}
      </div>
    );
  }

  // tipo === "confirm"
  if (["pago_liberable", "pago_liberado", "cancelado"].includes(status)) {
    return (
      <div className="confirm-actions">
        <p className="confirm-note">Ce paiement a déjà été confirmé. Aucune action n’est nécessaire.</p>
      </div>
    );
  }
  if (status === "en_disputa") {
    return (
      <div className="confirm-actions">
        <p className="confirm-note">Cette commande est déjà en litige : l’administration va examiner le dossier.</p>
      </div>
    );
  }

  return (
    <div className="confirm-actions">
      {deliveredMarkedAt && (
        <p className="confirm-note">Le vendeur a marqué cette commande comme livrée{deliveredMarkedAt ? " le " + new Date(deliveredMarkedAt).toLocaleDateString("fr-FR") : ""}. Si vous ne confirmez pas sous 72 h, le paiement sera automatiquement préparé pour le vendeur.</p>
      )}
      {step === "dispute" ? (
        <div className="dispute-form">
          <h2>Décrivez votre problème</h2>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="Ex. : le colis n'est pas arrivé, le produit est endommagé, ce n'est pas le bon article…"
          />
          <label className="dispute-photos">
            Photos (facultatif, 3 maximum, 8 Mo chacune)
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => uploadPhotos(e.target.files)} disabled={uploading} />
          </label>
          {photos.length > 0 && <p className="confirm-note">{photos.length} photo(s) jointe(s).</p>}
          <div className="confirm-btns">
            <button className="confirm-btn secondary" onClick={() => { setStep("idle"); setMessage(""); }} disabled={uploading}>Retour</button>
            <button className="confirm-btn danger" onClick={openDispute} disabled={uploading}>Ouvrir un litige</button>
          </div>
          <p className="confirm-note">Le paiement restera bloqué jusqu’à la résolution par l’administration.</p>
        </div>
      ) : (
        <>
          {step === "sure" ? (
            <div className="confirm-sure">
              <p><b>Êtes-vous sûr ?</b> Le paiement sera envoyé au vendeur.</p>
              <div className="confirm-btns">
                <button className="confirm-btn secondary" onClick={() => setStep("idle")}>Annuler</button>
                <button className="confirm-btn primary" onClick={confirmReceipt}>Oui, je confirme</button>
              </div>
            </div>
          ) : (
            <div className="confirm-btns column">
              <button className="confirm-btn primary" onClick={() => setStep("sure")}>Oui, j’ai reçu ma commande</button>
              <button className="confirm-btn secondary" onClick={() => { setStep("dispute"); setMessage(""); }}>J’ai un problème</button>
            </div>
          )}
        </>
      )}
      {message && <p className="confirm-message" role="status">{message}</p>}
    </div>
  );
}
