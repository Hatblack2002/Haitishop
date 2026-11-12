/**
 * Envoi d'e-mails transactionnels (français, ton proche et clair).
 * - Si RESEND_API_KEY est défini : envoi réel via l'API Resend (fetch, zéro dépendance).
 * - Sinon : l'e-mail est journalisé côté serveur et l'événement est enregistré
 *   dans Firestore (email:skipped) — aucune fonctionnalité n'est bloquée.
 * Variables : RESEND_API_KEY, EMAIL_FROM (défaut onboarding@resend.dev), ADMIN_EMAIL.
 */

import { adminDb } from "./firebase-admin";

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "vertiljivenson9@gmail.com";
const EMAIL_FROM = process.env.EMAIL_FROM || "HaïtiShop <onboarding@resend.dev>";

export type MailTemplate =
  | "purchase" | "confirmed_with_undo" | "delivery_marked" | "dispute_opened"
  | "payment_liberable" | "payment_released" | "dispute_resolved" | "admin_notice"
  | "kyc_submitted" | "kyc_result" | "kyc_suspended" | "kyc_payout_change";

type MailInput = {
  to: string;
  subject: string;
  html: string;
  orderId?: string;
  template: MailTemplate;
};

const btn = (url: string, label: string) =>
  `<a href="${url}" style="display:inline-block;background:#16845d;color:#ffffff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:600;margin:18px 0;">${label}</a>`;
const warn = (text: string) =>
  `<p style="background:#fff4e5;border-left:4px solid #e08600;padding:12px 14px;border-radius:8px;">⚠️ ${text}</p>`;

const wrap = (title: string, body: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#1f2430;">
     <div style="background:#16845d;border-radius:14px 14px 0 0;padding:20px 26px;">
       <span style="color:#fff;font-size:20px;font-weight:700;">Haïti<span style="color:#d4f3e6;">Shop</span></span>
     </div>
     <div style="border:1px solid #e6e9ef;border-top:none;border-radius:0 0 14px 14px;padding:26px;">
       <h2 style="margin:0 0 14px;font-size:20px;">${title}</h2>${body}
       <p style="color:#6b7280;font-size:12px;margin-top:26px;">HaïtiShop — Le commerce local, partout en Haïti.<br/>Cet e-mail concerne une commande réelle. Aucune publicité n'est envoyée via cette adresse.</p>
     </div>
   </div>`;

const money = (v: number) => new Intl.NumberFormat("fr-FR").format(Math.round(v)) + " HTG";

function itemsTable(items: { name: string; quantity: number; price: number }[]): string {
  return `<table style="width:100%;border-collapse:collapse;margin:12px 0;">` +
    items.map((i) =>
      `<tr><td style="padding:7px 0;border-bottom:1px solid #eef1f5;">${i.quantity} × ${i.name}</td><td style="text-align:right;border-bottom:1px solid #eef1f5;">${money(i.price * i.quantity)}</td></tr>`
    ).join("") +
    `</table>`;
}

export type PurchaseMail = {
  orderId: string; code: string; confirmUrl: string; items: { name: string; quantity: number; price: number }[];
  total: number; paymentMethod: string; deliveryAddress: string;
};

export function buildPurchaseMail(p: PurchaseMail): { subject: string; html: string } {
  return {
    subject: "Ta commande HaïtiShop est confirmée",
    html: wrap(
      "Merci pour ta commande 🇭🇹",
      `<p>Ta commande <b>${p.orderId}</b> est bien enregistrée. Voici le résumé :</p>` +
      itemsTable(p.items) +
      `<p><b>Total : ${money(p.total)}</b> · Paiement : ${p.paymentMethod}</p>` +
      (p.deliveryAddress ? `<p>Livraison : ${p.deliveryAddress}</p>` : "") +
      (p.code
        ? `<p style="font-size:16px;">Code de livraison : <b style="font-size:22px;letter-spacing:3px;">${p.code}</b></p>` +
          `<p>Donne ce code au vendeur au moment de la livraison : il prouve que tu as bien reçu ton colis.</p>`
        : "") +
      btn(p.confirmUrl, "Confirmer la réception") +
      warn("Ne confirme que si tu as reçu ton produit, car le paiement sera envoyé au vendeur.")
    )
  };
}

export function buildConfirmedMail(p: { orderId: string; undoUrl: string; items: { name: string; quantity: number; price: number }[]; total: number }): { subject: string; html: string } {
  return {
    subject: "Tu as confirmé la réception de ta commande",
    html: wrap(
      "Confirmation bien reçue ✅",
      `<p>Tu as confirmé la réception de la commande <b>${p.orderId}</b>.</p>` +
      itemsTable(p.items) +
      `<p><b>Total : ${money(p.total)}</b></p>` +
      `<p>Le paiement va maintenant être préparé pour l'envoi au vendeur.</p>` +
      btn(p.undoUrl, "Annuler la confirmation") +
      `<p style="color:#6b7280;font-size:13px;">Tu as confirmé par erreur ? Ce n'était pas voulu ? Annule pendant <b>24 h</b> : la commande passera en litige et le paiement restera bloqué.</p>`
    )
  };
}

export function buildDeliveryMarkedMail(p: { orderId: string; confirmUrl: string }): { subject: string; html: string } {
  return {
    subject: "Ta commande HaïtiShop a été marquée livrée",
    html: wrap(
      "Le vendeur a marqué ta commande comme livrée",
      `<p>Le vendeur a utilisé ton code de livraison pour la commande <b>${p.orderId}</b>.</p>` +
      `<p>Si tu as bien reçu le colis, confirme-le ci-dessous. Si tu ne fais rien sous <b>72 h</b>, le paiement sera automatiquement préparé pour le vendeur.</p>` +
      btn(p.confirmUrl, "Confirmer la réception") +
      warn("Un problème ? Ouvre un litige depuis le même lien : le paiement restera bloqué le temps de la vérification.")
    )
  };
}

export function buildDisputeMail(p: { orderId: string; reason: string; byAdmin: boolean }): { subject: string; html: string } {
  return {
    subject: "Litige ouvert sur la commande " + p.orderId,
    html: wrap(
      "Un litige a été ouvert 🛡️",
      `<p>Commande concernée : <b>${p.orderId}</b></p><p>Motif déclaré : « ${p.reason} »</p>` +
      `<p>Le paiement reste <b>bloqué</b> jusqu'à la résolution. L'administration HaïtiShop va examiner le dossier et contacter les deux parties.</p>` +
      (p.byAdmin ? "" : `<p>Conserve tes preuves (photos, échanges) : elles pourraient être demandées.</p>`)
    )
  };
}

export function buildLiberableMail(p: { orderId: string; sellerNames: string; sellerPayout: number }): { subject: string; html: string } {
  return {
    subject: "Paiement libérable pour la commande " + p.orderId,
    html: wrap(
      "Paiement prêt à être versé 💸",
      `<p>La commande <b>${p.orderId}</b> est passée en <b>paiement libérable</b> (aucun litige après confirmation / délai écoulé).</p>` +
      `<p>Vendeur(s) : ${p.sellerNames}<br/>Montant à transférer : <b>${money(p.sellerPayout)}</b></p>` +
      `<p>Rends-toi dans le panneau d'administration et marque le paiement comme versé après le transfert.</p>`
    )
  };
}

export function buildReleasedMail(p: { orderId: string; payout: number; isSeller: boolean }): { subject: string; html: string } {
  return {
    subject: p.isSeller ? "Tu as reçu ton paiement HaïtiShop 🎉" : "Le paiement de ta commande a été versé au vendeur",
    html: wrap(
      p.isSeller ? "Paiement versé 💸" : "Commande finalisée",
      p.isSeller
        ? `<p>Le paiement de la commande <b>${p.orderId}</b> vient d'être versé : <b>${money(p.payout)}</b> (après commission HaïtiShop).</p><p>Merci de vendre sur HaïtiShop !</p>`
        : `<p>Le paiement de la commande <b>${p.orderId}</b> a été versé au vendeur : <b>${money(p.payout)}</b>.</p><p>Merci d'avoir acheté local !</p>`
    )
  };
}

export function buildDisputeResolvedMail(p: { orderId: string; forSeller: boolean; note: string }): { subject: string; html: string } {
  return {
    subject: "Litige résolu — commande " + p.orderId,
    html: wrap(
      "Le litige a été résolu",
      `<p>Commande <b>${p.orderId}</b> : le litige a été examiné par l'administration.</p>` +
      `<p>Décision : <b>${p.forSeller ? "en faveur du vendeur (paiement libéré)" : "en faveur du client (paiement remboursé)"}</b>.</p>` +
      (p.note ? `<p><i>${p.note}</i></p>` : "") +
      `<p>Le paiement est ${p.forSeller ? "prêt à être transféré au vendeur" : "annulé : le client sera remboursé manuellement"}.</p>`
    )
  };
}

export async function sendMail(mail: MailInput): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[mail:not_configured] ${mail.template} → ${mail.to} (${mail.subject})`);
    if (mail.orderId) {
      await adminDb().collection("orderEvents").add({
        orderId: mail.orderId, actor: "system", action: "email:skipped",
        note: `${mail.template} → ${mail.to} (RESEND_API_KEY absente)`, at: new Date()
      }).catch(() => undefined);
    }
    return { sent: false, reason: "not_configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: "Bearer " + key, "content-type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [mail.to], subject: mail.subject, html: mail.html })
    });
    if (!res.ok) throw new Error("Resend " + res.status + ": " + (await res.text()).slice(0, 200));
    if (mail.orderId) {
      await adminDb().collection("orderEvents").add({
        orderId: mail.orderId, actor: "system", action: "email:sent",
        note: `${mail.template} → ${mail.to}`, at: new Date()
      }).catch(() => undefined);
    }
    return { sent: true };
  } catch (error) {
    console.error("[mail:error]", mail.template, error);
    return { sent: false, reason: "send_failed" };
  }
}


/* ------------------------------------------------------- KYC de vendedores */

export function buildKycSubmittedMail(p: { storeName: string; sellerEmail: string; fullName: string; city: string; department: string }): { subject: string; html: string } {
  return {
    subject: "Nouvelle demande vendeur à examiner — " + p.storeName,
    html: wrap(
      "Nouvelle demande de vérification 🧾",
      `<p>Un vendeur vient d'envoyer son dossier complet :</p>` +
      `<table style="width:100%;margin:12px 0;">` +
      `<tr><td style="padding:6px 0;">Boutique</td><td style="text-align:right;"><b>${p.storeName}</b></td></tr>` +
      `<tr><td style="padding:6px 0;">Responsable</td><td style="text-align:right;">${p.fullName}</td></tr>` +
      `<tr><td style="padding:6px 0;">E-mail</td><td style="text-align:right;">${p.sellerEmail}</td></tr>` +
      `<tr><td style="padding:6px 0;">Localisation</td><td style="text-align:right;">${p.city} (${p.department})</td></tr>` +
      `</table>` +
      `<p>Ouvre le panneau d'administration → onglet <b>Vendeurs</b> pour examiner le dossier et décider.</p>` +
      `<p style="color:#6b7280;font-size:12px;">Documents chiffrés · liens valables 10 minutes · chaque ouverture est enregistrée (qui, quand).</p>`
    )
  };
}

export function buildKycResultMail(p: { approved: boolean; storeName: string; motivo?: string; info?: string }): { subject: string; html: string } {
  if (p.approved) {
    return {
      subject: "Ton compte vendeur HaïtiShop est vérifié ✅",
      html: wrap(
        "Boutique vérifiée 🎉",
        `<p>Bonne nouvelle : <b>${p.storeName}</b> est maintenant un <b>vendeur vérifié</b> HaïtiShop.</p>` +
        `<p>Tu peux publier tes produits dès maintenant. Tes clients verront l'insigne « Vendeur vérifié » sur ta boutique.</p>` +
        `<p>Les paiements de tes ventes restent sécurisés par HaïtiShop et sont versés sur ton numéro de paiement vérifié après confirmation de livraison par le client.</p>`
      )
    };
  }
  if (p.info) {
    return {
      subject: "Il nous manque des informations — " + p.storeName,
      html: wrap(
        "Information demandée",
        `<p>Concernant la vérification de <b>${p.storeName}</b>, l'administration a besoin de précisions :</p>` +
        `<p style="background:#f3f6fb;border-left:4px solid #1769d2;padding:12px 14px;border-radius:8px;">${p.info}</p>` +
        `<p>Mets à jour ton dossier dans ton espace vendeur puis renvoie-le : l'examen reprendra aussitôt.</p>`
      )
    };
  }
  return {
    subject: "Ta demande vendeur a été refusée — " + p.storeName,
    html: wrap(
      "Demande refusée",
      `<p>Après examen, la vérification de <b>${p.storeName}</b> n'a pas été acceptée. Motif :</p>` +
      `<p style="background:#fdf0ef;border-left:4px solid #d64541;padding:12px 14px;border-radius:8px;">${p.motivo || "Non précisé."}</p>` +
      `<p>Tu peux corriger ton dossier (documents plus lisibles, informations exactes…) et le renvoyer depuis ton espace vendeur.</p>` +
      `<p style="color:#6b7280;font-size:12px;">Après plusieurs refus, le compte peut être bloqué : contacte l'administration.</p>`
    )
  };
}

export function buildKycSuspendedMail(p: { storeName: string; motivo: string }): { subject: string; html: string } {
  return {
    subject: "Ta boutique HaïtiShop a été suspendue",
    html: wrap(
      "Compte suspendu",
      `<p>La boutique <b>${p.storeName}</b> a été suspendue par l'administration. Motif :</p>` +
      `<p style="background:#fdf0ef;border-left:4px solid #d64541;padding:12px 14px;border-radius:8px;">${p.motivo}</p>` +
      `<p>Tes produits ne sont plus visibles et les paiements en attente restent conservés jusqu'à la révision de ton dossier par l'administration.</p>`
    )
  };
}

export function buildKycPayoutChangeMail(p: { storeName: string; sellerEmail: string }): { subject: string; html: string } {
  return {
    subject: "Changement de numéro de paiement — re-vérification requise",
    html: wrap(
      "Numéro de paiement modifié ⚠️",
      `<p>Le vendeur vérifié <b>${p.storeName}</b> (${p.sellerEmail}) a changé son numéro de paiement.</p>` +
      `<p>Son compte repasse automatiquement en <b>révision</b> : il doit re-vérifier le nouveau numéro par WhatsApp avant de recevoir de nouveaux paiements.</p>` +
      `<p>Les paiements libérables restent retenus tant que le dossier n'est pas re-validé.</p>`
    )
  };
}
