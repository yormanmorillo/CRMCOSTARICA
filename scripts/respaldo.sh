#!/usr/bin/env bash
# Respaldo de las dos bases de datos y de los archivos de Chatwoot. Guarda los últimos 7.
# Uso:  bash scripts/respaldo.sh
# Para hacerlo cada noche (crontab -e):  0 3 * * * cd /ruta/CRMCOSTARICA && bash scripts/respaldo.sh
set -euo pipefail
cd "$(dirname "$0")/.."

dir="respaldos/$(date +%F_%H%M)"
mkdir -p "$dir"
echo "Respaldando en $dir …"
docker compose exec -T postgres pg_dump -U postgres -d pulso | gzip > "$dir/pulso.sql.gz"
docker compose exec -T postgres pg_dump -U postgres -d chatwoot_production | gzip > "$dir/chatwoot.sql.gz"
docker compose exec -T rails tar -czf - -C /app storage > "$dir/chatwoot-archivos.tgz" || echo "Aviso: no se pudieron respaldar los archivos de Chatwoot."

# Dejar solo los 7 más recientes
ls -1dt respaldos/*/ 2>/dev/null | tail -n +8 | xargs -r rm -rf
echo "Listo. Copia la carpeta 'respaldos' a otro lugar (otra computadora o almacenamiento en la nube): un respaldo que está solo en el mismo servidor no protege si el servidor falla."
