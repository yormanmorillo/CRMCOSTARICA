#!/usr/bin/env bash
# Instalación guiada de Pulso CRM + Chatwoot en un servidor Ubuntu o Debian.
# Uso:  sudo bash scripts/instalar.sh
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib.sh
. scripts/lib.sh

if [ "${SKIP_SYSTEM:-}" != 1 ] && [ "$(id -u)" -ne 0 ]; then
  falla "Ejecútalo con sudo:  sudo bash scripts/instalar.sh"
fi

# 1. Memoria de apoyo (swap). Chatwoot lo recomienda para no quedarse sin memoria al actualizar.
if [ "${SKIP_SYSTEM:-}" != 1 ]; then
  if [ -z "$(swapon --show --noheadings 2>/dev/null)" ]; then
    titulo "Creando 2 GB de memoria de apoyo (swap)…"
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi

  # 2. Docker
  if ! command -v docker >/dev/null 2>&1; then
    titulo "Instalando Docker…"
    curl -fsSL https://get.docker.com | sh
  fi
  docker compose version >/dev/null 2>&1 || falla "No encuentro 'docker compose'. Instala el plugin de Docker Compose y vuelve a ejecutar."
fi

# 3. Archivo .env con las contraseñas
if [ -f .env ]; then
  titulo "Ya existe un archivo .env: lo conservo tal como está."
else
  titulo "Datos de tu instalación"
  preguntar CRM_DOMAIN "Dirección de Pulso CRM (ejemplo: crm.tuempresa.com)"
  preguntar CHAT_DOMAIN "Dirección de Chatwoot (ejemplo: chat.tuempresa.com)"
  preguntar ADMIN_EMAIL "Tu correo (será tu usuario)"
  preguntar ADMIN_PASSWORD "Contraseña para entrar a Pulso CRM (mínimo 8 caracteres)" secreto

  [[ "$CRM_DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || falla "La dirección de Pulso CRM no parece válida: $CRM_DOMAIN"
  [[ "$CHAT_DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || falla "La dirección de Chatwoot no parece válida: $CHAT_DOMAIN"
  [ "$CRM_DOMAIN" != "$CHAT_DOMAIN" ] || falla "Las dos direcciones deben ser distintas."
  [[ "$ADMIN_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || falla "El correo no parece válido."
  [ "${#ADMIN_PASSWORD}" -ge 8 ] || falla "La contraseña debe tener al menos 8 caracteres."
  case "$ADMIN_PASSWORD" in *"'"*) falla "La contraseña no puede llevar comilla simple (')." ;; esac

  # Aviso si las direcciones todavía no apuntan a este servidor (sin esto no se puede sacar el HTTPS)
  if [ "${SKIP_SYSTEM:-}" != 1 ]; then
    mi_ip="$(curl -fsS -m 8 https://api.ipify.org 2>/dev/null || true)"
    for d in "$CRM_DOMAIN" "$CHAT_DOMAIN"; do
      ip_d="$(getent ahostsv4 "$d" 2>/dev/null | awk '{print $1; exit}')"
      if [ -z "$ip_d" ] || { [ -n "$mi_ip" ] && [ "$ip_d" != "$mi_ip" ]; }; then
        aviso "OJO: $d apunta a '${ip_d:-ninguna IP}' y este servidor es '${mi_ip:-desconocida}'."
        aviso "Sin esto no se puede activar el HTTPS. Revisa los registros DNS (tipo A)."
        if [ "${NO_PROMPT:-}" != 1 ]; then
          read -r -p "¿Continuar de todos modos? [s/N] " r
          [[ "$r" =~ ^[sS]$ ]] || falla "Instalación detenida. Arregla el DNS y vuelve a ejecutar."
        fi
      fi
    done
  fi

  : > .env
  chmod 600 .env
  poner_env CRM_DOMAIN "$CRM_DOMAIN"
  poner_env CHAT_DOMAIN "$CHAT_DOMAIN"
  poner_env ADMIN_EMAIL "$ADMIN_EMAIL"
  poner_env ADMIN_PASSWORD "$ADMIN_PASSWORD"
  poner_env AUTH_SECRET "$(azar 32)"
  poner_env WEBHOOK_TOKEN "$(azar 24)"
  poner_env CHATWOOT_SECRET_KEY_BASE "$(azar 64)"
  poner_env POSTGRES_PASSWORD "$(azar 24)"
  poner_env PULSO_DB_PASSWORD "$(azar 24)"
  poner_env REDIS_PASSWORD "$(azar 24)"
  poner_env CHATWOOT_ACCOUNT_ID ""
  poner_env CHATWOOT_API_TOKEN ""
  poner_env CHATWOOT_WEBHOOK_SECRET ""
  echo "Archivo .env creado."
fi

[ "${SKIP_START:-}" = 1 ] && { echo "SKIP_START=1: no arranco los servicios."; exit 0; }

# 4. Construir y arrancar
titulo "Construyendo Pulso CRM y descargando Chatwoot (puede tardar varios minutos)…"
docker compose build pulso
docker compose pull rails sidekiq postgres redis caddy

titulo "Preparando la base de datos de Chatwoot…"
docker compose up -d postgres redis
docker compose run --rm rails bundle exec rails db:chatwoot_prepare

titulo "Arrancando todo…"
docker compose up -d

# 5. Esperar a que responda
CRM_DOMAIN="$(leer_env CRM_DOMAIN)"
CHAT_DOMAIN="$(leer_env CHAT_DOMAIN)"
titulo "Esperando a que las páginas respondan (el HTTPS puede tardar un minuto)…"
ok_crm=0; ok_chat=0
for _ in $(seq 1 36); do
  [ "$ok_crm" = 1 ] || { curl -fsS -m 8 -o /dev/null "https://$CRM_DOMAIN/login" 2>/dev/null && ok_crm=1; } || true
  [ "$ok_chat" = 1 ] || { curl -fsS -m 8 -o /dev/null "https://$CHAT_DOMAIN/" 2>/dev/null && ok_chat=1; } || true
  [ "$ok_crm$ok_chat" = 11 ] && break
  sleep 5
done

titulo "Listo"
[ "$ok_crm" = 1 ] && echo "  Pulso CRM:  https://$CRM_DOMAIN   (entra con $(leer_env ADMIN_EMAIL))" || aviso "  Pulso CRM aún no responde. Mira:  docker compose logs --tail 50 pulso caddy"
[ "$ok_chat" = 1 ] && echo "  Chatwoot:   https://$CHAT_DOMAIN" || aviso "  Chatwoot aún no responde (la primera vez tarda). Mira:  docker compose logs --tail 50 rails caddy"
cat <<EOF

Siguiente paso:
  1. Abre https://$CHAT_DOMAIN y crea tu cuenta de administrador de Chatwoot.
  2. Conecta ahí tus canales (WhatsApp, Instagram, Facebook, chat de la web).
  3. Ejecuta:  bash scripts/conectar-chatwoot.sh
EOF
