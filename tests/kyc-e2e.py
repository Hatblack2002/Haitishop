#!/usr/bin/env python3
"""E2E del KYC de vendedores de HaïtiShop contra el servidor local (:3000).

Prueba: flujo feliz completo, código SMS caducado, exceso de intentos,
documento duplicado, acceso sin permisos y enlace firmado caducado.
Limpia sus datos al final (cuentas, docs, colecciones KYC de prueba).
"""
import base64, hashlib, json, sys, time, urllib.request, urllib.error

BASE = "http://localhost:3000"
API_KEY = "AIzaSyCi4lFiD3QhjnqAOg9JQ1g6PfjNw_eywHQ"
PROJECT = "haitishop"
SA = "/home/z/my-project/upload/haitishop-firebase-adminsdk-fbsvc-507bff993b.json"
ENVLOCAL = "/tmp/Haitishop/.env.local"
STAMP = str(int(time.time()))
A_MAIL, B_MAIL = f"kyc-a-{STAMP}@haitishop.dev", f"kyc-b-{STAMP}@haitishop.dev"
PASS = "KycTest2026!"
A_PHONE = "+50937" + STAMP[-6:]   # +509 + 8 dígitos
DOC_NUM_A = "123456789" + STAMP[-3:]
DOC_NUM_B = "987654321" + STAMP[-3:]

results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("OK " if cond else "XX ") + name + ((" — " + str(extra)[:180]) if extra else ""))

def http(method, url, body=None, token=None, raw=None, ctype="application/json"):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = {}
    if body is not None or raw is not None: h["content-type"] = ctype
    if token: h["authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            payload = r.read().decode()
            return r.status, (json.loads(payload) if payload and payload.startswith(("{", "[")) else payload)
    except urllib.error.HTTPError as e:
        payload = e.read().decode()
        try: return e.code, json.loads(payload)
        except Exception: return e.code, payload

# ── SA helpers ────────────────────────────────────────────────────────────────
import google.auth.transport.requests as gtr
from google.oauth2 import service_account as gsa
creds = gsa.Credentials.from_service_account_file(SA, scopes=[
    "https://www.googleapis.com/auth/datastore", "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/identitytoolkit"])
def sa_token():
    creds.refresh(gtr.Request()); return creds.token

def fs(method, path, body=None):
    req = urllib.request.Request(
        f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/{path}",
        method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": "Bearer " + sa_token(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return {"HTTP_ERROR": e.code}

def fs_delete_query(collection, field, value):
    body = {"structuredQuery": {"from": [{"collectionId": collection}],
            "where": {"fieldFilter": {"field": {"fieldPath": field}, "op": "EQUAL", "value": {"stringValue": value}}}}}
    req = urllib.request.Request(
        f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents:runQuery",
        data=json.dumps(body).encode(), method="POST",
        headers={"Authorization": "Bearer " + sa_token(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            for line in r.read().decode().splitlines():
                try: doc = json.loads(line)
                except Exception: continue
                name = doc.get("document", {}).get("name")
                if name: fs("DELETE", name.split("/documents/")[1])
    except Exception: pass

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

def auth_token(refresh_token):
    req = urllib.request.Request(
        f"https://securetoken.googleapis.com/v1/token?key={API_KEY}",
        data=json.dumps({"grant_type": "refresh_token", "refresh_token": refresh_token}).encode(),
        method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())["id_token"]

SA_JSON = json.load(open(SA))
def mint_admin_token(uid):
    now = int(time.time())
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    claims = {"iss": SA_JSON["client_email"], "sub": SA_JSON["client_email"], "aud": "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
              "iat": now, "exp": now + 3600, "uid": uid}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).rstrip(b"=").decode()
    import cryptography
    from cryptography.hazmat.primitives.asymmetric import padding as apad
    from cryptography.hazmat.primitives import hashes, serialization
    key = serialization.load_pem_private_key(SA_JSON["private_key"].encode(), None)
    sig = key.sign(f"{header}.{payload}".encode(), apad.PKCS1v15(), hashes.SHA256())
    jwt = f"{header}.{payload}." + base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    req = urllib.request.Request(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key={API_KEY}",
        data=json.dumps({"token": jwt, "returnSecureToken": True}).encode(),
        method="POST", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        print("custom-token error:", e.read().decode()[:300]); raise
    fs("PATCH", f"admins/{uid}", {"fields": {"role": {"stringValue": "admin"},
        "email": {"stringValue": "e2e-kyc@test.local"}, "displayName": {"stringValue": "E2E KYC"}}})
    return auth_token(data["refresh_token"])

def kyc_hmac_hex(value):
    raw = ""
    for line in open(ENVLOCAL, encoding="utf-8"):
        if line.startswith("FIREBASE_PRIVATE_KEY="):
            raw = line.split("=", 1)[1].strip()
    if raw.startswith('"') and raw.endswith('"'): raw = raw[1:-1]
    return hashlib.sha256(("haitishop-kyc-v1:" + raw).encode("utf-8")).hexdigest()

PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")

def multipart(fields, file_field, file_bytes, filename, mime):
    boundary = "----kyc" + STAMP
    out = b""
    for k, v in fields.items():
        out += f"--{boundary}\r\ncontent-disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    out += (f"--{boundary}\r\ncontent-disposition: form-data; name=\"{file_field}\"; filename=\"{filename}\"\r\n"
            f"content-type: {mime}\r\n\r\n").encode() + file_bytes + f"\r\n--{boundary}--\r\n".encode()
    return out, f"multipart/form-data; boundary={boundary}"

def post_multipart(url, fields, file_bytes, filename, mime, token, file_field="file"):
    body, ct = multipart(fields, file_field, file_bytes, filename, mime)
    req = urllib.request.Request(BASE + url, data=body, method="POST",
                                 headers={"content-type": ct, "authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read().decode())
        except Exception: return e.code, {}


# ── pre-limpieza de ejecuciones anteriores ──
def pre_cleanup():
    for email in [A_MAIL, B_MAIL]:
        try:
            req = urllib.request.Request(
                f"https://identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:lookup?key={API_KEY}",
                data=json.dumps({"localId": [email]}).encode(), method="POST",
                headers={"Authorization": "Bearer " + sa_token(), "Content-Type": "application/json"})
        except Exception:
            pass
    # borra por patrón de email usando runQuery sobre sellers
    for store in ("Boutique Test A", "Boutique B"):
        body = {"structuredQuery": {"from": [{"collectionId": "sellers"}],
                "where": {"fieldFilter": {"field": {"fieldPath": "storeName"}, "op": "EQUAL", "value": {"stringValue": store}}}}}
        req = urllib.request.Request(
            f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents:runQuery",
            data=json.dumps(body).encode(), method="POST",
            headers={"Authorization": "Bearer " + sa_token(), "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                for line in r.read().decode().splitlines():
                    try: doc = json.loads(line)
                    except Exception: continue
                    d = doc.get("document", {})
                    name = d.get("name")
                    if name:
                        uid = name.split("/documents/")[1].split("/")[0]
                        fs_delete_query("kycFiles", "uid", uid)
                        fs("DELETE", f"kycPhoneCodes/{uid}__seller_phone")
                        fs("DELETE", f"kycPhoneCodes/{uid}__payout_phone")
                        fs("DELETE", f"kycRateLimits/{uid}_seller_phone_send")
                        fs("DELETE", f"kycRateLimits/{uid}_payout_phone_send")
                        fs("DELETE", f"sellers/{uid}")
                        fs_delete_query("products", "sellerId", uid)
                        lr = urllib.request.Request(
                            f"https://identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:lookup?key={API_KEY}",
                            data=json.dumps({"email": [d.get("fields", {}).get("email", {}).get("stringValue", "")]}).encode(),
                            method="POST", headers={"Authorization": "Bearer " + sa_token(), "Content-Type": "application/json"})
                        try:
                            with urllib.request.urlopen(lr, timeout=30) as rr:
                                users = json.loads(rr.read().decode()).get("users", [])
                                for u in users:
                                    dr = urllib.request.Request(
                                        f"https://identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:delete",
                                        data=json.dumps({"localId": u["localId"]}).encode(), method="POST",
                                        headers={"Authorization": "Bearer " + sa_token(), "Content-Type": "application/json"})
                                    urllib.request.urlopen(dr, timeout=30)
                        except Exception: pass
        except Exception as e:
            print("pre-cleanup parcial:", e)
pre_cleanup()

# ══ 0. cuentas ══
print("— Cuentas de prueba —")
A, B = auth_signup(A_MAIL, PASS), auth_signup(B_MAIL, PASS)
check("cuentas de prueba creadas", bool(A.get("idToken")) and bool(B.get("idToken")))
A_tok = auth_token(A["refreshToken"]); B_tok = auth_token(B["refreshToken"])

# ══ 1. flujo feliz (A) ══
print("— Flujo feliz (vendedor A) —")
st, r = http("POST", "/api/kyc/profile", {"fullName": "Jean Pierre", "storeName": "Boutique Test A", "city": "Port-au-Prince", "department": "Ouest"}, A_tok)
check("paso 1: perfil guardado", st == 200 and isinstance(r, dict) and r.get("seller", {}).get("status") == "registrado", r)

st, r = http("POST", "/api/kyc/phone/send-code", {"purpose": "seller_phone", "phone": A_PHONE}, A_tok)
check("paso 2: código enviado (modo dev)", st == 200 and isinstance(r, dict) and r.get("devMode") is True, r)
CODE_OK = str(r.get("devCode") or "") if isinstance(r, dict) else ""

st, r = http("POST", "/api/kyc/phone/verify", {"purpose": "seller_phone", "code": CODE_OK}, A_tok)
check("paso 2: teléfono verificado", st == 200, r)
st, r = http("GET", "/api/kyc/me", token=A_tok)
check("estado → telefono_verificado", isinstance(r, dict) and r.get("status") == "telefono_verificado", r.get("status") if isinstance(r, dict) else r)

# ══ 2. código caducado ══
print("— Código caducado —")
st, r = http("POST", "/api/kyc/phone/send-code", {"purpose": "seller_phone"}, A_tok)
OLD_CODE = str(r.get("devCode") or "") if isinstance(r, dict) else ""
req_pm = urllib.request.Request(
   f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/kycPhoneCodes/{A['localId']}__seller_phone?updateMask.fieldPaths=expiresAt",
   data=json.dumps({"fields": {"expiresAt": {"timestampValue": "2020-01-01T00:00:00Z"}}}).encode(),
   method="PATCH", headers={"Authorization": "Bearer " + sa_token(), "Content-Type": "application/json"})
urllib.request.urlopen(req_pm, timeout=30)
st, r = http("POST", "/api/kyc/phone/verify", {"purpose": "seller_phone", "code": OLD_CODE}, A_tok)
check("código caducado rechazado", st == 400 and "expir" in str(r.get("error", "")).lower(), r)

# ══ 3. exceso de intentos ══
print("— Exceso de intentos —")
st, r = http("POST", "/api/kyc/phone/send-code", {"purpose": "seller_phone"}, A_tok)
NEW_CODE = str(r.get("devCode") or "") if isinstance(r, dict) else ""
wrong_ok = False
for i in range(5):
    st, r = http("POST", "/api/kyc/phone/verify", {"purpose": "seller_phone", "code": "000000" if NEW_CODE != "000000" else "111111"}, A_tok)
    wrong_ok = (st == 400)
st, r = http("POST", "/api/kyc/phone/verify", {"purpose": "seller_phone", "code": NEW_CODE}, A_tok)
check("5 intentos erróneos → código correcto también rechazado", wrong_ok and st == 429, r)
st, r = http("POST", "/api/kyc/phone/send-code", {"purpose": "seller_phone"}, A_tok)
check("4º envío en 1 hora → 429 (máx 3/hora)", st == 429, r)

# ══ 4. documento duplicado ══
print("— Documentos + duplicado —")
st, r = post_multipart("/api/kyc/documents", {"kind": "id_front", "documentType": "cni", "documentNumber": DOC_NUM_A}, PNG_1PX, "cni.png", "image/png", A_tok)
check("A sube CNI recto (cifrada)", st == 200, r)
st, r = post_multipart("/api/kyc/documents", {"kind": "id_front", "documentType": "cni", "documentNumber": DOC_NUM_B}, PNG_1PX, "cni-b.png", "image/png", B_tok)
check("B sin perfil → rechazado", st == 400, r)
http("POST", "/api/kyc/profile", {"fullName": "Marc Louis", "storeName": "Boutique B", "city": "Cap-Haitien", "department": "Nord"}, B_tok)
st, r = post_multipart("/api/kyc/documents", {"kind": "id_front", "documentType": "cni", "documentNumber": DOC_NUM_A}, PNG_1PX, "cni-b.png", "image/png", B_tok)
check("documento duplicado rechazado (409)", st == 409, r)

st, _ = post_multipart("/api/kyc/documents", {"kind": "id_back", "documentType": "cni"}, PNG_1PX, "verso.png", "image/png", A_tok)
check("A sube CNI verso", st == 200)
st, _ = post_multipart("/api/kyc/documents", {"kind": "selfie", "documentType": "cni"}, PNG_1PX, "selfie.png", "image/png", A_tok)
check("A sube selfie", st == 200)

# ══ 5. pago (MonCash) + verificación SMS ══
print("— Número de pago —")
st, r = http("POST", "/api/kyc/payout", {"provider": "moncash", "number": A_PHONE, "holderName": "Jean Pierre"}, A_tok)
check("número de pago guardado (cifrado)", st == 200 and isinstance(r, dict) and r.get("needsVerification"), r)
st, r = http("POST", "/api/kyc/phone/send-code", {"purpose": "payout_phone"}, A_tok)
PCODE = str(r.get("devCode") or "") if isinstance(r, dict) else ""
st, r = http("POST", "/api/kyc/phone/verify", {"purpose": "payout_phone", "code": PCODE}, A_tok)
check("número de pago verificado por SMS", st == 200, r)
st, r = http("GET", "/api/kyc/me", token=A_tok)
masked = str(r.get("documentMasked") or "") if isinstance(r, dict) else ""
check("documento enmascarado (solo últimos 4)", "••" in masked and DOC_NUM_A[-4:] in masked, masked)

# ══ 6. envío a revisión ══
print("— Envío a revisión —")
st, r = http("POST", "/api/kyc/submit", {"acceptTerms": True}, A_tok)
check("dossier enviado → en_revision", st == 200 and isinstance(r, dict) and r.get("seller", {}).get("status") == "en_revision", r)
st, r = http("POST", "/api/kyc/submit", {"acceptTerms": False}, A_tok)
check("sin términos rechazado", st == 400, r)

# ══ 7. acceso sin permisos ══
print("— Acceso sin permisos —")
st, r = http("GET", "/api/admin/kyc/seller/" + A["localId"], token=B_tok)
check("detalle admin con no-admin → 403", st == 403, r)
st, r = http("GET", "/api/admin/kyc/queue", token=B_tok)
check("cola admin con no-admin → 403", st == 403, r)

fs("PATCH", f"admins/{B['localId']}", {"fields": {"role": {"stringValue": "admin"}, "email": {"stringValue": B_MAIL}, "displayName": {"stringValue": "E2E Admin"}}})
ADMIN_tok = B_tok
st, r = http("GET", "/api/admin/kyc/seller/" + A["localId"], token=ADMIN_tok)
links = r.get("documentLinks", {}) if isinstance(r, dict) else {}
check("detalle admin OK + enlaces firmados", st == 200 and len(links) == 3, list(links) if isinstance(links, dict) else links)
first_kind = next(iter(links), None) if isinstance(links, dict) else None
path = (links.get("id_front") or (first_kind and links.get(first_kind))) if isinstance(links, dict) else ""
parsed = path.split("?")[0] if path else ""
qs = dict(pair.split("=", 1) for pair in (path.split("?")[1].split("&") if path and "?" in path else []))
exp, sig = qs.get("exp", ""), qs.get("sig", "")
st, r = http("GET", parsed)
check("documento sin firma → 403", st == 403, r)
st, r = http("GET", parsed + f"?exp={exp}&sig={'0' * len(sig)}")
check("firma manipulada → 403", st == 403, r)
exp_past = str(int(time.time() * 1000) - 5000)
sig_past = kyc_hmac_hex(f"doc:{parsed.rsplit('/', 1)[1]}:{exp_past}")
st, r = http("GET", parsed + f"?exp={exp_past}&sig={sig_past}")
check("enlace firmado caducado → 403", st == 403, r)
req_bin = urllib.request.Request(BASE + parsed + f"?exp={exp}&sig={sig}")
try:
    with urllib.request.urlopen(req_bin, timeout=30) as rb:
        ok_link = rb.status == 200 and rb.read(8) == b"\x89PNG\r\n\x1a\n"
except urllib.error.HTTPError as eb:
    ok_link = False
check("enlace válido sirve el documento (PNG)", ok_link)
st, r = http("GET", "/api/kyc/me", token=A_tok)
dump = json.dumps(r) if isinstance(r, dict) else ""
check("vendedor NO ve campos cifrados", "documentNumberEnc" not in dump and "payoutNumberEnc" not in dump)

# ══ 8. decisión admin + publicación ══
print("— Decisión admin —")
st, r = http("POST", f"/api/admin/kyc/seller/{A['localId']}/decision", {"action": "reject", "motivo": "Fotos poco legibles, reenvíe por favor."}, ADMIN_tok)
check("rechazo con motivo obligatorio", st == 200 and isinstance(r, dict) and r.get("status") == "rechazado", r)
st, r = http("POST", "/api/kyc/resubmit", token=A_tok)
check("vendedor reenvía dossier", st == 200 and isinstance(r, dict) and r.get("seller", {}).get("status") == "en_revision", r)
st, r = http("POST", f"/api/admin/kyc/seller/{A['localId']}/decision", {"action": "approve"}, ADMIN_tok)
check("aprobación → verificado", st == 200 and isinstance(r, dict) and r.get("status") == "verificado", r)
prof = fs("GET", f"sellerProfiles/{A['localId']}")
check("insignia sellerProfiles.verified=true", prof.get("fields", {}).get("verified", {}).get("booleanValue") is True)

st, r = post_multipart("/api/seller/products", {"name": "Produit test KYC", "description": "Un produit de test du vendeur verifie.", "price": "1500", "stock": "3",
                      "category": "Mode", "condition": "Neuf", "location": "Port-au-Prince", "brand": "", "variants": ""}, PNG_1PX, "prod.png", "image/png", A_tok, "photo")
check("vendedor verificado publica producto", st == 200 and isinstance(r, dict) and "productId" in r, r)
st, r = post_multipart("/api/seller/products", {"name": "Produit B", "description": "Produit de compte no verifie.", "price": "900", "stock": "2",
                      "category": "Mode", "condition": "Neuf", "location": "Cap-Haitien", "brand": "", "variants": ""}, PNG_1PX, "prod-b.png", "image/png", B_tok, "photo")
check("no verificado NO publica (403)", st == 403, r)

# ══ 9. suspensión ══
print("— Suspensión —")
st, r = http("POST", f"/api/admin/kyc/seller/{A['localId']}/suspend", {"action": "suspend", "motivo": "Revisión manual solicitada por el propietario."}, ADMIN_tok)
check("suspensión → suspendido", st == 200 and isinstance(r, dict) and r.get("status") == "suspendido", r)
prof = fs("GET", f"sellerProfiles/{A['localId']}")
check("insignia retirada al suspender", prof.get("fields", {}).get("verified", {}).get("booleanValue") is False)
st, r = http("POST", f"/api/admin/kyc/seller/{A['localId']}/suspend", {"action": "unsuspend"}, ADMIN_tok)
check("reactivación → verificado", st == 200 and isinstance(r, dict) and r.get("status") == "verificado", r)

# ══ 10. cierre de cuenta (retención) ══
print("— Cierre de cuenta —")
st, r = http("DELETE", "/api/kyc/close", token=A_tok)
check("cierre borra documentos y expediente", st == 200, r)
gone = fs("GET", f"sellers/{A['localId']}")
check("sellers/{A} eliminado", "HTTP_ERROR" in gone, gone.get("HTTP_ERROR"))

# ══ limpieza ══
print("— Limpieza —")
for local in (A["localId"], B["localId"]):
    fs_delete_query("kycFiles", "uid", local)
    fs("DELETE", f"kycPhoneCodes/{local}__seller_phone")
    fs("DELETE", f"kycPhoneCodes/{local}__payout_phone")
    fs("DELETE", f"kycRateLimits/{local}_seller_phone_send")
    fs("DELETE", f"kycRateLimits/{local}_payout_phone_send")
    fs("DELETE", f"sellers/{local}")
    req = urllib.request.Request(
        f"https://identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:delete",
        data=json.dumps({"localId": local}).encode(), method="POST",
        headers={"Authorization": "Bearer " + sa_token(), "Content-Type": "application/json"})
    try: urllib.request.urlopen(req, timeout=30)
    except Exception: pass
fs("DELETE", "admins/e2e-admin-kyc-" + STAMP)
fs_delete_query("products", "sellerId", A["localId"])
print("limpieza hecha")

passed = sum(1 for _, ok in results if ok)
print(f"\n== RESULTADO: {passed}/{len(results)} pruebas OK ==")
sys.exit(0 if passed == len(results) else 1)
