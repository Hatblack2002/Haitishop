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
- **Idiomas de interfaz:** por confirmar.
- **Moneda y reglas de precios:** por confirmar.
- **Identidad visual, logotipo y paleta:** por confirmar con las referencias del propietario.

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

## 3. Arquitectura y servicios

| Área | Información disponible | Estado |
|---|---|---|
| Autenticación | Firebase Authentication | Decisión previa; confirmar configuración actual |
| Base de datos | No asumir Firestore ni otro servicio hasta confirmación expresa | Por confirmar |
| Imágenes y recursos visuales | Cloudinary | Decisión previa |
| Pagos | MonCash y NatCash | Requisito confirmado; integración y modo demo por definir |
| Pedidos | Envío/gestión mediante WhatsApp | Decisión previa; confirmar flujo |
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
| Repositorio y estructura de código | Pendiente de inspección | El repositorio fue encontrado vacío en la inspección inicial |
| Diseño y páginas | Por confirmar | — |
| Marketplace / panel de vendedores | Alcance funcional definido; implementación por inspeccionar | Panel administrativo y panel individual de vendedor |
| Catálogo de productos | Alcance definido parcialmente | Seis categorías iniciales confirmadas |
| Carrito | Alcance funcional definido; implementación por inspeccionar | Carrito persistente asociado a la cuenta |
| Checkout | Alcance funcional definido; implementación por inspeccionar | Checkout interno con confirmación complementaria por WhatsApp |
| Autenticación | Por confirmar | Firebase Authentication es una decisión previa |
| Cloudinary | Por confirmar | Decisión previa |
| MonCash | Requisito confirmado; implementación por confirmar | No asumir conexión activa |
| NatCash | Requisito confirmado; implementación por confirmar | No asumir conexión activa |
| Flujo WhatsApp | Alcance funcional definido parcialmente; implementación por inspeccionar | Confirmación de compra y consulta de pedidos por WhatsApp |
| Pruebas | Por confirmar | — |
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

## 7. Bloqueos y preguntas abiertas

- Definir la visión detallada y la propuesta de valor de HaïtiShop.
- Definir el procedimiento de registro abierto y creación/habilitación administrativa de vendedores.
- Definir documentos exigidos, revisión, vigencia y tratamiento de la verificación documental.
- Definir precio, periodicidad, niveles, período de prueba y consecuencias de impago de las suscripciones.
- Definir controles administrativos y límites de gestión sobre productos e inventario de vendedores.
- Definir condiciones, seguimiento y responsabilidades de las entregas gestionadas por cada vendedor.
- Definir el flujo técnico de confirmación de pago MonCash/NatCash, conciliación, cancelaciones y reembolsos.
- Definir si las valoraciones/reseñas se incorporarán y bajo qué reglas.
- Definir idiomas, moneda, impuestos y reglas de precios.
- Definir mecanismos concretos de confianza y resolución de problemas.
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
- Diseño y referencias visuales.
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
