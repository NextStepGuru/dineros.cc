#!/bin/bash

# Download Latest Production Backup Script
# Downloads the latest production zip file from backup-dineros bucket and extracts to prisma/backup/

set -e

# Configuration
BUCKET_NAME="backup-dineros"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_ROOT/prisma/backup"
TEMP_DIR="/tmp/dineros-backup"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔍 Finding latest production backup...${NC}"

# Create temp directory
mkdir -p "$TEMP_DIR"

# List objects in bucket and find the latest production backup
LATEST_BACKUP=$(gsutil ls "gs://$BUCKET_NAME/" | \
  grep "production.*\.zip$" | \
  sort | \
  tail -1)

if [ -z "$LATEST_BACKUP" ]; then
    echo -e "${RED}❌ No production backup files found in bucket${NC}"
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
