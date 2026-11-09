/**
 * Publica el catálogo inicial de la demo en Cloud Firestore.
 *
 * Uso:
 *   1. Descarga la clave de cuenta de servicio desde
 *      Firebase Console → Configuración del proyecto → Cuentas de servicio.
 *   2. Ejecuta:
 *      FIREBASE_SERVICE_ACCOUNT_PATH=./clave.json npm run seed
 *
 * El script es idempotente: cada producto se escribe con set() y un ID
 * fijo (catalog-seed.json → "id"), así que se puede relanzar sin duplicar.
 *
 * Nota: el SDK de administración ignora las reglas de seguridad de Firestore
 * — es la vía prevista para operaciones de carga de datos del propietario.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataPath = path.join(root, "src", "data", "catalog-seed.json");
const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  || process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!keyPath) {
  console.error("Falta la clave de cuenta de servicio.\n"
    + "Uso: FIREBASE_SERVICE_ACCOUNT_PATH=./clave.json npm run seed");
  process.exit(1);
}

const products = JSON.parse(readFileSync(dataPath, "utf8"));
const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const batch = db.batch();
for (const product of products) {
  const { id, createdAt, ...fields } = product;
  const createdAtSeconds = createdAt?.seconds ?? Math.floor(Date.now() / 1000);
  batch.set(db.collection("products").doc(id), {
    ...fields,
    createdAt: Timestamp.fromMillis(createdAtSeconds * 1000),
  });
}

try {
  await batch.commit();
  console.log(`OK ${products.length} productos publicados en Firestore (proyecto ${serviceAccount.project_id}).`);
  console.log("   Colección: products · IDs:", products.map((p) => p.id).join(", "));
} catch (error) {
  console.error("Error publicando el catálogo:", error);
  process.exit(1);
}
