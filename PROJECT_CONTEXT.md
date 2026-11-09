# HaïtiShop — Documento maestro de continuidad

> **Propósito:** conservar en el repositorio el estado verificable del proyecto para retomarlo desde cualquier conversación o entorno sin reconstruir el contexto.
>
> **Estado:** documento vivo. Los datos marcados como *por confirmar* no son decisiones aprobadas.

## 1. Identidad y propósito

- **Proyecto:** HaïtiShop.
- **Mercado objetivo:** Haití.
- **Tipo de entrega actual:** demo; no es una plataforma de producción.
- **Modelo comercial:** marketplace.
- **Público objetivo:** consumidores particulares y empresas/comerciantes.
- **Cobertura inicial:** todo el territorio nacional de Haití.
- **Objetivo funcional y visión detallada:** por definir con el propietario.
- **Idiomas de interfaz:** francés, criollo haitiano e inglés.
- **Moneda de visualización:** gourde haitiana (HTG); reglas de precios e impuestos pendientes.
- **Estilo visual:** moderno y profesional.
- **Paleta:** azul y blanco, estilo corporativo.
- **Referencia visual:** Amazon como referencia de organización y experiencia marketplace; no implica copiar su identidad.
- **Página principal:** estructura de marketplace con buscador, categorías, ofertas y productos.
- **Navegación móvil:** barra inferior.
- **Tema:** solo modo claro.
- **Logotipo:** el propietario confirmó que el logotipo alojado en Cloudinary (public ID `copy_of_file_000000004b4481f5856e94a87bad615e_awp5pa.png`) es el original, subido por él mismo. No crear uno nuevo ni sustituirlo.

## 2. Alcance funcional confirmado

### 2.1 Marketplace y vendedores

- HaïtiShop funcionará como marketplace, no como una tienda de un único comercio.
- El público incluye compradores particulares y clientes empresariales/comerciantes.
- El registro de vendedores estará abierto, pero también podrá realizarse mediante creación o habilitación administrativa.
- Los vendedores deberán pasar verificación documental.
- Una vez que un vendedor esté habilitado, sus productos podrán publicarse inmediatamente, sin aprobación previa individual.
- Cada vendedor tendrá su propio panel; también existirá un panel administrativo.
- Cada vendedor administrará sus propios productos, precios e inventario.
- Cada vendedor organizará sus propias entregas.
- El modelo de ingresos seleccionado es una suscripción para vendedores; precio, periodicidad, planes y cobro están pendientes de definición.

### 2.2 Categorías iniciales

Categorías seleccionadas por el propietario:
- Electrónica y teléfonos.
- Ropa, zapatos y accesorios.
- Hogar y electrodomésticos.
- Alimentos y bebidas.
- Belleza y cuidado personal.
- Construcción y herramientas.

No se deben agregar otras categorías como alcance inicial sin confirmación.

### 2.3 Diferenciadores

El propietario seleccionó:
- Precios bajos/competitivos.
- Comercio local y participación de vendedores haitianos.
- Confianza y seguridad en la experiencia de compra.

Los mecanismos concretos para garantizar confianza (verificación de vendedores, reseñas, disputas, reembolsos, moderación, etc.) están pendientes de diseño.

### 2.4 Experiencia de compra, pagos y pedidos

- Los visitantes podrán explorar el catálogo tanto sin cuenta como después de iniciar sesión.
- La creación de cuenta será obligatoria al llegar al checkout/confirmación de compra; no será necesaria para explorar.
- El carrito será persistente y estará asociado a la cuenta del comprador.
- El checkout se realizará dentro de HaïtiShop y se complementará con confirmación mediante WhatsApp.
- MonCash y NatCash aparecerán como métodos de pago seleccionables.
- La selección de ambos métodos no significa que sus API estén conectadas ni que existan credenciales o entornos de prueba configurados.
- El cliente consultará sus pedidos únicamente mediante WhatsApp; no se ha solicitado una sección interna de «Mis pedidos».
- No se incluirá seguimiento de pedidos dentro de la plataforma en el alcance decidido hasta ahora.
- Las valoraciones y reseñas están pendientes de decisión.
- Reglas de confirmación de pago, conciliación, cancelaciones y reembolsos: por definir.


### 2.5 Catálogo y publicación de productos

- Campos obligatorios de cada producto: nombre, descripción, precio, fotografía, existencias disponibles, categoría, estado (nuevo/usado) y ubicación del vendedor.
- No se establecieron como obligatorios la marca ni el SKU/código de producto.
- Cada producto tendrá una sola fotografía.
- Se admitirán variantes configurables dentro de un producto (por ejemplo, talla, color, capacidad o modelo). Los atributos concretos y la gestión de existencias/precios por variante quedan pendientes.
- El inventario será administrado manualmente por el vendedor; no se ha decidido un descuento automático de existencias por compra.
- El buscador incluirá búsqueda avanzada por nombre, categoría, marca y palabras clave, con sugerencias mientras el usuario escribe.
- Los filtros incluirán precio, categoría, marca, ubicación, vendedor y disponibilidad.
- El catálogo podrá ordenarse por relevancia, precio ascendente, precio descendente y fecha de publicación (más recientes).
- La ficha de producto será completa e incluirá galería/fotografía, descripción, precio, vendedor, disponibilidad y acción de compra. La opción de una sola fotografía significa que la galería tendrá una única imagen por producto en el alcance actual.

## 3. Arquitectura y servicios

| Área | Información disponible | Estado |
|---|---|---|
| Autenticación | Firebase Authentication con correo y contraseña (sign up/login) | Configuración web corregida (apiKey y appId reales) y verificada en navegador; dominio `haitishop.vercel.app` autorizado |
| Base de datos | Cloud Firestore con 18 productos publicados y reglas del repo desplegadas | Colección `products` con lectura pública; seed idempotente `npm run seed` |
| Imágenes y recursos visuales | Cloudinary, cloud `dcclzhsim`; logo alojado en la cuenta | Logo referenciado; upload preset unsigned pendiente |
| Pagos | MonCash y NatCash | Simulación en demo; acceso API pendiente de verificación de cuenta del propietario |
| Pedidos | Flujo de confirmación y consulta mediante WhatsApp | Implementación demo sin número oficial; destino configurable pendiente |
| Ubicación del cliente | Compartir ubicación solo con consentimiento del cliente | Decisión previa |
| Hosting/despliegue | No asumir Vercel ni otro proveedor | Por confirmar |
| Código y control de versiones | GitHub: Hatblack2002/Haitishop | Repositorio identificado |

**Regla de arquitectura:** no añadir servicios, proveedores, bases de datos ni dependencias sin documentar su propósito y obtener aprobación del propietario.

## 4. Configuración técnica

Registrar aquí, cuando el propietario los vuelva a proporcionar:

- Identificadores públicos de proyecto y nombres de instancia.
- Dominios autorizados y configuración de hosting.
- Variables de entorno por nombre, nunca sus valores secretos.
- Versiones de frameworks, SDK y dependencias.
- Configuración de almacenamiento y subida de archivos.
- Endpoints de prueba y documentación oficial de pagos.

**Seguridad:** nunca guardar contraseñas, claves privadas, tokens, secretos de API, códigos de recuperación ni credenciales en este documento o en Git. Usar variables de entorno y secretos del entorno de ejecución.

## 5. Estado de implementación

| Componente | Estado | Evidencia / observaciones |
|---|---|---|
| Repositorio y estructura de código | Base inicial creada | Next.js 15, React 19, TypeScript, Firebase SDK y CI; commit `69f0b95` |
| Diseño y páginas | Primera página de marketplace creada | Hero, buscador, categorías, catálogo de muestra y acceso de cuenta; commit `69f0b95` |
| Marketplace / panel de vendedores | Alcance funcional definido; implementación por inspeccionar | Panel administrativo y panel individual de vendedor |
| Catálogo de productos | Alcance funcional definido; implementación por inspeccionar | Campos obligatorios, foto única, variantes, búsqueda, filtros, ordenamiento y ficha definidos |
| Carrito | Alcance funcional definido; implementación por inspeccionar | Carrito persistente asociado a la cuenta |
| Checkout | Alcance funcional definido; implementación por inspeccionar | Checkout interno con confirmación complementaria por WhatsApp |
| Autenticación | Sign up/login implementado y verificado end-to-end | Firebase email/password probado en navegador: entrada, cierre de sesión y panel admin funcionan; cuenta demo `demo@haitishop.dev` (admin) disponible |
| Cloudinary | 18 imágenes de productos alojadas y optimizadas (`f_auto,q_auto`); preset unsigned operativo | Carpeta `haitishop-demo/products`, public IDs `<categoría>-<n>-<slug>` |
| MonCash | Requisito confirmado; implementación por confirmar | No asumir conexión activa |
| NatCash | Requisito confirmado; implementación por confirmar | No asumir conexión activa |
| Flujo WhatsApp | Alcance funcional definido parcialmente; implementación por inspeccionar | Confirmación de compra y consulta de pedidos por WhatsApp |
| Pruebas | Verificación manual E2E en navegador | Login, recuperación de contraseña, ficha de producto, checkout, pedidos admin, documento de vendedor y aprobación probados el 2026-11-10 |
| Despliegue demo | Por confirmar | — |

## 6. Decisiones aprobadas

Añadir cada decisión con fecha, responsable y motivo. Si una decisión cambia, no borrar el historial: registrar la nueva decisión y marcar la anterior como sustituida.

| Fecha | Decisión | Estado | Motivo / referencia |
|---|---|---|---|
| 2026-11-09 | HaïtiShop se desarrolla inicialmente como demo, no como producto de producción | Confirmada | Confirmación del propietario en conversación |
| 2026-11-09 | El modelo comercial será marketplace | Confirmada | Cuestionario 1, respuesta 1 |
| 2026-11-09 | El público incluirá particulares y empresas/comerciantes | Confirmada | Cuestionario 1, respuesta 2 |
| 2026-11-09 | Categorías iniciales: electrónica, ropa, hogar, alimentos, belleza y construcción | Confirmada | Cuestionario 1, respuesta 3 |
| 2026-11-09 | La cobertura inicial será nacional, en Haití | Confirmada | Cuestionario 1, respuesta 4 |
| 2026-11-09 | Los vendedores registrados podrán publicar productos | Confirmada | Cuestionario 1, respuesta 5 |
| 2026-11-09 | Diferenciadores: precios bajos, comercio local y confianza | Confirmada | Cuestionario 1, respuesta 6 |
| 2026-11-09 | MonCash y NatCash deben formar parte de los requisitos de pago | Confirmada como requisito; implementación pendiente | Cuestionario 1, respuesta 7 |
| 2026-11-09 | Registro de vendedores abierto y también habilitable por administración | Confirmada | Cuestionario 2, respuesta 1 |
| 2026-11-09 | Los vendedores deben completar verificación documental | Confirmada | Cuestionario 2, respuesta 2 |
| 2026-11-09 | Los productos se publican inmediatamente, sin aprobación individual previa | Confirmada | Cuestionario 2, respuesta 3 |
| 2026-11-09 | Habrá panel administrativo y panel independiente para cada vendedor | Confirmada | Cuestionario 2, respuesta 4 |
| 2026-11-09 | El modelo de ingresos será mediante suscripción de vendedores | Confirmada; condiciones económicas pendientes | Cuestionario 2, respuesta 5 |
| 2026-11-09 | Cada vendedor gestionará sus propios precios e inventario | Confirmada | Cuestionario 2, respuesta 6 |
| 2026-11-09 | Cada vendedor organizará sus propias entregas | Confirmada | Cuestionario 2, respuesta 7 |
| 2026-11-09 | El catálogo se podrá explorar con o sin cuenta | Confirmada | Cuestionario 3, respuesta 1 |
| 2026-11-09 | La cuenta será obligatoria al realizar el checkout/confirmar la compra | Confirmada | Cuestionario 3, respuesta 2 |
| 2026-11-09 | El carrito será persistente y asociado a la cuenta del comprador | Confirmada | Cuestionario 3, respuesta 3 |
| 2026-11-09 | Checkout dentro de HaïtiShop, complementado con confirmación por WhatsApp | Confirmada | Cuestionario 3, respuesta 4 |
| 2026-11-09 | MonCash y NatCash serán métodos seleccionables en el checkout | Confirmada como alcance; conexión técnica pendiente | Cuestionario 3, respuesta 5 |
| 2026-11-09 | La consulta de pedidos se realizará mediante WhatsApp, sin sección interna de pedidos definida | Confirmada | Cuestionario 3, respuesta 6 |
| 2026-11-09 | No se incluirá seguimiento de pedidos dentro de la plataforma | Confirmada | Cuestionario 3, respuesta 7 |
| 2026-11-09 | La inclusión de valoraciones y reseñas queda sin decidir | Pendiente | Cuestionario 3, respuesta 8 |
| 2026-11-09 | La interfaz estará disponible en francés, criollo haitiano e inglés | Confirmada | Cuestionario 4, respuesta 3 |
| 2026-11-09 | Los precios se mostrarán en gourde haitiana (HTG) | Confirmada; reglas de precios pendientes | Cuestionario 4, respuesta 4 |
| 2026-11-09 | El diseño será moderno y profesional, con paleta azul y blanca | Confirmada | Cuestionario 4, respuestas 1 y 2 |
| 2026-11-09 | La página principal seguirá una organización de marketplace, tomando Amazon como referencia funcional/visual | Confirmada | Cuestionario 4, respuestas 5 y 9 |
| 2026-11-09 | La navegación móvil usará una barra inferior | Confirmada | Cuestionario 4, respuesta 6 |
| 2026-11-09 | La interfaz tendrá únicamente tema claro | Confirmada | Cuestionario 4, respuesta 7 |
| 2026-11-09 | Se conservará el logotipo existente que proporcionará el propietario | Confirmada; el propietario confirmó que el logo de Cloudinary es el original | Cuestionario 4, respuesta 8; confirmación del propietario 2026-11-10 |
| 2026-11-09 | Campos obligatorios del producto: nombre, descripción, precio, fotografía, existencias, categoría, condición y ubicación del vendedor | Confirmada | Cuestionario 5, respuesta 1 |
| 2026-11-09 | Cada producto tendrá una sola fotografía | Confirmada | Cuestionario 5, respuesta 2 |
| 2026-11-09 | Los productos admitirán variantes configurables | Confirmada; atributos y reglas por variante pendientes | Cuestionario 5, respuesta 3 |
| 2026-11-09 | El inventario será actualizado manualmente por cada vendedor | Confirmada | Cuestionario 5, respuesta 4 |
| 2026-11-09 | El buscador será avanzado y mostrará sugerencias al escribir | Confirmada | Cuestionario 5, respuesta 5 |
| 2026-11-09 | Los filtros incluirán precio, categoría, marca, ubicación, vendedor y disponibilidad | Confirmada | Cuestionario 5, respuesta 6 |
| 2026-11-09 | El ordenamiento incluirá relevancia, precio ascendente/descendente y productos más recientes | Confirmada | Cuestionario 5, respuesta 7 |
| 2026-11-09 | La ficha de producto será completa, con descripción, precio, vendedor, disponibilidad y compra | Confirmada | Cuestionario 5, respuesta 8 |

## 7. Bloqueos y preguntas abiertas

- Definir la visión detallada y la propuesta de valor de HaïtiShop.
- Definir el procedimiento de registro abierto y creación/habilitación administrativa de vendedores.
- Definir documentos exigidos, revisión, vigencia y tratamiento de la verificación documental.
- Definir precio, periodicidad, niveles, período de prueba y consecuencias de impago de las suscripciones.
- Definir controles administrativos y límites de gestión sobre productos e inventario de vendedores.
- Definir condiciones, seguimiento y responsabilidades de las entregas gestionadas por cada vendedor.
- Definir el flujo técnico de confirmación de pago MonCash/NatCash, conciliación, cancelaciones y reembolsos.
- Definir si las valoraciones/reseñas se incorporarán y bajo qué reglas.
- Definir impuestos y reglas de precios, incluyendo formato y tratamiento de HTG.
- Definir mecanismos concretos de confianza y resolución de problemas.
- Definir los atributos permitidos para las variantes y si cada variante tendrá precio, SKU y existencias propios.
- Definir si la restricción de una fotografía por producto se mantiene también para cada variante.
- Definir si se requiere un límite de caracteres, formato o validación para los campos del catálogo.
- Reconstruir la arquitectura definitiva a partir de la información del propietario.
- Verificar qué cuentas y servicios ya están creados y cuáles están realmente configurados.
- Determinar qué partes del demo deben simularse y cuáles deben conectarse a servicios reales de prueba.
- Inspeccionar el código y los commits cuando el repositorio deje de estar vacío.

## 8. Protocolo de continuidad para cualquier asistente

1. Leer este documento antes de proponer cambios.
2. Revisar el estado real del repositorio y los commits; no asumir que este documento está actualizado.
3. Separar hechos comprobados, decisiones aprobadas, hipótesis y tareas pendientes.
4. Preguntar al propietario cuando falte una decisión funcional o técnica esencial.
5. No inventar credenciales, configuraciones, archivos, pruebas ni resultados.
6. Actualizar este documento al terminar cada sesión y registrar el commit correspondiente.
7. Mantener un historial de decisiones y cambios para evitar que se pierda el contexto entre conversaciones.

## 9. Información que debe aportar el propietario

Este apartado se completará progresivamente durante la reconstrucción del contexto. No es necesario proporcionar todo en un solo mensaje.

- Visión de producto y usuarios.
- Funciones exactas y prioridades.
- Archivo del logotipo existente y referencias visuales adicionales, si las hubiera.
- Flujo completo de compra y entrega.
- Reglas de catálogo, inventario, precios y pedidos.
- Reglas del marketplace para vendedores y administradores.
- Servicios, cuentas y configuraciones existentes.
- Restricciones de presupuesto y tecnologías.
- Estado de implementación y problemas conocidos.

## 10. Registro de sesiones

### 2026-11-09 — Cuestionario 1: visión general

- Se registraron las respuestas del propietario para modelo marketplace, público, categorías, territorio, publicación de productos y diferenciadores.
- Se añadieron MonCash y NatCash como requisitos de pago.
- La visión detallada quedó pendiente porque la respuesta fue enviada en blanco.
- No se modificó código de la aplicación ni se verificó ninguna integración de servicios.


### 2026-11-09 — Cuestionario 2: vendedores y administración

- Se confirmó registro de vendedores abierto y también mediante habilitación administrativa.
- Se confirmó verificación documental obligatoria para vendedores.
- Se confirmó publicación inmediata de productos, sin aprobación previa individual.
- Se confirmó panel administrativo y panel independiente para cada vendedor.
- Se seleccionó suscripción como modelo de ingresos; condiciones y precios siguen pendientes.
- Se confirmó que cada vendedor gestiona precios e inventario y organiza sus propias entregas.
- No se aportó información adicional.
- No se modificó código de la aplicación ni se verificó ninguna función implementada.


### 2026-11-09 — Cuestionario 3: experiencia de compra y pedidos

- Se confirmó que el catálogo podrá explorarse con o sin cuenta.
- La cuenta será obligatoria al realizar el checkout/confirmar la compra.
- Se confirmó un carrito persistente asociado a la cuenta.
- El checkout se realizará dentro de HaïtiShop y tendrá confirmación complementaria mediante WhatsApp.
- MonCash y NatCash se presentarán como métodos seleccionables; la integración técnica sigue sin verificarse.
- El comprador consultará sus pedidos mediante WhatsApp, no mediante una sección interna de pedidos.
- No se incluirá seguimiento de pedidos dentro de la plataforma.
- Las valoraciones/reseñas quedaron sin decisión.
- No se aportó información adicional.
- No se modificó código de la aplicación ni se verificó ninguna función implementada.


### 2026-11-09 — Cuestionario 4: diseño, identidad e idiomas

- Se confirmó un estilo moderno y profesional con paleta azul y blanca.
- Idiomas de interfaz: francés, criollo haitiano e inglés.
- Moneda de visualización: gourde haitiana (HTG); reglas de precios e impuestos pendientes.
- La página principal seguirá una organización de marketplace, con Amazon como referencia.
- La navegación móvil utilizará una barra inferior.
- Se utilizará únicamente tema claro.
- El propietario ya dispone de un logotipo y lo proporcionará; no se diseñará uno nuevo por ahora.
- No se aportaron instrucciones adicionales.
- No se modificó código de la aplicación ni se verificó ninguna función implementada.


### 2026-11-09 — Cuestionario 5: catálogo y publicación de productos

- Campos obligatorios: nombre, descripción, precio, fotografía, existencias, categoría, condición y ubicación del vendedor.
- Se confirmó una sola fotografía por producto.
- Se confirmó soporte para variantes configurables; los atributos y las reglas de inventario/precio por variante quedan pendientes.
- El vendedor actualizará manualmente las existencias.
- El buscador será avanzado, con sugerencias mientras se escribe.
- Se confirmaron filtros por precio, categoría, marca, ubicación, vendedor y disponibilidad.
- El ordenamiento incluirá relevancia, precio ascendente/descendente y fecha de publicación.
- La ficha de producto será completa e incluirá información del vendedor, disponibilidad y acción de compra.
- No se aportó información adicional.
- No se modificó código de la aplicación ni se verificó ninguna función implementada.


### 2026-11-09 — Inicio del desarrollo del demo

- El propietario confirmó Firebase Authentication con correo y contraseña para registro e inicio de sesión.
- El propietario confirmó que Cloud Firestore está activado.
- Se registró el cloud name de Cloudinary: `dcclzhsim`.
- Se identificó el logo alojado en Cloudinary mediante el public ID `copy_of_file_000000004b4481f5856e94a87bad615e_awp5pa.png`.
- El flujo de WhatsApp se implementará sin número oficial por ahora; el número de destino debe poder configurarse después.
- MonCash y NatCash se mostrarán como opciones de pago simuladas. El propietario aún no ha completado la verificación necesaria para solicitar las API.
- Se creó la base Next.js/TypeScript, la página inicial, el panel de autenticación email/password, la configuración cliente de Firebase, el ejemplo de variables y el workflow de CI.
- La clave privada de Firebase Admin compartida en la conversación no se utilizó ni se guardó. El demo utiliza la configuración web pública de Firebase.
- Cloudinary unsigned upload preset sigue pendiente. La documentación actual sitúa su creación en Console Settings → Upload → Upload Presets.

### 2026-11-09 — Catálogo de imágenes completado (Cloudinary + Firestore)

- Se subieron las 18 fotografías de productos a Cloudinary (cloud `dcclzhsim`) mediante
  el preset unsigned `haitishop_demo_unsigned`, con public IDs controlados
  (`<categoría>-<número>-<slug>`) en la carpeta `haitishop-demo/products` y entrega
  optimizada `f_auto,q_auto`. Verificación de todas las URLs: correcta.
- Se corrigieron dos imágenes tras revisión visual (ventilador de pie y aceite de coco);
  las versiones nuevas quedaron como public IDs `-v2` en Cloudinary.
- Se publicaron los metadatos de los 18 productos en la colección `products` de Firestore
  usando la clave de cuenta de servicio aportada por el propietario (script idempotente
  `scripts/seed-firestore.mjs`, `npm run seed`).
- Se detectó que el proyecto Firestore estaba en modo bloqueado (deny-all); se desplegaron
  las reglas del fichero `firestore.rules` del repositorio (lectura pública de productos,
  escritura restringida) mediante la API de reglas. Verificado: lectura pública correcta,
  escritura anónima denegada (403).
- Se añadió `src/data/catalog-seed.json` + `catalog-seed.ts` como catálogo de reserva en la
  app: si Firestore está vacío o no responde, la web muestra este catálogo en lugar de una
  página vacía.
- Verificado en producción: https://haitishop.vercel.app muestra los 18 productos con sus
  imágenes de Cloudinary, precios HTG, ubicaciones y existencias.
- El propietario aportó la clave de cuenta de servicio en la conversación; no se guardó en
  el repositorio ni en este documento. `.gitignore` excluye patrones `*firebase-adminsdk*.json`.
- Añadido `firebase.json` para permitir despliegues de reglas con firebase-tools.

### 2026-11-10 — Cierre del catálogo y empaquetado

- Parches de integración aplicados a `marketplace-app.tsx` (catálogo inicial como estado y
  como reserva de la suscripción de Firestore).
- `npm run seed` añadido a package.json; `firebase-admin` añadido a devDependencies.
- Documentación ampliada (README, `.env.example`).
- Verificación pendiente al empaquetar: typecheck, lint y build del repositorio.

### 2026-11-10 — Login de Firebase verificado y funcional

- Diagnóstico del login contra el proyecto real: el proveedor email/contraseña ya estaba
  activado, pero la `apiKey` del código era inválida (dos caracteres invertidos: `AO9gJQ…`
  en vez de `AOg9JQ…`) y el `appId` tenía el número de proyecto equivocado
  (`366912222405` en lugar de `366912084421`).
- La configuración web correcta se obtuvo de la API de Firebase Management con la clave de
  servicio del propietario y se corrigió en `src/lib/firebase.ts` y `.env.example`
  (incluye `measurementId: G-J09GVC6NZH`).
- `haitishop.vercel.app` añadido a los dominios autorizados de Identity Toolkit
  (antes solo: localhost, haitishop.firebaseapp.com, haitishop.web.app).
- Cuenta de demostración creada mediante la API admin: `demo@haitishop.dev` /
  `DemoHaiti2026`, con documento `admins/l5RRuqlzjPfgEmhk0ve6HEUo1q73` en Firestore para
  poder probar el panel de administración. Documentado cómo revocarla.
- `auth-panel.tsx` mejorado: más errores traducidos al francés (credenciales inválidas,
  e-mail ya usado, contraseña débil, proveedor desactivado, demasiados intentos, red) y
  cierre automático del modal 0,9 s después de entrar.
- Verificación end-to-end en navegador local: registro de sesión, entrada con la cuenta
  demo («Connexion réussie»), carga del panel de administración (documento `admins`),
  cierre de sesión y retorno al estado anónimo. typecheck, lint y build correctos.
- La clave de cuenta de servicio se usó solo localmente; no se guardó en el repositorio.

### 2026-11-10 — Cuenta admin del propietario y push a GitHub

- El propietario confirmó que el logotipo actual de Cloudinary es el original subido por él;
  no hace falta sustituirlo.
- El propietario registró su cuenta personal `vertiljivenson9@gmail.com` (ya existía en
  Firebase Authentication, creada desde la app). Se le asignó el documento
  `admins/JTbCo8YWt7b0XCiEiVKSA5MhzW23` en Firestore mediante la API admin, por lo que
  dispone del panel de administración con su propia cuenta. Su contraseña no se tocó.
- La cuenta demo `demo@haitishop.dev` sigue disponible para pruebas; puede eliminarse o
  quitársele el rol borrando su documento en `admins`.
- Se preparó el push del repositorio corregido a GitHub usando un token temporal
  aportado por el propietario, quien lo revocará después.

### 2026-11-10 — Funciones añadidas: recuperación, ficha de producto, pedidos admin, documento de vendedor, SEO

- **Recuperación de contraseña**: enlace «Mot de passe oublié ?» en el modal de acceso;
  usa `sendPasswordResetEmail` de Firebase. Probado: correo enviado.
- **Ficha de producto**: modal de detalle al hacer clic en la imagen o el nombre de una
  tarjeta (foto, precio, descripción, marca, variantes, vendedor, ubicación, existencias,
  añadir al carrito). Probado en navegador.
- **Pedidos recientes para la administración**: suscripción a `orders` (últimas 20,
  descendentes por `createdAt`) visible solo para admins. Probado: pedido de prueba
  visible con total, método de pago, contacto y artículos; eliminado después de la prueba.
- **Verificación documental real**: el formulario de vendedor exige una foto del documento
  (imagen, máx. según Cloudinary) que se sube a Cloudinary en `haitishop-demo/documents`;
  la solicitud guarda `documentUrl` y la administración la revisa con «Voir le document».
  Probado end-to-end: subida, revisión y aprobación; datos de prueba eliminados después.
- **SEO/favicon**: metadatos completos (Open Graph/Twitter con el logo original,
  metadataBase haitishop.vercel.app) e `icon.png` de 512×512 generado desde el logo.
- typecheck, lint y build correctos; la ruta `/icon.png` aparece en el build.
- Sigue pendiente: interfaz multilingüe (FR/KRE/EN), variantes con existencias por variante
  y número real de WhatsApp.
