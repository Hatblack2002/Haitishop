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

## Login (Firebase Authentication) — verificado

El inicio de sesión con correo y contraseña funciona de punta a punta (probado en navegador
contra el proyecto `haitishop`):

- **Cuenta de demostración:** `demo@haitishop.dev` / `DemoHaiti2026` (creada con la API admin;
  tiene documento `admins/{uid}` en Firestore, por lo que ve el panel de administración).
- Causa del fallo anterior: la `apiKey` del código tenía dos caracteres invertidos
  (`AO9gJQ…` en lugar de `AOg9JQ…`) y el `appId` tenía un número de proyecto equivocado.
  Ambos valores fueron tomados de la configuración web real del proyecto y corregidos en
  `src/lib/firebase.ts` y `.env.example`.
- El dominio `haitishop.vercel.app` quedó añadido a los dominios autorizados de Firebase
  Authentication (necesario para los flujos de la web desplegada).
- Errores de login traducidos al francés en el modal (credenciales inválidas, e-mail ya usado,
  contraseña débil, demasiados intentos, red…) y el modal se cierra solo tras entrar.

Para quitar los permisos de administrador de la cuenta demo: eliminar el documento
`admins/l5RRuqlzjPfgEmhk0ve6HEUo1q73` en Firestore (Console → Firestore → admins).

## Escrow: confirmación de entrega con retención de pago (2026-11-10)

Sistema de pago retenido tipo escrow manual: el dinero del cliente queda **retenido** y solo
se libera al vendedor cuando el cliente confirma que recibió su pedido (o tras los plazos de
seguridad). Sin integración MonCash/NatCash todavía: las transferencias las hace el
propietario manualmente y luego marca «versé» en el panel. Sin anuncios ni publicidad en
ninguna parte.

Estados del pedido: `pendiente_pago → pagado_retenido → entregado_confirmado →
pago_liberable → pago_liberado` (+ paralelos `en_disputa`, `cancelado`; los pedidos del
antiguo flujo WhatsApp quedan como `awaiting_confirmation`).

**Flujo:**
1. Checkout (API `/api/checkout`): el servidor valida precios y stock, crea el pedido,
   genera un **token criptográfico de 256 bits** y un **código de entrega de 6 dígitos**.
   Guarda solo el **hash SHA-256** del token y del código (el código se guarda además
   cifrado con AES-256-GCM para poder mostrárselo de nuevo al comprador en «Mes commandes»).
   Envía el e-mail de compra (asunto «Ta commande HaïtiShop est confirmée») y muestra el
   mismo resumen en pantalla.
2. El enlace del e-mail NO confirma nada: abre `/confirmation/{token}`, una página con dos
   botones — «Oui, j'ai reçu ma commande» y «J'ai un problème» — que no muestra datos
   personales del comprador. La confirmación real es un **POST** con doble confirmación
   («Êtes-vous sûr ? Le paiement sera envoyé au vendeur»).
3. Tras confirmar: e-mail «Tu as confirmé la réception…» con botón de anulación válido 24 h
   (token `deshacer_confirmacion`). Si lo usa, el pedido pasa a `en_disputa` y el pago queda
   retenido.
4. El vendedor marca la entrega en «Mes ventes» introduciendo el código de 6 dígitos:
   máx. 5 intentos fallidos y el código se **bloquea** con aviso al administrador.
5. Plazos automáticos: sin disputa 24 h tras la confirmación (o 72 h tras la marca de
   entrega sin respuesta) → `pago_liberable`. Tick lazy en cada lectura + cron diario
   (`/api/cron/escrow`, protegido con `CRON_SECRET`).
6. El administrador transfiere al vendedor y pulsa «Marquer paiement libéré» →
   `pago_liberado`. Cada evento queda en el historial (quién, qué, cuándo) y el admin
   recibe un correo en cada confirmación, litigo y pago liberable.

**Panel de administración** (pestañas): *Commandes* (filtro por estado, vendedor, monto,
comisión y monto a transferir, botones «Paiement reçu» / «Marquer paiement libéré»),
*Litiges* (cola con motivo y fotos, resolver a favor del vendedor o del cliente) e
*Historique* (auditoría completa).

**Seguridad:** todo el procesamiento en el servidor (Next.js API routes + Firebase Admin
SDK, inicialización perezosa); tokens de un solo uso (transacciones de Firestore, campo
`used_at`) con caducidad (confirmar 14 días, anular 24 h) e invalidación del anterior al
regenerar; validación token↔pedido↔cliente; rate limiting por IP en los endpoints
sensibles; reglas de Firestore que bloquean toda escritura cliente sobre `orders`,
`escrowTokens`, `orderEvents` y `disputes`; claves solo por variables de entorno.

**Variables de entorno del servidor (Vercel → Settings → Environment Variables):**

| Variable | Valor |
|---|---|
| `FIREBASE_PROJECT_ID` | `haitishop` |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-…@haitishop.iam.gserviceaccount.com` (del JSON de la cuenta de servicio) |
| `FIREBASE_PRIVATE_KEY` | la clave privada del mismo JSON (con los `\n` literales) |
| `RESEND_API_KEY` | opcional: envío real de e-mails (resend.com, gratis). Sin clave, los correos se registran en el log y en el historial y nada se rompe |
| `ADMIN_EMAIL` | correo del propietario que recibe los avisos (por defecto `vertiljivenson9@gmail.com`) |
| `ESCROW_COMMISSION_PERCENT` | comisión en % (por defecto 5) |
| `CRON_SECRET` | secreto del cron de Vercel |

**Orden de puesta en marcha en producción:** 1) añadir las variables `FIREBASE_*` en
Vercel y redesplegar; 2) desplegar las reglas de Firestore actualizadas (`firestore.rules`:
escrituras de pedidos/tokens/eventos/litigos solo servidor — puede hacerse desde la consola
o con la CLI); 3) opcionalmente configurar `RESEND_API_KEY` para los e-mails reales.

## Funciones de la demo (estado 2026-11-10)

- **Onboarding tipo marketplace (Comment ça marche)**: sección en la portada con las dos
  rutas — comprar (sin cuenta hasta el checkout) y vender (cuenta gratuita + solicitud con
  documento + aprobación) — para que el flujo quede claro a primera vista.
- **Guía post-autenticación**: tras entrar o crear cuenta, un aviso contextual explica el
  siguiente paso y el carrito se reabre automáticamente si tenía productos.

- **Login con Google**: botón «Continuer avec Google» en el modal (signInWithPopup).
  Requiere activar una vez el proveedor en Firebase Console → Authentication →
  Sign-in method → Google → Activer (gratis, usa el correo de asistencia del proyecto).
- **Login Firebase email/contraseña** con recuperación de contraseña ("Mot de passe oublié ?"
  envía el correo de restablecimiento de Firebase) y errores traducidos al francés.
- **Ficha de producto**: al hacer clic en la imagen o el nombre de un producto se abre una
  ficha con foto, precio, descripción, marca, variantes, vendedor, ubicación y existencias,
  con botón para añadir al carrito.
- **Verificación documental de vendedores**: el formulario de inscripción de vendedor sube
  una foto del documento a Cloudinary (carpeta `haitishop-demo/documents`) y la
  administración la revisa con el enlace «Voir le document» antes de aprobar.
- **Panel de administración**: demandas de vendedores pendientes (con documento), gestión
  de pagos escrow por pestañas (Commandes / Litiges / Historique) y auditoría de eventos.
- **Mes commandes**: el comprador ve sus pedidos con estado del escrow, su código de
  entrega, los plazos y puede pedir un nuevo enlace de confirmación.
- **Mes ventes**: el vendedor ve los pedidos con sus productos, lo que recibirá (después de
  la comisión) y marca la entrega con el código del cliente.
- **SEO y favicon**: metadatos Open Graph/Twitter con el logo original y `icon.png`
  (generado desde el logo) servido por Next.js.

## Validation

- `npm run typecheck`
- `npm run lint`
- `npm run build`

GitHub Actions runs these checks on pushes and pull requests to `main`.
