#!/bin/bash
# ============================================================================
# MCP Ecosystem - Database Migration Deployment Script
# ============================================================================
# Purpose: Safely deploy database migration from v0.1 to v0.2
# Target: VMI01 (46.250.243.123) - PostgreSQL 16
# Version: 0.2.0
# ============================================================================

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_NAME="mcp_ecosystem"
DB_USER="mcp_admin"
DB_HOST="localhost"
DB_PORT="5432"
SCHEMA_DIR="/opt/mcp/schema"
BACKUP_DIR="/var/backups/postgresql"
LOG_FILE="/var/log/mcp/migration_v02_$(date +%Y%m%d_%H%M%S).log"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$BACKUP_DIR"

# ============================================================================
# Logging Functions
# ============================================================================

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"
}

# ============================================================================
# Pre-flight Checks
# ============================================================================

preflight_checks() {
    log "Running pre-flight checks..."

    # Check if running as correct user
    if [ "$(whoami)" != "root" ] && [ "$(whoami)" != "dev-admin" ]; then
        log_error "This script must be run as root or dev-admin user"
        exit 1
    fi

    # Check PostgreSQL is running
    if ! systemctl is-active --quiet postgresql; then
        log_error "PostgreSQL is not running"
        exit 1
    fi

    # Check database exists
    if ! sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        log_error "Database $DB_NAME does not exist"
        exit 1
    fi

    # Check migration script exists
    if [ ! -f "$SCHEMA_DIR/migrate_v01_to_v02.sql" ]; then
        log_error "Migration script not found: $SCHEMA_DIR/migrate_v01_to_v02.sql"
        exit 1
    fi

    # Check disk space (need at least 1GB free)
    AVAILABLE_SPACE=$(df -BG "$BACKUP_DIR" | tail -1 | awk '{print $4}' | sed 's/G//')
    if [ "$AVAILABLE_SPACE" -lt 1 ]; then
        log_error "Insufficient disk space for backup (need 1GB, have ${AVAILABLE_SPACE}GB)"
        exit 1
    fi

    log_success "All pre-flight checks passed"
}

# ============================================================================
# Create Backup
# ============================================================================

create_backup() {
    log "Creating database backup..."

    BACKUP_FILE="$BACKUP_DIR/mcp_ecosystem_pre_v2_$(date +%Y%m%d_%H%M%S).backup"

    sudo -u postgres pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc -f "$BACKUP_FILE" 2>&1 | tee -a "$LOG_FILE"

    if [ "${PIPESTATUS[0]}" -eq 0 ]; then
        BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        log_success "Backup created: $BACKUP_FILE ($BACKUP_SIZE)"
        echo "$BACKUP_FILE"  # Return backup file path
    else
        log_error "Backup failed"
        exit 1
    fi
}

# ============================================================================
# Stop MCP Services
# ============================================================================

stop_mcp_services() {
    log "Stopping MCP services..."

    local services=("mcp-orchestrator" "perplexity-mcp" "it-mcp")
    local stopped_services=()

    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service"; then
            log "Stopping $service..."
            sudo systemctl stop "$service" || log_warning "Failed to stop $service (may not be installed yet)"
            stopped_services+=("$service")
        else
            log "Service $service is not running"
        fi
    done

    echo "${stopped_services[@]}"  # Return list of stopped services
}

# ============================================================================
# Run Migration
# ============================================================================

run_migration() {
    log "Running database migration v0.1 → v0.2..."

    # Run migration script with connection to database
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -f "$SCHEMA_DIR/migrate_v01_to_v02.sql" 2>&1 | tee -a "$LOG_FILE"

    if [ "${PIPESTATUS[0]}" -eq 0 ]; then
        log_success "Migration completed successfully"
        return 0
    else
        log_error "Migration failed"
        return 1
    fi
}

# ============================================================================
# Validate Migration
# ============================================================================

validate_migration() {
    log "Validating migration..."

    # Check new tables exist
    local new_tables=(
        "thought_branches"
        "feedback_signals"
        "thought_relationships"
        "thought_sync_queue"
    )

    for table in "${new_tables[@]}"; do
        if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
            -tAc "SELECT COUNT(*) FROM pg_tables WHERE tablename='$table'" | grep -q "1"; then
            log_success "Table $table exists"
        else
            log_error "Table $table NOT found"
            return 1
        fi
    done

    # Check new functions exist
    local new_functions=(
        "search_thoughts"
        "get_thought_branch"
        "get_branch_health"
    )

    for func in "${new_functions[@]}"; do
        if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
            -tAc "SELECT COUNT(*) FROM pg_proc WHERE proname='$func'" | grep -q "[1-9]"; then
            log_success "Function $func exists"
        else
            log_error "Function $func NOT found"
            return 1
        fi
    done

    # Test full-text search
    log "Testing full-text search..."
    if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -tAc "SELECT COUNT(*) FROM search_thoughts('test', 1)" &>> "$LOG_FILE"; then
        log_success "Full-text search working"
    else
        log_warning "Full-text search test inconclusive (may have no data)"
    fi

    log_success "Migration validation passed"
    return 0
}

# ============================================================================
# Start MCP Services
# ============================================================================

start_mcp_services() {
    local services=$1
    log "Starting MCP services..."

    if [ -z "$services" ]; then
        log "No services to start"
        return 0
    fi

    for service in $services; do
        log "Starting $service..."
        sudo systemctl start "$service" || log_warning "Failed to start $service (may need configuration)"

        # Wait a moment and check status
        sleep 2
        if systemctl is-active --quiet "$service"; then
            log_success "$service started successfully"
        else
            log_warning "$service did not start (check logs: journalctl -u $service)"
        fi
    done
}

# ============================================================================
# Rollback Function
# ============================================================================

rollback() {
    local backup_file=$1
    log_warning "Rolling back migration..."

    # Stop services
    sudo systemctl stop mcp-orchestrator perplexity-mcp it-mcp 2>/dev/null || true

    # Drop database and restore
    log "Restoring database from backup: $backup_file"

    sudo -u postgres psql -U "$DB_USER" -d "$DB_NAME" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>&1 | tee -a "$LOG_FILE"
    sudo -u postgres pg_restore -U "$DB_USER" -d "$DB_NAME" "$backup_file" 2>&1 | tee -a "$LOG_FILE"

    if [ $? -eq 0 ]; then
        log_success "Rollback completed successfully"
        return 0
    else
        log_error "Rollback failed - manual intervention required!"
        log_error "Backup file: $backup_file"
        return 1
    fi
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║       MCP Ecosystem Database Migration: v0.1 → v0.2           ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    log "Migration started"
    log "Database: $DB_NAME@$DB_HOST"
    log "User: $DB_USER"
    log "Log file: $LOG_FILE"
    echo ""

    # Prompt for database password
    if [ -z "${DB_PASS:-}" ]; then
        read -rsp "Enter password for PostgreSQL user $DB_USER: " DB_PASS
        echo ""
        export DB_PASS
    fi

    # Pre-flight checks
    preflight_checks || exit 1

    # Create backup
    backup_file=$(create_backup)
    log "Backup location: $backup_file"
    echo ""

    # Stop services
    stopped_services=$(stop_mcp_services)
    echo ""

    # Ask for confirmation
    echo ""
    log_warning "╔════════════════════════════════════════════════════════════════╗"
    log_warning "║                    MIGRATION READY                             ║"
    log_warning "║                                                                ║"
    log_warning "║  This will modify the database schema.                        ║"
    log_warning "║  Backup created: $(basename "$backup_file")                   ║"
    log_warning "║                                                                ║"
    log_warning "║  Stopped services: $stopped_services                          ║"
    log_warning "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    read -rp "Proceed with migration? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        log "Migration cancelled by user"
        start_mcp_services "$stopped_services"
        exit 0
    fi

    echo ""

    # Run migration
    if run_migration; then
        echo ""

        # Validate migration
        if validate_migration; then
            log_success "╔════════════════════════════════════════════════════════════════╗"
            log_success "║              MIGRATION COMPLETED SUCCESSFULLY                  ║"
            log_success "╚════════════════════════════════════════════════════════════════╝"

            # Update schema version file
            echo "0.2.0" > "$SCHEMA_DIR/current_version.txt"
            echo "$(date +'%Y-%m-%d %H:%M:%S')" >> "$SCHEMA_DIR/current_version.txt"

            # Start services
            echo ""
            start_mcp_services "$stopped_services"

            echo ""
            log "Post-migration steps:"
            log "1. ✅ Verify application connectivity"
            log "2. ✅ Test new search_thoughts function"
            log "3. ⏳ Monitor performance of new indexes"
            log "4. ⏳ Update MCP service configurations if needed"
            echo ""
            log "New capabilities:"
            log "  - Full-text search: SELECT * FROM search_thoughts('query', 50);"
            log "  - Branch health: SELECT * FROM get_branch_health();"
            log "  - Timeline view: SELECT * FROM v_thought_timeline_v2;"
            echo ""

            exit 0
        else
            log_error "Migration validation failed"
            read -rp "Rollback migration? (yes/no): " rollback_confirm

            if [ "$rollback_confirm" = "yes" ]; then
                rollback "$backup_file"
                start_mcp_services "$stopped_services"
            fi

            exit 1
        fi
    else
        log_error "Migration execution failed"
        read -rp "Rollback migration? (yes/no): " rollback_confirm

        if [ "$rollback_confirm" = "yes" ]; then
            rollback "$backup_file"
            start_mcp_services "$stopped_services"
        fi

        exit 1
    fi
}

# Run main function
main "$@"
