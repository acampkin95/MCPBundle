#!/bin/bash
#
# Backup NextCloud Data and Configuration
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="/mnt/secure-archive/nextcloud-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="nextcloud_backup_${TIMESTAMP}"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}NextCloud Backup${NC}"
echo "=================="
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "Creating backup: $BACKUP_NAME"
echo ""

# Enable maintenance mode
echo "Enabling maintenance mode..."
cd "$SCRIPT_DIR"
docker-compose exec -T nextcloud php occ maintenance:mode --on

# Backup files
echo "Backing up NextCloud data..."
mkdir -p "$BACKUP_DIR/$BACKUP_NAME"
tar -czf "$BACKUP_DIR/$BACKUP_NAME/data.tar.gz" -C /mnt/nextcloud data

# Backup docker volumes
echo "Backing up Docker volumes..."
docker run --rm \
    -v nextcloud_config:/config \
    -v "$BACKUP_DIR/$BACKUP_NAME":/backup \
    alpine tar -czf /backup/config.tar.gz -C /config .

docker run --rm \
    -v nextcloud_custom_apps:/apps \
    -v "$BACKUP_DIR/$BACKUP_NAME":/backup \
    alpine tar -czf /backup/apps.tar.gz -C /apps .

# Backup database (on VMI01)
source "$SCRIPT_DIR/.env"
echo "Backing up database..."
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h "$POSTGRES_HOST" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    | gzip > "$BACKUP_DIR/$BACKUP_NAME/database.sql.gz"

# Disable maintenance mode
echo "Disabling maintenance mode..."
docker-compose exec -T nextcloud php occ maintenance:mode --off

# Create backup info
cat > "$BACKUP_DIR/$BACKUP_NAME/backup_info.txt" <<EOF
NextCloud Backup Information
============================
Backup Date: $(date)
Backup Name: $BACKUP_NAME

Contents:
- data.tar.gz: NextCloud data directory
- config.tar.gz: NextCloud configuration
- apps.tar.gz: Custom apps
- database.sql.gz: PostgreSQL database dump

Restore Instructions:
1. Stop NextCloud: docker-compose down
2. Extract data: tar -xzf data.tar.gz -C /mnt/nextcloud
3. Restore database: gunzip -c database.sql.gz | psql -h HOST -U USER -d DATABASE
4. Extract volumes: tar -xzf config.tar.gz -C /var/lib/docker/volumes/nextcloud_config/_data
5. Start NextCloud: docker-compose up -d
EOF

# Calculate backup size
BACKUP_SIZE=$(du -sh "$BACKUP_DIR/$BACKUP_NAME" | cut -f1)

echo ""
echo -e "${GREEN}Backup completed successfully!${NC}"
echo ""
echo "Backup location: $BACKUP_DIR/$BACKUP_NAME"
echo "Backup size: $BACKUP_SIZE"
echo ""

# Cleanup old backups (keep last 7)
echo "Cleaning up old backups (keeping last 7)..."
ls -t "$BACKUP_DIR" | tail -n +8 | xargs -I {} rm -rf "$BACKUP_DIR/{}"

echo -e "${GREEN}Backup process complete${NC}"
