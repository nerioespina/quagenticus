#!/usr/bin/env bash
set -e

DB_HOST=${QG_DB_HOST:-localhost}
DB_PORT=${QG_DB_PORT:-5432}
DB_NAME=${QG_DB_NAME:-quagenticus}
DB_USER=${QG_DB_USER:-qg}
SCHEMA_NAME=${QG_DB_SCHEMA:-quagenticus}

psql_run() {
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
         -v ON_ERROR_STOP=1 \
         -c "SET search_path TO $SCHEMA_NAME, public;" \
         "$@"
}

echo "Waiting for database at $DB_HOST:$DB_PORT..."
while ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; do
    sleep 1
done
echo "Database is ready."

psql_run -c "CREATE SCHEMA IF NOT EXISTS $SCHEMA_NAME;"

# Check if schema is already installed (account table existing = DDL was applied before).
# Fresh install: run every file in order.
# Re-run: only apply functions and triggers (CREATE OR REPLACE — idempotent).
INSTALLED=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='$SCHEMA_NAME' AND table_name='account';" \
    | tr -d ' \n')

if [ "$INSTALLED" = "0" ]; then
    echo "Fresh install — applying all files..."
    while IFS= read -r file || [[ -n "$file" ]]; do
        [[ -z "$file" || "$file" =~ ^# ]] && continue
        echo "  Applying $file..."
        psql_run -f "$file"
    done < file_order.conf
else
    echo "Schema already installed — updating functions and triggers only..."
    while IFS= read -r file || [[ -n "$file" ]]; do
        [[ -z "$file" || "$file" =~ ^# ]] && continue
        if [[ "$file" == *"functions.sql" || "$file" == *"triggers.sql" ]]; then
            echo "  Applying $file..."
            psql_run -f "$file"
        fi
    done < file_order.conf
fi

echo "Database installation complete."
