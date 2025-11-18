#!/bin/bash
# LVM Snapshot Configuration Script
# Configure 12-hour LVM snapshots on VMI02D

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Server credentials
VMI02D_HOST="46.250.241.70"
ROOT_PASS="C0nnaught"

echo -e "${GREEN}=== Configuring LVM Snapshots on VMI02D ===${NC}"

sshpass -p "$ROOT_PASS" ssh -o StrictHostKeyChecking=accept-new root@$VMI02D_HOST << 'EOF'
# Create snapshot management script
cat > /backup/scripts/lvm-snapshot.sh << 'EOSCRIPT'
#!/bin/bash
# LVM Snapshot Management Script
# Creates and manages LVM snapshots with automatic rotation

set -e

# Configuration
VG_NAME="vg0"  # Update with actual volume group name
LV_NAME="data"  # Update with actual logical volume name
SNAPSHOT_PREFIX="snap"
MAX_SNAPSHOTS=14  # Keep last 14 snapshots (7 days at 12-hour intervals)
SNAPSHOT_SIZE="10G"  # Size allocated for snapshot COW data
LOG_FILE="/backup/logs/lvm-snapshot-$(date +%Y%m%d).log"
MOUNT_BASE="/backup/snapshots"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check available space
check_space() {
    local vg_free=$(vgs --noheadings --units g -o vg_free "$VG_NAME" | tr -d ' g')
    local required=10  # Required GB for snapshot

    if (( $(echo "$vg_free < $required" | bc -l) )); then
        log "ERROR: Insufficient space in volume group. Free: ${vg_free}G, Required: ${required}G"
        return 1
    fi

    log "Volume group has ${vg_free}G free space available"
    return 0
}

# Create new snapshot
create_snapshot() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local snapshot_name="${SNAPSHOT_PREFIX}_${timestamp}"

    log "Creating snapshot: $snapshot_name"

    # Create LVM snapshot
    if lvcreate -L "$SNAPSHOT_SIZE" -s -n "$snapshot_name" "/dev/$VG_NAME/$LV_NAME"; then
        log "✓ Snapshot created successfully: $snapshot_name"

        # Create mount point
        mkdir -p "$MOUNT_BASE/$snapshot_name"

        # Mount snapshot read-only
        mount -o ro "/dev/$VG_NAME/$snapshot_name" "$MOUNT_BASE/$snapshot_name"
        log "✓ Snapshot mounted at: $MOUNT_BASE/$snapshot_name"

        # Record snapshot metadata
        cat >> /backup/logs/snapshot-metadata.json << EOJ
{
  "name": "$snapshot_name",
  "created": "$(date -Iseconds)",
  "size": "$SNAPSHOT_SIZE",
  "source": "/dev/$VG_NAME/$LV_NAME",
  "mount": "$MOUNT_BASE/$snapshot_name",
  "cow_usage": "$(lvs --noheadings -o data_percent "/dev/$VG_NAME/$snapshot_name" | tr -d ' ')%"
}
EOJ

        return 0
    else
        log "ERROR: Failed to create snapshot"
        return 1
    fi
}

# Monitor snapshot space usage
monitor_snapshots() {
    log "Monitoring snapshot space usage..."

    for snap in $(lvs --noheadings -o lv_name "$VG_NAME" | grep "^${SNAPSHOT_PREFIX}_"); do
        local usage=$(lvs --noheadings -o data_percent "/dev/$VG_NAME/$snap" | tr -d ' ')

        if (( $(echo "$usage > 80" | bc -l) )); then
            log "WARNING: Snapshot $snap is ${usage}% full"
            # Send alert (implement your alerting here)
        elif (( $(echo "$usage > 95" | bc -l) )); then
            log "CRITICAL: Snapshot $snap is ${usage}% full - removing"
            remove_snapshot "$snap"
        else
            log "Snapshot $snap usage: ${usage}%"
        fi
    done
}

# Remove old snapshots
cleanup_old_snapshots() {
    log "Cleaning up old snapshots..."

    # Get list of snapshots sorted by creation time
    local snapshots=($(lvs --noheadings -o lv_name,lv_time "$VG_NAME" | \
                      grep "^${SNAPSHOT_PREFIX}_" | \
                      sort -k2 | \
                      awk '{print $1}'))

    local count=${#snapshots[@]}

    if [ "$count" -gt "$MAX_SNAPSHOTS" ]; then
        local remove_count=$((count - MAX_SNAPSHOTS))
        log "Found $count snapshots, removing $remove_count old snapshots"

        for ((i=0; i<$remove_count; i++)); do
            remove_snapshot "${snapshots[$i]}"
        done
    else
        log "Found $count snapshots, within limit of $MAX_SNAPSHOTS"
    fi
}

# Remove a specific snapshot
remove_snapshot() {
    local snapshot_name=$1

    log "Removing snapshot: $snapshot_name"

    # Unmount if mounted
    if mountpoint -q "$MOUNT_BASE/$snapshot_name" 2>/dev/null; then
        umount "$MOUNT_BASE/$snapshot_name"
        rmdir "$MOUNT_BASE/$snapshot_name"
        log "✓ Unmounted snapshot"
    fi

    # Remove LVM snapshot
    if lvremove -f "/dev/$VG_NAME/$snapshot_name"; then
        log "✓ Removed snapshot: $snapshot_name"
    else
        log "ERROR: Failed to remove snapshot: $snapshot_name"
    fi
}

# Verify snapshot integrity
verify_snapshot() {
    local snapshot_name=$1

    log "Verifying snapshot: $snapshot_name"

    # Check if snapshot is valid
    if lvs "/dev/$VG_NAME/$snapshot_name" &>/dev/null; then
        # Check COW usage
        local usage=$(lvs --noheadings -o data_percent "/dev/$VG_NAME/$snapshot_name" | tr -d ' ')

        if (( $(echo "$usage < 100" | bc -l) )); then
            log "✓ Snapshot $snapshot_name is valid (${usage}% used)"
            return 0
        else
            log "ERROR: Snapshot $snapshot_name is invalid (overflow)"
            return 1
        fi
    else
        log "ERROR: Snapshot $snapshot_name does not exist"
        return 1
    fi
}

# List all snapshots
list_snapshots() {
    log "Current snapshots:"

    lvs --noheadings -o lv_name,lv_size,data_percent,lv_time "$VG_NAME" | \
    grep "^${SNAPSHOT_PREFIX}_" | \
    while read name size usage created; do
        log "  - $name: Size=$size, Usage=${usage}%, Created=$created"
    done
}

# Main function
main() {
    log "=== Starting LVM Snapshot Process ==="

    # Check prerequisites
    if ! check_space; then
        exit 1
    fi

    # Monitor existing snapshots
    monitor_snapshots

    # Create new snapshot
    if create_snapshot; then
        # Cleanup old snapshots
        cleanup_old_snapshots

        # List current snapshots
        list_snapshots

        log "=== LVM Snapshot Process Complete ==="
        exit 0
    else
        log "=== LVM Snapshot Process Failed ==="
        exit 1
    fi
}

# Run main function
main
EOSCRIPT

chmod +x /backup/scripts/lvm-snapshot.sh

# Create snapshot restore script
cat > /backup/scripts/lvm-restore.sh << 'EOSCRIPT'
#!/bin/bash
# LVM Snapshot Restore Script

set -e

# Configuration
VG_NAME="vg0"
LV_NAME="data"
LOG_FILE="/backup/logs/lvm-restore-$(date +%Y%m%d_%H%M%S).log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# List available snapshots
list_available_snapshots() {
    echo "Available snapshots:"
    lvs --noheadings -o lv_name,lv_time,data_percent "$VG_NAME" | \
    grep "^snap_" | \
    while read name created usage; do
        echo "  - $name (Created: $created, Usage: ${usage}%)"
    done
}

# Restore from snapshot
restore_snapshot() {
    local snapshot_name=$1

    log "WARNING: This will restore data from snapshot: $snapshot_name"
    log "Current data will be replaced. Press Ctrl+C to cancel..."
    sleep 10

    # Verify snapshot exists
    if ! lvs "/dev/$VG_NAME/$snapshot_name" &>/dev/null; then
        log "ERROR: Snapshot $snapshot_name does not exist"
        exit 1
    fi

    log "Starting restore from snapshot: $snapshot_name"

    # Stop services that might be using the volume
    log "Stopping services..."
    systemctl stop postgresql || true
    systemctl stop nginx || true

    # Unmount current volume if mounted
    if mountpoint -q "/data"; then
        log "Unmounting current volume..."
        umount /data
    fi

    # Merge snapshot (restore)
    log "Merging snapshot with origin volume..."
    lvconvert --merge "/dev/$VG_NAME/$snapshot_name"

    log "Restore initiated. The merge will complete on next activation."
    log "Rebooting system to complete restore..."

    # Schedule reboot
    shutdown -r +1 "System will reboot in 1 minute to complete snapshot restore"

    log "✓ Restore process initiated successfully"
}

# Main
if [ $# -eq 0 ]; then
    list_available_snapshots
    echo ""
    echo "Usage: $0 <snapshot_name>"
    echo "Example: $0 snap_20240101_120000"
    exit 1
fi

restore_snapshot "$1"
EOSCRIPT

chmod +x /backup/scripts/lvm-restore.sh

# Create monitoring script
cat > /backup/scripts/monitor-snapshots.sh << 'EOSCRIPT'
#!/bin/bash
# Snapshot Monitoring Script

set -e

# Configuration
VG_NAME="vg0"
WARNING_THRESHOLD=70
CRITICAL_THRESHOLD=85
ALERT_EMAIL="admin@example.com"

# Check snapshot health
check_snapshot_health() {
    local has_warning=0
    local has_critical=0

    echo "=== Snapshot Health Check ==="

    # Check each snapshot
    for snap in $(lvs --noheadings -o lv_name "$VG_NAME" | grep "^snap_"); do
        local usage=$(lvs --noheadings -o data_percent "/dev/$VG_NAME/$snap" | tr -d ' ')

        if (( $(echo "$usage > $CRITICAL_THRESHOLD" | bc -l) )); then
            echo "CRITICAL: Snapshot $snap is ${usage}% full"
            has_critical=1
        elif (( $(echo "$usage > $WARNING_THRESHOLD" | bc -l) )); then
            echo "WARNING: Snapshot $snap is ${usage}% full"
            has_warning=1
        else
            echo "OK: Snapshot $snap is ${usage}% full"
        fi
    done

    # Check VG free space
    local vg_free=$(vgs --noheadings --units g -o vg_free "$VG_NAME" | tr -d ' g')
    if (( $(echo "$vg_free < 20" | bc -l) )); then
        echo "WARNING: Volume group has only ${vg_free}G free"
        has_warning=1
    fi

    # Return appropriate exit code
    if [ "$has_critical" -eq 1 ]; then
        exit 2
    elif [ "$has_warning" -eq 1 ]; then
        exit 1
    else
        exit 0
    fi
}

# Run check
check_snapshot_health
EOSCRIPT

chmod +x /backup/scripts/monitor-snapshots.sh

echo "LVM snapshot scripts configured on VMI02D"
EOF

echo -e "${GREEN}=== LVM Snapshot Configuration Complete ===${NC}"