# Pulso CRM con Chatwoot

CRM de seguimiento de clientes. Cuando alguien escribe por WhatsApp, Instagram, Facebook o el chat de la página web (todo conectado en Chatwoot), el lead se crea solo y la conversación se ve dentro de la ficha del lead. Desde ahí también se responde.

Incluye: leads con canal detectado automáticamente, filtro costarricense o extranjero, atenciones por día, tareas con calendario, imágenes adjuntas, recordatorios de llegada ("avisar 5 días antes"), panel con lo urgente, usuarios con contraseña y conversaciones.

> **¿Prefieres instalarlo todo en tu propio servidor** (Chatwoot incluido, con HTTPS y base de datos)? Sigue la guía [INSTALAR-EN-MI-SERVIDOR.md](INSTALAR-EN-MI-SERVIDOR.md). Lo de abajo es para publicarlo en Vercel.

## Cómo funciona

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
   | `CHATWOOT_URL` | `https://app.chatwoot.com` (o la dirección de tu cuenta) |
   | `CHATWOOT_ACCOUNT_ID` | El número que aparece en la dirección de Chatwoot: `.../app/accounts/NUMERO/...` |
   | `CHATWOOT_API_TOKEN` | En Chatwoot: tu perfil, Access Token |
   | `CHATWOOT_WEBHOOK_SECRET` | Opcional. Si tu Chatwoot muestra un secreto al crear el webhook, pégalo para verificar la firma |

5. **Despliega** (Deploy). Abre la dirección de Vercel y entra con `ADMIN_EMAIL` y `ADMIN_PASSWORD`.
6. **Conecta el webhook en Chatwoot.** En Pulso CRM abre Ajustes: ahí aparece la dirección lista para copiar (termina en `/api/webhooks/chatwoot?token=...`). En Chatwoot ve a Ajustes, Integraciones, Webhooks, agrega un webhook con esa dirección y marca los eventos "Conversación creada" y "Mensaje creado".
7. **Conecta los canales en Chatwoot** (Ajustes, Bandejas de entrada): WhatsApp, Instagram, Facebook y el chat de la web. Chatwoot tiene un asistente para cada uno.
8. **Prueba.** Escribe un mensaje a tu WhatsApp o usa el chat de la web: en unos segundos el lead aparece en Pulso CRM. En Ajustes, "Últimos avisos recibidos" muestra qué llegó y qué se hizo con cada uno.

Los pasos de Chatwoot y de Vercel pueden cambiar de nombre en sus pantallas. Si algo no coincide, usa su documentación.

## Cosas que debes saber

- **WhatsApp:** solo se puede responder dentro de las 24 horas siguientes al último mensaje del cliente. Si Chatwoot rechaza el envío, Pulso CRM muestra el motivo que dio Chatwoot.
- **Meta:** WhatsApp, Instagram y Facebook requieren cuentas y permisos de Meta Business, y la aprobación puede tardar. Eso se hace en Chatwoot, no aquí.
- **Imágenes adjuntas** de los leads se guardan en la base de datos (se reducen a unos 1100 px). Para volúmenes grandes conviene moverlas a un almacenamiento de archivos.
- **Ver imágenes y archivos que mande el cliente por chat:** se muestran desde la dirección que da Chatwoot. Solo se aceptan direcciones http(s).
- **Usuarios:** el administrador agrega vendedores en Ajustes. Los vendedores ven y trabajan los leads, pero no ven ajustes, usuarios ni la conexión con Chatwoot.
- **Datos personales:** los últimos 50 avisos de Chatwoot se guardan completos, para depurar. Si no los necesitas, bórralos de la tabla `eventos_cw`.
- No incluye: respuesta automática con bot, envío de archivos desde el CRM al cliente, ni recordatorios por correo o WhatsApp. Los avisos se ven en el panel y el calendario.

## Probar en tu computadora

```
npm install
cp .env.example .env.local     # llena AUTH_SECRET, ADMIN_EMAIL y ADMIN_PASSWORD
npm run dev                    # http://localhost:3000
```

Sin `DATABASE_URL` usa una base de datos embebida en la carpeta `.data` (solo para pruebas locales; en Vercel la variable es obligatoria).

Prueba automática con un Chatwoot simulado (70 comprobaciones). Enciende el servidor con `npm run build` y `npx next start -p 3100`, con estas variables: `WEBHOOK_TOKEN=whtok`, `CHATWOOT_URL=http://localhost:4010`, `CHATWOOT_ACCOUNT_ID=1`, `CHATWOOT_API_TOKEN=tok`, `CHATWOOT_WEBHOOK_SECRET=secreto-de-prueba`, `ADMIN_EMAIL=admin@prueba.cr`, `ADMIN_PASSWORD=clave-segura-123`. Luego ejecuta `node scripts/test.mjs`.

## Estructura

- `ui/` interfaz (HTML y JavaScript). `scripts/build-ui.mjs` la empaqueta en `src/lib/ui.ts` al correr `dev` o `build`.
- `src/lib/api.ts` rutas de la API. `src/lib/webhook.ts` y `src/lib/chatwoot.ts` integración con Chatwoot.
- `src/lib/db.ts` esquema de la base de datos. `src/lib/auth.ts` sesiones y contraseñas.
