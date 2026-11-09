# HaïtiShop Demo

Marketplace demo for Haiti, built with Next.js, TypeScript, Firebase Authentication, Cloud Firestore and Cloudinary.

## Current demo foundation

- French-first responsive marketplace landing page.
- Search and category filtering against sample catalogue data.
- Firebase email/password sign-up and login modal.
- HTG price formatting.
- WhatsApp, MonCash and NatCash flows are planned as demo flows; no real payment processing is enabled.
- Cloudinary logo asset reference is configured in the homepage.

## Local setup

1. Install Node.js 22 or later.
2. Copy `.env.example` to `.env.local`.
3. The Firebase web configuration is already populated with the public client values supplied for the demo. These values are not Firebase Admin credentials.
4. In Firebase Console, enable **Authentication → Sign-in method → Email/Password**.
5. Confirm Firestore is enabled. Configure restrictive Firestore Security Rules before adding user or seller data.
6. Install dependencies with `npm install`.
7. Start with `npm run dev`.

## Cloudinary uploads

The demo needs an unsigned upload preset for browser-side product image uploads. In Cloudinary Console, open **Settings → Upload → Upload Presets → Add upload preset**. Set **Signing Mode** to **Unsigned**, choose a dedicated folder such as `haitishop-demo/products`, allow only image formats (jpg, jpeg, png, webp), and save. Put the preset name in `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`.

Do not put the Cloudinary API Secret or Firebase Admin private key in this repository or browser code.

## Catálogo inicial (Cloudinary + Firestore)

El catálogo de la demo ya está cargado y operativo:

- **18 productos** (3 por cada una de las 6 categorías confirmadas), precios en HTG.
- **Imágenes alojadas en Cloudinary** (cloud `dcclzhsim`, carpeta `haitishop-demo/products`,
  entrega optimizada `f_auto,q_auto`) vía el upload preset unsigned `haitishop_demo_unsigned`.
- **Metadatos en Cloud Firestore** (colección `products`), publicados con el script de seed.
- La app muestra primero este catálogo inicial (`src/data/catalog-seed.json`) y en cuanto
  Firestore tiene productos publicados, la suscripción en vivo los sustituye automáticamente.
  Así la página nunca se ve vacía, ni siquiera antes del seed o si Firestore falla.

### Repoblar Firestore con el catálogo inicial

```bash
# 1. Clave de cuenta de servicio (Firebase Console → Cuentas de servicio).
#    No la versiones: .gitignore ya excluye *firebase-adminsdk*.json
# 2. Ejecutar el seed (idempotente, IDs fijos):
FIREBASE_SERVICE_ACCOUNT_PATH=./clave.json npm run seed
```

Las reglas de seguridad desplegadas (`firestore.rules`) permiten la **lectura pública**
de `products` y bloquean la escritura a cualquiera salvo vendedor aprobado o
administración; el SDK de administración del seed las omite por diseño.

## Catálogo inicial (Cloudinary + Firestore)

El catálogo de la demo ya está cargado y operativo:

- **18 productos** (3 por cada una de las 6 categorías confirmadas), precios en HTG.
- **Imágenes alojadas en Cloudinary** (cloud `dcclzhsim`, carpeta `haitishop-demo/products`,
  entrega optimizada `f_auto,q_auto`) vía el upload preset unsigned `haitishop_demo_unsigned`.
- **Metadatos en Cloud Firestore** (colección `products`), publicados con el script de seed.
- La app muestra primero este catálogo inicial (`src/data/catalog-seed.json`) y en cuanto
  Firestore tiene productos publicados, la suscripción en vivo los sustituye automáticamente.
  Así la página nunca se ve vacía, ni siquiera antes del seed o si Firestore falla.

### Repoblar Firestore con el catálogo inicial

```bash
# 1. Clave de cuenta de servicio (Firebase Console → Cuentas de servicio).
#    No la versiones: .gitignore ya excluye *firebase-adminsdk*.json
# 2. Ejecutar el seed (idempotente, IDs fijos):
FIREBASE_SERVICE_ACCOUNT_PATH=./clave.json npm run seed
```

Las reglas de seguridad desplegadas (`firestore.rules`) permiten la **lectura pública**
de `products` y bloquean la escritura a cualquiera salvo vendedor aprobado o
administración; el SDK de administración del seed las omite por diseño.

## Validation

- `npm run typecheck`
- `npm run lint`
- `npm run build`

GitHub Actions runs these checks on pushes and pull requests to `main`.
