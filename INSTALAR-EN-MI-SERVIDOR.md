# Instalar Pulso CRM + Chatwoot en tu propio servidor

Esta guía deja funcionando, en **un solo servidor**, Pulso CRM (tu CRM) y Chatwoot (donde llegan los mensajes de WhatsApp, Instagram, Facebook y la web), los dos con HTTPS y la base de datos incluida.

```
Cliente → WhatsApp / Instagram / Facebook / Web → Chatwoot ──aviso──▶ Pulso CRM
                                                      └── mismo servidor, mismo Postgres ──┘
```

Tiempo aproximado: 30 minutos, casi todo esperando que descargue.

## Qué necesitas

1. **Un servidor** con Ubuntu 22.04 o 24.04 (también sirve Debian) y **4 GB de RAM** o más. Chatwoot recomienda 4 núcleos de procesador; con menos funciona para un negocio pequeño, pero va más justo.
2. **Un dominio** donde puedas crear dos nombres, por ejemplo `crm.tuempresa.com` y `chat.tuempresa.com`.
3. **Los puertos 80 y 443 abiertos** en el servidor (en el panel de tu proveedor o con `ufw allow 80,443/tcp`).
4. Entrar al servidor por **SSH** (la consola de comandos).

## Paso 1. Apuntar los dos nombres al servidor

En el panel donde compraste el dominio, crea **dos registros tipo A**, los dos con la IP de tu servidor:

| Nombre | Tipo | Valor |
|---|---|---|
| `crm` | A | IP de tu servidor |
| `chat` | A | IP de tu servidor |

Puede tardar de unos minutos a unas horas en funcionar. Sin esto no se puede activar el HTTPS.

## Paso 2. Bajar el código y ejecutar la instalación

Entra a tu servidor por SSH y pega esto:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/yormanmorillo/CRMCOSTARICA.git
cd CRMCOSTARICA
sudo bash scripts/instalar.sh
```

Si GitHub te pide usuario y contraseña (porque el repositorio es privado), como contraseña usa un *token de acceso personal* de GitHub, no tu clave normal.

El script hace todo esto por ti:
- Agrega 2 GB de memoria de apoyo (swap), que Chatwoot recomienda.
- Instala Docker si no lo tienes.
- Te pregunta 4 cosas: la dirección de Pulso CRM, la de Chatwoot, tu correo y una contraseña.
- Crea las contraseñas internas al azar y las guarda en el archivo `.env` (no lo compartas ni lo subas a GitHub).
- Descarga y arranca todo.

Cuando termina te dice si las dos páginas responden. La primera vez Chatwoot puede tardar un par de minutos más.

## Paso 3. Crear tu cuenta de Chatwoot y conectar los canales

1. Abre `https://chat.tuempresa.com`. La primera vez te pide crear tu cuenta de administrador.
2. En Chatwoot, ve a **Ajustes, Bandejas de entrada** y conecta WhatsApp, Instagram, Facebook y el chat de la web. Chatwoot tiene un asistente para cada uno. Para WhatsApp, Instagram y Facebook necesitas una cuenta de Meta Business y la aprobación de permisos de Meta, que puede tardar.

## Paso 4. Conectar Chatwoot con Pulso CRM

En el servidor ejecuta:

```bash
bash scripts/conectar-chatwoot.sh
```

Te pide el **número de cuenta** de Chatwoot (aparece en la dirección del navegador: `.../app/accounts/NUMERO/...`) y tu **token de acceso** (abajo a la izquierda, tu nombre, "Profile Settings", "Access Token").

Al terminar te muestra una dirección larga. Cópiala y pégala en Chatwoot: **Ajustes, Integraciones, Webhooks, Agregar nuevo webhook**, marcando los eventos **"Conversación creada"** y **"Mensaje creado"**.

## Paso 5. Probar

Escríbele un mensaje a tu WhatsApp (o usa el chat de tu página). En unos segundos el lead aparece en `https://crm.tuempresa.com` y la conversación se ve dentro de su ficha, donde también puedes responder.

Si no aparece, entra a Pulso CRM, **Ajustes, "Últimos avisos recibidos"**: ahí se ve qué llegó y qué se hizo con cada aviso.

---

## Uso diario

| Quiero… | Comando (dentro de la carpeta `CRMCOSTARICA`) |
|---|---|
| Ver si todo está encendido | `docker compose ps` |
| Ver cuánta memoria usa cada pieza | `docker stats --no-stream` |
| Ver los mensajes de error de Pulso CRM | `docker compose logs --tail 100 pulso` |
| Ver los de Chatwoot | `docker compose logs --tail 100 rails sidekiq` |
| Reiniciar todo | `docker compose restart` |
| Hacer un respaldo | `bash scripts/respaldo.sh` |
| Actualizar | `bash scripts/actualizar.sh` (hace respaldo antes) |

**Respaldos.** Haz uno antes de cualquier cambio, y programa uno cada noche. Copia la carpeta `respaldos` a otro lugar, porque uno guardado solo en el mismo servidor no sirve si el servidor falla. Para programarlo: `crontab -e` y agrega `0 3 * * * cd /ruta/CRMCOSTARICA && bash scripts/respaldo.sh`.

**Agregar vendedores.** En Pulso CRM, Ajustes, Usuarios.

## Si algo falla

- **La página no abre o dice que no es segura.** Casi siempre es el DNS: revisa que los dos nombres apunten a la IP del servidor y que los puertos 80 y 443 estén abiertos. Luego: `docker compose logs --tail 50 caddy`.
- **El servidor se pone lento o se cae.** Probablemente se agotó la memoria. Revisa con `docker stats --no-stream`. Los ajustes de Chatwoot vienen reducidos para 4 GB; si tienes más memoria, puedes subirlos en `.env` (`CHATWOOT_WEB_CONCURRENCY`, `CHATWOOT_SIDEKIQ_CONCURRENCY`, ver `.env.servidor.example`) y ejecutar `docker compose up -d`.
- **Los mensajes llegan a Chatwoot pero no crean leads.** Revisa que el webhook de Chatwoot tenga la dirección exacta del Paso 4 y los dos eventos marcados. Si en "Últimos avisos recibidos" no aparece nada, Chatwoot no está pudiendo llamar a Pulso CRM: algunos servidores no pueden conectarse a su propia IP pública desde dentro. Pídeme ayuda con la salida de `docker compose logs --tail 100 sidekiq`.
- **No puedo responder desde Pulso CRM.** Revisa que hayas hecho el Paso 4 (cuenta y token). En WhatsApp solo se puede responder dentro de las 24 horas siguientes al último mensaje del cliente.
- **Cambié algo en `.env`.** Aplica los cambios con `docker compose up -d`.

## Notas

- **Seguridad.** Nunca abras en el firewall el puerto de la base de datos: este montaje no lo publica. Guarda el archivo `.env` (tiene todas las contraseñas) fuera de GitHub; ya está en `.gitignore`.
- **Versión de Chatwoot.** Usa la etiqueta `latest`, igual que su instalación oficial. Si quieres fijarla o usar la edición comunitaria (`latest-ce`), cambia `CHATWOOT_TAG` en `.env`.
- **Chatwoot y Pulso comparten un solo PostgreSQL** (cada uno en su propia base de datos) para ahorrar memoria.
- Los pasos de Chatwoot y de Meta pueden cambiar de nombre en sus pantallas. Si algo no coincide, usa su documentación.
