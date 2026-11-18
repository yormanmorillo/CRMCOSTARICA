# Panel de administración, canales y licencia

Entra a Pulso CRM como administrador y toca **Admin** (arriba a la derecha). Los vendedores no ven este botón.

## Secciones

| Sección | Para qué sirve |
|---|---|
| **Negocio** | Nombre del negocio y días de aviso por defecto. |
| **Canales** | Interruptores y conexión de WhatsApp, Instagram/Facebook, formulario web y Chatwoot. |
| **Etapas** | Agregar, renombrar, colorear, ordenar y borrar las etapas del embudo. El *tipo* define el comportamiento: **inicial** (donde entran los leads nuevos), **en proceso**, **ganado** y **perdido**. Siempre debe quedar al menos una de inicial, ganado y perdido, y no se borra una etapa que tenga leads. |
| **Motivos de pérdida** | Lista de razones ("le pareció caro", "se fue con la competencia"…). Al pasar un lead a una etapa de tipo perdido el sistema pide el motivo (y un detalle opcional). Un motivo ya usado se puede ocultar pero no borrar. |
| **Productos** | Catálogo de lo que vendes (precio en colones o dólares). Se agrega a cada lead desde su ficha; el lead guarda el precio con que se cotizó. |
| **Usuarios** | Alta, cambio de rol y de contraseña, baja. Respeta el máximo de usuarios de la licencia. |
| **Imágenes** | Espacio usado, galería de las fotos adjuntas a leads y las del chat, y limpieza automática (ver abajo). |
| **Leads perdidos** | Cuántos y por qué no se concretaron, con valor perdido; filtro por motivo. |
| **Licencia** | Estado y campo para pegar la licencia de uso. |

## Canales

* **Llamadas:** no tienen conexión. Se agregan a mano con **Nuevo lead** eligiendo el canal "Llamada".
* **WhatsApp:** ver [WHATSAPP.md](WHATSAPP.md).
* **Instagram y Facebook Messenger:** usan la **misma app de Meta** que WhatsApp. Variables: `META_PAGE_TOKEN` (token de la página de Facebook con permisos de mensajes; para Instagram, la cuenta profesional debe estar vinculada a esa página), `META_PAGE_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`. En Meta, en el Webhook de **Page** y de **Instagram**, pega la dirección que muestra Admin, Canales y suscribe `messages`. Los mensajes crean el lead y se responden desde **Conversaciones**, dentro de las 24 horas siguientes al mensaje del cliente.
* **Formulario de tu página web:** Admin, Canales muestra una dirección, una clave y un código listo para pegar. Cada envío crea un lead con canal "Página web" (si el correo o teléfono ya existe, agrega el mensaje como nota). Tiene campo trampa contra robots (`website`) y un límite de envíos por IP. La clave queda visible en el código de tu página; si la abusan, genera una nueva.
* **Chatwoot:** viene **apagado**. Enciéndelo con el interruptor cuando quieras usar su flujo (y configura sus variables según README). Apagado, sus avisos se ignoran.

> Instagram y Facebook se escribieron según la documentación de Meta y se probaron con mensajes simulados, **no contra una cuenta real**. La primera conexión puede pedir ajustes.

## Licencia de uso (para venderlo)

La licencia es un texto firmado (`PULSO1.…`) que se pega en **Admin, Licencia**. Incluye cliente, fecha de vencimiento (o permanente) y máximo de usuarios. Sin licencia hay **14 días de prueba**; con la licencia vencida o la prueba terminada el sistema queda en **solo lectura** (se sigue viendo todo y los mensajes de clientes siguen entrando, pero no se puede crear ni editar hasta ingresar una licencia).

Tú (el vendedor) la generas con una herramienta que **no se instala en el servidor del cliente**:

```bash
node scripts/licencia.mjs claves          # una sola vez: crea licencias/privada.pem y deja la llave pública en el código
node scripts/licencia.mjs emitir --cliente "Hotel Sol" --vence 2027-12-31 --usuarios 5
node scripts/licencia.mjs ver PULSO1....  # revisar una licencia
```

1. Ejecuta `claves` **antes de entregar** el sistema, y **guarda con copia** `licencias/privada.pem` (está en `.gitignore`; nunca la subas ni la pongas en un servidor de cliente). Si la pierdes no podrás emitir más licencias para las instalaciones que ya llevan tu llave pública.
2. Entrega el sistema compilado con esa llave pública (`src/lib/llave-publica.ts`). Mientras la llave esté vacía, el control de licencias está desactivado.
3. Emite una licencia por cliente y pégala en Admin, Licencia.

**Límite honesto:** como el cliente tiene el código y la base de datos, una persona con conocimientos podría quitar la verificación. Esto sirve como control comercial y disuasivo, no como protección infalible; si necesitas más, hace falta un servicio de licencias en línea o venderlo como servicio alojado por ti.


## Que las imágenes y documentos no llenen el servidor

- Las fotos que mandan los clientes por chat se **reducen al guardarse** (máx. 1600 px, JPEG) cuando el servidor tiene `sharp`; las que sube el equipo ya se reducen en el navegador. Tope de 4 MB por archivo.
- En **Admin → Imágenes** se ve cuánto espacio ocupan y se elige borrar los archivos del **chat** con más de 30, 90, 180 días o 1 año (por defecto 180). La limpieza corre sola, como mucho una vez por hora, mientras alguien usa el sistema; también hay un botón «Limpiar ahora». Los mensajes se conservan y muestran «Archivo eliminado para ahorrar espacio».
- Los adjuntos que el equipo sube a un lead **nunca** se borran solos.
- Si el volumen de archivos crece mucho, la salida escalable es guardarlos en un almacenamiento de objetos (S3, Cloudflare R2) en vez de la base de datos; con la limpieza activa, un negocio normal no lo necesita.

## Avance del lead (roadmap)

Cada lead muestra arriba de su ficha una línea con las etapas del proceso: las ya recorridas (con fecha y días en cada una), la actual, las pendientes y el porcentaje de avance. Tocar una etapa mueve el lead. El tablero muestra una barra de avance en cada tarjeta. El historial se guarda automáticamente en cada cambio de etapa.


## Simulador para demostraciones (/demo)

Con la sesión de administrador iniciada, abre `/demo` (también hay un enlace en Admin → Canales). Es una página con teléfonos de WhatsApp, Instagram, Facebook y correo: escribes como si fueras un cliente y el lead entra a Pulso por el mismo camino que un mensaje real, mientras ves a la derecha los leads nuevos. Si respondes desde Conversaciones, la respuesta aparece en el teléfono simulado.

- Son contactos ficticios (WhatsApp con números que empiezan con 9, p. ej. 9111-2233): no se envía nada a Meta.
- Los canales deben estar activados en Admin → Canales (el correo no necesita activación).
- El canal **Correo** crea el lead con el asunto y el texto como nota; todavía no recibe correos reales automáticamente.
- Los leads de demostración se borran como cualquier otro desde su ficha.


## Correo electrónico como canal

En **Admin → Canales → Correo** se conecta cualquier buzón por IMAP (recibir) y SMTP (responder): Gmail, Outlook/Microsoft 365, Zoho, cPanel o el de tu hosting.

- Datos: servidor y puerto IMAP (993), usuario, contraseña, servidor y puerto SMTP (465 o 587). En Gmail y Microsoft 365 hay que crear una **contraseña de aplicación** (la cuenta debe tener verificación en dos pasos). La contraseña se guarda cifrada y nunca se vuelve a mostrar.
- «Probar la conexión» revisa IMAP y SMTP; «Revisar ahora» fuerza una lectura.
- Cada correo nuevo sin leer crea un lead (canal «Correo») o se suma al lead de ese remitente; se guarda el asunto, el texto sin lo citado y hasta 5 adjuntos (imágenes, PDF, Office) de máx. 4 MB. Los correos se marcan como leídos. Solo entran los recibidos **desde que conectas el buzón**; no se importa el historial.
- Se ignoran solos: respuestas automáticas, boletines/listas, remitentes `no-reply`, `mailer-daemon` y el propio buzón. Además puedes escribir una lista de remitentes o dominios a ignorar.
- Responder desde Conversaciones envía un correo «Re: asunto» dentro del mismo hilo.
- **Revisión automática:** en un servidor propio, Pulso revisa cada ~90 segundos por sí solo. En Vercel (sin proceso permanente) programa una visita cada 2 minutos a la dirección que aparece en el panel (`/api/correo/revisar?token=…`).
- Sin OAuth todavía: Google y Microsoft permiten contraseña de aplicación, pero algunas empresas con Microsoft 365 la tienen bloqueada; en ese caso hay que agregar «Conectar con Microsoft» (OAuth).
- El simulador `/demo` tiene la pestaña **Correo**: manda un correo de cliente, uno con PDF, y ejemplos de boletín, respuesta automática y no-reply para mostrar que se filtran.
