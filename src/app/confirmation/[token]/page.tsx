import type { Metadata } from "next";
import Link from "next/link";
import { adminDb } from "@/lib/server/firebase-admin";
import { lookupToken, toDate } from "@/lib/server/escrow";
import { ConfirmActions } from "./confirm-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirmation de livraison — HaïtiShop",
  robots: { index: false, follow: false }
};

type Props = { params: Promise<{ token: string }> };

const money = (v: number) => new Intl.NumberFormat("fr-FR").format(Math.round(v)) + " HTG";

const ERRORS: Record<string, { title: string; text: string }> = {
  not_found: {
    title: "Lien invalide",
    text: "Ce lien de confirmation n'existe pas. Vérifiez l'adresse reçue par e-mail ou demandez un nouveau lien depuis votre compte HaïtiShop."
  },
  wrong_type: {
    title: "Lien invalide",
    text: "Ce lien ne correspond pas à cette action."
  },
  used: {
    title: "Déjà utilisé",
    text: "Ce paiement a déjà été confirmé. Aucune autre action n'est nécessaire."
  },
  revoked: {
    title: "Lien remplacé",
    text: "Ce lien a été remplacé par un lien plus récent. Demandez un nouveau lien depuis votre compte HaïtiShop."
  },
  expired: {
    title: "Lien expiré",
    text: "Ce lien a expiré. Ouvrez votre compte HaïtiShop et demandez un nouveau lien de confirmation."
  }
};

export default async function ConfirmationPage({ params }: Props) {
  const { token } = await params;
  const tipo = "deshacer"; // déterminé ci-dessous via lookup des deux types

  let state: "invalid" | "confirm" | "undo" = "invalid";
  let errorKey = "not_found";
  let orderId = "";
  let items: { name: string; quantity: number; price: number }[] = [];
  let total = 0;
  let status = "";
  let sellerNames = "";
  let createdAt: string | null = null;
  let deliveredMarkedAt: string | null = null;

  try {
    const confirmLookup = await lookupToken(token, "confirmar_entrega");
    if (confirmLookup.ok) {
      state = "confirm";
      orderId = confirmLookup.orderId;
    } else {
      const undoLookup = await lookupToken(token, "deshacer_confirmacion");
      if (undoLookup.ok) {
        state = "undo";
        orderId = undoLookup.orderId;
      } else {
        errorKey = undoLookup.error;
      }
    }
    if (state !== "invalid") {
      const orderSnap = await adminDb().collection("orders").doc(orderId).get();
      if (orderSnap.exists) {
        const order = orderSnap.data() as Record<string, unknown>;
        // Aucune donnée personnelle d'autres utilisateurs : articles + montant uniquement.
        items = ((order.items as { name: string; quantity: number; price: number }[]) || [])
          .map(({ name, quantity, price }) => ({ name, quantity, price }));
        total = Number(order.total) || 0;
        status = String(order.status);
        sellerNames = (((order.sellerPayouts as { sellerName: string }[]) || [])).map((s) => s.sellerName).join(", ") || "Vendeur HaïtiShop";
        createdAt = toDate(order.createdAt)?.toISOString() ?? null;
        deliveredMarkedAt = toDate(order.deliveredMarkedAt)?.toISOString() ?? null;
      } else {
        state = "invalid";
        errorKey = "not_found";
      }
    }
  } catch (error) {
    console.error("[confirmation:page]", error);
    state = "invalid";
    errorKey = "not_found";
  }

  void tipo;

  if (state === "invalid") {
    const e = ERRORS[errorKey] || ERRORS.not_found;
    return (
      <main className="confirm-page">
        <section className="confirm-card">
          <div className="confirm-brand">Haïti<span>Shop</span></div>
          <h1>{e.title}</h1>
          <p>{e.text}</p>
          <Link className="confirm-btn secondary" href="/">Retour à HaïtiShop</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="confirm-page">
      <section className="confirm-card">
        <div className="confirm-brand">Haïti<span>Shop</span></div>
        <span className="eyebrow">{state === "undo" ? "ANNULER UNE CONFIRMATION" : "CONFIRMATION DE LIVRAISON"}</span>
        <h1>{state === "undo" ? "Annuler la confirmation de la commande" : "Avez-vous bien reçu votre commande ?"}</h1>
        <p className="confirm-order-ref">Commande <b>{orderId}</b>{createdAt ? " · " + new Date(createdAt).toLocaleDateString("fr-FR") : ""}</p>
        <table className="confirm-items">
          <tbody>
            {items.map((item, i) => (
              <tr key={i}><td>{item.quantity} × {item.name}</td><td>{money(item.price * item.quantity)}</td></tr>
            ))}
            <tr className="confirm-total"><td>Total</td><td>{money(total)}</td></tr>
          </tbody>
        </table>
        <p className="confirm-seller">Vendeur(s) : {sellerNames}</p>
        {state === "confirm" && (
          <ConfirmActions token={token} tipo="confirm" orderId={orderId} status={status} deliveredMarkedAt={deliveredMarkedAt} />
        )}
        {state === "undo" && (
          <ConfirmActions token={token} tipo="undo" orderId={orderId} status={status} deliveredMarkedAt={null} />
        )}
      </section>
      <p className="confirm-foot">HaïtiShop ne vous demandera jamais votre mot de passe par e-mail.</p>
    </main>
  );
}
