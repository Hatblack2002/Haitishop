/**
 * Envío del código de verificación (6 dígitos) por WhatsApp Business Cloud API (Meta).
 *
 * Se usa una plantilla de categoría AUTHENTICATION con botón "Copiar el código",
 * aprobada en Meta Business Manager en los idiomas fr, ht y en. El adaptador solo
 * rellena el código de 6 dígitos.
 *
 * Credenciales SOLO por variables de entorno (nunca en el repo ni en los logs):
 * - WHATSAPP_TOKEN          : token permanente del sistema WhatsApp Business.
 * - WHATSAPP_PHONE_ID       : Phone Number ID del envío
 *                             (se acepta también WHATSAPP_PHONE_NUMBER_ID).
 * - WHATSAPP_LANG           : idioma de la plantilla: fr (defecto), ht o en.
 * - WHATSAPP_TEMPLATE_NAME  : nombre de la plantilla (defecto: haitishop_code).
 * - WHATSAPP_API_VERSION    : versión de la Graph API (defecto: v21.0).
 * - WHATSAPP_GRAPH_URL      : SOLO para pruebas con la API simulada (mock);
 *                             defecto: https://graph.facebook.com.
 *
 * Modo desarrollo (SOLO entorno local): con KYC_SMS_DEV_MODE=true y sin
 * producción (NODE_ENV !== "production"), la API devuelve el código en la
 * respuesta para poder probar el flujo completo. En producción ese modo se
 * ignora siempre, aunque la variable esté puesta.
 *
 * Errores de entrega: se registran en el log del servidor de forma interna y
 * redactada (estado HTTP y código de error de Meta, sin token ni el número
 * completo del destinatario). Al usuario solo se le informa de un fallo genérico.
 */

export type SmsResult = { sent: boolean; devMode: boolean; error?: string };

/** Idiomas en los que está aprobada la plantilla Authentication. */
const TEMPLATE_LANGS = ["fr", "ht", "en"] as const;

/** Teléfono haitiano en E.164: +509 + 8 dígitos que empiezan por 3 o 4. */
export function isHaitiPhone(phone: string): boolean {
  return /^\+509[34]\d{7}$/.test(String(phone || "").trim());
}

/** Modo desarrollo: true solo si se pide de forma explícita Y no es producción. */
export function isSmsDevMode(): boolean {
  return process.env.KYC_SMS_DEV_MODE === "true" && process.env.NODE_ENV !== "production";
}

function templateLanguage(): string {
  const raw = (process.env.WHATSAPP_LANG || "fr").trim().toLowerCase();
  return (TEMPLATE_LANGS as readonly string[]).includes(raw) ? raw : "fr";
}

/** Enmascara el teléfono para los logs internos (nunca el número completo). */
function masked(phone: string): string {
  return "+509 •••• " + phone.slice(-4);
}

/**
 * Envía el código por WhatsApp (plantilla Authentication con botón copiar código).
 * Nunca lanza: devuelve { sent: false, error } ante cualquier problema.
 */
export async function sendVerificationCode(phone: string, code: string): Promise<SmsResult> {
  if (isSmsDevMode()) return { sent: false, devMode: true };

  const token = (process.env.WHATSAPP_TOKEN || "").trim();
  const phoneId = (process.env.WHATSAPP_PHONE_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  if (!token || !phoneId) return { sent: false, devMode: false, error: "whatsapp_config" };

  if (!isHaitiPhone(phone)) return { sent: false, devMode: false, error: "invalid_phone" };

  const version = (process.env.WHATSAPP_API_VERSION || "v21.0").trim();
  const base = (process.env.WHATSAPP_GRAPH_URL || "https://graph.facebook.com").replace(/\/+$/, "");
  const url = `${base}/${version}/${phoneId}/messages`;

  // Plantilla AUTHENTICATION con botón "copiar código": el código va como
  // parámetro del cuerpo y del botón. Nunca texto libre ni datos sensibles.
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone.replace(/^\+/, ""),
    type: "template",
    template: {
      name: (process.env.WHATSAPP_TEMPLATE_NAME || "haitishop_code").trim(),
      language: { code: templateLanguage() },
      components: [
        { type: "body", parameters: [{ type: "text", text: code }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] }
      ]
    }
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000)
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: { code?: number; subcode?: number; title?: string; message?: string; error_user_msg?: string };
    };
    if (!res.ok || body.error) {
      // Log interno redactado: estado + códigos de error de Meta. Sin token.
      const e = body.error || {};
      console.error(
        "[whatsapp:error]",
        JSON.stringify({
          status: res.status,
          code: e.code, subcode: e.subcode,
          title: e.title, detail: e.message || e.error_user_msg || "",
          to: masked(phone), template: payload.template.name, lang: payload.template.language.code
        })
      );
      return { sent: false, devMode: false, error: "send_failed" };
    }
    return { sent: true, devMode: false };
  } catch (error) {
    // Red / tiempo de espera: mismo trato, sin detalles del entorno.
    console.error("[whatsapp:error]", JSON.stringify({
      status: 0, detail: error instanceof Error ? error.name : "network",
      to: masked(phone)
    }));
    return { sent: false, devMode: false, error: "send_failed" };
  }
}
