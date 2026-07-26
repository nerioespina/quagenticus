#!/usr/bin/env bash
set -e

# Configuration
DB_HOST=${QG_DB_HOST:-localhost}
DB_PORT=${QG_DB_PORT:-5432}
DB_NAME=${QG_DB_NAME:-quagenticus}
DB_USER=${QG_DB_USER:-qg}
SCHEMA_NAME=${QG_DB_SCHEMA:-quagenticus}

# Wait for DB
echo "Waiting for database at $DB_HOST:$DB_PORT..."
while ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; do
    sleep 1
done
echo "Database is ready."

# Initialize schema
echo "Creating schema $SCHEMA_NAME..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "CREATE SCHEMA IF NOT EXISTS $SCHEMA_NAME;"

# Read file_order.conf and execute each file
# First, create tables (data_structure)
echo "Installing data structures..."
while IFS= read -r file || [[ -n "$file" ]]; do
    if [[ ! -z "$file" ]] && [[ ! "$file" =~ ^# ]]; then
        if [[ "$file" == *"data_structure.sql" ]] || [[ "$file" == "common.sql" ]] || [[ "$file" == "init_system.sql" ]]; then
            echo "Applying $file..."
            psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -v search_path="$SCHEMA_NAME,public" -f "$file"
        fi
    fi
done < file_order.conf

# Then, create functions and triggers
echo "Installing functions and triggers..."
while IFS= read -r file || [[ -n "$file" ]]; do
    if [[ ! -z "$file" ]] && [[ ! "$file" =~ ^# ]]; then
        if [[ "$file" == *"functions.sql" ]] || [[ "$file" == *"triggers.sql" ]]; then
            echo "Applying $file..."
            psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -v search_path="$SCHEMA_NAME,public" -f "$file"
        fi
    fi
done < file_order.conf

echo "Database installation complete."
