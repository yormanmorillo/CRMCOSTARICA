#!/bin/bash
# Crea la base de datos de Pulso CRM junto a la de Chatwoot, en el mismo Postgres (ahorra memoria).
# Solo corre la primera vez, cuando el volumen de datos está vacío.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
	CREATE ROLE pulso LOGIN PASSWORD '${PULSO_DB_PASSWORD}';
	CREATE DATABASE pulso OWNER pulso;
EOSQL
