#!/usr/bin/env bash
# Conecta Pulso CRM con tu Chatwoot. Ejecútalo después de crear tu cuenta en Chatwoot.
# Uso:  bash scripts/conectar-chatwoot.sh
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib.sh
. scripts/lib.sh

[ -f .env ] || falla "No encuentro el archivo .env. Ejecuta primero:  sudo bash scripts/instalar.sh"

cat <<'EOF'
Necesito dos datos de Chatwoot:
  - Número de cuenta: está en la dirección del navegador, así:  .../app/accounts/NUMERO/...
  - Token de acceso:  abajo a la izquierda, tu nombre, "Profile Settings", "Access Token".
EOF
echo
preguntar CHATWOOT_ACCOUNT_ID "Número de cuenta de Chatwoot"
preguntar CHATWOOT_API_TOKEN "Token de acceso (no se verá al escribirlo)" secreto
[[ "$CHATWOOT_ACCOUNT_ID" =~ ^[0-9]+$ ]] || falla "El número de cuenta debe ser solo dígitos."
[ -n "$CHATWOOT_API_TOKEN" ] || falla "Falta el token."

poner_env CHATWOOT_ACCOUNT_ID "$CHATWOOT_ACCOUNT_ID"
poner_env CHATWOOT_API_TOKEN "$CHATWOOT_API_TOKEN"

if [ "${SKIP_START:-}" != 1 ]; then
  titulo "Reiniciando Pulso CRM con los datos nuevos…"
  docker compose up -d pulso
fi

CRM_DOMAIN="$(leer_env CRM_DOMAIN)"
TOKEN="$(leer_env WEBHOOK_TOKEN)"
cat <<EOF

Último paso, en Chatwoot:
  Ajustes, Integraciones, Webhooks, "Agregar nuevo webhook".
  Dirección (copia y pega todo):

    https://$CRM_DOMAIN/api/webhooks/chatwoot?token=$TOKEN

  Marca los eventos "Conversación creada" y "Mensaje creado". Guarda.

Para probar, escribe un mensaje a uno de tus canales. El lead aparece en https://$CRM_DOMAIN
(En Pulso CRM, Ajustes, "Últimos avisos recibidos" muestra todo lo que llega.)
EOF
