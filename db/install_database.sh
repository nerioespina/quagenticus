#!/usr/bin/env bash
# Installs or upgrades the Quagenticus schema.
#
# Phases:
#   1. Baseline DDL (fresh installs only): every file in file_order.conf that is
#      not code (*_functions.sql, *_triggers.sql, *_views.sql) nor the seed.
#   2. Migrations (always): db/migrations/NNNN_*.sql not yet recorded in
#      schema_migration, each one inside its own transaction.
#   3. Code (always): functions, triggers and views, in file_order.conf order.
#      They are idempotent (CREATE OR REPLACE / DROP IF EXISTS).
#   4. Seed (fresh installs only): init_system.sql.
set -e

cd "$(dirname "$0")"

DB_HOST=${QG_DB_HOST:-localhost}
DB_PORT=${QG_DB_PORT:-5432}
DB_NAME=${QG_DB_NAME:-quagenticus}
DB_USER=${QG_DB_USER:-qg}
SCHEMA_NAME=${QG_DB_SCHEMA:-quagenticus}

export PGOPTIONS="-c search_path=${SCHEMA_NAME},public -c client_min_messages=warning"

psql_base() {
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q "$@"
}

is_code() {
    [[ "$1" == *"_functions.sql" || "$1" == *"_triggers.sql" || "$1" == *"_views.sql" ]]
}

is_seed() {
    [[ "$1" == "init_system.sql" ]]
}

read_order() {
    grep -v '^\s*#' file_order.conf | grep -v '^\s*$'
}

echo "Waiting for database at $DB_HOST:$DB_PORT..."
while ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; do
    sleep 1
done
echo "Database is ready."

psql_base -c "CREATE SCHEMA IF NOT EXISTS $SCHEMA_NAME;"

INSTALLED=$(psql_base -t -A -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='$SCHEMA_NAME' AND table_name='account';")

if [ "$INSTALLED" = "0" ]; then
    FRESH=1
    echo "Fresh install."
else
    FRESH=0
    echo "Existing install detected — upgrading."
fi

# ---------------------------------------------------------------- 1. Baseline
if [ "$FRESH" = "1" ]; then
    while IFS= read -r file; do
        if is_code "$file" || is_seed "$file"; then continue; fi
        echo "  [ddl]  $file"
        psql_base -f "$file"
    done < <(read_order)
fi

# -------------------------------------------------------------- 2. Migrations
psql_base -c "CREATE TABLE IF NOT EXISTS schema_migration (
    version    text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);"

if [ -d migrations ]; then
    for path in $(ls migrations/*.sql 2>/dev/null | sort); do
        version=$(basename "$path" .sql)
        applied=$(psql_base -t -A -c "SELECT count(*) FROM schema_migration WHERE version = '$version';")
        if [ "$applied" != "0" ]; then continue; fi
        echo "  [mig]  $version"
        psql_base --single-transaction \
            -f "$path" \
            -c "INSERT INTO schema_migration (version) VALUES ('$version');"
    done
fi

# -------------------------------------------------------------------- 3. Code
while IFS= read -r file; do
    if ! is_code "$file"; then continue; fi
    echo "  [code] $file"
    psql_base -f "$file"
done < <(read_order)

# -------------------------------------------------------------------- 4. Seed
if [ "$FRESH" = "1" ]; then
    echo "  [seed] init_system.sql"
    psql_base -f init_system.sql
fi

echo "Database installation complete."
