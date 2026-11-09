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
- Los vendedores registrados podrán publicar productos.
- El alcance de moderación, aprobación, verificación y suspensión de vendedores está pendiente de definición.

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

### 2.4 Pagos y pedidos

- MonCash y NatCash son requisitos de integración.
- Su presencia en el alcance no significa que sus API estén conectadas ni que existan credenciales o entornos de prueba configurados.
- El propietario no especificó información adicional aparte de MonCash y NatCash.
- Flujo de pedidos, confirmación de pago, conciliación, cancelaciones y reembolsos: por definir.

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
| Marketplace / panel de vendedores | Alcance confirmado; implementación por inspeccionar | Vendedores registrados publican productos |
| Catálogo de productos | Alcance definido parcialmente | Seis categorías iniciales confirmadas |
| Carrito | Por confirmar | — |
| Checkout | Por confirmar | — |
| Autenticación | Por confirmar | Firebase Authentication es una decisión previa |
| Cloudinary | Por confirmar | Decisión previa |
| MonCash | Requisito confirmado; implementación por confirmar | No asumir conexión activa |
| NatCash | Requisito confirmado; implementación por confirmar | No asumir conexión activa |
| Flujo WhatsApp | Por confirmar | Decisión previa |
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

## 7. Bloqueos y preguntas abiertas

- Definir la visión detallada y la propuesta de valor de HaïtiShop.
- Definir el registro, verificación, aprobación y administración de vendedores.
- Definir comisiones, suscripciones u otro modelo de ingresos del marketplace.
- Definir quién gestiona inventario, precios, disponibilidad y cumplimiento de pedidos.
- Definir entrega, retiro, cobertura logística y cálculo de costos de envío.
- Definir el flujo de compra y cómo se confirma un pago MonCash o NatCash en el demo.
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
