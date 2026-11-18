#!/usr/bin/env bash
# Actualiza Pulso CRM (desde GitHub) y Chatwoot (última versión de la imagen). Hace un respaldo antes.
# Uso:  bash scripts/actualizar.sh
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib.sh
. scripts/lib.sh

titulo "Respaldo antes de actualizar…"
bash scripts/respaldo.sh

titulo "Bajando cambios de GitHub…"
git pull --ff-only

titulo "Actualizando…"
docker compose build pulso
docker compose pull rails sidekiq postgres redis caddy
docker compose run --rm rails bundle exec rails db:chatwoot_prepare
docker compose up -d
docker image prune -f >/dev/null
titulo "Listo."
docker compose ps
