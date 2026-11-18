# Pulso CRM

CRM de seguimiento de clientes. Cuando alguien escribe por WhatsApp, el lead se crea solo y la conversación se ve y se responde dentro de Pulso CRM, en la pestaña **Conversaciones** y en la ficha de cada lead. Instagram, Facebook y el chat de la web se pueden conectar con Chatwoot (opcional).

Hay dos formas de recibir los mensajes:

| | WhatsApp directo con Meta (recomendado) | Chatwoot (opcional) |
|---|---|---|
| Qué es | Pulso CRM habla directo con WhatsApp Business Platform | Chatwoot recibe todos los canales y avisa a Pulso CRM |
| Qué instalas | Nada extra | Chatwoot (en la nube o en tu servidor, 4 GB de memoria) |
| Canales | WhatsApp (Instagram y Messenger son el siguiente paso) | WhatsApp, Instagram, Facebook y web |
| Guía | [WHATSAPP.md](WHATSAPP.md) | Más abajo y [INSTALAR-EN-MI-SERVIDOR.md](INSTALAR-EN-MI-SERVIDOR.md) |

Se pueden usar las dos a la vez: cada lead responde por el canal por el que escribió.

Incluye: leads con canal detectado automáticamente, filtro costarricense o extranjero, atenciones por día, tareas con calendario, imágenes adjuntas, recordatorios de llegada ("avisar 5 días antes"), panel con lo urgente, usuarios con contraseña y conversaciones.

> **¿Prefieres instalarlo en tu propio servidor?** Pulso CRM solo (liviano, unos 512 MB): [WHATSAPP.md](WHATSAPP.md), sección "Instalación liviana". Con Chatwoot incluido: [INSTALAR-EN-MI-SERVIDOR.md](INSTALAR-EN-MI-SERVIDOR.md). Lo de abajo es para publicarlo en Vercel.

## Cómo funciona con Chatwoot

```
Cliente → WhatsApp / Instagram / Facebook / Web → Chatwoot (nube)
                                                      │ webhook
                                                      ▼
                                              Pulso CRM (Vercel) ←→ Base de datos Postgres
```

- Chatwoot recibe los mensajes y avisa a Pulso CRM (webhook).
- Pulso CRM crea o actualiza el lead, guarda el mensaje y lo muestra en la ficha.
- Al responder desde Pulso CRM, el mensaje se envía a Chatwoot y sale por el mismo canal del cliente.
- Si la misma persona escribe otra vez, no se crea otro lead: se une por contacto de Chatwoot, por teléfono o por correo.
- Al primer mensaje de respuesta del equipo, el lead pasa de "Nuevo" a "Contactado" y se registra la atención del día.
- El tipo de cliente se adivina: prefijo +506 o número de 8 dígitos = costarricense; otro prefijo = extranjero con el país probable. Se puede corregir en la ficha.

## Publicar en Vercel (unos 20 minutos)

Nota: el plan gratuito (Hobby) de Vercel es solo para uso personal sin fines comerciales. Si esto es para un cliente, usa el plan Pro.

1. **Sube el proyecto a GitHub.** Crea un repositorio privado y sube esta carpeta (sin `node_modules`).
2. **Importa el repositorio en Vercel** (Add New, Project). El framework Next.js se detecta solo.
3. **Crea la base de datos.** En el proyecto de Vercel: pestaña Storage, Create Database, elige Neon (Postgres). Al conectarla al proyecto se llena la variable `DATABASE_URL`. Las tablas se crean solas la primera vez.
4. **Agrega las variables de entorno** (Settings, Environment Variables). Mira `.env.example`:

   | Variable | Qué poner |
   |---|---|
   | `AUTH_SECRET` | Un texto largo al azar (mínimo 16 caracteres) |
   | `ADMIN_EMAIL` y `ADMIN_PASSWORD` | Tu usuario administrador. Se crea la primera vez que entras |
   | `WEBHOOK_TOKEN` | Un texto largo al azar. Va dentro de la dirección del webhook |
   | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN` | Para WhatsApp directo con Meta. Mira [WHATSAPP.md](WHATSAPP.md) |
   | `META_PAGE_TOKEN`, `META_PAGE_ID` | Para Instagram y Facebook directos. Mira [ADMIN.md](ADMIN.md) |
   | `CHATWOOT_URL` | Solo si usas Chatwoot: `https://app.chatwoot.com` (o la dirección de tu cuenta) |
   | `CHATWOOT_ACCOUNT_ID` | El número que aparece en la dirección de Chatwoot: `.../app/accounts/NUMERO/...` |
   | `CHATWOOT_API_TOKEN` | En Chatwoot: tu perfil, Access Token |
   | `CHATWOOT_WEBHOOK_SECRET` | Opcional. Si tu Chatwoot muestra un secreto al crear el webhook, pégalo para verificar la firma |

5. **Despliega** (Deploy). Abre la dirección de Vercel y entra con `ADMIN_EMAIL` y `ADMIN_PASSWORD`.
6. **Conecta el webhook en Chatwoot.** Primero enciende el interruptor de Chatwoot en **Admin, Canales** (viene apagado). Ahí aparece la dirección lista para copiar (termina en `/api/webhooks/chatwoot?token=...`). En Chatwoot ve a Ajustes, Integraciones, Webhooks, agrega un webhook con esa dirección y marca los eventos "Conversación creada" y "Mensaje creado".
7. **Conecta los canales en Chatwoot** (Ajustes, Bandejas de entrada): WhatsApp, Instagram, Facebook y el chat de la web. Chatwoot tiene un asistente para cada uno.
8. **Prueba.** Escribe un mensaje a tu WhatsApp o usa el chat de la web: en unos segundos el lead aparece en Pulso CRM. En Admin, Canales, "Últimos avisos" muestra qué llegó y qué se hizo con cada uno.

Los pasos de Chatwoot y de Vercel pueden cambiar de nombre en sus pantallas. Si algo no coincide, usa su documentación.

## Cosas que debes saber

- **WhatsApp:** solo se puede responder dentro de las 24 horas siguientes al último mensaje del cliente. Si Meta o Chatwoot rechazan el envío, Pulso CRM muestra el motivo.
- **WhatsApp directo no está probado contra Meta de verdad**, solo con mensajes simulados en el formato de Meta (ver [WHATSAPP.md](WHATSAPP.md)).
- **Meta:** WhatsApp, Instagram y Facebook requieren cuentas y permisos de Meta Business, y la aprobación puede tardar. Eso se hace en Chatwoot, no aquí.
- **Imágenes adjuntas** de los leads se guardan en la base de datos (se reducen a unos 1100 px). Para volúmenes grandes conviene moverlas a un almacenamiento de archivos.
- **Imágenes y archivos que manda el cliente por chat:** con WhatsApp directo se descargan y se guardan en la base de datos (hasta 4 MB cada uno). Con Chatwoot se muestran desde la dirección que da Chatwoot (solo http y https).
- **Usuarios:** el administrador agrega vendedores en Admin, Usuarios. Los vendedores ven y trabajan los leads, pero no ven el panel Admin.
- **Datos personales:** los últimos 50 avisos de Chatwoot se guardan completos, para depurar. Si no los necesitas, bórralos de la tabla `eventos_cw`.
- No incluye: respuesta automática con bot, plantillas de WhatsApp (para escribir primero o después de 24 horas), envío de archivos desde el CRM al cliente, ni recordatorios por correo o WhatsApp. Los avisos se ven en el panel y el calendario.

## Probar en tu computadora

```
npm install
cp .env.example .env.local     # llena AUTH_SECRET, ADMIN_EMAIL y ADMIN_PASSWORD
npm run dev                    # http://localhost:3000
```

Sin `DATABASE_URL` usa una base de datos embebida en la carpeta `.data` (solo para pruebas locales; en Vercel la variable es obligatoria).

Prueba automática con un Chatwoot y un Meta simulados (201 comprobaciones; las de licencia solo corren si defines `LIC_PRIV` con una llave privada de prueba y `LICENCIA_PUBLIC_KEY` en el servidor). Enciende el servidor con una base de datos nueva (`npm run build` y `npx next start -p 3100`) con estas variables: `AUTH_SECRET` (cualquier texto largo), `WEBHOOK_TOKEN=whtok`, `CHATWOOT_URL=http://localhost:4010`, `CHATWOOT_ACCOUNT_ID=1`, `CHATWOOT_API_TOKEN=tok`, `CHATWOOT_WEBHOOK_SECRET=secreto-de-prueba`, `WHATSAPP_TOKEN=watok`, `WHATSAPP_PHONE_ID=PHID`, `META_APP_SECRET=appsecret`, `META_VERIFY_TOKEN=verifytok`, `META_GRAPH_URL=http://localhost:4010/graph`, `ADMIN_EMAIL=admin@prueba.cr`, `ADMIN_PASSWORD=clave-segura-123`. Luego ejecuta `node scripts/test.mjs`.

## Estructura

- `ui/` interfaz (HTML y JavaScript). `scripts/build-ui.mjs` la empaqueta en `src/lib/ui.ts` al correr `dev` o `build`.
- `src/lib/api.ts` rutas de la API. `src/lib/meta.ts` WhatsApp directo con Meta. `src/lib/webhook.ts` y `src/lib/chatwoot.ts` integración con Chatwoot.
- `src/lib/db.ts` esquema de la base de datos. `src/lib/auth.ts` sesiones y contraseñas.

Más: [ADMIN.md](ADMIN.md) (panel de administración, canales, licencia de uso) y [WHATSAPP.md](WHATSAPP.md).
