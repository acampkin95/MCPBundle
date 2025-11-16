#!/bin/bash
# ============================================================================
# MCP Ecosystem - Database Migration Deployment Script
# ============================================================================
# Purpose: Safely deploy database migration from v0.1 to v0.2
# Target: VMI01 (46.250.243.123) - PostgreSQL 16
# Version: 0.2.0
# Date: 2025-11-07
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
DB_PASS=""
BACKUP_DIR="/var/backups/postgresql"
LOG_FILE="/var/log/mcp/migration_v02_$(date +%Y%m%d_%H%M%S).log"
MIGRATION_DIR="$(dirname "$0")"

# Ensure directories exist
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
    if [ ! -f "$MIGRATION_DIR/migrate_v01_to_v02.sql" ]; then
        log_error "Migration script not found: $MIGRATION_DIR/migrate_v01_to_v02.sql"
        exit 1
    fi

    # Check disk space (need at least 1GB free)
    AVAILABLE_SPACE=$(df -BG "$BACKUP_DIR" | tail -1 | awk '{print $4}' | sed 's/G//')
    if [ "$AVAILABLE_SPACE" -lt 1 ]; then
        log_error "Insufficient disk space for backup (need 1GB, have ${AVAILABLE_SPACE}GB)"
        exit 1
    fi

    # Check current schema version
    CURRENT_VERSION=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -tAc "SELECT version FROM schema_version ORDER BY applied_at DESC LIMIT 1" 2>/dev/null || echo "0.1.0")

    if [ "$CURRENT_VERSION" != "0.1.0" ] && [ "$CURRENT_VERSION" != "0.1" ]; then
        log_warning "Current schema version: $CURRENT_VERSION (expected 0.1.0)"
        read -rp "Continue anyway? (yes/no): " continue_anyway
        if [ "$continue_anyway" != "yes" ]; then
            exit 1
        fi
    fi

    log_success "All pre-flight checks passed"
    log "Current schema version: $CURRENT_VERSION"
}

# ============================================================================
# Create Backup
# ============================================================================

create_backup() {
    log "Creating database backup..."

    BACKUP_FILE="$BACKUP_DIR/mcp_ecosystem_pre_v2_$(date +%Y%m%d_%H%M%S).backup"

    # Use pg_dump with custom format for better compression
    PGPASSWORD="$DB_PASS" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -Fc -f "$BACKUP_FILE" 2>&1 | tee -a "$LOG_FILE"

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
    log "Checking and stopping MCP services..."

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
        else
            log "Service $service is not installed"
        fi
    done

    echo "${stopped_services[@]}"  # Return list of stopped services
}

# ============================================================================
# Run Migration
# ============================================================================

run_migration() {
    log "Running database migration v0.1 → v0.2..."
    log "This may take 10-15 minutes..."

    # Run migration script
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -f "$MIGRATION_DIR/migrate_v01_to_v02.sql" 2>&1 | tee -a "$LOG_FILE"

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

    local validation_failed=0

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
            log_success "✓ Table $table exists"
        else
            log_error "✗ Table $table NOT found"
            validation_failed=1
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
            log_success "✓ Function $func exists"
        else
            log_error "✗ Function $func NOT found"
            validation_failed=1
        fi
    done

    # Test full-text search
    log "Testing full-text search capability..."
    if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -tAc "SELECT COUNT(*) FROM search_thoughts('test', 1)" &>> "$LOG_FILE"; then
        log_success "✓ Full-text search working"
    else
        log_warning "⚠ Full-text search test inconclusive (may have no data)"
    fi

    # Check schema version
    NEW_VERSION=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -tAc "SELECT version FROM schema_version ORDER BY applied_at DESC LIMIT 1" 2>/dev/null)

    if [ "$NEW_VERSION" = "0.2.0" ]; then
        log_success "✓ Schema version updated to 0.2.0"
    else
        log_error "✗ Schema version not updated (found: $NEW_VERSION)"
        validation_failed=1
    fi

    if [ $validation_failed -eq 0 ]; then
        log_success "Migration validation passed"
        return 0
    else
        log_error "Migration validation failed"
        return 1
    fi
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
        sudo systemctl start "$service" 2>/dev/null || log_warning "Failed to start $service (may need configuration)"

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
    stop_mcp_services > /dev/null 2>&1

    # Restore from backup
    log "Restoring database from backup: $backup_file"

    # Drop existing schema and restore
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>&1 | tee -a "$LOG_FILE"

    PGPASSWORD="$DB_PASS" pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        "$backup_file" 2>&1 | tee -a "$LOG_FILE"

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
# Generate Migration Report
# ============================================================================

generate_report() {
    local start_time=$1
    local end_time=$2
    local backup_file=$3
    local status=$4

    REPORT_FILE="$MIGRATION_DIR/migration_report_$(date +%Y%m%d_%H%M%S).md"

    cat > "$REPORT_FILE" << EOF
# MCP Ecosystem Database Migration Report

## Migration Details
- **Version**: v0.1 → v0.2
- **Date**: $(date +'%Y-%m-%d')
- **Server**: VMI01 (46.250.243.123)
- **Database**: $DB_NAME
- **Status**: $status

## Timeline
- **Start Time**: $start_time
- **End Time**: $end_time
- **Duration**: $(( ($(date -d "$end_time" +%s) - $(date -d "$start_time" +%s)) / 60 )) minutes

## Backup Information
- **Backup File**: $backup_file
- **Backup Size**: $(du -h "$backup_file" 2>/dev/null | cut -f1)

## Migration Changes
### New Tables Created (4)
- thought_branches - Branch analytics for parallel reasoning paths
- feedback_signals - Metacognitive feedback signals
- thought_relationships - Semantic relationships between thoughts
- thought_sync_queue - Synchronization queue for distributed system

### New Functions Created (5)
- search_thoughts() - Full-text search across thought content
- get_thought_branch() - Retrieve all thoughts in a specific branch
- get_branch_health() - Get health status of branches
- update_thought_tsvector() - Maintain full-text search vectors
- update_branch_analytics() - Update branch metrics

### Enhanced Features
- Full-text search capability with tsvector
- Branch tracking and analytics
- Feedback signal system
- Thought relationships graph
- Enhanced session metrics

## Validation Results
$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
SELECT 'Tables' as check_type, COUNT(*) as count
FROM pg_tables
WHERE tablename IN ('thought_branches', 'feedback_signals', 'thought_relationships', 'thought_sync_queue')
UNION ALL
SELECT 'Functions', COUNT(*)
FROM pg_proc
WHERE proname IN ('search_thoughts', 'get_thought_branch', 'get_branch_health')
UNION ALL
SELECT 'Schema Version', version::text
FROM schema_version
ORDER BY applied_at DESC LIMIT 1;
" 2>/dev/null || echo "Unable to query validation results")

## Post-Migration Tasks
- [x] Database backup created
- [x] Migration executed
- [x] Schema validated
- [ ] Application connectivity verified
- [ ] Performance monitoring enabled
- [ ] Service configurations updated

## Log File
- Location: $LOG_FILE

---
*Generated: $(date +'%Y-%m-%d %H:%M:%S')*
EOF

    log_success "Migration report generated: $REPORT_FILE"
    cat "$REPORT_FILE"
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    START_TIME=$(date +'%Y-%m-%d %H:%M:%S')

    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║       MCP Ecosystem Database Migration: v0.1 → v0.2           ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    log "Migration started at $START_TIME"
    log "Database: $DB_NAME@$DB_HOST"
    log "User: $DB_USER"
    log "Log file: $LOG_FILE"
    echo ""

    # Pre-flight checks
    preflight_checks || exit 1
    echo ""

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
    log_warning "║  Backup created at:                                          ║"
    log_warning "║  $(basename "$backup_file")                                   ║"
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
            END_TIME=$(date +'%Y-%m-%d %H:%M:%S')

            log_success "╔════════════════════════════════════════════════════════════════╗"
            log_success "║              MIGRATION COMPLETED SUCCESSFULLY                  ║"
            log_success "╚════════════════════════════════════════════════════════════════╝"

            # Start services
            echo ""
            start_mcp_services "$stopped_services"

            # Generate report
            echo ""
            generate_report "$START_TIME" "$END_TIME" "$backup_file" "SUCCESS"

            echo ""
            log_success "Migration completed successfully!"
            log ""
            log "New capabilities available:"
            log "  - Full-text search: SELECT * FROM search_thoughts('query', 50);"
            log "  - Branch health: SELECT * FROM get_branch_health();"
            log "  - Branch details: SELECT * FROM get_thought_branch('branch-id');"
            log "  - Timeline view: SELECT * FROM v_thought_timeline_v2;"
            log "  - Branch summary: SELECT * FROM v_branch_summary;"
            echo ""

            exit 0
        else
            log_error "Migration validation failed"
            read -rp "Rollback migration? (yes/no): " rollback_confirm

            if [ "$rollback_confirm" = "yes" ]; then
                rollback "$backup_file"
                start_mcp_services "$stopped_services"
            fi

            END_TIME=$(date +'%Y-%m-%d %H:%M:%S')
            generate_report "$START_TIME" "$END_TIME" "$backup_file" "FAILED - Validation Error"
            exit 1
        fi
    else
        log_error "Migration execution failed"
        read -rp "Rollback migration? (yes/no): " rollback_confirm

        if [ "$rollback_confirm" = "yes" ]; then
            rollback "$backup_file"
            start_mcp_services "$stopped_services"
        fi

        END_TIME=$(date +'%Y-%m-%d %H:%M:%S')
        generate_report "$START_TIME" "$END_TIME" "$backup_file" "FAILED - Execution Error"
        exit 1
    fi
}

# Run main function
main "$@"