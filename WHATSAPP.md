# Conectar WhatsApp directo a Pulso CRM (sin Chatwoot)

Con esta conexión, los mensajes de WhatsApp llegan a Pulso CRM sin ningún programa en el medio:

```
Cliente → WhatsApp → Meta (WhatsApp Business Platform) ──aviso──▶ Pulso CRM
                                                  ◀── respuesta ──┘
```

En Pulso CRM, la pestaña **Conversaciones** (en el teléfono, **Chats**) muestra la lista de chats y el hilo de cada uno. El lead se crea solo con el primer mensaje, las fotos y audios del cliente se guardan, y se responde desde la misma pantalla.

> **Aviso importante.** Esta guía está escrita de memoria sobre cómo funciona Meta, y sus pantallas cambian seguido. El código de Pulso CRM está probado con mensajes simulados que siguen el formato de Meta, **pero todavía no se ha probado contra una cuenta real de Meta**. La primera conexión puede pedir algún ajuste. Si algo no coincide, usa la documentación oficial de Meta ("WhatsApp Business Platform, Cloud API") y pídeme ayuda con lo que veas en Admin, Canales, "Últimos avisos".

## Qué necesitas

1. **Una cuenta de Meta for Developers** (developers.facebook.com) y un **portafolio de Meta Business** (business.facebook.com).
2. **Un número de teléfono para WhatsApp Business.** Dos cosas a tener en cuenta (confírmalas en Meta):
   - Un número que ya usa la app normal de WhatsApp tiene que migrarse a la API, y Meta tiene reglas sobre cuándo se puede seguir usando la app en el celular al mismo tiempo. Lo más sencillo es un número dedicado.
   - Para pruebas, Meta da un número de prueba gratis que solo escribe a unos pocos números que tú registras.
3. **Pulso CRM publicado con HTTPS** (en Vercel o en tu servidor). Meta no acepta direcciones sin HTTPS.
4. Los precios y límites de mensajes los fija Meta. Revísalos en su página antes de contárselos al cliente. Responder dentro de las 24 horas siguientes al mensaje del cliente es lo más barato.

## Paso 1. Crear la app en Meta

1. Entra a **developers.facebook.com**, "Mis apps", "Crear app".
2. Elige el tipo **Empresa (Business)** y vincúlala a tu portafolio de Meta Business.
3. Agrega el producto **WhatsApp**. Meta crea una cuenta de WhatsApp Business y te muestra un número de prueba.
4. Si usas un número real, agrégalo en **WhatsApp, Configuración de la API (API Setup), Agregar número de teléfono** y verifícalo con el código que te llega por SMS o llamada.

## Paso 2. Reunir 3 datos

| Dato | Dónde está | Variable de Pulso CRM |
|---|---|---|
| **Token de acceso permanente** | Business Settings (Configuración del negocio), **Usuarios del sistema**: crea uno, asígnale tu app y tu cuenta de WhatsApp con control total, y genera un token con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`. | `WHATSAPP_TOKEN` |
| **Id del número de teléfono** (no es el número, es un código largo) | WhatsApp, Configuración de la API, junto al número | `WHATSAPP_PHONE_ID` |
| **Clave secreta de la app** | Configuración de la app, Básico, "Clave secreta de la app" (App Secret) | `META_APP_SECRET` |

El token temporal que aparece en la pantalla de la API **dura solo 24 horas**: sirve para probar, no para dejarlo funcionando.

Además inventa tú una cuarta: **`META_VERIFY_TOKEN`**, un texto largo al azar (por ejemplo, el resultado de `openssl rand -hex 24`). Meta te la pedirá en el Paso 4 y debe ser idéntica.

## Paso 3. Poner las variables en Pulso CRM

**Si está en Vercel:** Settings, Environment Variables, agrega las 4 variables y haz **Redeploy** (las variables nuevas solo se aplican en un despliegue nuevo).

**Si está en tu servidor:** edita el archivo `.env` y ejecuta `docker compose up -d` (o `docker compose -f docker-compose.solo.yml up -d` si usas la instalación liviana, ver más abajo).

Luego abre Pulso CRM, **Admin, Canales, WhatsApp**: deben salir 4 marcas verdes. Toca **Probar la conexión**: si el token y el id son correctos, muestra el número conectado.

## Paso 4. Decirle a Meta dónde enviar los mensajes

1. En Meta: tu app, **WhatsApp, Configuración (Configuration), Webhook, Editar**.
2. **URL de devolución de llamada:** copia la dirección que muestra Pulso CRM en Admin, Canales (termina en `/api/webhooks/meta`).
3. **Token de verificación:** copia el que también muestra ahí (es tu `META_VERIFY_TOKEN`).
4. Toca **Verificar y guardar**. Si falla, revisa que hayas hecho el Paso 3 y el redeploy.
5. En la lista de campos del webhook, **suscríbete a `messages`**.

## Paso 5. Probar

1. Con el número de prueba, agrega tu propio celular como destinatario permitido y escribe al número del negocio. Con un número real, solo escríbele desde otro celular.
2. En unos segundos aparece el chat en la pestaña **Conversaciones** y el lead en **Leads** (marcado "Automático"). Revisa que el tipo (costarricense o extranjero) esté bien: se adivina por el prefijo del teléfono.
3. Responde desde Pulso CRM. En el celular del cliente debe llegar el mensaje, y en el chat verás "Enviado", "Entregado" y "Leído".

Si el mensaje no aparece: Admin, Canales, "Últimos avisos". Si ahí no llega nada, Meta no está logrando llamar a tu dirección (revisa el Paso 4 y que la app esté en modo **Live** y no en desarrollo, que es lo que Meta exige para recibir mensajes de clientes reales; para pasarla a Live Meta pide, entre otras cosas, una dirección de política de privacidad). En algunas cuentas hay que suscribir la app a la cuenta de WhatsApp Business además de marcar el campo `messages`: la documentación de Meta lo llama `subscribed_apps`.

## Cómo se comporta

- **Lead automático.** El primer mensaje crea el lead con el nombre del perfil de WhatsApp, el teléfono, el canal "WhatsApp" y el mensaje como consulta. Si ya hay un lead con ese teléfono (con o sin el 506), el chat se une a él y no se duplica.
- **Fotos, audios, videos y documentos** que manda el cliente se descargan y se guardan en la base de datos, hasta 4 MB cada uno (Meta borra sus copias a los pocos días). Si uno pesa más o la descarga falla, el mensaje igual queda guardado con un aviso para abrirlo en WhatsApp.
- **Ubicaciones, contactos y botones** llegan como texto. Las reacciones (👍) se ignoran.
- **Regla de las 24 horas.** WhatsApp solo deja responder libremente durante las 24 horas siguientes al último mensaje del cliente. Pasado ese tiempo, Pulso CRM bloquea el cuadro de respuesta y lo explica. Escribirle primero a alguien, o después de las 24 horas, requiere una *plantilla* aprobada por Meta, y **Pulso CRM todavía no envía plantillas**.
- **Al responder:** el lead pasa de la etapa inicial a la siguiente (por defecto, de Nuevo a Contactado) y se anota la atención del día (una sola vez por día).
- **Seguridad.** Pulso CRM rechaza cualquier aviso que no traiga la firma correcta de Meta (`X-Hub-Signature-256`, calculada con tu clave secreta). Los archivos de los clientes solo se ven con sesión iniciada.
- **Aún no incluye:** enviar fotos o archivos desde el CRM al cliente ni plantillas. Instagram y Messenger ya están (ver [ADMIN.md](ADMIN.md)).

## Instalación liviana en tu propio servidor (sin Chatwoot)

Pulso CRM solo, con su base de datos y HTTPS, usa unos 512 MB de memoria (a diferencia de Chatwoot, que pide 4 GB). Necesitas un servidor con Docker, un nombre como `crm.tuempresa.com` apuntando a su IP, y los puertos 80 y 443 abiertos.

```bash
git clone https://github.com/yormanmorillo/CRMCOSTARICA.git
cd CRMCOSTARICA
cp .env.solo.example .env
nano .env        # cambia todo lo que dice CAMBIAR (para textos al azar: openssl rand -hex 24)
docker compose -f docker-compose.solo.yml up -d --build
```

Después sigue desde el Paso 1 de esta guía. Para ver el estado: `docker compose -f docker-compose.solo.yml ps`. Para los mensajes de error: `docker compose -f docker-compose.solo.yml logs --tail 100 pulso`.

> Esta instalación liviana todavía no se ha probado en un servidor real (en el entorno donde se escribió no hay Docker).

## Si algo falla

| Síntoma | Qué revisar |
|---|---|
| Meta dice que no pudo verificar la URL | El `META_VERIFY_TOKEN` debe ser idéntico en Meta y en las variables; y Pulso CRM debe haberse reiniciado o redeployado después de crearlo. |
| "Probar la conexión" da error 190 | El token venció o está mal copiado. Genera el permanente (Usuario del sistema). |
| Llegan mensajes pero no puedo responder | El token necesita el permiso `whatsapp_business_messaging`, y el id debe ser el del número (`WHATSAPP_PHONE_ID`), no el de la cuenta. |
| Responder da error de "lista de destinatarios" | Estás con el número de prueba: agrega ese celular como destinatario en Meta. |
| Los mensajes de clientes reales no llegan, pero los de prueba sí | La app de Meta sigue en modo desarrollo: pásala a Live. |
| Llega el aviso pero dice "firma no válida" (401) | `META_APP_SECRET` mal copiado (es la clave secreta de la app, no el token). |
