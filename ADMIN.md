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
| **Imágenes** | Galería de las fotos adjuntas a leads y las que mandaron los clientes por chat, con borrado. |
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
