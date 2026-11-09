# HaïtiShop — Documento maestro de continuidad

> **Propósito:** conservar en el repositorio el estado verificable del proyecto para retomarlo desde cualquier conversación o entorno sin reconstruir el contexto.
>
> **Estado:** documento inicial. Los datos marcados como *por confirmar* no son decisiones aprobadas.

## 1. Identidad y propósito

- **Proyecto:** HaïtiShop.
- **Mercado objetivo:** Haití.
- **Tipo de entrega actual:** demo; no es una plataforma de producción.
- **Objetivo funcional y alcance exacto:** por definir con el propietario.
- **Idiomas de interfaz:** por confirmar.
- **Moneda y reglas de precios:** por confirmar.
- **Identidad visual, logotipo y paleta:** por confirmar con las referencias del propietario.

## 2. Arquitectura y servicios

| Área | Información disponible | Estado |
|---|---|---|
| Autenticación | Firebase Authentication | Decisión previa; confirmar configuración actual |
| Base de datos | No asumir Firestore ni otro servicio hasta confirmación expresa | Por confirmar |
| Imágenes y recursos visuales | Cloudinary | Decisión previa |
| Pagos | Integraciones/API de MonCash y NatCash | Alcance y modo demo por confirmar |
| Pedidos | Envío/gestión mediante WhatsApp | Decisión previa |
| Ubicación del cliente | Compartir ubicación solo con consentimiento del cliente | Decisión previa |
| Hosting/despliegue | No asumir Vercel ni otro proveedor | Por confirmar |
| Código y control de versiones | GitHub: Hatblack2002/Haitishop | Repositorio identificado |

**Regla de arquitectura:** no añadir servicios, proveedores, bases de datos ni dependencias sin documentar su propósito y obtener aprobación del propietario.

## 3. Configuración técnica

Registrar aquí, cuando el propietario los vuelva a proporcionar:

- Identificadores públicos de proyecto y nombres de instancia.
- Dominios autorizados y configuración de hosting.
- Variables de entorno por nombre, nunca sus valores secretos.
- Versiones de frameworks, SDK y dependencias.
- Configuración de almacenamiento y subida de archivos.
- Endpoints de prueba y documentación oficial de pagos.

**Seguridad:** nunca guardar contraseñas, claves privadas, tokens, secretos de API, códigos de recuperación ni credenciales en este documento o en Git. Usar variables de entorno y secretos del entorno de ejecución.

## 4. Estado de implementación

| Componente | Estado | Evidencia / observaciones |
|---|---|---|
| Repositorio y estructura de código | Pendiente de inspección | El repositorio fue encontrado vacío en la inspección inicial |
| Diseño y páginas | Por confirmar | — |
| Catálogo de productos | Por confirmar | — |
| Carrito | Por confirmar | — |
| Checkout | Por confirmar | — |
| Autenticación | Por confirmar | — |
| Cloudinary | Por confirmar | — |
| MonCash | Por confirmar | — |
| NatCash | Por confirmar | — |
| Flujo WhatsApp | Por confirmar | — |
| Pruebas | Por confirmar | — |
| Despliegue demo | Por confirmar | — |

## 5. Decisiones aprobadas

Añadir cada decisión con fecha, responsable y motivo. Si una decisión cambia, no borrar el historial: registrar la nueva decisión y marcar la anterior como sustituida.

| Fecha | Decisión | Estado | Motivo / referencia |
|---|---|---|---|
| 2026-11-09 | HaïtiShop se desarrolla inicialmente como demo, no como producto de producción | Confirmada | Confirmación del propietario en conversación |

## 6. Registro de cambios y trabajo

Para cada sesión de trabajo registrar:

- Fecha y responsable.
- Objetivo de la sesión.
- Archivos modificados.
- Cambios realizados.
- Comandos y pruebas ejecutadas.
- Resultado real de compilación/pruebas/despliegue.
- Commit SHA y enlace.
- Problemas abiertos y su diagnóstico.
- Próximo paso exacto.

No declarar una tarea terminada sin evidencia verificable.

## 7. Bloqueos y preguntas abiertas

- Definir con precisión qué experiencia debe ofrecer la tienda al comprador.
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

- Visión del producto y usuarios.
- Funciones exactas y prioridades.
- Diseño y referencias visuales.
- Flujo completo de compra y entrega.
- Reglas de catálogo, inventario, precios y pedidos.
- Servicios, cuentas y configuraciones existentes.
- Restricciones de presupuesto y tecnologías.
- Estado de implementación y problemas conocidos.
