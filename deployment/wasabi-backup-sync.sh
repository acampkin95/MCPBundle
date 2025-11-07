#!/bin/bash
# Wasabi S3 Backup Sync Script for MCP Infrastructure
#
# Prerequisites:
# 1. rclone installed: apt-get install rclone
# 2. rclone configured with Wasabi credentials (see wasabi-s3-backup-template.conf)
# 3. This script installed in /usr/local/bin/wasabi-sync.sh
# 4. Cron job: 0 4 * * * /usr/local/bin/wasabi-sync.sh

set -e

# Configuration
WASABI_REMOTE="wasabi-backup"  # Name of rclone remote from config
WASABI_BUCKET="mcp-backups"    # Your Wasabi bucket name
HOSTNAME=$(hostname -s)
DATE=$(date +%Y%m%d)

# Local backup directories
BACKUP_DIRS=(
    "/var/backups/system"
    "/var/lib/pgbackrest"
    "/var/log/pgbackrest"
)

# Logging
LOG_FILE="/var/log/wasabi-sync.log"
exec 1>>"$LOG_FILE"
exec 2>&1

echo "================================================="
echo "Starting Wasabi S3 sync at $(date)"
echo "================================================="

# Check if rclone is installed
if ! command -v rclone &> /dev/null; then
    echo "ERROR: rclone is not installed. Install with: apt-get install rclone"
    exit 1
fi

# Check if rclone remote is configured
if ! rclone listremotes | grep -q "^${WASABI_REMOTE}:"; then
    echo "ERROR: rclone remote '$WASABI_REMOTE' not configured"
    echo "Please configure rclone with: rclone config"
    exit 1
fi

# Sync each backup directory to Wasabi
for DIR in "${BACKUP_DIRS[@]}"; do
    if [ -d "$DIR" ]; then
        REMOTE_PATH="${WASABI_REMOTE}:${WASABI_BUCKET}/${HOSTNAME}${DIR}"
        echo "Syncing $DIR to $REMOTE_PATH..."

        # Use rclone sync with appropriate flags
        rclone sync "$DIR" "$REMOTE_PATH" \
            --transfers 4 \
            --checkers 8 \
            --contimeout 60s \
            --timeout 300s \
            --retries 3 \
            --low-level-retries 10 \
            --stats 1m \
            --stats-one-line \
            --max-age 30d \
            --log-level INFO

        echo "✓ Completed sync of $DIR"
    else
        echo "⚠ Warning: Directory $DIR does not exist, skipping..."
    fi
done

# Optional: Clean up old files from Wasabi (older than 30 days)
echo "Cleaning up old backups from Wasabi (>30 days)..."
for DIR in "${BACKUP_DIRS[@]}"; do
    if [ -d "$DIR" ]; then
        REMOTE_PATH="${WASABI_REMOTE}:${WASABI_BUCKET}/${HOSTNAME}${DIR}"
        rclone delete "$REMOTE_PATH" \
            --min-age 30d \
            --rmdirs \
            --log-level INFO || true
    fi
done

# List current backup sizes on Wasabi
echo ""
echo "Current backup sizes on Wasabi:"
rclone size "${WASABI_REMOTE}:${WASABI_BUCKET}/${HOSTNAME}"

echo ""
echo "Wasabi S3 sync completed at $(date)"
echo "================================================="