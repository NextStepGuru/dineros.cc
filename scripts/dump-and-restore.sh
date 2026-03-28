#!/bin/bash

# Database Dump and Restore Script
# Dumps from staging or production and restores to local MySQL

set -e

# Default remote sources (can be overridden with exported env vars)
: "${DINEROS_PRODUCTION_DATABASE_URL:=empty}"
: "${DINEROS_PRODUCTION_DATABASE_NAME:=production-dineros}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to URL decode (handles common URL encoding)
url_decode() {
    local url_encoded_string=$1
    # Use Python for proper URL decoding if available, otherwise use printf
    if command -v python3 &> /dev/null; then
        python3 -c "import urllib.parse; print(urllib.parse.unquote('$url_encoded_string'))"
    else
        # Fallback: basic decoding
        printf '%b\n' "${url_encoded_string//%/\\x}"
    fi
}

# Function to parse MySQL URL
parse_mysql_url() {
    local url=$1
    # Remove mysql:// prefix
    url=${url#mysql://}
    # Strip query string if present
    local connection_part=${url%%\?*}

    # Extract user:password@host:port/database
    if [[ $connection_part =~ ^([^:]+):([^@]+)@([^:/]+)(:([0-9]+))?(/(.+))?$ ]]; then
        DB_USER="${BASH_REMATCH[1]}"
        DB_PASS="${BASH_REMATCH[2]}"
        DB_HOST="${BASH_REMATCH[3]}"
        DB_PORT="${BASH_REMATCH[5]:-3306}"
        DB_NAME="${BASH_REMATCH[7]}"

        # URL decode the password only if it contains encoded characters
        if [[ "$DB_PASS" =~ % ]]; then
            DB_PASS=$(url_decode "$DB_PASS")
        fi
    else
        echo -e "${RED}❌ Invalid MySQL URL format${NC}"
        exit 1
    fi
}

# Function to dump database
# Optional second arg: explicit output path (e.g. persisted .dumps file)
dump_database() {
    local env=$1
    local output_path=${2:-}
    local env_upper=$(echo "$env" | tr '[:lower:]' '[:upper:]')
    local url_var="DINEROS_${env_upper}_DATABASE_URL"
    local url="${!url_var}"

    if [ -z "$url" ]; then
        echo -e "${RED}❌ Environment variable $url_var is not set${NC}"
        exit 1
    fi

    echo -e "${BLUE}📥 Parsing $env database URL...${NC}" >&2
    parse_mysql_url "$url"

    # Check if Cloud SQL Proxy is being used (override host)
    if [ -n "$CLOUD_SQL_PROXY_HOST" ]; then
        echo -e "${BLUE}🔀 Using Cloud SQL Proxy at $CLOUD_SQL_PROXY_HOST${NC}" >&2
        DB_HOST="$CLOUD_SQL_PROXY_HOST"
        DB_PORT="${CLOUD_SQL_PROXY_PORT:-3306}"
    fi

    # Debug output (hide password)
    echo -e "${BLUE}   Host: $DB_HOST${NC}" >&2
    echo -e "${BLUE}   Port: $DB_PORT${NC}" >&2
    echo -e "${BLUE}   User: $DB_USER${NC}" >&2
    echo -e "${BLUE}   Database: $DB_NAME${NC}" >&2

    local dump_file
    if [ -n "$output_path" ]; then
        dump_file="$output_path"
        mkdir -p "$(dirname "$output_path")"
    else
        dump_file="/tmp/dineros-${env}-$(date +%Y%m%d-%H%M%S).sql"
    fi

    echo -e "${YELLOW}💾 Dumping $env database ($DB_NAME) from $DB_HOST:$DB_PORT...${NC}" >&2

    # Build mysqldump command
    local mysqldump_cmd=(
        mysqldump
        -h "$DB_HOST"
        -P "$DB_PORT"
        -u "$DB_USER"
        --single-transaction
        --routines
        --triggers
        --add-drop-database
        --set-gtid-purged=OFF
        --databases "$DB_NAME"
    )

    # Test connection first
    echo -e "${BLUE}🔍 Testing connection...${NC}" >&2
    local test_output
    # Use MYSQL_PWD to avoid password in command line
    export MYSQL_PWD="$DB_PASS"
    test_output=$(mysql --protocol=TCP -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e "SELECT 1" 2>&1)
    local test_exit=$?
    unset MYSQL_PWD

    # Check both exit code and error messages (MySQL sometimes returns 0 even on auth failure)
    local has_error=0
    if [ $test_exit -ne 0 ]; then
        has_error=1
    elif echo "$test_output" | grep -qiE "ERROR|Access denied"; then
        has_error=1
    fi

    if [ $has_error -eq 1 ]; then
        echo -e "${RED}❌ Cannot connect to database${NC}" >&2
        echo -e "${YELLOW}Error details:${NC}" >&2
        echo "$test_output" | grep -vE "Using a password|WARNING" | head -5 >&2
        echo "" >&2

        # Check if this looks like a Google Cloud SQL instance
        if [[ "$DB_HOST" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && [[ "$test_output" =~ "Access denied" ]]; then
            echo -e "${YELLOW}💡 This appears to be a Google Cloud SQL instance. Options:${NC}" >&2
            echo -e "${BLUE}   1. Whitelist your IP in Google Cloud Console:${NC}" >&2
            echo -e "      gcloud sql instances patch INSTANCE_NAME --authorized-networks=YOUR_IP/32" >&2
            echo -e "" >&2
            echo -e "${BLUE}   2. Use Cloud SQL Proxy (recommended):${NC}" >&2
            echo -e "      a. Start proxy: cloud-sql-proxy INSTANCE_CONNECTION_NAME" >&2
            echo -e "      b. Set CLOUD_SQL_PROXY_HOST=127.0.0.1 before running this script" >&2
            echo -e "" >&2
            echo -e "${BLUE}   3. Verify password is correct (may need URL decoding)${NC}" >&2
        else
            echo -e "${YELLOW}💡 Troubleshooting:${NC}" >&2
            echo -e "   1. Check if your IP is whitelisted" >&2
            echo -e "   2. Verify the password is correct" >&2
            echo -e "   3. Check network connectivity" >&2
        fi
        exit 1
    fi

    echo -e "${GREEN}✅ Connection successful${NC}" >&2

    # Use password via MYSQL_PWD environment variable (more secure than -p)
    export MYSQL_PWD="$DB_PASS"
    "${mysqldump_cmd[@]}" > "$dump_file"
    local dump_exit=$?
    unset MYSQL_PWD

    if [ $dump_exit -eq 0 ]; then
        echo -e "${GREEN}✅ Database dumped successfully to $dump_file${NC}" >&2
        echo "$dump_file"
    else
        echo -e "${RED}❌ Failed to dump database${NC}" >&2
        exit 1
    fi
}

# Function to restore database
restore_database() {
    local dump_file=$1
    local source_db_name=$2  # Database name from the dump

    # Local database configuration (from docker-compose defaults)
    local LOCAL_HOST="${MYSQL_HOST:-localhost}"
    local LOCAL_PORT="${MYSQL_PORT:-3309}"
    local LOCAL_USER="${MYSQL_USER:-dineros}"
    local LOCAL_PASS="${MYSQL_PASSWORD:-dineros}"
    local LOCAL_DB="${MYSQL_DATABASE:-dineros}"

    echo -e "${YELLOW}🔄 Restoring to local database ($LOCAL_DB) at $LOCAL_HOST:$LOCAL_PORT...${NC}"

    # Check if local MySQL is accessible (force TCP protocol, not socket)
    if ! MYSQL_PWD="$LOCAL_PASS" mysql --protocol=TCP -h "$LOCAL_HOST" -P "$LOCAL_PORT" -u "$LOCAL_USER" -e "SELECT 1" &>/dev/null; then
        echo -e "${RED}❌ Cannot connect to local MySQL. Make sure docker-compose is running.${NC}"
        echo -e "${YELLOW}💡 Try: docker-compose up -d mysql${NC}"
        exit 1
    fi

    # Restore the dump (force TCP protocol)
    # Replace database name in dump file if it differs from local database name
    local temp_dump="$dump_file.tmp"
    if [ -n "$source_db_name" ] && [ "$LOCAL_DB" != "$source_db_name" ]; then
        echo -e "${BLUE}   Adjusting database name from $source_db_name to $LOCAL_DB...${NC}" >&2
        sed "s/\`$source_db_name\`/\`$LOCAL_DB\`/g; s/USE \`$source_db_name\`/USE \`$LOCAL_DB\`/g; s/CREATE DATABASE.*\`$source_db_name\`/CREATE DATABASE IF NOT EXISTS \`$LOCAL_DB\`/g" "$dump_file" > "$temp_dump"
        MYSQL_PWD="$LOCAL_PASS" mysql --protocol=TCP -h "$LOCAL_HOST" -P "$LOCAL_PORT" -u "$LOCAL_USER" < "$temp_dump"
        local restore_exit=$?
        rm -f "$temp_dump"
    else
        MYSQL_PWD="$LOCAL_PASS" mysql --protocol=TCP -h "$LOCAL_HOST" -P "$LOCAL_PORT" -u "$LOCAL_USER" < "$dump_file"
        local restore_exit=$?
    fi

    if [ $restore_exit -eq 0 ]; then
        echo -e "${GREEN}✅ Database restored successfully${NC}"
    else
        echo -e "${RED}❌ Failed to restore database${NC}"
        exit 1
    fi
}

# Main script
if [ $# -eq 0 ]; then
    echo -e "${RED}Usage: $0 [staging|production] [--identical] [--persist]${NC}"
    echo -e "  --identical  Restore an exact copy (skip re-encrypt). Use production DB_ENCRYPTION_KEY in .env to read data."
    echo -e "  --persist    Write/read dump at <repo>/.dumps/dineros-<env>.sql; reuse if present (skip download)."
    exit 1
fi

ENV=$1
shift
RESTORE_IDENTICAL=0
PERSIST=0
while [ $# -gt 0 ]; do
    case "$1" in
        --identical) RESTORE_IDENTICAL=1 ;;
        --persist) PERSIST=1 ;;
        *)
            echo -e "${RED}❌ Unknown option: $1${NC}"
            echo -e "${RED}Usage: $0 [staging|production] [--identical] [--persist]${NC}"
            exit 1
            ;;
    esac
    shift
done

if [ "$ENV" != "staging" ] && [ "$ENV" != "production" ]; then
    echo -e "${RED}❌ Invalid environment. Use 'staging' or 'production'${NC}"
    exit 1
fi

echo -e "${GREEN}🚀 Starting database dump and restore process for $ENV...${NC}"
if [ $RESTORE_IDENTICAL -eq 1 ]; then
    echo -e "${YELLOW}   Mode: identical copy (no re-encrypt). Set DB_ENCRYPTION_KEY to $ENV key in .env to use.${NC}"
fi

# Get source database name before dumping
env_upper=$(echo "$ENV" | tr '[:lower:]' '[:upper:]')
url_var="DINEROS_${env_upper}_DATABASE_URL"
url="${!url_var}"
parse_mysql_url "$url"
if [ -z "$DB_NAME" ]; then
    db_name_var="DINEROS_${env_upper}_DATABASE_NAME"
    DB_NAME="${!db_name_var}"
fi
if [ -z "$DB_NAME" ]; then
    echo -e "${RED}❌ Missing database name in $url_var. Set DINEROS_${env_upper}_DATABASE_NAME.${NC}"
    exit 1
fi
SOURCE_DB_NAME="$DB_NAME"

SCRIPT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PERSIST_DUMP="$SCRIPT_ROOT/.dumps/dineros-${ENV}.sql"

# Dump from remote (or reuse persisted file)
if [ -f "$PERSIST_DUMP" ] && [ -s "$PERSIST_DUMP" ]; then
    echo -e "${BLUE}📂 Using local dump (skip download): $PERSIST_DUMP${NC}"
    echo -e "${YELLOW}   Remove this file to fetch a fresh dump from $ENV.${NC}"
    DUMP_FILE="$PERSIST_DUMP"
elif [ "$PERSIST" -eq 1 ]; then
    DUMP_FILE=$(dump_database "$ENV" "$PERSIST_DUMP")
else
    DUMP_FILE=$(dump_database "$ENV")
fi

# Restore to local
restore_database "$DUMP_FILE" "$SOURCE_DB_NAME"

# Reset/re-encrypt encrypted fields so local app works with local DB_ENCRYPTION_KEY (unless --identical)
if [ $RESTORE_IDENTICAL -eq 1 ]; then
    echo -e "${BLUE}🔐 Skipping re-encrypt (identical copy). Set DB_ENCRYPTION_KEY to $ENV key in .env to read data.${NC}"
else
    echo -e "${YELLOW}🔐 Updating encrypted fields for local (re-encrypt or overwrite)...${NC}"
    if (cd "$(dirname "$0")/.." && RESTORE_FROM_ENV="$ENV" pnpm run reset-encrypted-users); then
        echo -e "${GREEN}✅ Encrypted fields updated. Log in with dev@local.dev / dev (or RESTORE_DEV_PASSWORD).${NC}"
    else
        echo -e "${YELLOW}⚠️  Could not update encrypted fields (ensure .env has DATABASE_URL and DB_ENCRYPTION_KEY). Run: pnpm run reset-encrypted-users${NC}"
    fi
fi

# Optionally clean up dump file (not for persisted path)
if [[ "$DUMP_FILE" == "$PERSIST_DUMP" ]]; then
    echo -e "${BLUE}💾 Persisted dump at: $DUMP_FILE${NC}"
else
    read -p "$(echo -e ${YELLOW}Delete dump file $DUMP_FILE? [y/N]${NC}) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm "$DUMP_FILE"
        echo -e "${GREEN}🗑️  Dump file deleted${NC}"
    else
        echo -e "${BLUE}💾 Dump file kept at: $DUMP_FILE${NC}"
    fi
fi

echo -e "${GREEN}✨ Done!${NC}"
