#!/bin/bash
# ============================================================================
# MCP Ecosystem - Migration Rollback Script
# ============================================================================
# Purpose: Safely rollback database to pre-migration state
# Version: 0.2.0
# Date: 2025-11-07
# ============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Database configuration
DB_NAME="mcp_ecosystem"
DB_USER="mcp_admin"
DB_HOST="localhost"
DB_PORT="5432"
DB_PASS=""
LOG_FILE="/var/log/mcp/rollback_$(date +%Y%m%d_%H%M%S).log"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# ============================================================================
# Helper Functions
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
# Validation Functions
# ============================================================================

validate_backup_file() {
    local backup_file=$1

    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi

    # Check if it's a valid PostgreSQL backup
    if ! file "$backup_file" | grep -q "PostgreSQL" && ! file "$backup_file" | grep -q "data"; then
        log_warning "File may not be a valid PostgreSQL backup"
        read -rp "Continue anyway? (yes/no): " continue_anyway
        if [ "$continue_anyway" != "yes" ]; then
            return 1
        fi
    fi

    BACKUP_SIZE=$(du -h "$backup_file" | cut -f1)
    log "Backup file: $backup_file ($BACKUP_SIZE)"
    return 0
}

check_current_state() {
    log "Checking current database state..."

    # Check schema version
    CURRENT_VERSION=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -tAc "SELECT version FROM schema_version ORDER BY applied_at DESC LIMIT 1" 2>/dev/null || echo "Unknown")

    log "Current schema version: $CURRENT_VERSION"

    # Count records in main tables
    log "Current data statistics:"
    for table in "structured_thoughts" "thought_sessions" "mcp_agents"; do
        COUNT=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
            -tAc "SELECT COUNT(*) FROM $table" 2>/dev/null || echo "Error")
        log "  - $table: $COUNT records"
    done

    # Check for v0.2 tables
    V2_TABLES=0
    for table in "thought_branches" "feedback_signals" "thought_relationships" "thought_sync_queue"; do
        if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
            -tAc "SELECT COUNT(*) FROM pg_tables WHERE tablename='$table'" 2>/dev/null | grep -q "1"; then
            ((V2_TABLES++))
        fi
    done

    if [ $V2_TABLES -gt 0 ]; then
        log_warning "Found $V2_TABLES v0.2 tables that will be removed"
    fi
}

stop_services() {
    log "Stopping MCP services..."

    local services=("mcp-orchestrator" "perplexity-mcp" "it-mcp")
    local stopped_services=()

    for service in "${services[@]}"; do
        if systemctl list-units --full --all | grep -q "$service.service"; then
            if systemctl is-active --quiet "$service"; then
                log "Stopping $service..."
                sudo systemctl stop "$service" 2>/dev/null || log_warning "Failed to stop $service"
                stopped_services+=("$service")
            else
                log "Service $service is not running"
            fi
        fi
    done

    echo "${stopped_services[@]}"
}

terminate_connections() {
    log "Terminating active database connections..."

    # Terminate all connections except our own
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
        -c "SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = '$DB_NAME'
            AND pid <> pg_backend_pid()" 2>&1 | tee -a "$LOG_FILE"

    sleep 2
}

perform_rollback() {
    local backup_file=$1

    log "Starting database rollback..."

    # Method 1: Try pg_restore with clean option
    log "Attempting restore with pg_restore..."

    if PGPASSWORD="$DB_PASS" pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
        -d "$DB_NAME" --clean --if-exists "$backup_file" 2>&1 | tee -a "$LOG_FILE"; then
        log_success "Restore completed using pg_restore"
        return 0
    fi

    # Method 2: Drop and recreate schema, then restore
    log_warning "pg_restore with --clean failed, trying drop/recreate method..."

    # Drop existing schema
    log "Dropping existing schema..."
    if ! PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>&1 | tee -a "$LOG_FILE"; then
        log_error "Failed to drop schema"
        return 1
    fi

    # Grant permissions on new schema
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -c "GRANT ALL ON SCHEMA public TO $DB_USER; GRANT ALL ON SCHEMA public TO public;" 2>&1 | tee -a "$LOG_FILE"

    # Restore from backup
    log "Restoring from backup..."
    if PGPASSWORD="$DB_PASS" pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
        -d "$DB_NAME" "$backup_file" 2>&1 | tee -a "$LOG_FILE"; then
        log_success "Database restored successfully"
        return 0
    else
        log_error "Restore failed"
        return 1
    fi
}

verify_rollback() {
    log "Verifying rollback..."

    # Check schema version
    RESTORED_VERSION=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -tAc "SELECT version FROM schema_version ORDER BY applied_at DESC LIMIT 1" 2>/dev/null || echo "Unknown")

    if [ "$RESTORED_VERSION" = "0.1.0" ] || [ "$RESTORED_VERSION" = "0.1" ]; then
        log_success "Schema version restored to: $RESTORED_VERSION"
    else
        log_warning "Schema version: $RESTORED_VERSION (expected 0.1.0)"
    fi

    # Check that v0.2 tables are gone
    V2_TABLES_REMAIN=0
    for table in "thought_branches" "feedback_signals" "thought_relationships" "thought_sync_queue"; do
        if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
            -tAc "SELECT COUNT(*) FROM pg_tables WHERE tablename='$table'" 2>/dev/null | grep -q "1"; then
            log_error "v0.2 table still exists: $table"
            ((V2_TABLES_REMAIN++))
        fi
    done

    if [ $V2_TABLES_REMAIN -eq 0 ]; then
        log_success "All v0.2 tables removed"
    else
        log_error "$V2_TABLES_REMAIN v0.2 tables still remain"
        return 1
    fi

    # Check core tables exist
    for table in "structured_thoughts" "thought_sessions" "mcp_agents"; do
        if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
            -tAc "SELECT COUNT(*) FROM $table" &>/dev/null; then
            COUNT=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
                -tAc "SELECT COUNT(*) FROM $table")
            log_success "Table $table restored with $COUNT records"
        else
            log_error "Core table $table is missing or inaccessible"
            return 1
        fi
    done

    return 0
}

start_services() {
    local services=$1
    log "Starting MCP services..."

    if [ -z "$services" ]; then
        log "No services to start"
        return 0
    fi

    for service in $services; do
        log "Starting $service..."
        sudo systemctl start "$service" 2>/dev/null || log_warning "Failed to start $service"

        sleep 2
        if systemctl is-active --quiet "$service"; then
            log_success "$service started successfully"
        else
            log_warning "$service did not start (check logs: journalctl -u $service)"
        fi
    done
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║          MCP Ecosystem Migration Rollback Tool                ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    # Check arguments
    if [ $# -eq 0 ]; then
        log_error "Usage: $0 <backup-file>"
        echo ""
        echo "Available backups:"
        ls -lh /var/backups/postgresql/*.backup 2>/dev/null || echo "No backup files found in /var/backups/postgresql/"
        exit 1
    fi

    BACKUP_FILE="$1"

    log "Rollback started at $(date +'%Y-%m-%d %H:%M:%S')"
    log "Log file: $LOG_FILE"
    echo ""

    # Validate backup file
    if ! validate_backup_file "$BACKUP_FILE"; then
        exit 1
    fi
    echo ""

    # Check current state
    check_current_state
    echo ""

    # Confirmation
    log_warning "╔════════════════════════════════════════════════════════════════╗"
    log_warning "║                         WARNING                                ║"
    log_warning "║                                                                ║"
    log_warning "║  This will restore the database from backup.                 ║"
    log_warning "║  All changes since the backup will be LOST.                  ║"
    log_warning "║                                                                ║"
    log_warning "║  Backup file: $(basename "$BACKUP_FILE")                      ║"
    log_warning "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    read -rp "Proceed with rollback? Type 'ROLLBACK' to confirm: " confirm

    if [ "$confirm" != "ROLLBACK" ]; then
        log "Rollback cancelled by user"
        exit 0
    fi
    echo ""

    # Stop services
    stopped_services=$(stop_services)
    echo ""

    # Terminate connections
    terminate_connections
    echo ""

    # Perform rollback
    if perform_rollback "$BACKUP_FILE"; then
        echo ""

        # Verify rollback
        if verify_rollback; then
            log_success "╔════════════════════════════════════════════════════════════════╗"
            log_success "║              ROLLBACK COMPLETED SUCCESSFULLY                   ║"
            log_success "╚════════════════════════════════════════════════════════════════╝"

            # Start services
            echo ""
            start_services "$stopped_services"

            echo ""
            log_success "Database has been restored to pre-migration state"
            log "Please verify application functionality"
            exit 0
        else
            log_error "Rollback verification failed"
            log_error "Database may be in inconsistent state"
            log_error "Manual intervention required"
            exit 1
        fi
    else
        log_error "╔════════════════════════════════════════════════════════════════╗"
        log_error "║                   ROLLBACK FAILED                              ║"
        log_error "╚════════════════════════════════════════════════════════════════╝"
        log_error ""
        log_error "Manual recovery steps:"
        log_error "1. Check PostgreSQL logs: /var/log/postgresql/"
        log_error "2. Try manual restore:"
        log_error "   sudo -u postgres psql -d postgres -c 'DROP DATABASE $DB_NAME'"
        log_error "   sudo -u postgres psql -d postgres -c 'CREATE DATABASE $DB_NAME OWNER $DB_USER'"
        log_error "   pg_restore -U $DB_USER -d $DB_NAME $BACKUP_FILE"
        log_error ""
        log_error "Backup file preserved at: $BACKUP_FILE"
        exit 1
    fi
}

# Run main function
main "$@"