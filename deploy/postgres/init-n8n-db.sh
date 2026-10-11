#!/bin/sh
# Runs once, when the PostgreSQL volume is created: n8n gets its own database next to the app's
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE n8n OWNER \"$POSTGRES_USER\";"
