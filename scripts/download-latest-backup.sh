#!/bin/bash

# Download Latest Production Backup Script
# Downloads the latest production zip file from backup-dineros bucket and extracts to app/prisma/backup/

set -e

# Configuration
BUCKET_NAME="backup-dineros"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_ROOT/app/prisma/backup"
TEMP_DIR="/tmp/dineros-backup"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ENVIRONMENT="${1:-production}"
if [ "$ENVIRONMENT" != "production" ] && [ "$ENVIRONMENT" != "staging" ]; then
    echo -e "${RED}❌ Invalid environment. Use 'production' or 'staging'${NC}"
    echo -e "${YELLOW}Usage: $0 [production|staging]${NC}"
    exit 1
fi

echo -e "${GREEN}🔍 Finding latest ${ENVIRONMENT} backup...${NC}"

# Create temp directory
mkdir -p "$TEMP_DIR"

# List objects recursively and find latest backup by object timestamp.
LATEST_BACKUP=$(
  gsutil ls -l -r "gs://$BUCKET_NAME/**" | \
  awk -v env="$ENVIRONMENT" '$0 !~ /TOTAL:/ && $3 ~ env && $3 ~ /\.zip$/ { print $0 }' | \
  sort -k2,2 | \
  tail -1 | \
  awk '{print $3}'
)

if [ -z "$LATEST_BACKUP" ]; then
    echo -e "${RED}❌ No ${ENVIRONMENT} backup files found in bucket${NC}"
    exit 1
fi

# Extract just the filename from the full path
BACKUP_FILENAME=$(basename "$LATEST_BACKUP")

echo -e "${GREEN}📦 Found latest backup: $BACKUP_FILENAME${NC}"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Clean existing files in backup directory
echo -e "${YELLOW}🧹 Cleaning existing backup files...${NC}"
rm -rf "$BACKUP_DIR"/*

# Download the latest backup
echo -e "${YELLOW}⬇️  Downloading backup...${NC}"
gsutil cp "$LATEST_BACKUP" "$TEMP_DIR/"

# Extract the backup
echo -e "${YELLOW}📂 Extracting backup...${NC}"
cd "$TEMP_DIR"
unzip -q "$BACKUP_FILENAME" -d "$BACKUP_DIR"

# Clean up temp files
rm -rf "$TEMP_DIR"

echo -e "${GREEN}✅ Backup successfully downloaded and extracted to $BACKUP_DIR${NC}"
echo -e "${GREEN}📁 Files extracted from: $BACKUP_FILENAME${NC}"
