#!/usr/bin/env python3
"""E2E del KYC de HaïtiShop con la API de WhatsApp SIMULADA (mock).

Levanta un servidor mock de la Graph API de Meta (plantilla Authentication),
arranca `next start` (NODE_ENV=production) apuntando al mock con
WHATSAPP_GRAPH_URL y prueba: envío y estructura de la plantilla, verificación,
código caducado, límite de 3 envíos/hora (con reembolso si el proveedor falla),
bloqueo tras 5 intentos, validación +509 y modo desarrollo RECHAZADO en
producción. Limpia sus datos al final.
"""
import json, os, signal, subprocess, sys, threading, time, urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = "http://localhost:3000"
MOCK_PORT = 9091
API_KEY = "AIzaSyCi4lFiD3QhjnqAOg9JQ1g6PfjNw_eywHQ"
PROJECT = "haitishop"
SA = "/home/z/my-project/upload/haitishop-firebase-adminsdk-fbsvc-507bff993b.json"
REPO = "/tmp/Haitishop"
STAMP = str(int(time.time()))
MAIL = f"kyc-wa-{STAMP}@haitishop.dev"
PASS = "KycWa2026!"
PHONE = "+50937" + STAMP[-6:]
PAYOUT = "+50938" + STAMP[-6:]
MOCK_TOKEN, MOCK_PID = "mock-token-e2e", "mock-phone-id-e2e"

results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("OK " if cond else "XX ") + name + ((" — " + str(extra)[:200]) if extra else ""))

def http(method, url, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    h = {"content-type": "application/json"} if data else {}
    if token: h["authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            payload = r.read().decode()
            return r.status, (json.loads(payload) if payload.startswith(("{", "[")) else payload)
    except urllib.error.HTTPError as e:
        payload = e.read().decode()
        try: return e.code, json.loads(payload)
        except Exception: return e.code, payload

# ── Mock de la Graph API de Meta ─────────────────────────────────────────────
mode, lock = {"value": "ok"}, threading.Lock()
recorded = []
class MockGraph(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _json(self, code, obj):
        raw = json.dumps(obj).encode()
        self.send_response(code); self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def do_POST(self):
        if self.path == "/__control":
            n = int(self.headers.get("content-length", 0))
            mode["value"] = json.loads(self.rfile.read(n) or b"{}").get("mode", "ok")
            return self._json(200, {"mode": mode["value"]})
        if self.path.startswith(f"/v21.0/{MOCK_PID}/messages"):
            n = int(self.headers.get("content-length", 0))
            body = json.loads(self.rfile.read(n) or b"{}")
            with lock: recorded.append({"url": self.path, "auth": self.headers.get("authorization", ""), "body": body})
            if mode["value"] == "ok":
                return self._json(200, {"messaging_product": "whatsapp", "contacts": [], "messages": [{"id": "wamid.mock"}]})
            return self._json(500, {"error": {"code": 131047, "title": "Re-engagement message", "message": "detalle interno de Meta"}})
        self._json(404, {"error": {"code": 404, "title": "not found"}})
    def do_GET(self):
        if self.path == "/__requests":
            with lock: return self._json(200, {"requests": recorded})
        self._json(404, {"error": {"code": 404, "title": "not found"}})

mock_http = ThreadingHTTPServer(("127.0.0.1", MOCK_PORT), MockGraph)
threading.Thread(target=mock_http.serve_forever, daemon=True).start()
def mock_control(m): urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{MOCK_PORT}/__control", data=json.dumps({"mode": m}).encode(), method="POST"), timeout=10)
def mock_requests():
    with urllib.request.urlopen(f"http://127.0.0.1:{MOCK_PORT}/__requests", timeout=10) as r:
        return json.loads(r.read().decode())["requests"]

# ── helpers de Firebase (solo limpieza y manipulación de caducidad) ──────────
import google.auth.transport.requests as gtr
from google.oauth2 import service_account as gsa
creds = gsa.Credentials.from_service_account_file(SA, scopes=["https://www.googleapis.com/auth/datastore", "https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/identitytoolkit"])
def sa_token():
    creds.refresh(gtr.Request()); return creds.token
def fs(method, path, body=None, mask=None):
    qs = ("?updateMask.fieldPaths=" + mask) if mask else ""
    req = urllib.request.Request(
        f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/{path}{qs}",
        method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": "Bearer " + sa_token(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return {"HTTP_ERROR": e.code}

def auth_signup(email, password):
    req = urllib.request.Request(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
        data=json.dumps({"email": email, "password": password, "returnSecureToken": True}).encode(),
        method="POST", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        print("signup fail", email, e.read().decode()[:200]); return {}

# ── ciclo de vida del servidor Next (producción) ─────────────────────────────
next_proc = None
def start_next(extra_env):
    global next_proc
    subprocess.run(["pkill", "-f", "next-server"], capture_output=True)
    subprocess.run(["pkill", "-f", "next start"], capture_output=True)
    time.sleep(1.5)
    env = dict(os.environ)
    env.update(extra_env)  # las variables de proceso tienen prioridad sobre .env.local
    next_proc = subprocess.Popen(["npm", "start"], cwd=REPO, env=env,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                 start_new_session=True)
    for _ in range(60):
        try:
            with urllib.request.urlopen(BASE, timeout=3) as r:
                if r.status == 200: return True
        except Exception: pass
        time.sleep(1)
    return False

def stop_next():
    global next_proc
    if next_proc:
        try: os.killpg(next_proc.pid, signal.SIGTERM)
        except Exception: pass
        time.sleep(1.5); next_proc = None

def code_from_mock(index):
    reqs = mock_requests()
    params = reqs[index]["body"]["template"]["components"][0]["parameters"]
    return params[0]["text"]

# ══ FASE A: modo desarrollo RECHAZADO en producción ══════════════════════════
print("— Fase A: modo dev ignorado en producción (NODE_ENV=production) —")
user = auth_signup(MAIL, PASS)
uid = user.get("localId", "")
ok = start_next({"KYC_SMS_DEV_MODE": "true"})   # sin WHATSAPP_TOKEN a propósito
check("servidor next start levantado", ok)
st, r = http("POST", "/api/kyc/profile", {"fullName": "Jean Test", "storeName": "Boutique WA", "city": "Port-au-Prince", "department": "Ouest"}, user.get("idToken"))
check("perfil de vendedor creado", st == 200, r)
st, r = http("POST", "/api/kyc/phone/send-code", {"purpose": "seller_phone", "phone": PHONE}, user.get("idToken"))
check("modo dev en producción → 503 (no devuelve código)", st == 503 and "devCode" not in json.dumps(r), (st, r))
check("mensaje genérico sin detalles del proveedor", isinstance(r, dict) and "Meta" not in json.dumps(r) and "131047" not in json.dumps(r), r)
check("mock no recibió nada en fase A", len(mock_requests()) == 0)
stop_next()

# ══ FASE B: flujo completo contra el mock de Meta ════════════════════════════
print("— Fase B: flujo completo con WhatsApp simulado —")
ok = start_next({
    "KYC_SMS_DEV_MODE": "false",
    "WHATSAPP_TOKEN": MOCK_TOKEN, "WHATSAPP_PHONE_ID": MOCK_PID,
    "WHATSAPP_LANG": "fr", "WHATSAPP_TEMPLATE_NAME": "haitishop_code",
    "WHATSAPP_GRAPH_URL": f"http://127.0.0.1:{MOCK_PORT}",
})
check("servidor reiniciado con mock de Meta", ok)
tok = user.get("idToken")

st, r = http("POST", "/api/kyc/phone/send-code", {"purpose": "seller_phone", "phone": "1234"}, tok)
check("teléfono inválido → 400 (validación +509)", st == 400, (st, r))

st, r = http("POST", "/api/kyc/phone/send-code", {"purpose": "seller_phone", "phone": PHONE}, tok)
check("envío 1 → 200 sent=true sin devCode", st == 200 and r.get("sent") is True and r.get("devMode") is False and "devCode" not in r, (st, r))
reqs = mock_requests()
check("mock recibió exactamente 1 envío", len(reqs) == 1, len(reqs))
m = reqs[0]
check("autenticación Bearer con token del entorno", m["auth"] == "Bearer " + MOCK_TOKEN)
check("URL /v21.0/<phone-id>/messages", m["url"] == f"/v21.0/{MOCK_PID}/messages", m["url"])
b = m["body"]
check("tipo template + producto whatsapp", b.get("type") == "template" and b.get("messaging_product") == "whatsapp")
check("destinatario +509 sin signo +", b.get("to") == PHONE.replace("+", ""), b.get("to"))
check("idioma fr de la plantilla Authentication", b.get("template", {}).get("language", {}).get("code") == "fr")
comps = b.get("template", {}).get("components", [])
CODE1 = ""
if len(comps) == 2 and comps[0]["type"] == "body" and comps[1]["type"] == "button":
    CODE1 = comps[0]["parameters"][0]["text"]
    check("código 6 dígitos en cuerpo y botón copiar código",
          comps[1]["sub_type"] == "url" and comps[1]["parameters"][0]["text"] == CODE1 and len(CODE1) == 6, CODE1)
    check("el token nunca aparece en el cuerpo enviado", MOCK_TOKEN not in json.dumps(b))
else:
    check("estructura de plantilla Authentication (cuerpo + botón)", False, comps)

st, r = http("POST", "/api/kyc/phone/verify", {"purpose": "seller_phone", "code": "000000" if CODE1 != "000000" else "000001"}, tok)
check("código incorrecto → 400 con intentos restantes", st == 400 and "Essais restants" in str(r.get("error", "")), (st, r))
st, r = http("POST", "/api/kyc/phone/verify", {"purpose": "seller_phone", "code": CODE1}, tok)
check("código correcto → verificado", st == 200, (st, r))
st, r = http("GET", "/api/kyc/me", token=tok)
check("perfil marca phoneVerified=true", st == 200 and r.get("phoneVerified") is True, r.get("phoneVerified"))

# caducidad: segundo código, se adelanta expiresAt al pasado
st, r = http("POST", "/api/kyc/phone/send-code", {"purpose": "seller_phone"}, tok)
check("envío 2 → 200", st == 200, (st, r))
CODE2 = code_from_mock(1)
old = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 60))
# updateMask.fieldPaths: solo caduca expiresAt, sin sustituir el documento entero
patched = fs("PATCH", f"kycPhoneCodes/{uid}__seller_phone", {"fields": {"expiresAt": {"timestampValue": old}}}, mask="expiresAt")
check("Firestore acepta el parche de caducidad", "HTTP_ERROR" not in patched, patched.get("HTTP_ERROR"))
st, r = http("POST", "/api/kyc/phone/verify", {"purpose": "seller_phone", "code": CODE2}, tok)
check("código caducado → 400 «Code expiré»", st == 400 and "expiré" in str(r.get("error", "")).lower(), (st, r))

# límite 3/hora + reembolso cuando el proveedor falla
mock_control("error")
st, r = http("POST", "/api/kyc/phone/send-code", {"purpose": "seller_phone"}, tok)
check("fallo del proveedor → 503 genérico sin detalles", st == 503 and "131047" not in json.dumps(r) and "Meta" not in json.dumps(r) and "Re-engagement" not in json.dumps(r), (st, r))
mock_control("ok")
st, r = http("POST", "/api/kyc/phone/send-code", {"purpose": "seller_phone"}, tok)
check("envío reembolsado: 3.º envío OK tras el fallo", st == 200, (st, r))
st, r = http("POST", "/api/kyc/phone/send-code", {"purpose": "seller_phone"}, tok)
check("4.º envío en 1 hora → 429 (máx 3/hora)", st == 429, (st, r))

# bloqueo tras 5 intentos (propósito payout_phone con su propio contador)
st, r = http("POST", "/api/kyc/payout", {"provider": "moncash", "number": PAYOUT, "holderName": "Jean Test"}, tok)
check("número de pago guardado", st == 200, (st, r))
st, r = http("POST", "/api/kyc/phone/send-code", {"purpose": "payout_phone"}, tok)
check("envío código de pago por WhatsApp", st == 200, (st, r))
PCODE = code_from_mock(len(mock_requests()) - 1)
last = None
for i in range(5):
    wrong = f"{(int(PCODE) + i + 1) % 1000000:06d}"   # siempre distinto del correcto
    st, r = http("POST", "/api/kyc/phone/verify", {"purpose": "payout_phone", "code": wrong}, tok)
    last = (st, str(r.get("error", "")))
check("5 intentos fallidos: el 5.º consume el último (restantes 0)", last and last[0] == 400 and "Essais restants : 0" in last[1], last)
st, r = http("POST", "/api/kyc/phone/verify", {"purpose": "payout_phone", "code": PCODE}, tok)
check("bloqueo: ni el código correcto pasa (429)", st == 429, (st, r))

# ══ limpieza ════════════════════════════════════════════════════════════════
print("— Limpieza —")
fs("DELETE", f"kycPhoneCodes/{uid}__seller_phone")
fs("DELETE", f"kycPhoneCodes/{uid}__payout_phone")
fs("DELETE", f"kycRateLimits/{uid}_seller_phone_send")
fs("DELETE", f"kycRateLimits/{uid}_payout_phone_send")
fs("DELETE", f"sellers/{uid}")
try:
    req = urllib.request.Request(f"https://identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:delete",
        data=json.dumps({"localId": uid}).encode(), method="POST",
        headers={"Authorization": "Bearer " + sa_token(), "Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=30)
except Exception: pass
stop_next()
mock_http.shutdown()
print("limpieza hecha")

passed = sum(1 for _, ok in results if ok)
print(f"\n== RESULTADO: {passed}/{len(results)} pruebas OK ==")
sys.exit(0 if passed == len(results) else 1)
