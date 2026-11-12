#!/usr/bin/env node
/**
 * Pruebas unitarias del adaptador de WhatsApp (WhatsApp Business Cloud API, Meta)
 * contra una API simulada (mock) local. Sin dependencias: node --test tests/
 *
 * Cubre: plantilla Authentication (cuerpo + botón copiar código), idiomas
 * fr/ht/en, validación +509, credenciales solo por entorno, modo desarrollo
 * solo local, y fallos de entrega sin filtrar detalles.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { sendVerificationCode, isHaitiPhone, isSmsDevMode } from "../src/lib/server/sms.ts";

/** Servidor Graph API simulado: graba las peticiones y responde según `mode`. */
function startMock(mode = "ok") {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      requests.push({ url: req.url, auth: req.headers.authorization || "", body: JSON.parse(raw || "{}") });
      if (mode === "ok") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ messaging_product: "whatsapp", contacts: [], messages: [{ id: "wamid.mock" }] }));
      } else if (mode === "meta_error") {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: 132001, title: "Payload param mismatch", message: "template does not match", details: "secret-ish detail" } }));
      } else if (mode === "server_error") {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: 131047, title: "Re-engagement message" } }));
      } else if (mode === "ok_with_error_field") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: 999, title: "should fail" } }));
      }
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, requests, url: "http://127.0.0.1:" + server.address().port, close: () => { server.closeAllConnections(); server.close(); } })));
}

const ENV_KEYS = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_LANG",
  "WHATSAPP_TEMPLATE_NAME", "WHATSAPP_API_VERSION", "WHATSAPP_GRAPH_URL", "KYC_SMS_DEV_MODE", "NODE_ENV"];

function setEnv(overrides = {}) {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.NODE_ENV = "development";
  Object.assign(process.env, overrides);
}

test.afterEach(() => { for (const k of ENV_KEYS) delete process.env[k]; });

test("sin credenciales → error whatsapp_config y ninguna llamada HTTP", async () => {
  const mock = await startMock();
  setEnv({ WHATSAPP_GRAPH_URL: mock.url });
  const r = await sendVerificationCode("+50937112233", "123456");
  assert.equal(r.sent, false);
  assert.equal(r.devMode, false);
  assert.equal(r.error, "whatsapp_config");
  assert.equal(mock.requests.length, 0, "no debe contactar a la API sin token");
  mock.close();
});

test("acepta WHATSAPP_PHONE_NUMBER_ID como variante antigua", async () => {
  const mock = await startMock();
  setEnv({ WHATSAPP_TOKEN: "tok", WHATSAPP_PHONE_NUMBER_ID: "PID-LEGACY", WHATSAPP_GRAPH_URL: mock.url });
  const r = await sendVerificationCode("+50937112233", "123456");
  assert.equal(r.sent, true);
  assert.equal(mock.requests[0].url, "/v21.0/PID-LEGACY/messages");
  mock.close();
});

test("modo desarrollo SOLO local: activo fuera de producción, ignorado en producción", async () => {
  setEnv({ KYC_SMS_DEV_MODE: "true", NODE_ENV: "development" });
  assert.equal(isSmsDevMode(), true);
  const local = await sendVerificationCode("+50937112233", "123456");
  assert.equal(local.devMode, true, "dev mode responde en local sin configuración");

  setEnv({ KYC_SMS_DEV_MODE: "true", NODE_ENV: "production" });
  assert.equal(isSmsDevMode(), false);
  const prod = await sendVerificationCode("+50937112233", "123456");
  assert.equal(prod.devMode, false, "en producción el modo dev se ignora");
  assert.equal(prod.error, "whatsapp_config", "producción exige credenciales reales");
});

test("validación +509: rechaza números no haitianos sin llamar a la API", async () => {
  const mock = await startMock();
  setEnv({ WHATSAPP_TOKEN: "tok", WHATSAPP_PHONE_ID: "PID", WHATSAPP_GRAPH_URL: mock.url });
  for (const bad of ["31234567", "50931234567", "+50921234567", "+5093123456", "+18095551234", "", "abc"]) {
    const r = await sendVerificationCode(bad, "123456");
    assert.equal(r.error, "invalid_phone", `rechaza ${JSON.stringify(bad)}`);
  }
  for (const good of ["+50937112233", "+50948112233"]) assert.equal(isHaitiPhone(good), true, good);
  assert.equal(mock.requests.length, 0, "ningún número inválido llega a la API");
  mock.close();
});

test("payload correcto de plantilla Authentication (cuerpo + botón copiar código)", async () => {
  const mock = await startMock();
  setEnv({ WHATSAPP_TOKEN: "tok-secreto", WHATSAPP_PHONE_ID: "PID123", WHATSAPP_GRAPH_URL: mock.url, WHATSAPP_TEMPLATE_NAME: "haitishop_code" });
  const r = await sendVerificationCode("+50937112233", "654321");
  assert.equal(r.sent, true);
  const req = mock.requests[0];
  assert.equal(req.url, "/v21.0/PID123/messages");
  assert.equal(req.auth, "Bearer tok-secreto");
  const b = req.body;
  assert.equal(b.messaging_product, "whatsapp");
  assert.equal(b.recipient_type, "individual");
  assert.equal(b.to, "50937112233", "sin + en el destinatario");
  assert.equal(b.type, "template");
  assert.equal(b.template.name, "haitishop_code");
  assert.equal(b.template.language.code, "fr");
  assert.deepEqual(b.template.components[0], { type: "body", parameters: [{ type: "text", text: "654321" }] });
  assert.deepEqual(b.template.components[1], { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "654321" }] });
  assert.equal(JSON.stringify(b).includes("tok-secreto"), false, "el token nunca va en el cuerpo");
  mock.close();
});

test("idiomas de plantilla: fr por defecto, ht y en permitidos, otro valor cae a fr", async () => {
  const mock = await startMock();
  setEnv({ WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_ID: "P", WHATSAPP_GRAPH_URL: mock.url, WHATSAPP_LANG: "ht" });
  await sendVerificationCode("+50937112233", "111111");
  assert.equal(mock.requests[0].body.template.language.code, "ht");
  setEnv({ WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_ID: "P", WHATSAPP_GRAPH_URL: mock.url, WHATSAPP_LANG: "en" });
  await sendVerificationCode("+50937112233", "222222");
  assert.equal(mock.requests[1].body.template.language.code, "en");
  setEnv({ WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_ID: "P", WHATSAPP_GRAPH_URL: mock.url, WHATSAPP_LANG: "es" });
  await sendVerificationCode("+50937112233", "333333");
  assert.equal(mock.requests[2].body.template.language.code, "fr", "idioma no aprobado → fr");
  setEnv({ WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_ID: "P", WHATSAPP_GRAPH_URL: mock.url, WHATSAPP_LANG: "FR" });
  await sendVerificationCode("+50937112233", "444444");
  assert.equal(mock.requests[3].body.template.language.code, "fr");
  mock.close();
});

test("error de Meta (400) → fallo genérico sin filtrar el detalle", async () => {
  const mock = await startMock("meta_error");
  setEnv({ WHATSAPP_TOKEN: "tok", WHATSAPP_PHONE_ID: "P", WHATSAPP_GRAPH_URL: mock.url });
  const r = await sendVerificationCode("+50937112233", "123456");
  assert.equal(r.sent, false);
  assert.equal(r.devMode, false);
  assert.equal(r.error, "send_failed");
  assert.equal(JSON.stringify(r).includes("132001"), false, "códigos de Meta no salen al usuario");
  assert.equal(JSON.stringify(r).includes("secret-ish"), false);
  mock.close();
});

test("error 500 de Meta → fallo genérico", async () => {
  const mock = await startMock("server_error");
  setEnv({ WHATSAPP_TOKEN: "tok", WHATSAPP_PHONE_ID: "P", WHATSAPP_GRAPH_URL: mock.url });
  const r = await sendVerificationCode("+50937112233", "123456");
  assert.equal(r.sent, false);
  assert.equal(r.error, "send_failed");
  mock.close();
});

test("HTTP 200 con campo error → fallo genérico", async () => {
  const mock = await startMock("ok_with_error_field");
  setEnv({ WHATSAPP_TOKEN: "tok", WHATSAPP_PHONE_ID: "P", WHATSAPP_GRAPH_URL: mock.url });
  const r = await sendVerificationCode("+50937112233", "123456");
  assert.equal(r.sent, false);
  assert.equal(r.error, "send_failed");
  mock.close();
});

test("red caída / tiempo de espera → fallo genérico, nunca lanza", async () => {
  setEnv({ WHATSAPP_TOKEN: "tok", WHATSAPP_PHONE_ID: "P", WHATSAPP_GRAPH_URL: "http://127.0.0.1:9" });
  const r = await sendVerificationCode("+50937112233", "123456");
  assert.equal(r.sent, false);
  assert.equal(r.error, "send_failed");
});
