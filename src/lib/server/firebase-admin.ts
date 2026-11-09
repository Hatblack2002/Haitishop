import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Firebase Admin perezoso: se inicializa SOLO cuando una ruta de API lo usa.
 * Nunca en tiempo de build. Credenciales 100% por variables de entorno.
 *
 * Vercel (Production → Environment Variables):
 *   FIREBASE_PROJECT_ID      = haitishop
 *   FIREBASE_CLIENT_EMAIL    = firebase-adminsdk-...@haitishop.iam.gserviceaccount.com
 *   FIREBASE_PRIVATE_KEY     = "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
 * (los valores salen del JSON de la cuenta de servicio, que nunca se versiona)
 */

export const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "haitishop";

let cachedApp: App | null = null;

function getAdminApp(): App {
  if (cachedApp) return cachedApp;
  const existing = getApps().find((a) => a.name === "haitishop-server");
  if (existing) { cachedApp = existing; return cachedApp; }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      "FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY no están configuradas en el entorno del servidor."
    );
  }
  cachedApp = initializeApp(
    { credential: cert({ projectId: PROJECT_ID, clientEmail, privateKey }) },
    "haitishop-server"
  );
  return cachedApp;
}

export function adminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function adminAuth(): Auth {
  return getAuth(getAdminApp());
}

export type AdminUser = { uid: string; email: string; isAdmin: boolean };

/** Verifica el ID token de Firebase del cliente y devuelve el usuario (+ rol admin). */
export async function requireUser(req: Request): Promise<AdminUser | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(token, true);
    const uid = decoded.uid;
    let isAdmin = false;
    try {
      const adminDoc = await adminDb().collection("admins").doc(uid).get();
      isAdmin = adminDoc.exists;
    } catch { isAdmin = false; }
    return { uid, email: decoded.email || "", isAdmin };
  } catch {
    return null;
  }
}
